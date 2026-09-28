import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  CreateCmmsPartV1Schema,
  RecordCmmsStockMovementV1Schema,
  SearchCmmsPartsV1Schema,
  UpdateCmmsPartV1Schema,
  type CmmsPageV1,
  type CmmsPartV1,
  type CmmsStockMovementTypeV1,
  type CmmsStockMovementV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import {
  assertUuid,
  iso,
  isoOrNull,
  notFound,
  numberOrNull,
  parseInput,
  recordMutation,
  translateConstraint,
  versionConflict,
} from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';

const PART_COLUMNS = `p.id, p.part_number, p.name, p.description, p.category, p.unit_of_measure, p.unit_cost,
  p.currency_code, p.quantity_on_hand, p.min_quantity, p.reorder_point, p.non_stock, p.barcode, p.site_ref,
  p.bin_location, p.department_id, p.archived_at, p.version, p.created_at, p.updated_at`;
const MOVEMENT_COLUMNS = `m.id, m.part_id, m.movement_type, m.quantity_delta, m.balance_after, m.work_order_id,
  m.unit_cost, m.currency_code, m.reason, m.created_by, m.created_at`;

export interface StockMovementRequest {
  readonly partId: string;
  readonly movementType: CmmsStockMovementTypeV1;
  readonly quantityDelta: number;
  readonly idempotencyKey: string;
  readonly workOrderId?: string | null;
  readonly unitCost?: number | null;
  readonly reason?: string | null;
}

@Injectable()
export class PartsService {
  constructor(private readonly database: DatabaseService) {}

