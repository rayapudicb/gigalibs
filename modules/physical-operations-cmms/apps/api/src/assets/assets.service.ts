import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface Asset {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  formSchemaId: string | null;
  specs: Record<string, unknown>;
  status: string;
  assetTag: string | null;
  serialNumber: string | null;
  model: string | null;
  manufacturer: string | null;
  power: string | null;
  area: string | null;
  acquisitionCost: number | null;
  currencyCode: string;
  locationId: string | null;
  parentAssetId: string | null;
  assignedTo: string | null;
  assignedTeams: string[];
  assignedVendors: string[];
  assignedCustomers: string[];
  warrantyExpiry: string | null;
  purchaseDate: string | null;
  criticality: string;
  iotDeviceId: string | null;
  scadaEndpoint: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const VALID_STATUSES = new Set(['OPERATIONAL', 'UNDER_MAINTENANCE', 'OFFLINE', 'DECOMMISSIONED']);
const VALID_CRITICALITY = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

@Injectable()
export class AssetsService {
  constructor(private readonly db: DatabaseService) {}

  async search(
    tenantId: string,
    params: {
      page?: number;
      pageSize?: number;
      status?: string;
      categoryId?: string;
      locationId?: string;
      criticality?: string;
      q?: string;
    },
    departmentIds?: readonly string[],
  ): Promise<{ data: Asset[]; total: number; page: number; pageSize: number }> {
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

    if (params.status) { conditions.push(`status = $${idx++}`); values.push(params.status); }
    if (params.categoryId) { conditions.push(`category_id = $${idx++}`); values.push(params.categoryId); }
    if (params.locationId) { conditions.push(`location_id = $${idx++}`); values.push(params.locationId); }
    if (params.criticality) { conditions.push(`criticality = $${idx++}`); values.push(params.criticality); }
    if (params.q) { conditions.push(`name ILIKE $${idx++}`); values.push(`%${params.q}%`); }

    const where = conditions.join(' AND ');
    const [countResult, dataResult] = await Promise.all([
      this.db.queryWithTenant<{ total: string }>(tenantId, `SELECT COUNT(*) AS total FROM gigalibs_cmms.assets WHERE ${where}`, values),
      this.db.queryWithTenant(
        tenantId,
        `SELECT id, name, description, category_id, form_schema_id, specs, status,
                asset_tag, serial_number, model, manufacturer, power, area,
                acquisition_cost, currency_code, location_id, parent_asset_id,
                assigned_to, assigned_teams, assigned_vendors, assigned_customers,
                warranty_expiry, purchase_date, criticality, iot_device_id,
                scada_endpoint, version, created_by, created_at, updated_at
         FROM gigalibs_cmms.assets WHERE ${where}
         ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, pageSize, offset],
      ),
    ]);

    return {
      data: dataResult.rows.map(mapAsset),
      total: Number(countResult.rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getOne(tenantId: string, id: string): Promise<Asset> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, name, description, category_id, form_schema_id, specs, status,
              asset_tag, serial_number, model, manufacturer, power, area,
              acquisition_cost, currency_code, location_id, parent_asset_id,
              assigned_to, assigned_teams, assigned_vendors, assigned_customers,
              warranty_expiry, purchase_date, criticality, iot_device_id,
              scada_endpoint, version, created_by, created_at, updated_at
       FROM gigalibs_cmms.assets
       WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException(`Asset ${id} not found.`);
    return mapAsset(result.rows[0]);
  }

  async getChildren(tenantId: string, parentId: string): Promise<Asset[]> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, name, description, category_id, form_schema_id, specs, status,
              asset_tag, serial_number, model, manufacturer, power, area,
              acquisition_cost, currency_code, location_id, parent_asset_id,
              assigned_to, assigned_teams, assigned_vendors, assigned_customers,
              warranty_expiry, purchase_date, criticality, iot_device_id,
              scada_endpoint, version, created_by, created_at, updated_at
       FROM gigalibs_cmms.assets
       WHERE tenant_id = $1 AND parent_asset_id = $2 AND NOT is_deleted
       ORDER BY name ASC`,
      [tenantId, parentId],
    );
    return result.rows.map(mapAsset);
  }

  async getByBarcode(tenantId: string, barcode: string): Promise<Asset> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, name, description, category_id, form_schema_id, specs, status,
              asset_tag, serial_number, model, manufacturer, power, area,
              acquisition_cost, currency_code, location_id, parent_asset_id,
              assigned_to, assigned_teams, assigned_vendors, assigned_customers,
              warranty_expiry, purchase_date, criticality, iot_device_id,
              scada_endpoint, version, created_by, created_at, updated_at
       FROM gigalibs_cmms.assets
       WHERE tenant_id = $1 AND asset_tag = $2 AND NOT is_deleted`,
      [tenantId, barcode],
    );
    if (!result.rows[0]) throw new NotFoundException(`Asset with barcode/tag ${barcode} not found.`);
    return mapAsset(result.rows[0]);
  }

  async create(
    tenantId: string,
    actorId: string,
    data: {
      name: string;
      description?: string;
      categoryId?: string;
      formSchemaId?: string;
      specs?: Record<string, unknown>;
      status?: string;
      assetTag?: string;
      serialNumber?: string;
      model?: string;
      manufacturer?: string;
      power?: string;
      area?: string;
      acquisitionCost?: number;
      currencyCode?: string;
      locationId?: string;
      parentAssetId?: string;
      assignedTo?: string;
      warrantyExpiry?: string;
      purchaseDate?: string;
      criticality?: string;
      iotDeviceId?: string;
      scadaEndpoint?: string;
    },
  ): Promise<Asset> {
    if (data.status && !VALID_STATUSES.has(data.status)) {
      throw new BadRequestException(`Invalid status: ${data.status}`);
    }
    if (data.criticality && !VALID_CRITICALITY.has(data.criticality)) {
      throw new BadRequestException(`Invalid criticality: ${data.criticality}`);
    }

    await this.ensureTenant(tenantId);
    const id = randomUUID();

    const result = await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.assets (
         tenant_id, id, name, description, category_id, form_schema_id, specs,
         status, asset_tag, serial_number, model, manufacturer, power, area,
         acquisition_cost, currency_code, location_id, parent_asset_id,
         assigned_to, warranty_expiry, purchase_date, criticality,
         iot_device_id, scada_endpoint, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
       )
       RETURNING id, name, description, category_id, form_schema_id, specs, status,
                 asset_tag, serial_number, model, manufacturer, power, area,
                 acquisition_cost, currency_code, location_id, parent_asset_id,
                 assigned_to, assigned_teams, assigned_vendors, assigned_customers,
                 warranty_expiry, purchase_date, criticality, iot_device_id,
                 scada_endpoint, version, created_by, created_at, updated_at`,
      [
        tenantId, id,
        data.name.trim(),
        data.description ?? null,
        data.categoryId ?? null,
        data.formSchemaId ?? null,
        JSON.stringify(data.specs ?? {}),
        data.status ?? 'OPERATIONAL',
        data.assetTag ?? null,
        data.serialNumber ?? null,
        data.model ?? null,
        data.manufacturer ?? null,
        data.power ?? null,
        data.area ?? null,
        data.acquisitionCost ?? null,
        (data.currencyCode ?? 'USD').toUpperCase(),
        data.locationId ?? null,
        data.parentAssetId ?? null,
        data.assignedTo ?? null,
        data.warrantyExpiry ?? null,
        data.purchaseDate ?? null,
        data.criticality ?? 'MEDIUM',
        data.iotDeviceId ?? null,
        data.scadaEndpoint ?? null,
        actorId,
      ],
    );

    // Write audit event
    await this.writeAuditEvent(tenantId, id, 'CREATE', actorId, { name: data.name });

    return mapAsset(result.rows[0]);
  }

  async update(
    tenantId: string,
    id: string,
    actorId: string,
    data: Partial<{
      name: string; description: string; status: string; assetTag: string;
      serialNumber: string; model: string; manufacturer: string; power: string;
      area: string; acquisitionCost: number; locationId: string;
      parentAssetId: string; assignedTo: string; warrantyExpiry: string;
      purchaseDate: string; criticality: string; iotDeviceId: string;
      scadaEndpoint: string; specs: Record<string, unknown>;
    }>,
  ): Promise<Asset> {
    if (data.status && !VALID_STATUSES.has(data.status)) {
      throw new BadRequestException(`Invalid status: ${data.status}`);
    }
    const existing = await this.getOne(tenantId, id);

    const result = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_cmms.assets SET
         name = $1, description = $2, status = $3, asset_tag = $4,
         serial_number = $5, model = $6, manufacturer = $7, power = $8,
         area = $9, acquisition_cost = $10, location_id = $11,
         parent_asset_id = $12, assigned_to = $13, warranty_expiry = $14,
         purchase_date = $15, criticality = $16, iot_device_id = $17,
         scada_endpoint = $18, specs = $19::jsonb,
         version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $20 AND id = $21 AND NOT is_deleted
       RETURNING id, name, description, category_id, form_schema_id, specs, status,
                 asset_tag, serial_number, model, manufacturer, power, area,
                 acquisition_cost, currency_code, location_id, parent_asset_id,
                 assigned_to, assigned_teams, assigned_vendors, assigned_customers,
                 warranty_expiry, purchase_date, criticality, iot_device_id,
                 scada_endpoint, version, created_by, created_at, updated_at`,
      [
        data.name ?? existing.name,
        data.description ?? existing.description,
        data.status ?? existing.status,
        data.assetTag ?? existing.assetTag,
        data.serialNumber ?? existing.serialNumber,
        data.model ?? existing.model,
        data.manufacturer ?? existing.manufacturer,
        data.power ?? existing.power,
        data.area ?? existing.area,
        data.acquisitionCost ?? existing.acquisitionCost,
        data.locationId ?? existing.locationId,
        data.parentAssetId ?? existing.parentAssetId,
        data.assignedTo ?? existing.assignedTo,
        data.warrantyExpiry ?? existing.warrantyExpiry,
        data.purchaseDate ?? existing.purchaseDate,
        data.criticality ?? existing.criticality,
        data.iotDeviceId ?? existing.iotDeviceId,
        data.scadaEndpoint ?? existing.scadaEndpoint,
        JSON.stringify(data.specs ?? existing.specs),
        tenantId, id,
      ],
    );
    await this.writeAuditEvent(tenantId, id, 'UPDATE', actorId, data);
    return mapAsset(result.rows[0]);
  }

  async softDelete(tenantId: string, id: string, actorId: string): Promise<void> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_cmms.assets SET is_deleted = true, status = 'DECOMMISSIONED',
              version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted`,
      [tenantId, id],
    );
    if (result.rowCount === 0) throw new NotFoundException(`Asset ${id} not found.`);
    await this.writeAuditEvent(tenantId, id, 'DELETE', actorId, {});
  }

  private async writeAuditEvent(
    tenantId: string,
    entityId: string,
    action: string,
    actorId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.audit_events (tenant_id, id, entity_type, entity_id, action, actor_id, actor_role, details)
       VALUES ($1, $2, 'asset', $3, $4, $5, 'user', $6::jsonb)`,
      [tenantId, randomUUID(), entityId, action, actorId, JSON.stringify(details)],
    );
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

function mapAsset(row: any): Asset {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    categoryId: row.category_id ?? null,
    formSchemaId: row.form_schema_id ?? null,
    specs: row.specs ?? {},
    status: row.status,
    assetTag: row.asset_tag ?? null,
    serialNumber: row.serial_number ?? null,
    model: row.model ?? null,
    manufacturer: row.manufacturer ?? null,
    power: row.power ?? null,
    area: row.area ?? null,
    acquisitionCost: row.acquisition_cost ? Number(row.acquisition_cost) : null,
    currencyCode: row.currency_code,
    locationId: row.location_id ?? null,
    parentAssetId: row.parent_asset_id ?? null,
    assignedTo: row.assigned_to ?? null,
    assignedTeams: row.assigned_teams ?? [],
    assignedVendors: row.assigned_vendors ?? [],
    assignedCustomers: row.assigned_customers ?? [],
    warrantyExpiry: row.warranty_expiry ? new Date(row.warranty_expiry).toISOString().split('T')[0] : null,
    purchaseDate: row.purchase_date ? new Date(row.purchase_date).toISOString().split('T')[0] : null,
    criticality: row.criticality,
    iotDeviceId: row.iot_device_id ?? null,
    scadaEndpoint: row.scada_endpoint ?? null,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
