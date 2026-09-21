import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface Part {
  id: string;
  partNumber: string;
  name: string;
  description: string | null;
  category: string | null;
  unitOfMeasure: string;
  unitCost: number | null;
  currencyCode: string;
  quantityOnHand: number;
  minQuantity: number;
  maxQuantity: number | null;
  reorderPoint: number | null;
  nonStock: boolean;
  barcode: string | null;
  area: string | null;
  locationId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PartTransaction {
  id: string;
  partId: string;
  type: string;
  quantity: number;
  woId: string | null;
  poId: string | null;
  locationId: string | null;
  unitCost: number | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

@Injectable()
export class PartsService {
  constructor(private readonly db: DatabaseService) {}

  async search(
    tenantId: string,
    params: {
      page?: number;
      pageSize?: number;
      category?: string;
      lowStockOnly?: boolean;
      q?: string;
    },
    departmentIds?: readonly string[],
  ): Promise<{ data: Part[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['tenant_id = $1', 'NOT is_deleted'];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (departmentIds && departmentIds.length > 0) {
      const placeholders = departmentIds.map(() => `$${idx++}`).join(', ');
      conditions.push(`(department_id IS NULL OR department_id IN (${placeholders}))`);
      for (const d of departmentIds) values.push(d);
    }

    if (params.category) {
      conditions.push(`category = $${idx++}`);
      values.push(params.category);
    }
    if (params.lowStockOnly) {
      conditions.push(`quantity_on_hand <= COALESCE(reorder_point, min_quantity)`);
    }
    if (params.q) {
      conditions.push(`(name ILIKE $${idx} OR part_number ILIKE $${idx})`);
      values.push(`%${params.q}%`);
      idx++;
    }

    const where = conditions.join(' AND ');
    const [countResult, dataResult] = await Promise.all([
      this.db.queryWithTenant<{ total: string }>(tenantId, `SELECT COUNT(*) AS total FROM gigalibs_cmms.parts WHERE ${where}`, values),
      this.db.queryWithTenant(
        tenantId,
        `SELECT id, part_number, name, description, category, unit_of_measure, unit_cost, currency_code,
                quantity_on_hand, min_quantity, max_quantity, reorder_point, non_stock, barcode,
                area, location_id, version, created_at, updated_at
         FROM gigalibs_cmms.parts WHERE ${where}
         ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, pageSize, offset],
      ),
    ]);

    return {
      data: dataResult.rows.map(mapPart),
      total: Number(countResult.rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getOne(tenantId: string, id: string): Promise<Part> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, part_number, name, description, category, unit_of_measure, unit_cost, currency_code,
              quantity_on_hand, min_quantity, max_quantity, reorder_point, non_stock, barcode,
              area, location_id, version, created_at, updated_at
       FROM gigalibs_cmms.parts WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException(`Part ${id} not found.`);
    return mapPart(result.rows[0]);
  }

  async create(
    tenantId: string,
    actorId: string,
    data: {
      partNumber: string;
      name: string;
      description?: string;
      category?: string;
      unitOfMeasure?: string;
      unitCost?: number;
      currencyCode?: string;
      quantityOnHand?: number;
      minQuantity?: number;
      maxQuantity?: number;
      reorderPoint?: number;
      nonStock?: boolean;
      barcode?: string;
      area?: string;
      locationId?: string;
    },
  ): Promise<Part> {
    await this.ensureTenant(tenantId);
    const id = randomUUID();

    const result = await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.parts (
         tenant_id, id, part_number, name, description, category, unit_of_measure,
         unit_cost, currency_code, quantity_on_hand, min_quantity, max_quantity,
         reorder_point, non_stock, barcode, area, location_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id, part_number, name, description, category, unit_of_measure, unit_cost, currency_code,
                 quantity_on_hand, min_quantity, max_quantity, reorder_point, non_stock, barcode,
                 area, location_id, version, created_at, updated_at`,
      [
        tenantId, id,
        data.partNumber.trim().toUpperCase(),
        data.name.trim(),
        data.description ?? null,
        data.category ?? null,
        data.unitOfMeasure ?? 'EACH',
        data.unitCost ?? null,
        (data.currencyCode ?? 'USD').toUpperCase(),
        data.quantityOnHand ?? 0,
        data.minQuantity ?? 0,
        data.maxQuantity ?? null,
        data.reorderPoint ?? null,
        data.nonStock ?? false,
        data.barcode ?? null,
        data.area ?? null,
        data.locationId ?? null,
      ],
    );

    return mapPart(result.rows[0]);
  }

  async recordTransaction(
    tenantId: string,
    actorId: string,
    data: {
      partId: string;
      type: 'ADD' | 'CONSUME' | 'TRANSFER' | 'ADJUSTMENT';
      quantity: number;
      woId?: string;
      poId?: string;
      locationId?: string;
      unitCost?: number;
      notes?: string;
    },
  ): Promise<{ part: Part; transaction: PartTransaction }> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const partResult = await client.query(
        `SELECT id, part_number, name, description, category, unit_of_measure, unit_cost, currency_code,
                quantity_on_hand, min_quantity, max_quantity, reorder_point, non_stock, barcode,
                area, location_id, version, created_at, updated_at
         FROM gigalibs_cmms.parts
         WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted
         FOR UPDATE`,
        [tenantId, data.partId],
      );
      if (!partResult.rows[0]) throw new NotFoundException(`Part ${data.partId} not found.`);
      const part = mapPart(partResult.rows[0]);
      const qtyDelta = data.type === 'CONSUME' ? -Math.abs(data.quantity) : Math.abs(data.quantity);
      const newQty = part.quantityOnHand + qtyDelta;

      if (newQty < 0 && !part.nonStock) {
        throw new BadRequestException(`Insufficient stock for part ${part.partNumber}. Current: ${part.quantityOnHand}, Requested: ${data.quantity}`);
      }

      const txResult = await client.query(
        `INSERT INTO gigalibs_cmms.part_transactions (
           tenant_id, id, part_id, type, quantity, wo_id, po_id, location_id, unit_cost, notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, part_id, type, quantity, wo_id, po_id, location_id, unit_cost, notes, created_by, created_at`,
        [
          tenantId, randomUUID(), data.partId, data.type, qtyDelta,
          data.woId ?? null, data.poId ?? null, data.locationId ?? null,
          data.unitCost ?? part.unitCost, data.notes ?? null, actorId,
        ],
      );

      const updatedResult = await client.query(
        `UPDATE gigalibs_cmms.parts
         SET quantity_on_hand = $1, version = version + 1, updated_at = transaction_timestamp()
         WHERE tenant_id = $2 AND id = $3
         RETURNING id, part_number, name, description, category, unit_of_measure, unit_cost, currency_code,
                   quantity_on_hand, min_quantity, max_quantity, reorder_point, non_stock, barcode,
                   area, location_id, version, created_at, updated_at`,
        [newQty, tenantId, data.partId],
      );

      const updatedPart = mapPart(updatedResult.rows[0]);
      if (
        updatedPart.reorderPoint !== null &&
        updatedPart.quantityOnHand <= updatedPart.reorderPoint &&
        data.type === 'CONSUME'
      ) {
        await client.query(
          `INSERT INTO gigalibs_cmms.outbox_events (tenant_id, id, event_type, payload)
           VALUES ($1,$2,'cmms.parts.restock.requested',$3::jsonb)`,
          [tenantId, randomUUID(), JSON.stringify({
            partId: updatedPart.id,
            partNumber: updatedPart.partNumber,
            name: updatedPart.name,
            quantityOnHand: updatedPart.quantityOnHand,
            reorderPoint: updatedPart.reorderPoint,
            unitCost: updatedPart.unitCost,
            currencyCode: updatedPart.currencyCode,
          })],
        );
      }

      const transactionRow = txResult.rows[0];
      return {
        part: updatedPart,
        transaction: {
          id: transactionRow.id,
          partId: transactionRow.part_id,
          type: transactionRow.type,
          quantity: Number(transactionRow.quantity),
          woId: transactionRow.wo_id,
          poId: transactionRow.po_id,
          locationId: transactionRow.location_id,
          unitCost: transactionRow.unit_cost ? Number(transactionRow.unit_cost) : null,
          notes: transactionRow.notes,
          createdBy: transactionRow.created_by,
          createdAt: transactionRow.created_at.toISOString(),
        },
      };
    });
  }

  async getTransactions(tenantId: string, partId: string): Promise<PartTransaction[]> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, part_id, type, quantity, wo_id, po_id, location_id, unit_cost, notes, created_by, created_at
       FROM gigalibs_cmms.part_transactions
       WHERE tenant_id = $1 AND part_id = $2
       ORDER BY created_at DESC`,
      [tenantId, partId],
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      partId: row.part_id,
      type: row.type,
      quantity: Number(row.quantity),
      woId: row.wo_id,
      poId: row.po_id,
      locationId: row.location_id,
      unitCost: row.unit_cost ? Number(row.unit_cost) : null,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
    }));
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

function mapPart(row: any): Part {
  return {
    id: row.id,
    partNumber: row.part_number,
    name: row.name,
    description: row.description ?? null,
    category: row.category ?? null,
    unitOfMeasure: row.unit_of_measure,
    unitCost: row.unit_cost ? Number(row.unit_cost) : null,
    currencyCode: row.currency_code,
    quantityOnHand: Number(row.quantity_on_hand),
    minQuantity: Number(row.min_quantity),
    maxQuantity: row.max_quantity ? Number(row.max_quantity) : null,
    reorderPoint: row.reorder_point ? Number(row.reorder_point) : null,
    nonStock: row.non_stock,
    barcode: row.barcode ?? null,
    area: row.area ?? null,
    locationId: row.location_id ?? null,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
