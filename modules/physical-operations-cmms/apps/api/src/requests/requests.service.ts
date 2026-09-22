import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'CANCELLED' | 'CONVERTED';
export type RequestPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';

export interface MaintenanceRequest {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  assetId: string | null;
  locationId: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;
  convertedWoId: string | null;
  portalUuid: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConvertResult {
  request: MaintenanceRequest;
  workOrderId: string;
  workOrderNumber: string;
}

@Injectable()
export class RequestsService {
  constructor(private readonly db: DatabaseService) {}

  async search(
    tenantId: string,
    params: { page?: number; pageSize?: number; status?: RequestStatus; priority?: RequestPriority; q?: string },
    departmentIds?: readonly string[],
  ): Promise<{ data: MaintenanceRequest[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (params.status)   { conditions.push(`status = $${idx++}`);   values.push(params.status); }
    if (params.priority) { conditions.push(`priority = $${idx++}`); values.push(params.priority); }
    if (params.q)        { conditions.push(`title ILIKE $${idx++}`); values.push(`%${params.q}%`); }

    const where = conditions.join(' AND ');
    const [countResult, dataResult] = await Promise.all([
      this.db.queryWithTenant<{ total: string }>(tenantId, `SELECT COUNT(*) AS total FROM gigalibs_cmms.maintenance_requests WHERE ${where}`, values),
      this.db.queryWithTenant(
        tenantId,
        `SELECT id, title, description, priority, status, asset_id, location_id,
                requester_name, requester_email, requester_phone, converted_wo_id, portal_uuid,
                version, created_at, updated_at
         FROM gigalibs_cmms.maintenance_requests WHERE ${where}
         ORDER BY
           CASE priority WHEN 'EMERGENCY' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END,
           created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, pageSize, offset],
      ),
    ]);

    return {
      data: dataResult.rows.map(mapRequest),
      total: Number(countResult.rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getOne(tenantId: string, id: string): Promise<MaintenanceRequest> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, title, description, priority, status, asset_id, location_id,
              requester_name, requester_email, requester_phone, converted_wo_id, portal_uuid,
              version, created_at, updated_at
       FROM gigalibs_cmms.maintenance_requests WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException(`Maintenance request ${id} not found.`);
    return mapRequest(result.rows[0]);
  }

  async create(
    tenantId: string,
    _actorId: string,
    data: {
      title: string;
      description?: string;
      priority?: RequestPriority;
      assetId?: string;
      locationId?: string;
      requesterName?: string;
      requesterEmail?: string;
      requesterPhone?: string;
    },
  ): Promise<MaintenanceRequest> {
    await this.ensureTenant(tenantId);
    const id = randomUUID();
    const portalUuid = randomUUID(); // public portal slug per tenant

    const result = await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.maintenance_requests (
         tenant_id, id, title, description, priority, asset_id, location_id,
         requester_name, requester_email, requester_phone, portal_uuid
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, title, description, priority, status, asset_id, location_id,
                 requester_name, requester_email, requester_phone, converted_wo_id, portal_uuid,
                 version, created_at, updated_at`,
      [
        tenantId, id,
        data.title.trim(),
        data.description ?? null,
        data.priority ?? 'NONE',
        data.assetId ?? null,
        data.locationId ?? null,
        data.requesterName ?? null,
        data.requesterEmail ?? null,
        data.requesterPhone ?? null,
        portalUuid,
      ],
    );
    return mapRequest(result.rows[0]);
  }

  async approve(tenantId: string, id: string, version: number): Promise<MaintenanceRequest> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_cmms.maintenance_requests
       SET status = 'APPROVED', version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $1 AND id = $2 AND version = $3 AND status = 'PENDING'
       RETURNING id, title, description, priority, status, asset_id, location_id,
                 requester_name, requester_email, requester_phone, converted_wo_id, portal_uuid,
                 version, created_at, updated_at`,
      [tenantId, id, version],
    );
    if (!result.rows[0]) throw new ConflictException('Request not found, not in PENDING status, or version conflict.');
    return mapRequest(result.rows[0]);
  }

  async cancel(tenantId: string, id: string, version: number): Promise<MaintenanceRequest> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_cmms.maintenance_requests
       SET status = 'CANCELLED', version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $1 AND id = $2 AND version = $3 AND status IN ('PENDING','APPROVED')
       RETURNING id, title, description, priority, status, asset_id, location_id,
                 requester_name, requester_email, requester_phone, converted_wo_id, portal_uuid,
                 version, created_at, updated_at`,
      [tenantId, id, version],
    );
    if (!result.rows[0]) throw new ConflictException('Request not found, already converted/cancelled, or version conflict.');
    return mapRequest(result.rows[0]);
  }

  /**
   * Convert an APPROVED maintenance request into a Work Order atomically.
   * Sets converted_wo_id on the request and status → CONVERTED.
   * Creates the WO in the same tenant transaction.
   */
  async convertToWorkOrder(
    tenantId: string,
    actorId: string,
    id: string,
    version: number,
    woData?: { assignedTo?: string; dueDate?: string },
  ): Promise<ConvertResult> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      // Lock and validate request
      const reqResult = await client.query(
        `SELECT id, title, description, priority, status, asset_id, location_id, version
         FROM gigalibs_cmms.maintenance_requests
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, id],
      );
      const req = reqResult.rows[0];
      if (!req) throw new NotFoundException(`Maintenance request ${id} not found.`);
      if (req.status !== 'APPROVED') throw new BadRequestException(`Request must be APPROVED to convert. Current status: ${req.status}`);
      if (Number(req.version) !== version) throw new ConflictException('Version conflict on maintenance request.');

      // Generate WO number (sequence-style from count)
      const woCountResult = await client.query(
        `SELECT COUNT(*) AS cnt FROM gigalibs_cmms.work_orders WHERE tenant_id = $1`,
        [tenantId],
      );
      const woNumber = `WO-${String(Number(woCountResult.rows[0]?.cnt ?? 0) + 1).padStart(6, '0')}`;
      const woId = randomUUID();

      // Create work order
      const woResult = await client.query(
        `INSERT INTO gigalibs_cmms.work_orders (
           tenant_id, id, wo_number, type, priority, status, title, description,
           asset_id, location_id, assigned_to, trigger_source, created_by
         ) VALUES ($1,$2,$3,'REACTIVE',$4,'OPEN',$5,$6,$7,$8,$9,'REQUEST',$10)
         RETURNING id, wo_number`,
        [
          tenantId, woId, woNumber,
          req.priority,
          req.title,
          req.description ?? null,
          req.asset_id ?? null,
          req.location_id ?? null,
          woData?.assignedTo ?? null,
          actorId,
        ],
      );
      const wo = woResult.rows[0];

      // Mark request as CONVERTED
      await client.query(
        `UPDATE gigalibs_cmms.maintenance_requests
         SET status = 'CONVERTED', converted_wo_id = $1, version = version + 1, updated_at = transaction_timestamp()
         WHERE tenant_id = $2 AND id = $3`,
        [woId, tenantId, id],
      );

      const updatedReqResult = await client.query(
        `SELECT id, title, description, priority, status, asset_id, location_id,
                requester_name, requester_email, requester_phone, converted_wo_id, portal_uuid,
                version, created_at, updated_at
         FROM gigalibs_cmms.maintenance_requests WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
      );

      return {
        request: mapRequest(updatedReqResult.rows[0]),
        workOrderId: wo.id,
        workOrderNumber: wo.wo_number,
      };
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

function mapRequest(row: any): MaintenanceRequest {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    priority: row.priority,
    status: row.status,
    assetId: row.asset_id ?? null,
    locationId: row.location_id ?? null,
    requesterName: row.requester_name ?? null,
    requesterEmail: row.requester_email ?? null,
    requesterPhone: row.requester_phone ?? null,
    convertedWoId: row.converted_wo_id ?? null,
    portalUuid: row.portal_uuid ?? null,
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
