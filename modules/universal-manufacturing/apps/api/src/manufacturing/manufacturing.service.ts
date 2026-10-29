import { randomUUID } from 'node:crypto';
import { ExactDecimal } from '@gigalibs/contracts';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { applyScrapFactor } from '../engine/cost-rollup.js';
import { explodeBomRequirements, type BomNode } from '../engine/bom-explosion.js';
import { netMrpRequirements } from '../engine/mrp-netting.js';
import {
  InventoryHandshakeClient,
  isManufacturingInventoryHandshakeConfigured,
} from '../inventory/inventory-handshake.client.js';
import {
  InventoryReserveReleaseClient,
  isManufacturingInventoryReserveReleaseConfigured,
} from '../inventory/inventory-reserve-release.client.js';

const CreateBomSchema = z
  .object({
    bomCode: z.string().min(1).max(64),
    finishedProductId: z.string().uuid(),
    scrapPercent: z.string().optional(),
    orgUnitId: z.string().max(64).optional(),
    lines: z
      .array(
        z.object({
          componentProductId: z.string().uuid(),
          uomId: z.string().uuid(),
          quantityPer: z.string(),
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
    quantity: z.string(),
    orgUnitId: z.string().max(64).optional(),
  })
  .strict();

const MrpPreviewSchema = z
  .object({
    warehouseId: z.string().uuid(),
    rows: z.array(
      z.object({
        productId: z.string().uuid(),
        demand: z.string(),
        supply: z.string(),
      }),
    ),
  })
  .strict();

@Injectable()
export class ManufacturingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly inventoryReserveRelease: InventoryReserveReleaseClient,
    private readonly inventoryHandshake: InventoryHandshakeClient,
  ) {}

  async createBom(principal: ModulePrincipal, raw: unknown) {
    const input = CreateBomSchema.parse(raw ?? {});
    const bomId = randomUUID();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
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
          input.orgUnitId ?? null,
          principal.subject,
        ],
      );
      let lineNumber = 0;
      for (const line of input.lines) {
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
      return { id: bomId, bomCode: input.bomCode, finishedProductId: input.finishedProductId };
    });
  }

  async listBoms(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT id, bom_code, finished_product_id, status, scrap_percent, version FROM ${SCHEMA}.boms
          WHERE tenant_id = $1 ORDER BY bom_code, version DESC`,
        [principal.tenantId],
      );
      return res.rows;
    });
  }

  async getBomTree(principal: ModulePrincipal, bomId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const bom = await this.loadBomNode(client, principal.tenantId, bomId);
      const bomsById = await this.loadAllBoms(client, principal.tenantId);
      const requirements = explodeBomRequirements(bom, '1.000000', bomsById);
      return {
        bom,
        unitRequirements: [...requirements.entries()].map(([productId, row]) => ({
          productId,
          uomId: row.uomId,
          quantity: row.quantity,
        })),
      };
    });
  }

  async createProductionOrder(principal: ModulePrincipal, raw: unknown) {
    const input = CreateProductionOrderSchema.parse(raw ?? {});
    const orderId = randomUUID();
    const correlationId = randomUUID();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const bom = await this.loadBomRow(client, principal.tenantId, input.bomId);
      if (bom.status !== 'ACTIVE') throw new ConflictException('BOM must be ACTIVE.');
      const bomNode = await this.loadBomNode(client, principal.tenantId, input.bomId);
      const bomsById = await this.loadAllBoms(client, principal.tenantId);
      const qtyWithScrap = applyScrapFactor(input.quantity, String(bom.scrap_percent));
      const requirements = explodeBomRequirements(bomNode, qtyWithScrap, bomsById);
      const seq = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${SCHEMA}.production_orders WHERE tenant_id = $1`,
        [principal.tenantId],
      );
      const orderNumber = `MO-${String(Number(seq.rows[0]?.count ?? 0) + 1).padStart(5, '0')}`;
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
          input.orgUnitId ?? bom.org_unit_id,
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
      return { id: orderId, orderNumber, status: 'DRAFT' };
    });
  }

  async releaseProductionOrder(principal: ModulePrincipal, orderId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const order = await this.lockOrder(client, principal.tenantId, orderId);
      if (order.status === 'RELEASED') return { id: orderId, status: 'RELEASED' };
      if (order.status !== 'DRAFT') throw new ConflictException('Only DRAFT orders can be released.');
      const lines = await client.query<{
        id: string;
        component_product_id: string;
        uom_id: string;
        required_quantity: string;
      }>(
        `SELECT id, component_product_id, uom_id, required_quantity FROM ${SCHEMA}.production_order_lines
          WHERE tenant_id = $1 AND production_order_id = $2 ORDER BY line_number`,
        [principal.tenantId, orderId],
      );
      if (isManufacturingInventoryReserveReleaseConfigured()) {
        for (const line of lines.rows) {
          const reserve = await this.inventoryReserveRelease.execute(principal, {
            action: 'RESERVE',
            reservationType: 'HARD',
            commandKey: randomUUID(),
            demandType: 'WORK_ORDER',
            demandReferenceId: orderId,
            demandLineId: line.id,
            warehouseId: order.warehouse_id,
            productId: line.component_product_id,
            uomId: line.uom_id,
            quantity: line.required_quantity,
            idempotencyKey: `mo:${orderId}:${line.id}`,
          });
          if (reserve.outcome !== 'RESERVED' || !reserve.reservationId) {
            throw new ConflictException('Inventory reservation failed for a component line.');
          }
          await client.query(
            `UPDATE ${SCHEMA}.production_order_lines SET reservation_id = $3 WHERE tenant_id = $1 AND id = $2`,
            [principal.tenantId, line.id, reserve.reservationId],
          );
        }
      }
      await client.query(
        `UPDATE ${SCHEMA}.production_orders SET status = 'RELEASED', version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, orderId],
      );
      return { id: orderId, status: 'RELEASED' };
    });
  }

  async issueProductionOrder(principal: ModulePrincipal, orderId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const order = await this.lockOrder(client, principal.tenantId, orderId);
      if (order.status === 'ISSUED') return { id: orderId, status: 'ISSUED' };
      if (order.status !== 'RELEASED') throw new ConflictException('Order must be released before issue.');
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
      if (isManufacturingInventoryHandshakeConfigured()) {
        for (const line of lines.rows) {
          if (!line.reservation_id) continue;
          const issued = await this.inventoryHandshake.issueLine(principal, {
            reservationId: line.reservation_id,
            productionOrderId: orderId,
            productionLineId: line.id,
            quantity: line.required_quantity,
            correlationId: order.correlation_id,
          });
          await client.query(
            `UPDATE ${SCHEMA}.production_order_lines SET issued_quantity = $3 WHERE tenant_id = $1 AND id = $2`,
            [principal.tenantId, line.id, issued.issuedQuantity],
          );
        }
      }
      await client.query(
        `UPDATE ${SCHEMA}.production_orders SET status = 'ISSUED', version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, orderId],
      );
      return { id: orderId, status: 'ISSUED' };
    });
  }

  async completeProductionOrder(principal: ModulePrincipal, orderId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const order = await this.lockOrder(client, principal.tenantId, orderId);
      if (order.status === 'COMPLETED') return { id: orderId, status: 'COMPLETED' };
      const handshake = isManufacturingInventoryHandshakeConfigured();
      if (handshake && order.status !== 'ISSUED') {
        throw new ConflictException('Order must be issued before completion when inventory handshake is enabled.');
      }
      if (!handshake && order.status !== 'RELEASED' && order.status !== 'ISSUED') {
        throw new ConflictException('Order must be released before completion.');
      }
      let inventoryReceiptId: string | null = order.inventory_receipt_id ?? null;
      if (handshake && !inventoryReceiptId) {
        if (!order.finished_uom_id) throw new ConflictException('Production order is missing finished UOM.');
        const receipt = await this.inventoryHandshake.receiveFinishedGoods(principal, {
          commandKey: orderId,
          productionOrderId: orderId,
          warehouseId: order.warehouse_id,
          productId: order.finished_product_id,
          uomId: order.finished_uom_id,
          quantity: String(order.quantity),
        });
        inventoryReceiptId = receipt.receiptId;
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
        quantity:
          ExactDecimal.isPositive(String(line.issued_quantity)) ? String(line.issued_quantity) : String(line.required_quantity),
      }));
      await client.query(
        `UPDATE ${SCHEMA}.production_orders
            SET status = 'COMPLETED', inventory_receipt_id = COALESCE($3, inventory_receipt_id),
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, orderId, inventoryReceiptId],
      );
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
            inventoryReceiptId,
            orgUnitId: order.org_unit_id ?? null,
            componentLines,
          }),
        ],
      );
      return { id: orderId, status: 'COMPLETED' };
    });
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
      for (const row of nets) {
        if (ExactDecimal.isZero(row.netRequirement)) continue;
        await client.query(
          `INSERT INTO ${SCHEMA}.production_plans
             (id, tenant_id, run_id, product_id, warehouse_id, net_requirement, suggested_order_qty)
           VALUES ($1,$2,$3,$4,$5,$6,$6)`,
          [randomUUID(), principal.tenantId, runId, row.productId, row.warehouseId, row.netRequirement],
        );
      }
    });
    return { runId, lines: nets };
  }

  async listProductionOrders(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT id, order_number, bom_id, finished_product_id, warehouse_id, quantity, status, version
           FROM ${SCHEMA}.production_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [principal.tenantId],
      );
      return res.rows;
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

  private async loadAllBoms(client: PoolClient, tenantId: string): Promise<Map<string, BomNode>> {
    const headers = await client.query<{ id: string; finished_product_id: string }>(
      `SELECT id, finished_product_id FROM ${SCHEMA}.boms WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [tenantId],
    );
    const map = new Map<string, BomNode>();
    for (const header of headers.rows) {
      map.set(header.id, await this.loadBomNode(client, tenantId, header.id));
    }
    return map;
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
