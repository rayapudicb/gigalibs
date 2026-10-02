import {
  type CreateWfoSupportTicketV1,
  type CreateWfoVendorV1,
  type WfoSupportTicketRecordV1,
  type WfoVendorRecordV1,
  CreateWfoSupportTicketV1Schema,
  CreateWfoVendorV1Schema,
} from '@gigalibs/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

@Injectable()
export class WfoVendorsService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  async createVendor(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<WfoVendorRecordV1> {
    const data: CreateWfoVendorV1 = CreateWfoVendorV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_vendors (
           tenant_id, name, contact_email, contact_phone, connector_id,
           tax_id, payment_terms, metadata, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, tenant_id as "tenantId", name, contact_email as "contactEmail",
                   contact_phone as "contactPhone", connector_id as "connectorId",
                   status, tax_id as "taxId", payment_terms as "paymentTerms",
                   metadata, created_at as "createdAt", updated_at as "updatedAt"`,
        [
          principal.tenantId,
          data.name,
          data.contactEmail || null,
          data.contactPhone || null,
          data.connectorId || null,
          data.taxId || null,
          data.paymentTerms || null,
          data.metadata || {},
          principal.subject,
        ],
      );

      return res.rows[0];
    });
  }

  async listVendors(principal: GigaOpsPrincipal): Promise<WfoVendorRecordV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT
           v.id,
           v.tenant_id as "tenantId",
           v.name,
           v.contact_email as "contactEmail",
           v.contact_phone as "contactPhone",
           v.connector_id as "connectorId",
           v.status,
           v.tax_id as "taxId",
           v.payment_terms as "paymentTerms",
           COALESCE(COUNT(w.id), 0)::int as "activeWorkersCount",
           v.metadata,
           v.created_at as "createdAt",
           v.updated_at as "updatedAt"
         FROM gigalibs_workforce.wfo_vendors v
         LEFT JOIN gigalibs_workforce.wfo_workers w
           ON w.vendor_id = v.id AND w.tenant_id = v.tenant_id AND w.lifecycle_status = 'ACTIVE'
         WHERE v.tenant_id = $1
         GROUP BY v.id
         ORDER BY v.name ASC`,
        [principal.tenantId],
      );

      return res.rows;
    });
  }

  async getVendor(principal: GigaOpsPrincipal, id: string): Promise<any> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const vRes = await client.query(
        `SELECT
           v.id,
           v.tenant_id as "tenantId",
           v.name,
           v.contact_email as "contactEmail",
           v.contact_phone as "contactPhone",
           v.connector_id as "connectorId",
           v.status,
           v.tax_id as "taxId",
           v.payment_terms as "paymentTerms",
           v.metadata,
           v.created_at as "createdAt",
           v.updated_at as "updatedAt"
         FROM gigalibs_workforce.wfo_vendors v
         WHERE v.tenant_id = $1 AND v.id = $2`,
        [principal.tenantId, id],
      );

      if (!vRes.rowCount || vRes.rowCount === 0) {
        throw new NotFoundException(`Vendor ${id} not found.`);
      }

      const workersRes = await client.query(
        `SELECT id, first_name as "firstName", last_name as "lastName", email, worker_type as "workerType", lifecycle_status as "lifecycleStatus"
         FROM gigalibs_workforce.wfo_workers
         WHERE tenant_id = $1 AND vendor_id = $2`,
        [principal.tenantId, id],
      );

      return {
        ...vRes.rows[0],
        workers: workersRes.rows,
      };
    });
  }

  async createSupportTicket(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<WfoSupportTicketRecordV1> {
    const data: CreateWfoSupportTicketV1 = CreateWfoSupportTicketV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_support_tickets (
           tenant_id, worker_id, category, subject, description, priority
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, tenant_id as "tenantId", worker_id as "workerId",
                   category, subject, description, status, priority,
                   resolution_notes as "resolutionNotes", assigned_to as "assignedTo",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [principal.tenantId, data.workerId, data.category, data.subject, data.description, data.priority],
      );

      return res.rows[0];
    });
  }

  async listSupportTickets(
    principal: GigaOpsPrincipal,
    status?: string,
  ): Promise<WfoSupportTicketRecordV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let sql = `
        SELECT
          t.id,
          t.tenant_id as "tenantId",
          t.worker_id as "workerId",
          w.first_name || ' ' || w.last_name as "workerName",
          t.category,
          t.subject,
          t.description,
          t.status,
          t.priority,
          t.resolution_notes as "resolutionNotes",
          t.assigned_to as "assignedTo",
          t.created_at as "createdAt",
          t.updated_at as "updatedAt"
        FROM gigalibs_workforce.wfo_support_tickets t
        JOIN gigalibs_workforce.wfo_workers w
          ON w.id = t.worker_id AND w.tenant_id = t.tenant_id
        WHERE t.tenant_id = $1
      `;
      const params: unknown[] = [principal.tenantId];

      if (status) {
        params.push(status);
        sql += ` AND t.status = $${params.length}`;
      }

      sql += ` ORDER BY t.created_at DESC`;

      const res = await client.query(sql, params);
      return res.rows;
    });
  }
}
