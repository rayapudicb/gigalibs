import {
  type CreateWfoComplianceDocV1,
  type CreateWfoWorkerV1,
  type UpdateWfoWorkerV1,
  type VerifyWfoComplianceDocV1,
  type WfoComplianceDocRecordV1,
  type WfoWorkerRecordV1,
  CreateWfoComplianceDocV1Schema,
  CreateWfoWorkerV1Schema,
  UpdateWfoWorkerV1Schema,
  VerifyWfoComplianceDocV1Schema,
} from '@gigalibs/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

@Injectable()
export class WfoWorkersService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  // ─── Worker Registry ─────────────────────────────────────────────────────────

  async createWorker(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<WfoWorkerRecordV1> {
    const data: CreateWfoWorkerV1 = CreateWfoWorkerV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      // Duplicate check by identity_hash if provided
      if (data.identityHash) {
        const dup = await client.query(
          `SELECT id FROM gigalibs_workforce.wfo_workers WHERE tenant_id = $1 AND identity_hash = $2`,
          [principal.tenantId, data.identityHash],
        );
        if (dup.rowCount && dup.rowCount > 0) {
          throw new ConflictException('A worker with this identity already exists.');
        }
      }

      // Check unique email
      const emailDup = await client.query(
        `SELECT id FROM gigalibs_workforce.wfo_workers WHERE tenant_id = $1 AND email = $2`,
        [principal.tenantId, data.email.toLowerCase()],
      );
      if (emailDup.rowCount && emailDup.rowCount > 0) {
        throw new ConflictException('A worker with this email address already exists.');
      }

      const res = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_workers (
          tenant_id, first_name, last_name, email, phone, worker_type,
          primary_org_unit_id, skills, identity_hash, union_id, metadata,
          lifecycle_status, created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PROSPECT_LEAD', $12, $12
        ) RETURNING *`,
        [
          principal.tenantId,
          data.firstName,
          data.lastName,
          data.email.toLowerCase(),
          data.phone ?? null,
          data.workerType,
          data.primaryOrgUnitId ?? null,
          JSON.stringify(data.skills),
          data.identityHash ?? null,
          data.unionId ?? null,
          JSON.stringify(data.metadata),
          principal.subject,
        ],
      );

      return this.mapWorker(res.rows[0]);
    });
  }

  async listWorkers(
    principal: GigaOpsPrincipal,
    filters: {
      status?: string;
      workerType?: string;
      orgUnitId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ items: WfoWorkerRecordV1[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let whereClause = `WHERE tenant_id = $1`;
      const params: any[] = [principal.tenantId];
      let pIdx = 2;

      if (filters.status) {
        whereClause += ` AND lifecycle_status = $${pIdx++}`;
        params.push(filters.status);
      }
      if (filters.workerType) {
        whereClause += ` AND worker_type = $${pIdx++}`;
        params.push(filters.workerType);
      }
      if (filters.orgUnitId) {
        whereClause += ` AND primary_org_unit_id = $${pIdx++}`;
        params.push(filters.orgUnitId);
      }
      if (filters.search) {
        whereClause += ` AND (first_name ILIKE $${pIdx} OR last_name ILIKE $${pIdx} OR email ILIKE $${pIdx})`;
        params.push(`%${filters.search}%`);
        pIdx++;
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM gigalibs_workforce.wfo_workers ${whereClause}`,
        params,
      );
      const total = countRes.rows[0]?.count ?? 0;

      const rowsRes = await client.query(
        `SELECT * FROM gigalibs_workforce.wfo_workers ${whereClause}
         ORDER BY last_name ASC, first_name ASC
         LIMIT $${pIdx++} OFFSET $${pIdx++}`,
        [...params, limit, offset],
      );

      return {
        items: rowsRes.rows.map((r) => this.mapWorker(r)),
        total,
      };
    });
  }

  async getWorker(
    principal: GigaOpsPrincipal,
    id: string,
  ): Promise<WfoWorkerRecordV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_workforce.wfo_workers WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, id],
      );
      if (!res.rowCount || res.rowCount === 0) {
        throw new NotFoundException(`Worker ${id} not found.`);
      }
      return this.mapWorker(res.rows[0]);
    });
  }

  async updateWorker(
    principal: GigaOpsPrincipal,
    id: string,
    input: unknown,
  ): Promise<WfoWorkerRecordV1> {
    const data: UpdateWfoWorkerV1 = UpdateWfoWorkerV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const existing = await client.query(
        `SELECT * FROM gigalibs_workforce.wfo_workers WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, id],
      );
      if (!existing.rowCount || existing.rowCount === 0) {
        throw new NotFoundException(`Worker ${id} not found.`);
      }
      if (existing.rows[0].version !== data.expectedVersion) {
        throw new ConflictException('Worker version conflict. Refresh and try again.');
      }

      const updates: string[] = [];
      const values: any[] = [principal.tenantId, id, data.expectedVersion + 1, principal.subject];
      let vIdx = 5;

      if (data.firstName !== undefined) {
        updates.push(`first_name = $${vIdx++}`);
        values.push(data.firstName);
      }
      if (data.lastName !== undefined) {
        updates.push(`last_name = $${vIdx++}`);
        values.push(data.lastName);
      }
      if (data.phone !== undefined) {
        updates.push(`phone = $${vIdx++}`);
        values.push(data.phone);
      }
      if (data.primaryOrgUnitId !== undefined) {
        updates.push(`primary_org_unit_id = $${vIdx++}`);
        values.push(data.primaryOrgUnitId);
      }
      if (data.skills !== undefined) {
        updates.push(`skills = $${vIdx++}`);
        values.push(JSON.stringify(data.skills));
      }
      if (data.metadata !== undefined) {
        updates.push(`metadata = $${vIdx++}`);
        values.push(JSON.stringify(data.metadata));
      }

      if (updates.length === 0) {
        return this.mapWorker(existing.rows[0]);
      }

      const res = await client.query(
        `UPDATE gigalibs_workforce.wfo_workers
         SET ${updates.join(', ')}, version = $3, updated_by = $4, updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        values,
      );

      return this.mapWorker(res.rows[0]);
    });
  }

  async setLifecycleStatus(
    principal: GigaOpsPrincipal,
    id: string,
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED',
  ): Promise<WfoWorkerRecordV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `UPDATE gigalibs_workforce.wfo_workers
         SET lifecycle_status = $3, version = version + 1, updated_by = $4, updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [principal.tenantId, id, status, principal.subject],
      );
      if (!res.rowCount || res.rowCount === 0) {
        throw new NotFoundException(`Worker ${id} not found.`);
      }
      return this.mapWorker(res.rows[0]);
    });
  }

  // ─── Compliance Documents ────────────────────────────────────────────────────

  async addComplianceDoc(
    principal: GigaOpsPrincipal,
    workerId: string,
    input: unknown,
  ): Promise<WfoComplianceDocRecordV1> {
    const data: CreateWfoComplianceDocV1 = CreateWfoComplianceDocV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      // Ensure worker exists
      const worker = await client.query(
        `SELECT id FROM gigalibs_workforce.wfo_workers WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, workerId],
      );
      if (!worker.rowCount || worker.rowCount === 0) {
        throw new NotFoundException(`Worker ${workerId} not found.`);
      }

      const res = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_compliance_documents (
          tenant_id, worker_id, doc_type, file_url, expires_at, notes, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        ) RETURNING *`,
        [
          principal.tenantId,
          workerId,
          data.docType,
          data.fileUrl,
          data.expiresAt ?? null,
          data.notes ?? null,
          principal.subject,
        ],
      );

      return this.mapDoc(res.rows[0]);
    });
  }

  async listComplianceDocs(
    principal: GigaOpsPrincipal,
    workerId: string,
  ): Promise<WfoComplianceDocRecordV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_workforce.wfo_compliance_documents
         WHERE tenant_id = $1 AND worker_id = $2
         ORDER BY created_at DESC`,
        [principal.tenantId, workerId],
      );
      return res.rows.map((r) => this.mapDoc(r));
    });
  }

  async verifyComplianceDoc(
    principal: GigaOpsPrincipal,
    workerId: string,
    docId: string,
    input: unknown,
  ): Promise<WfoComplianceDocRecordV1> {
    const data: VerifyWfoComplianceDocV1 = VerifyWfoComplianceDocV1Schema.parse(input);
    const newStatus = data.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `UPDATE gigalibs_workforce.wfo_compliance_documents
         SET status = $4, verified_by = $5, verified_at = now(), notes = COALESCE($6, notes), updated_at = now()
         WHERE tenant_id = $1 AND worker_id = $2 AND id = $3
         RETURNING *`,
        [
          principal.tenantId,
          workerId,
          docId,
          newStatus,
          principal.subject,
          data.notes ?? null,
        ],
      );
      if (!res.rowCount || res.rowCount === 0) {
        throw new NotFoundException(`Compliance document ${docId} not found.`);
      }

      // Recompute onboarding percentage for the worker
      const totalDocs = await client.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved
         FROM gigalibs_workforce.wfo_compliance_documents
         WHERE tenant_id = $1 AND worker_id = $2`,
        [principal.tenantId, workerId],
      );
      const total = totalDocs.rows[0]?.total ?? 0;
      const approved = totalDocs.rows[0]?.approved ?? 0;
      const pct = total > 0 ? Math.round((approved / total) * 100) : 0;

      await client.query(
        `UPDATE gigalibs_workforce.wfo_workers
         SET onboarding_pct = $3, updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, workerId, pct],
      );

      return this.mapDoc(res.rows[0]);
    });
  }

  // ─── Private Mappers ─────────────────────────────────────────────────────────

  private mapWorker(row: any): WfoWorkerRecordV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      portalUserId: row.portal_user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      workerType: row.worker_type,
      lifecycleStatus: row.lifecycle_status,
      onboardingPct: row.onboarding_pct,
      identityHash: row.identity_hash,
      unionId: row.union_id,
      primaryOrgUnitId: row.primary_org_unit_id,
      skills: typeof row.skills === 'string' ? JSON.parse(row.skills) : row.skills,
      externalIds: typeof row.external_ids === 'string' ? JSON.parse(row.external_ids) : row.external_ids,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      version: row.version,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapDoc(row: any): WfoComplianceDocRecordV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      workerId: row.worker_id,
      docType: row.doc_type,
      fileUrl: row.file_url,
      status: row.status,
      expiresAt: row.expires_at ? row.expires_at.toISOString().split('T')[0] : null,
      verifiedBy: row.verified_by,
      verifiedAt: row.verified_at ? row.verified_at.toISOString() : null,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
