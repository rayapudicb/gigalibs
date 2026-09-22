import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  website: string | null;
  description: string | null;
  rate: number | null;
  currencyCode: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class VendorsService {
  constructor(private readonly db: DatabaseService) {}

  async search(
    tenantId: string,
    params: { page?: number; pageSize?: number; q?: string },
  ): Promise<{ data: Vendor[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['tenant_id = $1', 'NOT is_deleted'];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (params.q) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
      values.push(`%${params.q}%`);
      idx++;
    }

    const where = conditions.join(' AND ');
    const [countResult, dataResult] = await Promise.all([
      this.db.queryWithTenant<{ total: string }>(tenantId, `SELECT COUNT(*) AS total FROM gigalibs_cmms.vendors WHERE ${where}`, values),
      this.db.queryWithTenant(
        tenantId,
        `SELECT id, name, email, phone, address, website, description, rate, currency_code,
                version, created_at, updated_at
         FROM gigalibs_cmms.vendors WHERE ${where}
         ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, pageSize, offset],
      ),
    ]);

    return {
      data: dataResult.rows.map(mapVendor),
      total: Number(countResult.rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getOne(tenantId: string, id: string): Promise<Vendor> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, name, email, phone, address, website, description, rate, currency_code,
              version, created_at, updated_at
       FROM gigalibs_cmms.vendors WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException(`Vendor ${id} not found.`);
    return mapVendor(result.rows[0]);
  }

  async create(
    tenantId: string,
    _actorId: string,
    data: {
      name: string;
      email?: string;
      phone?: string;
      address?: Record<string, unknown>;
      website?: string;
      description?: string;
      rate?: number;
      currencyCode?: string;
    },
  ): Promise<Vendor> {
    await this.ensureTenant(tenantId);
    const id = randomUUID();
    try {
      const result = await this.db.queryWithTenant(
        tenantId,
        `INSERT INTO gigalibs_cmms.vendors (
           tenant_id, id, name, email, phone, address, website, description, rate, currency_code
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
         RETURNING id, name, email, phone, address, website, description, rate, currency_code,
                   version, created_at, updated_at`,
        [
          tenantId, id,
          data.name.trim(),
          data.email ?? null,
          data.phone ?? null,
          data.address ? JSON.stringify(data.address) : null,
          data.website ?? null,
          data.description ?? null,
          data.rate ?? null,
          (data.currencyCode ?? 'USD').toUpperCase(),
        ],
      );
      return mapVendor(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') throw new ConflictException(`Vendor name '${data.name}' already exists.`);
      throw err;
    }
  }

  async update(
    tenantId: string,
    id: string,
    version: number,
    data: Partial<{
      name: string;
      email: string | null;
      phone: string | null;
      address: Record<string, unknown> | null;
      website: string | null;
      description: string | null;
      rate: number | null;
      currencyCode: string;
    }>,
  ): Promise<Vendor> {
    const sets: string[] = ['version = version + 1', 'updated_at = transaction_timestamp()'];
    const values: unknown[] = [tenantId, id, version];
    let idx = 4;

    if ('name' in data)        { sets.push(`name = $${idx++}`);        values.push(data.name?.trim() ?? null); }
    if ('email' in data)       { sets.push(`email = $${idx++}`);       values.push(data.email ?? null); }
    if ('phone' in data)       { sets.push(`phone = $${idx++}`);       values.push(data.phone ?? null); }
    if ('address' in data)     { sets.push(`address = $${idx++}::jsonb`); values.push(data.address ? JSON.stringify(data.address) : null); }
    if ('website' in data)     { sets.push(`website = $${idx++}`);     values.push(data.website ?? null); }
    if ('description' in data) { sets.push(`description = $${idx++}`); values.push(data.description ?? null); }
    if ('rate' in data)        { sets.push(`rate = $${idx++}`);        values.push(data.rate ?? null); }
    if ('currencyCode' in data){ sets.push(`currency_code = $${idx++}`); values.push(data.currencyCode?.toUpperCase() ?? 'USD'); }

    try {
      const result = await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_cmms.vendors SET ${sets.join(', ')}
         WHERE tenant_id = $1 AND id = $2 AND version = $3 AND NOT is_deleted
         RETURNING id, name, email, phone, address, website, description, rate, currency_code,
                   version, created_at, updated_at`,
        values,
      );
      if (!result.rows[0]) throw new ConflictException('Vendor not found or version conflict.');
      return mapVendor(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') throw new ConflictException(`Vendor name '${data.name}' already exists.`);
      throw err;
    }
  }

  async softDelete(tenantId: string, id: string, version: number): Promise<void> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_cmms.vendors SET is_deleted = true, version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $1 AND id = $2 AND version = $3 AND NOT is_deleted`,
      [tenantId, id, version],
    );
    if (result.rowCount === 0) throw new ConflictException('Vendor not found or version conflict.');
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

function mapVendor(row: any): Vendor {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    website: row.website ?? null,
    description: row.description ?? null,
    rate: row.rate ? Number(row.rate) : null,
    currencyCode: row.currency_code,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
