import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export type PoStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface PoLineItem {
  id: string;
  poId: string;
  partId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | null;
  notes: string | null;
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  departmentId: string | null;
  status: string;
  reference: string | null;
  notes: string | null;
  currencyCode: string;
  totalCost: number | null;
  orderedAt: string | null;
  receivedAt: string | null;
  lineItems: PoLineItem[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly db: DatabaseService) {}

  async search(
    tenantId: string,
    params: { page?: number; pageSize?: number; status?: PoStatus; vendorId?: string; q?: string },
    departmentIds?: readonly string[],
  ): Promise<{ data: Omit<PurchaseOrder, 'lineItems'>[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (departmentIds && departmentIds.length > 0) {
      const placeholders = departmentIds.map(() => `$${idx++}`).join(', ');
      conditions.push(`(department_id IS NULL OR department_id IN (${placeholders}))`);
      for (const d of departmentIds) values.push(d);
    }

    if (params.status)   { conditions.push(`status = $${idx++}`);    values.push(params.status); }
    if (params.vendorId) { conditions.push(`vendor_id = $${idx++}`); values.push(params.vendorId); }
    if (params.q)        { conditions.push(`reference ILIKE $${idx++}`); values.push(`%${params.q}%`); }

    const where = conditions.join(' AND ');
    const [countResult, dataResult] = await Promise.all([
      this.db.queryWithTenant<{ total: string }>(tenantId, `SELECT COUNT(*) AS total FROM gigalibs_cmms.purchase_orders WHERE ${where}`, values),
      this.db.queryWithTenant(
        tenantId,
        `SELECT id, vendor_id, department_id, status, reference, notes, currency_code,
                total_cost, ordered_at, received_at, version, created_by, created_at, updated_at
         FROM gigalibs_cmms.purchase_orders WHERE ${where}
         ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, pageSize, offset],
      ),
    ]);

    return {
      data: dataResult.rows.map(mapPoHeader),
      total: Number(countResult.rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getOne(tenantId: string, id: string): Promise<PurchaseOrder> {
    const [poResult, lineResult] = await Promise.all([
      this.db.queryWithTenant(
        tenantId,
        `SELECT id, vendor_id, department_id, status, reference, notes, currency_code,
                total_cost, ordered_at, received_at, version, created_by, created_at, updated_at
         FROM gigalibs_cmms.purchase_orders WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
      ),
      this.db.queryWithTenant(
        tenantId,
        `SELECT id, po_id, part_id, quantity_ordered, quantity_received, unit_cost, notes
         FROM gigalibs_cmms.po_line_items WHERE tenant_id = $1 AND po_id = $2
         ORDER BY id`,
        [tenantId, id],
      ),
    ]);
    if (!poResult.rows[0]) throw new NotFoundException(`Purchase order ${id} not found.`);
    return { ...mapPoHeader(poResult.rows[0]), lineItems: lineResult.rows.map(mapLineItem) };
  }

  async create(
    tenantId: string,
    actorId: string,
    data: {
      vendorId: string;
      departmentId?: string;
      reference?: string;
      notes?: string;
      currencyCode?: string;
      lineItems?: Array<{ partId: string; quantityOrdered: number; unitCost?: number; notes?: string }>;
    },
  ): Promise<PurchaseOrder> {
    await this.ensureTenant(tenantId);
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const poId = randomUUID();
      const poResult = await client.query(
        `INSERT INTO gigalibs_cmms.purchase_orders (
           tenant_id, id, vendor_id, department_id, reference, notes, currency_code, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, vendor_id, department_id, status, reference, notes, currency_code,
                   total_cost, ordered_at, received_at, version, created_by, created_at, updated_at`,
        [
          tenantId, poId,
          data.vendorId,
          data.departmentId ?? null,
          data.reference ?? null,
          data.notes ?? null,
          (data.currencyCode ?? 'USD').toUpperCase(),
          actorId,
        ],
      );

      const lineItems: PoLineItem[] = [];
      for (const li of data.lineItems ?? []) {
        const liId = randomUUID();
        const liResult = await client.query(
          `INSERT INTO gigalibs_cmms.po_line_items (tenant_id, id, po_id, part_id, quantity_ordered, unit_cost, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, po_id, part_id, quantity_ordered, quantity_received, unit_cost, notes`,
          [tenantId, liId, poId, li.partId, li.quantityOrdered, li.unitCost ?? null, li.notes ?? null],
        );
        lineItems.push(mapLineItem(liResult.rows[0]));
      }

      // Recompute total_cost from line items
      if (lineItems.length > 0) {
        await client.query(
          `UPDATE gigalibs_cmms.purchase_orders
           SET total_cost = (SELECT COALESCE(SUM(quantity_ordered * unit_cost), 0) FROM gigalibs_cmms.po_line_items WHERE tenant_id = $1 AND po_id = $2 AND unit_cost IS NOT NULL)
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, poId],
        );
      }

      return { ...mapPoHeader(poResult.rows[0]), lineItems };
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    version: number,
    status: PoStatus,
    extra?: { orderedAt?: string; receivedAt?: string },
  ): Promise<Omit<PurchaseOrder, 'lineItems'>> {
    const VALID_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
      DRAFT:    ['SENT', 'CANCELLED'],
      SENT:     ['PARTIAL', 'RECEIVED', 'CANCELLED'],
      PARTIAL:  ['RECEIVED', 'CANCELLED'],
      RECEIVED: [],
      CANCELLED:[],
    };

    // Fetch current status first
    const currentResult = await this.db.queryWithTenant(
      tenantId,
      `SELECT status FROM gigalibs_cmms.purchase_orders WHERE tenant_id = $1 AND id = $2 AND version = $3`,
      [tenantId, id, version],
    );
    const current = currentResult.rows[0];
    if (!current) throw new ConflictException('Purchase order not found or version conflict.');
    if (!VALID_TRANSITIONS[current.status as PoStatus]?.includes(status)) {
      throw new BadRequestException(`Cannot transition purchase order from ${current.status} to ${status}.`);
    }

    const sets = ['status = $4', 'version = version + 1', 'updated_at = transaction_timestamp()'];
    const values: unknown[] = [tenantId, id, version, status];
    let idx = 5;
    if (extra?.orderedAt)  { sets.push(`ordered_at = $${idx++}`);  values.push(extra.orderedAt); }
    if (extra?.receivedAt) { sets.push(`received_at = $${idx++}`); values.push(extra.receivedAt); }

    const result = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_cmms.purchase_orders SET ${sets.join(', ')}
       WHERE tenant_id = $1 AND id = $2 AND version = $3
       RETURNING id, vendor_id, department_id, status, reference, notes, currency_code,
                 total_cost, ordered_at, received_at, version, created_by, created_at, updated_at`,
      values,
    );
    return mapPoHeader(result.rows[0]);
  }

  async receiveLineItem(
    tenantId: string,
    poId: string,
    lineItemId: string,
    quantityReceived: number,
  ): Promise<{ lineItem: PoLineItem; poStatus: string }> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const liResult = await client.query(
        `UPDATE gigalibs_cmms.po_line_items
         SET quantity_received = quantity_received + $1
         WHERE tenant_id = $2 AND po_id = $3 AND id = $4
           AND quantity_received + $1 <= quantity_ordered
         RETURNING id, po_id, part_id, quantity_ordered, quantity_received, unit_cost, notes`,
        [quantityReceived, tenantId, poId, lineItemId],
      );
      if (!liResult.rows[0]) {
        throw new BadRequestException('Line item not found, or receiving quantity would exceed ordered quantity.');
      }

      // Determine new PO status: PARTIAL if any line partially received, RECEIVED if all fully received
      const statusResult = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE quantity_received < quantity_ordered) AS unfulfilled,
           COUNT(*) FILTER (WHERE quantity_received > 0) AS partially_received
         FROM gigalibs_cmms.po_line_items WHERE tenant_id = $1 AND po_id = $2`,
        [tenantId, poId],
      );
      const unfulfilled = Number(statusResult.rows[0]?.unfulfilled ?? 1);
      const partiallyReceived = Number(statusResult.rows[0]?.partially_received ?? 0);
      const newStatus: PoStatus = unfulfilled === 0 ? 'RECEIVED' : partiallyReceived > 0 ? 'PARTIAL' : 'SENT';

      await client.query(
        `UPDATE gigalibs_cmms.purchase_orders
         SET status = $1, version = version + 1, updated_at = transaction_timestamp(),
             received_at = CASE WHEN $1 = 'RECEIVED' THEN transaction_timestamp() ELSE received_at END
         WHERE tenant_id = $2 AND id = $3`,
        [newStatus, tenantId, poId],
      );

      return { lineItem: mapLineItem(liResult.rows[0]), poStatus: newStatus };
    });
  }

  private async ensureTenant(tenantId: string): Promise<void> {
    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.module_tenants (id, oidc_issuer, external_tenant_subject)
       VALUES ($1, 'system', $1) ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
  }
}

function mapPoHeader(row: any): Omit<PurchaseOrder, 'lineItems'> {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    departmentId: row.department_id ?? null,
    status: row.status,
    reference: row.reference ?? null,
    notes: row.notes ?? null,
    currencyCode: row.currency_code,
    totalCost: row.total_cost ? Number(row.total_cost) : null,
    orderedAt: row.ordered_at ? row.ordered_at.toISOString() : null,
    receivedAt: row.received_at ? row.received_at.toISOString() : null,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapLineItem(row: any): PoLineItem {
  return {
    id: row.id,
    poId: row.po_id,
    partId: row.part_id,
    quantityOrdered: Number(row.quantity_ordered),
    quantityReceived: Number(row.quantity_received),
    unitCost: row.unit_cost ? Number(row.unit_cost) : null,
    notes: row.notes ?? null,
  };
}
