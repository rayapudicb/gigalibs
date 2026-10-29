import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationReplica, assertOrganizationWrite, organizationAccess, type ModulePrincipal } from '@gigalibs/module-sdk';
import type pg from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import {
  mapBalance,
  mapCostLayer,
  mapPostedReceiptCost,
  mapReservation,
  mapItem,
  mapLedgerEntry,
  mapLocation,
  mapLot,
  mapReceipt,
  mapWarehouse,
} from './inventory.service.js';

// WI-OI-120f (F0.5, ADR-0033 D1): the reads and the few commands Inventory's metadata windows need, beside the
// domain service. Every query is tenant-bound (forced RLS plus tenant_id), paged in SQL, and accepts only the columns
// each entity declares for search, filter and sort; values are always bound parameters.

export type InventoryEntity =
  | 'warehouses'
  | 'locations'
  | 'items'
  | 'lots'
  | 'receipts'
  | 'receiptLines'
  | 'balances'
  | 'ledger'
  | 'costLayers'
  | 'postedReceiptCosts'
  | 'reservations';

export interface InventoryPageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  /** A domain field name from the entity's `sort` list. */
  readonly sortField?: string;
  readonly sortDirection: 'ASC' | 'DESC';
  /** Domain field name → value, from the entity's `filter` list. */
  readonly filters: Readonly<Record<string, string>>;
  readonly parentId?: string;
}

interface EntitySpec {
  readonly table: string;
  readonly search: readonly string[];
  /** Domain field → column, for filtering. */
  readonly filter: Readonly<Record<string, string>>;
  /** Domain field → column, for sorting. */
  readonly sort: Readonly<Record<string, string>>;
  readonly defaultSort: string;
  readonly parent?: string;
  readonly map: (row: any) => Record<string, unknown>;
}

const SPECS: Readonly<Record<InventoryEntity, EntitySpec>> = {
  warehouses: {
    table: 'warehouses',
    search: ['code', 'name'],
    filter: { warehouseType: 'warehouse_type' },
    sort: { code: 'code', name: 'name' },
    defaultSort: 'code',
    map: (row) => ({ ...mapWarehouse(row) }),
  },
  locations: {
    table: 'locations',
    search: ['code', 'name', 'barcode'],
    filter: { locationType: 'location_type' },
    sort: { code: 'code', name: 'name' },
    defaultSort: 'code',
    parent: 'warehouse_id',
    map: (row) => ({ ...mapLocation(row) }),
  },
  items: {
    table: 'inventory_items',
    search: [],
    filter: { valuationMethod: 'valuation_method' },
    sort: { createdAt: 'created_at' },
    defaultSort: 'created_at',
    map: (row) => ({ ...mapItem(row) }),
  },
  lots: {
    table: 'inventory_lots',
    search: ['lot_number', 'batch_code', 'supplier_lot_number'],
    filter: { status: 'status' },
    sort: { lotNumber: 'lot_number', expiryDate: 'expiry_date' },
    defaultSort: 'lot_number',
    map: (row) => ({ ...mapLot(row) }),
  },
  receipts: {
    table: 'receipts',
    search: ['receipt_number', 'external_document_reference'],
    filter: { status: 'status' },
    sort: { receiptNumber: 'receipt_number', createdAt: 'created_at' },
    defaultSort: 'created_at',
    map: (row) => {
      const { lines: _lines, ...receipt } = mapReceipt(row, []);
      return receipt;
    },
  },
  receiptLines: {
    table: 'receipt_lines',
    search: ['lot_number'],
    filter: { inspectionStatus: 'inspection_status' },
    sort: { lineNumber: 'line_number' },
    defaultSort: 'line_number',
    parent: 'receipt_id',
    map: (row) => ({ ...(mapReceipt({ ...RECEIPT_SHELL }, [row]).lines?.[0] ?? {}) }),
  },
  balances: {
    table: 'stock_balances',
    search: [],
    filter: { stockStatus: 'stock_status' },
    sort: { lastMovementAt: 'last_movement_at' },
    defaultSort: 'last_movement_at',
    map: (row) => ({ ...mapBalance(row) }),
  },
  reservations: {
    table: 'inventory_reservations',
    search: ['demand_reference_id'],
    filter: { warehouseId: 'warehouse_id', status: 'status', demandType: 'demand_type' },
    sort: { createdAt: 'created_at' },
    defaultSort: 'created_at',
    map: (row) => ({ ...mapReservation(row) }),
  },
  ledger: {
    table: 'stock_ledger_entries',
    search: [],
    filter: { direction: 'direction', stockStatus: 'stock_status' },
    sort: { createdAt: 'created_at' },
    defaultSort: 'created_at',
    map: (row) => ({ ...mapLedgerEntry(row) }),
  },
  costLayers: {
    table: 'inventory_cost_layers',
    search: [],
    filter: { productId: 'product_id', warehouseId: 'warehouse_id', valuationMethod: 'valuation_method' },
    sort: { createdAt: 'created_at' },
    defaultSort: 'created_at',
    map: (row) => ({ ...mapCostLayer(row) }),
  },
  postedReceiptCosts: {
    table: 'inventory_receipt_cost_records',
    search: [],
    filter: { productId: 'product_id', warehouseId: 'warehouse_id', valuationMethod: 'valuation_method' },
    sort: { createdAt: 'created_at' },
    defaultSort: 'created_at',
    map: (row) => ({ ...mapPostedReceiptCost(row) }),
  },
};

