import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface Location {
  id: string;
  name: string;
  parentId: string | null;
  locationType: string;
  address: Record<string, unknown> | null;
  floorPlanUrl: string | null;
  geoLat: number | null;
  geoLng: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class LocationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string, departmentIds?: readonly string[]): Promise<Location[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let idx = 2;
    if (departmentIds && departmentIds.length > 0) {
      const placeholders = departmentIds.map(() => `$${idx++}`).join(', ');
      conditions.push(`(department_id IS NULL OR department_id IN (${placeholders}))`);
      for (const d of departmentIds) values.push(d);
    }
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, name, parent_id, location_type, address, floor_plan_url,
              geo_lat, geo_lng, version, created_at, updated_at
       FROM gigalibs_cmms.locations
       WHERE ${conditions.join(' AND ')}
       ORDER BY name ASC`,
      values,
    );
    return result.rows.map(mapLocation);
  }

  async getOne(tenantId: string, id: string): Promise<Location> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, name, parent_id, location_type, address, floor_plan_url,
              geo_lat, geo_lng, version, created_at, updated_at
       FROM gigalibs_cmms.locations
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException(`Location ${id} not found.`);
    return mapLocation(result.rows[0]);
  }

  async create(
    tenantId: string,
    data: {
      name: string;
      parentId?: string;
      locationType?: string;
      address?: Record<string, unknown>;
      floorPlanUrl?: string;
      geoLat?: number;
      geoLng?: number;
    },
  ): Promise<Location> {
    // Ensure tenant row exists
    await this.ensureTenant(tenantId);
    const id = randomUUID();
    const result = await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.locations
         (tenant_id, id, name, parent_id, location_type, address, floor_plan_url, geo_lat, geo_lng)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
       RETURNING id, name, parent_id, location_type, address, floor_plan_url,
                 geo_lat, geo_lng, version, created_at, updated_at`,
      [
        tenantId, id, data.name.trim(),
        data.parentId ?? null,
        data.locationType ?? 'SITE',
        data.address ? JSON.stringify(data.address) : null,
        data.floorPlanUrl ?? null,
        data.geoLat ?? null,
        data.geoLng ?? null,
      ],
    );
    return mapLocation(result.rows[0]);
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; parentId: string; locationType: string; floorPlanUrl: string; geoLat: number; geoLng: number }>,
  ): Promise<Location> {
    const existing = await this.getOne(tenantId, id);
    const result = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_cmms.locations
       SET name = $1, parent_id = $2, location_type = $3,
           floor_plan_url = $4, geo_lat = $5, geo_lng = $6,
           version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $7 AND id = $8
       RETURNING id, name, parent_id, location_type, address, floor_plan_url,
                 geo_lat, geo_lng, version, created_at, updated_at`,
      [
        data.name ?? existing.name,
        data.parentId ?? existing.parentId,
        data.locationType ?? existing.locationType,
        data.floorPlanUrl ?? existing.floorPlanUrl,
        data.geoLat ?? existing.geoLat,
        data.geoLng ?? existing.geoLng,
        tenantId, id,
      ],
    );
    return mapLocation(result.rows[0]);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    // Check no children
    const children = await this.db.queryWithTenant(
      tenantId,
      `SELECT 1 FROM gigalibs_cmms.locations WHERE tenant_id=$1 AND parent_id=$2 LIMIT 1`,
      [tenantId, id],
    );
    if (children.rows.length > 0) {
      throw new BadRequestException('Cannot delete a location with child locations.');
    }
    const result = await this.db.queryWithTenant(
      tenantId,
      `DELETE FROM gigalibs_cmms.locations WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id],
    );
    if (result.rowCount === 0) throw new NotFoundException(`Location ${id} not found.`);
  }

  private async ensureTenant(tenantId: string): Promise<void> {
    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.module_tenants (id, oidc_issuer, external_tenant_subject)
       VALUES ($1, 'system', $1)
       ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
  }
}

function mapLocation(row: any): Location {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? null,
    locationType: row.location_type,
    address: row.address ?? null,
    floorPlanUrl: row.floor_plan_url ?? null,
    geoLat: row.geo_lat ? Number(row.geo_lat) : null,
    geoLng: row.geo_lng ? Number(row.geo_lng) : null,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