  async search(principal: CmmsPrincipal, raw: unknown): Promise<CmmsPageV1<CmmsPartV1>> {
    const query = parseInput(SearchCmmsPartsV1Schema, raw);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['p.tenant_id = $1', ...scopePredicates(principal, values, 'p.')];
      if (!query.includeArchived) where.push('p.archived_at IS NULL');
      if (query.lowStockOnly) where.push('NOT p.non_stock AND p.quantity_on_hand <= COALESCE(p.reorder_point, p.min_quantity)');
      if (query.siteRef) {
        values.push(query.siteRef);
        where.push(`p.site_ref = $${values.length}`);
      }
      if (query.q) {
        values.push(`%${query.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
        where.push(`(p.name ILIKE $${values.length} OR p.part_number ILIKE $${values.length})`);
      }
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const result = await client.query(
        `SELECT ${PART_COLUMNS}, COUNT(*) OVER()::int AS total_count
           FROM gigalibs_cmms.parts p
          WHERE ${where.join(' AND ')}
          ORDER BY p.name ASC, p.id ASC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return {
        items: result.rows.map(mapPart),
        total: Number(result.rows[0]?.total_count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  async get(principal: CmmsPrincipal, partId: string): Promise<CmmsPartV1> {
    assertUuid(partId, 'partId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) =>
      mapPart(await this.visiblePartRow(client, principal, partId, { lock: false })),
    );
  }

  async movements(principal: CmmsPrincipal, partId: string): Promise<{ readonly items: readonly CmmsStockMovementV1[] }> {
    assertUuid(partId, 'partId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.visiblePartRow(client, principal, partId, { lock: false });
      const result = await client.query(
        `SELECT ${MOVEMENT_COLUMNS} FROM gigalibs_cmms.stock_movements m
          WHERE m.tenant_id = $1 AND m.part_id = $2
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 200`,
        [principal.tenantId, partId],
      );
      return { items: result.rows.map(mapMovement) };
    });
  }

  async create(context: CmmsCommandContext, raw: unknown): Promise<CmmsPartV1> {
    const input = parseInput(CreateCmmsPartV1Schema, raw);
    const departmentId = input.departmentId ?? null;
    const siteRef = input.siteRef ?? null;
    assertWritableScope(context.principal, { departmentId, siteRef });
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      let id: string;
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.parts
             (tenant_id, part_number, name, description, category, unit_of_measure, unit_cost, currency_code,
              min_quantity, reorder_point, non_stock, barcode, site_ref, bin_location, department_id,
              created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, $17)
           RETURNING id`,
          [
            context.principal.tenantId,
            input.partNumber,
            input.name,
            input.description ?? null,
            input.category ?? null,
            input.unitOfMeasure ?? 'EACH',
            input.unitCost ?? null,
            input.currencyCode,
            input.minQuantity ?? 0,
            input.reorderPoint ?? null,
            input.nonStock,
            input.barcode ?? null,
            siteRef,
            input.binLocation ?? null,
            departmentId,
            context.principal.subject,
            context.correlationId,
          ],
        );
        id = result.rows[0]!.id;
      } catch (error) {
        translateConstraint(error, { unique: `A part with number ${input.partNumber} already exists.` });
      }
      await recordMutation(client, context, {
        action: 'CMMS_PART_CREATED',
        aggregateType: 'CMMS_PART',
        aggregateId: id,
        aggregateVersion: 1,
        payload: { partNumber: input.partNumber, currencyCode: input.currencyCode, nonStock: input.nonStock },
      });
      if (input.openingQuantity !== undefined) {
        await this.applyMovement(client, context, {
          partId: id,
          movementType: 'RECEIPT',
          quantityDelta: input.openingQuantity,
          idempotencyKey: randomUUID(),
          unitCost: input.unitCost ?? null,
          reason: 'Opening balance',
        });
      }
      return mapPart(await this.visiblePartRow(client, context.principal, id, { lock: false, includeArchived: true }));
    });
  }

  async update(context: CmmsCommandContext, partId: string, raw: unknown): Promise<CmmsPartV1> {
    assertUuid(partId, 'partId');
    const input = parseInput(UpdateCmmsPartV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.visiblePartRow(client, context.principal, partId, { lock: true });
      if (Number(current.version) !== input.expectedVersion) versionConflict('The part');
      const departmentId = input.departmentId === undefined ? current.department_id : input.departmentId;
      const siteRef = input.siteRef === undefined ? current.site_ref : input.siteRef;
      assertWritableScope(context.principal, { departmentId: current.department_id, siteRef: current.site_ref });
      assertWritableScope(context.principal, { departmentId, siteRef });
      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.parts
            SET name = $4, description = $5, category = $6, unit_of_measure = $7, unit_cost = $8,
                min_quantity = $9, reorder_point = $10, barcode = $11, site_ref = $12, bin_location = $13,
                department_id = $14, version = version + 1, updated_by = $15, correlation_id = $16, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          partId,
          input.expectedVersion,
          input.name ?? current.name,
          input.description === undefined ? current.description : input.description,
          input.category === undefined ? current.category : input.category,
          input.unitOfMeasure ?? current.unit_of_measure,
          input.unitCost === undefined ? current.unit_cost : input.unitCost,
          input.minQuantity ?? current.min_quantity,
          input.reorderPoint === undefined ? current.reorder_point : input.reorderPoint,
          input.barcode === undefined ? current.barcode : input.barcode,
          siteRef,
          input.binLocation === undefined ? current.bin_location : input.binLocation,
          departmentId,
          context.principal.subject,
          context.correlationId,
        ],
      );
      if (result.rowCount === 0) versionConflict('The part');
      await recordMutation(client, context, {
        action: 'CMMS_PART_UPDATED',
        aggregateType: 'CMMS_PART',
        aggregateId: partId,
        aggregateVersion: Number(result.rows[0]!.version),
        payload: { changed: Object.keys(input).filter((key) => key !== 'expectedVersion') },
      });
      return mapPart(await this.visiblePartRow(client, context.principal, partId, { lock: false }));
    });
  }

  /** RECEIPT, RETURN (against a work order that issued the part) or a reasoned ADJUSTMENT. */
  async recordMovement(
    context: CmmsCommandContext,
    partId: string,
    raw: unknown,
  ): Promise<{ readonly part: CmmsPartV1; readonly movement: CmmsStockMovementV1; readonly replayed: boolean }> {
    assertUuid(partId, 'partId');
    const input = parseInput(RecordCmmsStockMovementV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const part = await this.visiblePartRow(client, context.principal, partId, { lock: true });
      assertWritableScope(context.principal, { departmentId: part.department_id, siteRef: part.site_ref });
      const replay = await this.replayedMovement(client, context.principal.tenantId, input.idempotencyKey, partId);
      if (replay) return { part: mapPart(part), movement: replay, replayed: true };

      let request: StockMovementRequest;
      if (input.movementType === 'RECEIPT') {
        request = {
          partId,
          movementType: 'RECEIPT',
          quantityDelta: input.quantity,
          idempotencyKey: input.idempotencyKey,
          unitCost: input.unitCost ?? null,
          reason: input.reason ?? null,
        };
      } else if (input.movementType === 'RETURN') {
        const issued = await client.query<{ net_issued: string | null }>(
          `SELECT -SUM(quantity_delta) AS net_issued FROM gigalibs_cmms.stock_movements
            WHERE tenant_id = $1 AND part_id = $2 AND work_order_id = $3 AND movement_type IN ('ISSUE', 'RETURN')`,
          [context.principal.tenantId, partId, input.workOrderId],
        );
        const netIssued = Number(issued.rows[0]?.net_issued ?? 0);
        if (input.quantity > netIssued) {
          throw new BadRequestException({
            code: 'CMMS_RETURN_EXCEEDS_ISSUE',
            message: `Only ${netIssued} of this part is outstanding on that work order.`,
          });
        }
        request = {
          partId,
          movementType: 'RETURN',
          quantityDelta: input.quantity,
          idempotencyKey: input.idempotencyKey,
          workOrderId: input.workOrderId,
          reason: input.reason ?? null,
        };
      } else {
        request = {
          partId,
          movementType: 'ADJUSTMENT',
          quantityDelta: input.quantityDelta,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
        };
      }
      const movement = await this.applyMovement(client, context, request);
      return {
        part: mapPart(await this.visiblePartRow(client, context.principal, partId, { lock: false })),
        movement,
        replayed: false,
      };
    });
  }

  /**
   * Applies one ledger movement in the caller's transaction. The balance changes only through this
   * conditional update, so the ledger sum always equals the balance and stock can never go negative even under
   * concurrent issues. Non-stock parts record the movement (for cost) without a balance.
   */
  async applyMovement(client: PoolClient, context: CmmsCommandContext, request: StockMovementRequest): Promise<CmmsStockMovementV1> {
    const tenantId = context.principal.tenantId;
    const partResult = await client.query(
      `SELECT id, part_number, name, unit_cost, currency_code, non_stock, quantity_on_hand, reorder_point, archived_at
         FROM gigalibs_cmms.parts WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, request.partId],
    );
    const part = partResult.rows[0];
    if (!part) notFound('The part');
    if (part.archived_at) throw new ConflictException({ code: 'CMMS_PART_ARCHIVED', message: 'Archived parts cannot move stock.' });
    if (part.non_stock && request.movementType !== 'ISSUE' && request.movementType !== 'RETURN') {
      throw new BadRequestException({ code: 'CMMS_NON_STOCK_PART', message: 'A non-stock part has no stock balance to receive or adjust.' });
    }

    const updated = await client.query<{ quantity_on_hand: string; version: number }>(
      part.non_stock
        ? `UPDATE gigalibs_cmms.parts SET version = version + 1, updated_by = $4, correlation_id = $5, updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND $3::numeric IS NOT NULL RETURNING quantity_on_hand, version`
        : `UPDATE gigalibs_cmms.parts
              SET quantity_on_hand = quantity_on_hand + $3::numeric, version = version + 1,
                  updated_by = $4, correlation_id = $5, updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND quantity_on_hand + $3::numeric >= 0
            RETURNING quantity_on_hand, version`,
      [tenantId, request.partId, request.quantityDelta, context.principal.subject, context.correlationId],
    );
    if (updated.rowCount === 0) {
      throw new ConflictException({
        code: 'CMMS_INSUFFICIENT_STOCK',
        message: `Only ${Number(part.quantity_on_hand)} ${part.part_number} on hand.`,
      });
    }
    const balanceAfter = part.non_stock ? null : Number(updated.rows[0]!.quantity_on_hand);
    const version = Number(updated.rows[0]!.version);
    const unitCost = request.unitCost ?? numberOrNull(part.unit_cost);

    let movementRow;
    try {
      movementRow = await client.query(
        `INSERT INTO gigalibs_cmms.stock_movements AS m
           (tenant_id, part_id, movement_type, quantity_delta, balance_after, work_order_id, unit_cost,
            currency_code, reason, idempotency_key, created_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING ${MOVEMENT_COLUMNS}`,
        [
          tenantId,
          request.partId,
          request.movementType,
          request.quantityDelta,
          balanceAfter,
          request.workOrderId ?? null,
          unitCost,
          part.currency_code,
          request.reason ?? null,
          request.idempotencyKey,
          context.principal.subject,
          context.correlationId,
        ],
      );
    } catch (error) {
      translateConstraint(error, {
        unique: 'This stock request was already recorded.',
        reference: 'The referenced work order does not exist.',
      });
    }
    const movement = mapMovement(movementRow.rows[0]);
    await recordMutation(client, context, {
      action: `CMMS_STOCK_${request.movementType}`,
      aggregateType: 'CMMS_PART',
      aggregateId: request.partId,
      aggregateVersion: version,
      payload: {
        movementId: movement.id,
        quantityDelta: request.quantityDelta,
        balanceAfter,
        workOrderId: request.workOrderId ?? null,
        unitCost,
        currencyCode: part.currency_code,
      },
    });

    const reorderPoint = numberOrNull(part.reorder_point);
    const before = Number(part.quantity_on_hand);
    if (
      !part.non_stock &&
      reorderPoint !== null &&
      balanceAfter !== null &&
      balanceAfter <= reorderPoint &&
      before > reorderPoint
    ) {
      // A request for replenishment, never a purchase or receipt claim (CM-03).
      await recordMutation(client, context, {
        action: 'CMMS_PART_REORDER_REQUESTED',
        aggregateType: 'CMMS_PART',
        aggregateId: request.partId,
        aggregateVersion: version,
        payload: { partNumber: part.part_number, quantityOnHand: balanceAfter, reorderPoint },
      });
    }
    return movement;
  }

  async replayedMovement(
    client: PoolClient,
    tenantId: string,
    idempotencyKey: string,
    partId: string,
  ): Promise<CmmsStockMovementV1 | null> {
    const existing = await client.query(
      `SELECT ${MOVEMENT_COLUMNS} FROM gigalibs_cmms.stock_movements m WHERE m.tenant_id = $1 AND m.idempotency_key = $2`,
      [tenantId, idempotencyKey],
    );
    if (!existing.rows[0]) return null;
    if (existing.rows[0].part_id !== partId) {
      throw new ConflictException({ code: 'CMMS_IDEMPOTENCY_KEY_REUSED', message: 'This request key was used for another part.' });
    }
    return mapMovement(existing.rows[0]);
  }

  async visiblePartRow(
    client: PoolClient,
    principal: CmmsPrincipal,
    partId: string,
    options: { readonly lock: boolean; readonly includeArchived?: boolean },
  ): Promise<any> {
    const values: unknown[] = [principal.tenantId, partId];
    const where = ['p.tenant_id = $1', 'p.id = $2', ...scopePredicates(principal, values, 'p.')];
    if (!options.includeArchived) where.push('p.archived_at IS NULL');
    const result = await client.query(
      `SELECT ${PART_COLUMNS}, p.tenant_id FROM gigalibs_cmms.parts p WHERE ${where.join(' AND ')}${options.lock ? ' FOR UPDATE' : ''}`,
      values,
    );
    if (!result.rows[0]) notFound('The part');
    return result.rows[0];
  }
}

export function mapPart(row: any): CmmsPartV1 {
  const quantityOnHand = Number(row.quantity_on_hand);
  const reorderPoint = numberOrNull(row.reorder_point);
  const minQuantity = Number(row.min_quantity);
  return {
    id: row.id,
    partNumber: row.part_number,
    name: row.name,
    description: row.description ?? null,
    category: row.category ?? null,
    unitOfMeasure: row.unit_of_measure,
    unitCost: numberOrNull(row.unit_cost),
    currencyCode: row.currency_code,
    quantityOnHand,
    minQuantity,
    reorderPoint,
    lowStock: !row.non_stock && quantityOnHand <= (reorderPoint ?? minQuantity),
    nonStock: row.non_stock === true,
    barcode: row.barcode ?? null,
    siteRef: row.site_ref ?? null,
    binLocation: row.bin_location ?? null,
    departmentId: row.department_id ?? null,
    archivedAt: isoOrNull(row.archived_at),
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function mapMovement(row: any): CmmsStockMovementV1 {
  return {
    id: row.id,
    partId: row.part_id,
    movementType: row.movement_type,
    quantityDelta: Number(row.quantity_delta),
    balanceAfter: numberOrNull(row.balance_after),
    workOrderId: row.work_order_id ?? null,
    unitCost: numberOrNull(row.unit_cost),
    currencyCode: row.currency_code,
    reason: row.reason ?? null,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}
