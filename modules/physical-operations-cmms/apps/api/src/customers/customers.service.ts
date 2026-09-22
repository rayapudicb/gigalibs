import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly db: DatabaseService) {}

  async search(
    tenantId: string,
    params: { page?: number; pageSize?: number; q?: string },
  ): Promise<{ data: Customer[]; total: number; page: number; pageSize: number }> {
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
      this.db.queryWithTenant<{ total: string }>(tenantId, `SELECT COUNT(*) AS total FROM gigalibs_cmms.customers WHERE ${where}`, values),
      this.db.queryWithTenant(
        tenantId,
        `SELECT id, name, email, phone, address, description, version, created_at, updated_at
         FROM gigalibs_cmms.customers WHERE ${where}
         ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, pageSize, offset],
      ),
    ]);

    return {
      data: dataResult.rows.map(mapCustomer),
      total: Number(countResult.rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getOne(tenantId: string, id: string): Promise<Customer> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, name, email, phone, address, description, version, created_at, updated_at
       FROM gigalibs_cmms.customers WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException(`Customer ${id} not found.`);
    return mapCustomer(result.rows[0]);
  }

  async create(
    tenantId: string,
    _actorId: string,
    data: {
      name: string;
      email?: string;
      phone?: string;
      address?: Record<string, unknown>;
      description?: string;
    },
  ): Promise<Customer> {
    await this.ensureTenant(tenantId);
    const id = randomUUID();
    try {
      const result = await this.db.queryWithTenant(
        tenantId,
        `INSERT INTO gigalibs_cmms.customers (tenant_id, id, name, email, phone, address, description)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         RETURNING id, name, email, phone, address, description, version, created_at, updated_at`,
        [
          tenantId, id,
          data.name.trim(),
          data.email ?? null,
          data.phone ?? null,
          data.address ? JSON.stringify(data.address) : null,
          data.description ?? null,
        ],
      );
      return mapCustomer(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') throw new ConflictException(`Customer name '${data.name}' already exists.`);
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
      description: string | null;
    }>,
  ): Promise<Customer> {
    const sets: string[] = ['version = version + 1', 'updated_at = transaction_timestamp()'];
    const values: unknown[] = [tenantId, id, version];
    let idx = 4;

    if ('name' in data)        { sets.push(`name = $${idx++}`);        values.push(data.name?.trim() ?? null); }
    if ('email' in data)       { sets.push(`email = $${idx++}`);       values.push(data.email ?? null); }
    if ('phone' in data)       { sets.push(`phone = $${idx++}`);       values.push(data.phone ?? null); }
    if ('address' in data)     { sets.push(`address = $${idx++}::jsonb`); values.push(data.address ? JSON.stringify(data.address) : null); }
    if ('description' in data) { sets.push(`description = $${idx++}`); values.push(data.description ?? null); }

    try {
      const result = await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_cmms.customers SET ${sets.join(', ')}
         WHERE tenant_id = $1 AND id = $2 AND version = $3 AND NOT is_deleted
         RETURNING id, name, email, phone, address, description, version, created_at, updated_at`,
        values,
      );
      if (!result.rows[0]) throw new ConflictException('Customer not found or version conflict.');
      return mapCustomer(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') throw new ConflictException(`Customer name '${data.name}' already exists.`);
      throw err;
    }
  }

  async softDelete(tenantId: string, id: string, version: number): Promise<void> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_cmms.customers SET is_deleted = true, version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $1 AND id = $2 AND version = $3 AND NOT is_deleted`,
      [tenantId, id, version],
    );
    if (result.rowCount === 0) throw new ConflictException('Customer not found or version conflict.');
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

function mapCustomer(row: any): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    description: row.description ?? null,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