/** A receipt row with only the fields mapReceipt reads, so a single receipt line can be mapped on its own. */
const RECEIPT_SHELL = { created_at: '1970-01-01T00:00:00.000Z', updated_at: '1970-01-01T00:00:00.000Z' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InventoryPage {
  readonly items: readonly Record<string, unknown>[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface UpdateWarehouseFields {
  readonly name?: string;
  readonly description?: string | null;
  readonly warehouseType?: string;
  readonly address?: string | null;
}

export interface AddReceiptLineFields {
  readonly productId: string;
  readonly uomId: string;
  readonly expectedQuantity: string;
  readonly targetLocationId?: string | null;
  readonly lotNumber?: string | null;
  readonly expiryDate?: string | null;
}

/** Raised when the record changed since the caller read it; the record adapter turns it into a 412. */
export class InventoryVersionConflict extends ConflictException {
  constructor() {
    super({ code: 'UNIVERSAL_INVENTORY_VERSION_CONFLICT', message: 'The record was changed by someone else; reload it before retrying.' });
  }
}

@Injectable()
export class InventoryRecordsService {
  private readonly orgReplica = new OrganizationReplica(SCHEMA);

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async readScope(
    client: pg.PoolClient,
    principal: ModulePrincipal,
    entity: InventoryEntity,
    values: unknown[],
  ): Promise<string> {
    const access = await organizationAccess(this.orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'TENANT' });
    if (access.denied) return 'FALSE';
    if (access.readUnits === null) return 'TRUE';
    if (entity === 'items' || entity === 'lots') return 'TRUE'; // tenant-shared product master data
    const placeholder = `$${values.push([...access.readUnits])}::text[]`;
    if (entity === 'warehouses') return `(t.org_unit_id IS NULL OR t.org_unit_id = ANY(${placeholder}))`;
    if (entity === 'receiptLines') {
      return `EXISTS (SELECT 1 FROM ${SCHEMA}.receipts r
        JOIN ${SCHEMA}.warehouses w ON w.tenant_id = r.tenant_id AND w.id = r.warehouse_id
        WHERE r.tenant_id = t.tenant_id AND r.id = t.receipt_id
          AND (w.org_unit_id IS NULL OR w.org_unit_id = ANY(${placeholder})))`;
    }
    return `EXISTS (SELECT 1 FROM ${SCHEMA}.warehouses w
      WHERE w.tenant_id = t.tenant_id AND w.id = t.warehouse_id
        AND (w.org_unit_id IS NULL OR w.org_unit_id = ANY(${placeholder})))`;
  }

  private async assertWarehouseWrite(client: pg.PoolClient, principal: ModulePrincipal, warehouseId: string): Promise<void> {
    const access = await organizationAccess(this.orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'TENANT' });
    const result = await client.query(
      `SELECT org_unit_id FROM ${SCHEMA}.warehouses WHERE tenant_id = $1 AND id = $2`,
      [principal.tenantId, warehouseId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Warehouse not found.');
    assertOrganizationWrite(access, result.rows[0].org_unit_id);
  }

  page(principal: ModulePrincipal, entity: InventoryEntity, query: InventoryPageQuery): Promise<InventoryPage> {
    const spec = SPECS[entity];
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['t.tenant_id = $1', await this.readScope(client, principal, entity, values)];
      if (query.parentId !== undefined) {
        if (!spec.parent) throw new BadRequestException(`${entity} has no parent.`);
        values.push(query.parentId);
        where.push(`t.${spec.parent} = $${values.length}`);
      }
      if (query.search && spec.search.length > 0) {
        values.push(`%${query.search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
        where.push(`(${spec.search.map((column) => `t.${column} ILIKE $${values.length}`).join(' OR ')})`);
      }
      for (const [field, value] of Object.entries(query.filters)) {
        const column = spec.filter[field];
        if (!column) throw new BadRequestException(`${entity} cannot be filtered by ${field}.`);
        values.push(value);
        where.push(`t.${column} = $${values.length}`);
      }
      const sortColumn = query.sortField ? spec.sort[query.sortField] : spec.defaultSort;
      if (!sortColumn) throw new BadRequestException(`${entity} cannot be sorted by ${query.sortField}.`);
      const direction = query.sortDirection === 'DESC' ? 'DESC' : 'ASC';
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const result = await client.query(
        `SELECT t.*, count(*) OVER () AS total_rows
           FROM ${SCHEMA}.${spec.table} t
          WHERE ${where.join(' AND ')}
          ORDER BY t.${sortColumn} ${direction}, t.id ASC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return {
        items: result.rows.map((row) => spec.map(row)),
        total: result.rows.length > 0 ? Number(result.rows[0].total_rows) : await this.count(client, spec, where, values.slice(0, -2)),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  private async count(client: pg.PoolClient, spec: EntitySpec, where: readonly string[], values: readonly unknown[]): Promise<number> {
    const result = await client.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.${spec.table} t WHERE ${where.join(' AND ')}`, [...values]);
    return Number(result.rows[0]?.n ?? 0);
  }

  get(principal: ModulePrincipal, entity: InventoryEntity, id: string): Promise<Record<string, unknown> | null> {
    if (!UUID.test(id)) return Promise.resolve(null);
    const spec = SPECS[entity];
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId, id];
      const scope = await this.readScope(client, principal, entity, values);
      const result = await client.query(
        `SELECT t.* FROM ${SCHEMA}.${spec.table} t WHERE t.tenant_id = $1 AND t.id = $2 AND ${scope}`,
        values,
      );
      return result.rows[0] ? spec.map(result.rows[0]) : null;
    });
  }

  /** Changes a warehouse's descriptive fields when the caller holds its current version. */
  updateWarehouse(principal: ModulePrincipal, id: string, fields: UpdateWarehouseFields, expectedVersion: number) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assertWarehouseWrite(client, principal, id);
      const result = await client.query(
        `UPDATE ${SCHEMA}.warehouses
            SET name = COALESCE($4, name),
                description = CASE WHEN $5::boolean THEN $6 ELSE description END,
                warehouse_type = COALESCE($7, warehouse_type),
                address = CASE WHEN $8::boolean THEN $9 ELSE address END,
                version = version + 1,
                updated_by = $10,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING *`,
        [
          principal.tenantId,
          id,
          expectedVersion,
          fields.name ?? null,
          'description' in fields,
          fields.description ?? null,
          fields.warehouseType ?? null,
          'address' in fields,
          fields.address ?? null,
          principal.subject,
        ],
      );
      if (result.rowCount === 1) {
        await client.query(
          `INSERT INTO ${SCHEMA}.audit_events (id, tenant_id, entity_type, entity_id, action, actor_id, payload)
           VALUES ($1, $2, 'warehouse', $3, 'UPDATE', $4, $5::jsonb)`,
          [randomUUID(), principal.tenantId, id, principal.subject, JSON.stringify({ name: fields.name, warehouseType: fields.warehouseType })],
        );
        await client.query(
          `INSERT INTO ${SCHEMA}.outbox_events (
             id, tenant_id, topic, event_type, aggregate_type, aggregate_id,
             aggregate_version, correlation_id, schema_version, payload, status, created_at
           ) VALUES ($1, $2, $3, 'inventory.warehouse.updated.v1', 'warehouse', $4, $5, $4, 1, $6, 'PENDING', now())`,
          [
            randomUUID(),
            principal.tenantId,
            TOPIC,
            id,
            expectedVersion + 1,
            JSON.stringify({ warehouseId: id, updatedBy: principal.subject }),
          ],
        );
        return { ...mapWarehouse(result.rows[0]) };
      }
      const exists = await client.query(`SELECT 1 FROM ${SCHEMA}.warehouses WHERE tenant_id = $1 AND id = $2`, [principal.tenantId, id]);
      if (exists.rowCount === 0) throw new NotFoundException('Warehouse not found.');
      throw new InventoryVersionConflict();
    });
  }

  /** Adds a line to a DRAFT receipt; a completed receipt cannot change. */
  addReceiptLine(principal: ModulePrincipal, receiptId: string, line: AddReceiptLineFields) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const receipt = await client.query(`SELECT status, warehouse_id FROM ${SCHEMA}.receipts WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [principal.tenantId, receiptId]);
      if (receipt.rowCount === 0) throw new NotFoundException('Receipt not found.');
      await this.assertWarehouseWrite(client, principal, receipt.rows[0].warehouse_id);
      if (receipt.rows[0].status !== 'DRAFT') throw new ConflictException('Only a draft receipt can take new lines.');
      const next = await client.query(
        `SELECT COALESCE(MAX(line_number), 0) + 1 AS n FROM ${SCHEMA}.receipt_lines WHERE tenant_id = $1 AND receipt_id = $2`,
        [principal.tenantId, receiptId],
      );
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.receipt_lines (
           id, tenant_id, receipt_id, line_number, product_id, uom_id, expected_quantity, received_quantity,
           target_location_id, lot_number, expiry_date, inspection_status, custom_extensions, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, 'PENDING', '{}', now(), now())
         RETURNING *`,
        [
          randomUUID(),
          principal.tenantId,
          receiptId,
          Number(next.rows[0].n),
          line.productId,
          line.uomId,
          line.expectedQuantity,
          line.targetLocationId ?? null,
          line.lotNumber ?? null,
          line.expiryDate ?? null,
        ],
      );
      await client.query(`UPDATE ${SCHEMA}.receipts SET version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`, [
        principal.tenantId,
        receiptId,
      ]);
      const lineId = inserted.rows[0].id as string;
      await client.query(
        `INSERT INTO ${SCHEMA}.audit_events (id, tenant_id, entity_type, entity_id, action, actor_id, payload)
         VALUES ($1, $2, 'receipt_line', $3, 'CREATE', $4, $5::jsonb)`,
        [randomUUID(), principal.tenantId, lineId, principal.subject, JSON.stringify({ receiptId, productId: line.productId })],
      );
      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (id, tenant_id, event_type, payload, status, created_at)
         VALUES ($1, $2, 'inventory.receipt.line.added.v1', $3::jsonb, 'PENDING', now())`,
        [randomUUID(), principal.tenantId, JSON.stringify({ receiptId, lineId, productId: line.productId })],
      );
      return SPECS.receiptLines.map(inserted.rows[0]);
    });
  }

  /** Options for a lookup: warehouses or locations of the tenant, by text or by ids. */
  lookup(principal: ModulePrincipal, entity: 'warehouses' | 'locations', request: { search?: string; ids?: readonly string[]; limit: number }) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['t.tenant_id = $1', 't.active = true', await this.readScope(client, principal, entity, values)];
      if (request.ids?.length) {
        values.push(request.ids);
        where.push(`t.id = ANY($${values.length}::uuid[])`);
      } else if (request.search) {
        values.push(`%${request.search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
        where.push(`(t.code ILIKE $${values.length} OR t.name ILIKE $${values.length})`);
      }
      values.push(request.limit);
      const result = await client.query(
        `SELECT t.id, t.code || ' — ' || t.name AS label FROM ${SCHEMA}.${entity} t WHERE ${where.join(' AND ')} ORDER BY t.code ASC LIMIT $${values.length}`,
        values,
      );
      return result.rows.map((row) => ({ value: String(row.id), label: String(row.label) }));
    });
  }
}
