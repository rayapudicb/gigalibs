import { randomUUID } from 'node:crypto';
import { ExactDecimal } from '@gigalibs/contracts';
import {
  OrganizationReplica, OrganizationScopeRefusal, OrganizationVersionPendingError,
  assertOrganizationWrite, assertOwningUnit, organizationAccess,
  type ModulePrincipal,
} from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { applyScrapFactor } from '../engine/cost-rollup.js';
import { explodeBomRequirements, type BomNode } from '../engine/bom-explosion.js';
import { netMrpRequirements } from '../engine/mrp-netting.js';
import { InventoryAtpClient } from '../inventory/inventory-atp.client.js';
import {
  InventoryHandshakeClient,
  isManufacturingInventoryHandshakeConfigured,
} from '../inventory/inventory-handshake.client.js';
import {
  InventoryReserveReleaseClient,
  isManufacturingInventoryReserveReleaseConfigured,
} from '../inventory/inventory-reserve-release.client.js';

const PositiveQuantity = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  .refine((value) => !ExactDecimal.isZero(value), 'Quantity must be positive.');
const NonnegativeQuantity = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);

const CreateBomSchema = z
  .object({
    bomCode: z.string().min(1).max(64),
    finishedProductId: z.string().uuid(),
    scrapPercent: z.string().optional(),
    orgUnitId: z.string().trim().min(1).max(64),
    lines: z
      .array(
        z.object({
          componentProductId: z.string().uuid(),
          uomId: z.string().uuid(),
          quantityPer: PositiveQuantity,
          subBomId: z.string().uuid().optional().nullable(),
        }),
      )
      .min(1),
  })
  .strict();

const CreateProductionOrderSchema = z
  .object({
    bomId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    finishedUomId: z.string().uuid(),
    quantity: PositiveQuantity,
    orgUnitId: z.string().trim().min(1).max(64),
  })
  .strict();

const MrpPreviewSchema = z
  .object({
    warehouseId: z.string().uuid(),
    orgUnitId: z.string().trim().min(1).max(64),
    rows: z.array(
      z.object({
        productId: z.string().uuid(),
        demand: NonnegativeQuantity,
        supply: NonnegativeQuantity,
      }),
    ),
  })
  .strict();

const CreateWorkCenterSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(128),
  orgUnitId: z.string().trim().min(1).max(64),
}).strict();

const CreateRoutingSchema = z.object({
  bomId: z.string().uuid(),
  orgUnitId: z.string().trim().min(1).max(64),
  steps: z.array(z.object({
    workCenterId: z.string().uuid(),
    setupMinutes: NonnegativeQuantity,
    runMinutesPerUnit: NonnegativeQuantity,
  }).strict()).min(1),
}).strict();

@Injectable()
export class ManufacturingService {
  private readonly orgReplica = new OrganizationReplica(SCHEMA);
  constructor(
    private readonly database: DatabaseService,
    private readonly inventoryReserveRelease: InventoryReserveReleaseClient,
    private readonly inventoryHandshake: InventoryHandshakeClient,
    private readonly inventoryAtp: InventoryAtpClient,
  ) {}

  private async audit(
    client: PoolClient, principal: ModulePrincipal, action: string,
    entityType: string, entityId: string, correlationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${SCHEMA}.audit_events
         (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [randomUUID(), principal.tenantId, principal.subject, action, entityType, entityId,
        correlationId, JSON.stringify(payload)],
    );
  }

  private requireInventoryIntegration(): void {
    if (!isManufacturingInventoryReserveReleaseConfigured() ||
        !isManufacturingInventoryHandshakeConfigured()) {
      throw new ServiceUnavailableException({ code: 'MANUFACTURING_INVENTORY_HANDSHAKE_NOT_CONFIGURED' });
    }
  }

  private async organizationAccess(client: PoolClient, principal: ModulePrincipal) {
    try {
      return await organizationAccess(this.orgReplica, client, principal.tenantId,
        principal.organization ?? { mode: 'DENIED' });
    } catch (error) {
      if (error instanceof OrganizationVersionPendingError) {
        throw new ServiceUnavailableException({ code: error.code, versionId: error.versionId });
      }
      throw error;
    }
  }

  private async assertUnitAccess(client: PoolClient, principal: ModulePrincipal, unitId: string | null,
    mode: 'read' | 'write'): Promise<void> {
    const access = await this.organizationAccess(client, principal);
    if (!unitId) throw new ConflictException('Manufacturing record needs a reconciled owning organization.');
    if (access.denied || (mode === 'read' && access.readUnits !== null && !access.readUnits.includes(unitId))) {
      throw new ForbiddenException('Manufacturing record is outside your organization scope.');
    }
    if (mode === 'write') {
      try {
        assertOrganizationWrite(access, unitId);
        if (!access.versionId) {
          throw new ServiceUnavailableException({ code: 'ORGANIZATION_VERSION_REQUIRED' });
        }
        await assertOwningUnit(this.orgReplica, client, principal.tenantId, access, 'UNIT', unitId);
      } catch (error) {
        if (error instanceof OrganizationScopeRefusal) throw new ForbiddenException({ code: error.code });
        throw error;
      }
    }
  }

  private async actionFailed(
    principal: ModulePrincipal, orderId: string,
    pendingStatus: 'RESERVING' | 'ISSUING' | 'RECEIVING',
  ): Promise<void> {
    await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const order = await this.lockOrder(client, principal.tenantId, orderId);
      if (order.status !== pendingStatus) return;
      await client.query(
        `UPDATE ${SCHEMA}.production_orders SET last_error_code = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, orderId, 'MANUFACTURING_INVENTORY_ACTION_FAILED'],
      );
      await this.audit(client, principal, 'INVENTORY_ACTION_FAILED', 'production_order', orderId,
        order.correlation_id, { pendingStatus, code: 'MANUFACTURING_INVENTORY_ACTION_FAILED' });
    });
  }

  async createBom(principal: ModulePrincipal, raw: unknown) {
    const input = CreateBomSchema.parse(raw ?? {});
    const bomId = randomUUID();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assertUnitAccess(client, principal, input.orgUnitId, 'write');
      await client.query(
        `INSERT INTO ${SCHEMA}.boms
           (id, tenant_id, bom_code, finished_product_id, scrap_percent, org_unit_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          bomId,
          principal.tenantId,
          input.bomCode,
          input.finishedProductId,
          input.scrapPercent ?? '0',
          input.orgUnitId,
          principal.subject,
        ],
      );
      let lineNumber = 0;
      for (const line of input.lines) {
        if (line.subBomId) {
          const subBom = await this.loadBomRow(client, principal.tenantId, line.subBomId);
          if (subBom.org_unit_id !== input.orgUnitId || subBom.status !== 'ACTIVE' ||
              subBom.finished_product_id !== line.componentProductId) {
            throw new ConflictException('A sub-BOM must be active, make the line component, and have the same owning unit.');
          }
        }
        lineNumber += 1;
        await client.query(
          `INSERT INTO ${SCHEMA}.bom_lines
             (id, tenant_id, bom_id, line_number, component_product_id, uom_id, quantity_per, sub_bom_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            principal.tenantId,
            bomId,
            lineNumber,
            line.componentProductId,
            line.uomId,
            line.quantityPer,
            line.subBomId ?? null,
          ],
        );
      }
      await this.audit(client, principal, 'CREATE', 'bom', bomId, bomId,
        { bomCode: input.bomCode, finishedProductId: input.finishedProductId,
          orgUnitId: input.orgUnitId, lineCount: input.lines.length });
      return { id: bomId, bomCode: input.bomCode, finishedProductId: input.finishedProductId };
    });
  }

  async createWorkCenter(principal: ModulePrincipal, raw: unknown) {
    const input = CreateWorkCenterSchema.parse(raw ?? {});
    const id = randomUUID();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assertUnitAccess(client, principal, input.orgUnitId, 'write');
      await client.query(
        `INSERT INTO ${SCHEMA}.work_centers (id, tenant_id, code, name, org_unit_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, principal.tenantId, input.code, input.name, input.orgUnitId],
      );
      await this.audit(client, principal, 'CREATE', 'work_center', id, id, input);
      return { id, code: input.code, name: input.name, orgUnitId: input.orgUnitId };
    });
  }

  async listWorkCenters(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.organizationAccess(client, principal);
      const units = access.readUnits === null ? null : [...access.readUnits];
      const result = await client.query(
        `SELECT id, code, name, org_unit_id, active FROM ${SCHEMA}.work_centers
          WHERE tenant_id = $1 AND org_unit_id IS NOT NULL
            AND ($2::varchar[] IS NULL OR org_unit_id = ANY($2::varchar[]))
          ORDER BY code`, [principal.tenantId, units],
      );
      return result.rows;
    });
  }

  async createRouting(principal: ModulePrincipal, raw: unknown) {
    const input = CreateRoutingSchema.parse(raw ?? {});
    const id = randomUUID();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assertUnitAccess(client, principal, input.orgUnitId, 'write');
      const bom = await this.loadBomRow(client, principal.tenantId, input.bomId);
      if (bom.org_unit_id !== input.orgUnitId || bom.status !== 'ACTIVE') {
        throw new ConflictException('Routing requires an active BOM with the same owning unit.');
      }
      for (const step of input.steps) {
        const workCenter = await client.query<{ org_unit_id: string; active: boolean }>(
          `SELECT org_unit_id, active FROM ${SCHEMA}.work_centers WHERE tenant_id = $1 AND id = $2`,
          [principal.tenantId, step.workCenterId],
        );
        if (!workCenter.rows[0]?.active || workCenter.rows[0].org_unit_id !== input.orgUnitId) {
          throw new ConflictException('Routing work centers must be active and have the BOM owning unit.');
        }
      }
      await client.query(
        `INSERT INTO ${SCHEMA}.routings (id, tenant_id, bom_id, org_unit_id, created_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, principal.tenantId, input.bomId, input.orgUnitId, principal.subject],
      );
      for (const [index, step] of input.steps.entries()) {
        await client.query(
          `INSERT INTO ${SCHEMA}.routing_steps
            (id, tenant_id, routing_id, step_number, work_center_id, setup_minutes, run_minutes_per_unit)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(), principal.tenantId, id, index + 1, step.workCenterId,
            step.setupMinutes, step.runMinutesPerUnit],
        );
      }
      await this.audit(client, principal, 'CREATE', 'routing', id, id,
        { bomId: input.bomId, orgUnitId: input.orgUnitId, steps: input.steps.length });
      return { id, bomId: input.bomId, status: 'ACTIVE', steps: input.steps.length };
    });
  }

  async listRoutings(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.organizationAccess(client, principal);
      const units = access.readUnits === null ? null : [...access.readUnits];
      const result = await client.query(
        `SELECT r.id, r.bom_id, b.bom_code, r.org_unit_id, r.status,
                COUNT(s.id)::int AS step_count
           FROM ${SCHEMA}.routings r JOIN ${SCHEMA}.boms b ON b.id = r.bom_id AND b.tenant_id = r.tenant_id
           LEFT JOIN ${SCHEMA}.routing_steps s ON s.routing_id = r.id AND s.tenant_id = r.tenant_id
          WHERE r.tenant_id = $1 AND ($2::varchar[] IS NULL OR r.org_unit_id = ANY($2::varchar[]))
          GROUP BY r.id, b.bom_code ORDER BY b.bom_code`, [principal.tenantId, units],
      );
      return result.rows;
    });
  }

  async listBoms(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.organizationAccess(client, principal);
      const roots = access.readUnits === null ? null : [...access.readUnits];
      const res = await client.query(
        `SELECT id, bom_code, finished_product_id, status, scrap_percent, version FROM ${SCHEMA}.boms
          WHERE tenant_id = $1 AND org_unit_id IS NOT NULL
            AND ($2::varchar[] IS NULL OR org_unit_id = ANY($2::varchar[]))
          ORDER BY bom_code, version DESC`,
        [principal.tenantId, roots],
      );
      return res.rows;
    });
  }

  async getBomTree(principal: ModulePrincipal, bomId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const bom = await this.loadBomNode(client, principal.tenantId, bomId);
      const header = await this.loadBomRow(client, principal.tenantId, bomId);
      await this.assertUnitAccess(client, principal, header.org_unit_id, 'read');
      const bomsById = await this.loadAllBoms(client, principal.tenantId, header.org_unit_id);
      const requirements = explodeBomRequirements(bom, '1.000000', bomsById);
      return {
        bom,
        nestedTree: this.nestedBomTree(bom, bomsById),
        unitRequirements: [...requirements.entries()].map(([productId, row]) => ({
          productId,
          uomId: row.uomId,
          quantity: row.quantity,
        })),
      };
    });
  }

  async whereUsed(principal: ModulePrincipal, productId: string) {
    if (!z.string().uuid().safeParse(productId).success) throw new BadRequestException('Product ID must be a UUID.');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.organizationAccess(client, principal);
      const roots = access.readUnits === null ? null : [...access.readUnits];
      const rows = await client.query<{
        bom_id: string; bom_code: string; finished_product_id: string; component_product_id: string;
      }>(
        `SELECT b.id AS bom_id, b.bom_code, b.finished_product_id, l.component_product_id
           FROM ${SCHEMA}.bom_lines l JOIN ${SCHEMA}.boms b ON b.id = l.bom_id AND b.tenant_id = l.tenant_id
          WHERE b.tenant_id = $1 AND b.status = 'ACTIVE' AND b.org_unit_id IS NOT NULL
            AND ($2::varchar[] IS NULL OR b.org_unit_id = ANY($2::varchar[]))`,
        [principal.tenantId, roots],
      );
      const found = new Map<string, { bomId: string; bomCode: string; finishedProductId: string; depth: number }>();
      const queue = [{ productId, depth: 1 }];
      const seenProducts = new Set<string>([productId]);
      while (queue.length) {
        const current = queue.shift()!;
        for (const row of rows.rows) {
          if (row.component_product_id !== current.productId) continue;
          if (!found.has(row.bom_id)) {
            found.set(row.bom_id, { bomId: row.bom_id, bomCode: row.bom_code,
              finishedProductId: row.finished_product_id, depth: current.depth });
          }
          if (!seenProducts.has(row.finished_product_id)) {
            seenProducts.add(row.finished_product_id);
            queue.push({ productId: row.finished_product_id, depth: current.depth + 1 });
          }
        }
      }
      return [...found.values()].sort((a, b) => a.depth - b.depth || a.bomCode.localeCompare(b.bomCode));
    });
  }

  async bomShortages(principal: ModulePrincipal, bomId: string, warehouseId: string, quantity: string) {
    if (!z.string().uuid().safeParse(warehouseId).success) throw new BadRequestException('Warehouse ID must be a UUID.');
    if (!PositiveQuantity.safeParse(quantity).success) throw new BadRequestException('Quantity must be a positive decimal.');
    const tree = await this.getBomTree(principal, bomId);
    const lines = [];
    for (const requirement of tree.unitRequirements) {
      const needed = ExactDecimal.multiply(requirement.quantity, quantity);
      const atp = await this.inventoryAtp.check(principal, {
        requestKey: randomUUID(), warehouseId, productId: requirement.productId,
        uomId: requirement.uomId, requestedQuantity: needed,
      });
      lines.push({ ...requirement, needed, available: atp.availableQuantity, decision: atp.decision });
    }
    return { bomId, warehouseId, quantity, lines };
  }

  async createProductionOrder(principal: ModulePrincipal, raw: unknown) {
    const input = CreateProductionOrderSchema.parse(raw ?? {});
    const orderId = randomUUID();
    const correlationId = randomUUID();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assertUnitAccess(client, principal, input.orgUnitId, 'write');
      const bom = await this.loadBomRow(client, principal.tenantId, input.bomId);
      if (bom.org_unit_id !== input.orgUnitId) {
        throw new ConflictException('Production order and BOM must have the same owning organization.');
      }
      if (bom.status !== 'ACTIVE') throw new ConflictException('BOM must be ACTIVE.');
      const bomNode = await this.loadBomNode(client, principal.tenantId, input.bomId);
      const bomsById = await this.loadAllBoms(client, principal.tenantId, input.orgUnitId);
      const qtyWithScrap = applyScrapFactor(input.quantity, String(bom.scrap_percent));
      const requirements = explodeBomRequirements(bomNode, qtyWithScrap, bomsById);
      const seq = await client.query<{ last_number: string }>(
        `INSERT INTO ${SCHEMA}.production_order_counters (tenant_id, last_number)
         VALUES ($1, 1)
         ON CONFLICT (tenant_id) DO UPDATE SET last_number = ${SCHEMA}.production_order_counters.last_number + 1
         RETURNING last_number::text`, [principal.tenantId],
      );
      const orderNumber = `MO-${seq.rows[0]!.last_number.padStart(5, '0')}`;
      await client.query(
        `INSERT INTO ${SCHEMA}.production_orders
           (id, tenant_id, order_number, bom_id, finished_product_id, finished_uom_id, warehouse_id, org_unit_id, quantity, correlation_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          orderId,
          principal.tenantId,
          orderNumber,
          input.bomId,
          bom.finished_product_id,
          input.finishedUomId,
          input.warehouseId,
          input.orgUnitId,
          input.quantity,
          correlationId,
          principal.subject,
        ],
      );
      let lineNumber = 0;
      for (const [productId, row] of requirements) {
        lineNumber += 1;
        await client.query(
          `INSERT INTO ${SCHEMA}.production_order_lines
             (id, tenant_id, production_order_id, line_number, component_product_id, uom_id, required_quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(), principal.tenantId, orderId, lineNumber, productId, row.uomId, row.quantity],
        );
      }
      await this.audit(client, principal, 'CREATE', 'production_order', orderId, correlationId,
        { orderNumber, bomId: input.bomId, warehouseId: input.warehouseId,
          orgUnitId: input.orgUnitId, quantity: input.quantity, componentCount: lineNumber });
      return { id: orderId, orderNumber, status: 'DRAFT' };
    });
  }

  async releaseProductionOrder(principal: ModulePrincipal, orderId: string) {
    this.requireInventoryIntegration();
    const start = await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const order = await this.lockOrder(client, principal.tenantId, orderId);
      await this.assertUnitAccess(client, principal, order.org_unit_id, 'write');
      if (order.status === 'RELEASED') return { alreadyDone: true, lines: [] as Array<{
        id: string; component_product_id: string; uom_id: string;
        required_quantity: string; reservation_id: string | null;
      }>, warehouseId: order.warehouse_id };
      if (order.status !== 'DRAFT' && order.status !== 'RESERVING') {
        throw new ConflictException('Only DRAFT or RESERVING orders can be released.');
      }
      if (order.status === 'DRAFT') {
        await client.query(
          `UPDATE ${SCHEMA}.production_orders
              SET status = 'RESERVING', last_error_code = NULL, version = version + 1, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`, [principal.tenantId, orderId],
        );
        await this.audit(client, principal, 'RESERVING', 'production_order', orderId,
          order.correlation_id, { from: 'DRAFT' });
      }
      const lines = await client.query<{
        id: string;
        component_product_id: string;
        uom_id: string;
        required_quantity: string;
        reservation_id: string | null;
      }>(
        `SELECT id, component_product_id, uom_id, required_quantity, reservation_id FROM ${SCHEMA}.production_order_lines
          WHERE tenant_id = $1 AND production_order_id = $2 ORDER BY line_number`,
        [principal.tenantId, orderId],
      );
      return { alreadyDone: false, lines: lines.rows, warehouseId: order.warehouse_id };
    });
    if (start.alreadyDone) return { id: orderId, status: 'RELEASED' };
    try {
      for (const line of start.lines) {
        if (line.reservation_id) continue;
        const reserve = await this.inventoryReserveRelease.execute(principal, {
            action: 'RESERVE',
            reservationType: 'HARD',
            commandKey: randomUUID(),
            demandType: 'WORK_ORDER',
            demandReferenceId: orderId,
            demandLineId: line.id,
            warehouseId: start.warehouseId,
            productId: line.component_product_id,
            uomId: line.uom_id,
            quantity: line.required_quantity,
            idempotencyKey: `mo:${orderId}:${line.id}`,
        });
        if (reserve.outcome !== 'RESERVED' || !reserve.reservationId) {
          throw new ConflictException('Inventory reservation failed for a component line.');
        }
        await this.database.withTenantTransaction(principal.tenantId, async (client) => {
          const order = await this.lockOrder(client, principal.tenantId, orderId);
          await this.assertUnitAccess(client, principal, order.org_unit_id, 'write');
          if (order.status !== 'RESERVING' && order.status !== 'RELEASED') {
            throw new ConflictException('Production order changed while reserving.');
          }
          const saved = await client.query<{ reservation_id: string | null }>(
            `UPDATE ${SCHEMA}.production_order_lines
                SET reservation_id = COALESCE(reservation_id, $4)
              WHERE tenant_id = $1 AND production_order_id = $2 AND id = $3
              RETURNING reservation_id`,
            [principal.tenantId, orderId, line.id, reserve.reservationId],
          );
          if (saved.rows[0]?.reservation_id !== reserve.reservationId) {
            throw new ConflictException('A component line has a different reservation; reconcile Inventory.');
          }
          await this.audit(client, principal, 'RESERVE_COMPONENT', 'production_order', orderId,
            order.correlation_id, { lineId: line.id, reservationId: reserve.reservationId });
        });
      }
      return await this.database.withTenantTransaction(principal.tenantId, async (client) => {
        const order = await this.lockOrder(client, principal.tenantId, orderId);
        await this.assertUnitAccess(client, principal, order.org_unit_id, 'write');
        if (order.status === 'RELEASED') return { id: orderId, status: 'RELEASED' };
        if (order.status !== 'RESERVING') throw new ConflictException('Production order changed while reserving.');
        const unreserved = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM ${SCHEMA}.production_order_lines
            WHERE tenant_id = $1 AND production_order_id = $2 AND reservation_id IS NULL`,
          [principal.tenantId, orderId],
        );
        if (Number(unreserved.rows[0]?.count) !== 0) {
          throw new ConflictException('One or more component reservations are still pending.');
        }
        await client.query(
          `UPDATE ${SCHEMA}.production_orders SET status = 'RELEASED', last_error_code = NULL,
                  version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
          [principal.tenantId, orderId],
        );
        await this.audit(client, principal, 'RELEASE', 'production_order', orderId,
          order.correlation_id, { componentCount: start.lines.length });
        return { id: orderId, status: 'RELEASED' };
      });
    } catch (error) {
      await this.actionFailed(principal, orderId, 'RESERVING');
      throw error;
    }
  }

  async issueProductionOrder(principal: ModulePrincipal, orderId: string) {
    this.requireInventoryIntegration();
    const start = await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const order = await this.lockOrder(client, principal.tenantId, orderId);
      await this.assertUnitAccess(client, principal, order.org_unit_id, 'write');
      if (order.status === 'ISSUED') return { alreadyDone: true, lines: [] as Array<{
        id: string; reservation_id: string | null; required_quantity: string; issued_quantity: string;
      }>, correlationId: order.correlation_id };
      if (order.status !== 'RELEASED' && order.status !== 'ISSUING') {
        throw new ConflictException('Order must be RELEASED or ISSUING before issue.');
      }
      if (order.status === 'RELEASED') {
        await client.query(
          `UPDATE ${SCHEMA}.production_orders
              SET status = 'ISSUING', last_error_code = NULL, version = version + 1, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`, [principal.tenantId, orderId],
        );
        await this.audit(client, principal, 'ISSUING', 'production_order', orderId,
          order.correlation_id, { from: 'RELEASED' });
      }
      const lines = await client.query<{
        id: string;
        reservation_id: string | null;
        required_quantity: string;
        issued_quantity: string;
      }>(
        `SELECT id, reservation_id, required_quantity, issued_quantity FROM ${SCHEMA}.production_order_lines
          WHERE tenant_id = $1 AND production_order_id = $2 ORDER BY line_number`,
        [principal.tenantId, orderId],
      );
      return { alreadyDone: false, lines: lines.rows, correlationId: order.correlation_id };
    });
    if (start.alreadyDone) return { id: orderId, status: 'ISSUED' };
    try {
      for (const line of start.lines) {
        if (!line.reservation_id) {
          throw new ConflictException('Component has no Inventory reservation; retry release or reconcile it.');
        }
        if (ExactDecimal.isGreaterThanOrEqual(String(line.issued_quantity), String(line.required_quantity))) continue;
        const issued = await this.inventoryHandshake.issueLine(principal, {
            reservationId: line.reservation_id,
            productionOrderId: orderId,
            productionLineId: line.id,
            quantity: line.required_quantity,
            correlationId: start.correlationId,
        });
        if (issued.status !== 'ISSUED' ||
            ExactDecimal.toScaledBigInt(issued.issuedQuantity) !== ExactDecimal.toScaledBigInt(line.required_quantity)) {
          throw new ConflictException('Inventory issued a different quantity; reconcile the component line.');
        }
        await this.database.withTenantTransaction(principal.tenantId, async (client) => {
          const order = await this.lockOrder(client, principal.tenantId, orderId);
          await this.assertUnitAccess(client, principal, order.org_unit_id, 'write');
          if (order.status !== 'ISSUING' && order.status !== 'ISSUED') {
            throw new ConflictException('Production order changed while issuing.');
          }
          const saved = await client.query<{ issued_quantity: string }>(
            `UPDATE ${SCHEMA}.production_order_lines
                SET issued_quantity = $4
              WHERE tenant_id = $1 AND production_order_id = $2 AND id = $3
                AND (issued_quantity = 0 OR issued_quantity = $4)
              RETURNING issued_quantity`,
            [principal.tenantId, orderId, line.id, issued.issuedQuantity],
          );
          if (!saved.rows[0]) throw new ConflictException('Component issue conflicts with recorded quantity.');
          await this.audit(client, principal, 'ISSUE_COMPONENT', 'production_order', orderId,
            order.correlation_id, { lineId: line.id, issueId: issued.issueId, quantity: issued.issuedQuantity });
        });
      }
      return await this.database.withTenantTransaction(principal.tenantId, async (client) => {
        const order = await this.lockOrder(client, principal.tenantId, orderId);
        await this.assertUnitAccess(client, principal, order.org_unit_id, 'write');
        if (order.status === 'ISSUED') return { id: orderId, status: 'ISSUED' };
        if (order.status !== 'ISSUING') throw new ConflictException('Production order changed while issuing.');
        const incomplete = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM ${SCHEMA}.production_order_lines
            WHERE tenant_id = $1 AND production_order_id = $2 AND issued_quantity <> required_quantity`,
          [principal.tenantId, orderId],
        );
        if (Number(incomplete.rows[0]?.count) !== 0) {
          throw new ConflictException('One or more component issues are still pending.');
        }
        await client.query(
          `UPDATE ${SCHEMA}.production_orders SET status = 'ISSUED', last_error_code = NULL,
                  version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
          [principal.tenantId, orderId],
        );
        await this.audit(client, principal, 'ISSUE', 'production_order', orderId,
          order.correlation_id, { componentCount: start.lines.length });
        return { id: orderId, status: 'ISSUED' };
      });
    } catch (error) {
      await this.actionFailed(principal, orderId, 'ISSUING');
      throw error;
    }
  }

  async completeProductionOrder(principal: ModulePrincipal, orderId: string) {
    this.requireInventoryIntegration();
    const start = await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const order = await this.lockOrder(client, principal.tenantId, orderId);
      await this.assertUnitAccess(client, principal, order.org_unit_id, 'write');
      if (order.status === 'COMPLETED') return { alreadyDone: true, order };
      if (order.status !== 'ISSUED' && order.status !== 'RECEIVING') {
        throw new ConflictException('Order must be ISSUED or RECEIVING before completion.');
      }
      if (!order.finished_uom_id) throw new ConflictException('Production order is missing finished UOM.');
      if (order.status === 'ISSUED') {
        await client.query(
          `UPDATE ${SCHEMA}.production_orders
              SET status = 'RECEIVING', last_error_code = NULL, version = version + 1, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`, [principal.tenantId, orderId],
        );
        await this.audit(client, principal, 'RECEIVING', 'production_order', orderId,
          order.correlation_id, { from: 'ISSUED' });
      }
      return { alreadyDone: false, order };
    });
    if (start.alreadyDone) return { id: orderId, status: 'COMPLETED' };
    try {
      const receipt = await this.inventoryHandshake.receiveFinishedGoods(principal, {
        commandKey: orderId,
        productionOrderId: orderId,
        warehouseId: start.order.warehouse_id,
        orgUnitId: start.order.org_unit_id,
        productId: start.order.finished_product_id,
        uomId: start.order.finished_uom_id,
        quantity: String(start.order.quantity),
      });
      if (!z.string().uuid().safeParse(receipt.receiptId).success) {
        throw new ServiceUnavailableException({ code: 'MANUFACTURING_INVENTORY_RECEIPT_INVALID' });
      }
      if (!z.string().uuid().safeParse(receipt.financeCostProfileId).success) {
        throw new ServiceUnavailableException({ code: 'MANUFACTURING_FINANCE_PROFILE_INVALID' });
      }
      return await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const order = await this.lockOrder(client, principal.tenantId, orderId);
      await this.assertUnitAccess(client, principal, order.org_unit_id, 'write');
      if (order.status === 'COMPLETED') return { id: orderId, status: 'COMPLETED' };
      if (order.status !== 'RECEIVING') throw new ConflictException('Production order changed while receiving.');
      if (order.inventory_receipt_id && order.inventory_receipt_id !== receipt.receiptId) {
        throw new ConflictException('Inventory receipt differs from the recorded production receipt.');
      }
      const componentLinesRes = await client.query<{
        component_product_id: string;
        uom_id: string;
        required_quantity: string;
        issued_quantity: string;
      }>(
        `SELECT component_product_id, uom_id, required_quantity, issued_quantity
           FROM ${SCHEMA}.production_order_lines
          WHERE tenant_id = $1 AND production_order_id = $2 ORDER BY line_number`,
        [principal.tenantId, orderId],
      );
      const componentLines = componentLinesRes.rows.map((line) => ({
        productId: line.component_product_id,
        uomId: line.uom_id,
        quantity: String(line.issued_quantity),
      }));
      if (componentLinesRes.rows.some((line) =>
        ExactDecimal.toScaledBigInt(String(line.issued_quantity)) !==
        ExactDecimal.toScaledBigInt(String(line.required_quantity)))) {
        throw new ConflictException('All component issues must be confirmed before completion.');
      }
      await client.query(
        `UPDATE ${SCHEMA}.production_orders
            SET status = 'COMPLETED', inventory_receipt_id = COALESCE($3, inventory_receipt_id),
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, orderId, receipt.receiptId],
      );
      await this.audit(client, principal, 'COMPLETE', 'production_order', orderId,
        order.correlation_id, { inventoryReceiptId: receipt.receiptId,
          componentCount: componentLines.length });
      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events
           (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload)
         VALUES ($1,$2,$3,'manufacturing.production.completed.v1','production_order',$4,$5,$6,1,$7::jsonb)`,
        [
          randomUUID(),
          principal.tenantId,
          TOPIC,
          orderId,
          order.version + 1,
          order.correlation_id,
          JSON.stringify({
            productionOrderId: orderId,
            orderNumber: order.order_number,
            finishedProductId: order.finished_product_id,
            warehouseId: order.warehouse_id,
            quantity: order.quantity,
            inventoryReceiptId: receipt.receiptId,
            orgUnitId: order.org_unit_id ?? null,
            financeCostProfileId: receipt.financeCostProfileId,
            componentLines,
          }),
        ],
      );
      return { id: orderId, status: 'COMPLETED' };
      });
    } catch (error) {
      await this.actionFailed(principal, orderId, 'RECEIVING');
      throw error;
    }
  }

  async previewMrp(principal: ModulePrincipal, raw: unknown) {
    const input = MrpPreviewSchema.parse(raw ?? {});
    const runId = randomUUID();
    const nets = netMrpRequirements(
      input.rows.map((row) => ({
        productId: row.productId,
        warehouseId: input.warehouseId,
        demand: row.demand,
        supply: row.supply,
      })),
    );
    await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assertUnitAccess(client, principal, input.orgUnitId, 'write');
      for (const row of nets) {
        if (ExactDecimal.isZero(row.netRequirement)) continue;
        await client.query(
          `INSERT INTO ${SCHEMA}.production_plans
             (id, tenant_id, run_id, product_id, warehouse_id, org_unit_id, net_requirement, suggested_order_qty)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
          [randomUUID(), principal.tenantId, runId, row.productId, row.warehouseId,
            input.orgUnitId, row.netRequirement],
        );
      }
      await this.audit(client, principal, 'PREVIEW', 'mrp_run', runId, runId,
        { warehouseId: input.warehouseId, orgUnitId: input.orgUnitId,
          inputRows: input.rows.length, suggestedRows: nets.length });
    });
    return { runId, lines: nets };
  }

  async listProductionOrders(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.organizationAccess(client, principal);
      const roots = access.readUnits === null ? null : [...access.readUnits];
      const res = await client.query(
        `SELECT id, order_number, bom_id, finished_product_id, warehouse_id, quantity,
                status, version, last_error_code
           FROM ${SCHEMA}.production_orders
          WHERE tenant_id = $1 AND org_unit_id IS NOT NULL
            AND ($2::varchar[] IS NULL OR org_unit_id = ANY($2::varchar[]))
          ORDER BY created_at DESC LIMIT 200`,
        [principal.tenantId, roots],
      );
      return res.rows;
    });
  }

  async getProductionOrder(principal: ModulePrincipal, orderId: string) {
    if (!z.string().uuid().safeParse(orderId).success) throw new BadRequestException('Order ID must be a UUID.');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const order = await client.query(
        `SELECT id, order_number, bom_id, finished_product_id, finished_uom_id,
                warehouse_id, org_unit_id, quantity, status, version, inventory_receipt_id, last_error_code
           FROM ${SCHEMA}.production_orders WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, orderId],
      );
      if (!order.rows[0]) throw new NotFoundException('Production order not found.');
      await this.assertUnitAccess(client, principal, order.rows[0].org_unit_id, 'read');
      const lines = await client.query(
        `SELECT id, line_number, component_product_id, uom_id, required_quantity,
                reservation_id, issued_quantity
           FROM ${SCHEMA}.production_order_lines
          WHERE tenant_id = $1 AND production_order_id = $2 ORDER BY line_number`,
        [principal.tenantId, orderId],
      );
      return { ...order.rows[0], lines: lines.rows };
    });
  }

  private async loadBomRow(client: PoolClient, tenantId: string, bomId: string) {
    const res = await client.query(
      `SELECT * FROM ${SCHEMA}.boms WHERE tenant_id = $1 AND id = $2`,
      [tenantId, bomId],
    );
    if (!res.rows[0]) throw new NotFoundException('BOM not found.');
    return res.rows[0];
  }

  private async loadBomNode(client: PoolClient, tenantId: string, bomId: string): Promise<BomNode> {
    const header = await this.loadBomRow(client, tenantId, bomId);
    const lines = await client.query(
      `SELECT component_product_id, uom_id, quantity_per::text, sub_bom_id
         FROM ${SCHEMA}.bom_lines WHERE tenant_id = $1 AND bom_id = $2 ORDER BY line_number`,
      [tenantId, bomId],
    );
    return {
      id: bomId,
      finishedProductId: header.finished_product_id,
      lines: lines.rows.map((row) => ({
        componentProductId: row.component_product_id,
        uomId: row.uom_id,
        quantityPer: row.quantity_per,
        subBomId: row.sub_bom_id,
      })),
    };
  }

  private async loadAllBoms(client: PoolClient, tenantId: string, orgUnitId: string): Promise<Map<string, BomNode>> {
    const headers = await client.query<{ id: string; finished_product_id: string }>(
      `SELECT id, finished_product_id FROM ${SCHEMA}.boms
        WHERE tenant_id = $1 AND org_unit_id = $2 AND status = 'ACTIVE'`,
      [tenantId, orgUnitId],
    );
    const map = new Map<string, BomNode>();
    for (const header of headers.rows) {
      map.set(header.id, await this.loadBomNode(client, tenantId, header.id));
    }
    return map;
  }

  private nestedBomTree(bom: BomNode, all: ReadonlyMap<string, BomNode>): BomNode & { children: unknown[] } {
    return {
      ...bom,
      children: bom.lines.map((line) => line.subBomId ? {
        ...line, subBom: all.get(line.subBomId) ? this.nestedBomTree(all.get(line.subBomId)!, all) : null,
      } : { ...line, subBom: null }),
    };
  }

  private async lockOrder(client: PoolClient, tenantId: string, orderId: string) {
    const res = await client.query(
      `SELECT * FROM ${SCHEMA}.production_orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, orderId],
    );
    if (!res.rows[0]) throw new NotFoundException('Production order not found.');
    return res.rows[0];
  }
}
