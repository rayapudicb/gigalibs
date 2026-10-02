import {
  type BulkInviteRowV1,
  type BulkInviteSubmitV1,
  type CreateWfoInvitationV1,
  type GenerateWfoContractV1,
  type RespondWfoInvitationV1,
  type SignWfoContractV1,
  type WfoContractRecordV1,
  type WfoInvitationRecordV1,
  BulkInviteSubmitV1Schema,
  CreateWfoInvitationV1Schema,
  GenerateWfoContractV1Schema,
  RespondWfoInvitationV1Schema,
  SignWfoContractV1Schema,
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
export class WfoStaffingService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  // ─── Template Generation ───────────────────────────────────────────────────

  async generateInvitationTemplateCsv(
    principal: GigaOpsPrincipal,
    engagementId: string,
  ): Promise<string> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const positions = await client.query(
        `SELECT id, title FROM gigalibs_workforce.wfo_engagement_positions
         WHERE tenant_id = $1 AND engagement_id = $2 AND status = 'OPEN'`,
        [principal.tenantId, engagementId],
      );

      const header = 'Email*,FirstName*,LastName*,Phone,PositionCode*,RateOverride,Notes\n';
      const sampleRows = positions.rows.map((p, idx) =>
        `crew.${idx + 1}@example.com,John,Doe,+1555000${idx},${p.title},,Available on weekend`,
      );

      return header + (sampleRows.length > 0 ? sampleRows.join('\n') : 'crew@example.com,Alex,Smith,+15551234,General,,\n');
    });
  }

  // ─── Bulk Preview & Submit ─────────────────────────────────────────────────

  async previewBulkInvitations(
    principal: GigaOpsPrincipal,
    engagementId: string,
    rows: BulkInviteRowV1[],
  ): Promise<{
    validCount: number;
    errorCount: number;
    details: { row: number; email: string; valid: boolean; reason?: string }[];
  }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const details: { row: number; email: string; valid: boolean; reason?: string }[] = [];
      let validCount = 0;
      let errorCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.email || !r.email.includes('@')) {
          details.push({ row: i + 1, email: r.email, valid: false, reason: 'Invalid email address' });
          errorCount++;
          continue;
        }

        // Check if position title exists in engagement
        const pos = await client.query(
          `SELECT id FROM gigalibs_workforce.wfo_engagement_positions
           WHERE tenant_id = $1 AND engagement_id = $2 AND (title ILIKE $3 OR id::text = $3)`,
          [principal.tenantId, engagementId, r.positionCode],
        );
        if (!pos.rowCount || pos.rowCount === 0) {
          details.push({ row: i + 1, email: r.email, valid: false, reason: `Position '${r.positionCode}' not found` });
          errorCount++;
          continue;
        }

        details.push({ row: i + 1, email: r.email, valid: true });
        validCount++;
      }

      return { validCount, errorCount, details };
    });
  }

  async submitBulkInvitations(
    principal: GigaOpsPrincipal,
    engagementId: string,
    input: unknown,
  ): Promise<{ invitedCount: number; createdWorkerCount: number }> {
    const data: BulkInviteSubmitV1 = BulkInviteSubmitV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let invitedCount = 0;
      let createdWorkerCount = 0;

      for (const r of data.rows) {
        // Resolve or create worker
        let workerRes = await client.query(
          `SELECT id FROM gigalibs_workforce.wfo_workers WHERE tenant_id = $1 AND email = $2`,
          [principal.tenantId, r.email.toLowerCase()],
        );

        let workerId: string;
        if (!workerRes.rowCount || workerRes.rowCount === 0) {
          const newWorker = await client.query(
            `INSERT INTO gigalibs_workforce.wfo_workers (
              tenant_id, first_name, last_name, email, phone, lifecycle_status, created_by, updated_by
            ) VALUES ($1, $2, $3, $4, $5, 'PROSPECT_LEAD', $6, $6)
            RETURNING id`,
            [principal.tenantId, r.firstName, r.lastName, r.email.toLowerCase(), r.phone ?? null, principal.subject],
          );
          workerId = newWorker.rows[0].id;
          createdWorkerCount++;
        } else {
          workerId = workerRes.rows[0].id;
        }

        // Resolve position
        const posRes = await client.query(
          `SELECT id FROM gigalibs_workforce.wfo_engagement_positions
           WHERE tenant_id = $1 AND engagement_id = $2 AND (title ILIKE $3 OR id::text = $3)
           LIMIT 1`,
          [principal.tenantId, engagementId, r.positionCode],
        );

        if (posRes.rowCount && posRes.rowCount > 0) {
          const positionId = posRes.rows[0].id;
          // Upsert invitation
          const invRes = await client.query(
            `INSERT INTO gigalibs_workforce.wfo_invitations (
              tenant_id, engagement_id, position_id, worker_id, rate_override, message, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (tenant_id, position_id, worker_id) DO NOTHING
            RETURNING id`,
            [
              principal.tenantId,
              engagementId,
              positionId,
              workerId,
              r.rateOverride ?? null,
              r.notes ?? null,
              principal.subject,
            ],
          );
          if (invRes.rowCount && invRes.rowCount > 0) {
            invitedCount++;
          }
        }
      }

      return { invitedCount, createdWorkerCount };
    });
  }

  // ─── Invitations Lifecycle ─────────────────────────────────────────────────

  async createInvitation(
    principal: GigaOpsPrincipal,
    engagementId: string,
    input: unknown,
  ): Promise<WfoInvitationRecordV1> {
    const data: CreateWfoInvitationV1 = CreateWfoInvitationV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_invitations (
          tenant_id, engagement_id, position_id, worker_id, rate_override, message, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          principal.tenantId,
          engagementId,
          data.positionId,
          data.workerId,
          data.rateOverride ?? null,
          data.message ?? null,
          principal.subject,
        ],
      );

      return this.mapInvitation(res.rows[0]);
    });
  }

  async listInvitations(
    principal: GigaOpsPrincipal,
    filters: { engagementId?: string; positionId?: string; workerId?: string; status?: string },
  ): Promise<WfoInvitationRecordV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let where = `WHERE tenant_id = $1`;
      const params: any[] = [principal.tenantId];
      let idx = 2;

      if (filters.engagementId) {
        where += ` AND engagement_id = $${idx++}`;
        params.push(filters.engagementId);
      }
      if (filters.positionId) {
        where += ` AND position_id = $${idx++}`;
        params.push(filters.positionId);
      }
      if (filters.workerId) {
        where += ` AND worker_id = $${idx++}`;
        params.push(filters.workerId);
      }
      if (filters.status) {
        where += ` AND status = $${idx++}`;
        params.push(filters.status);
      }

      const res = await client.query(
        `SELECT * FROM gigalibs_workforce.wfo_invitations ${where} ORDER BY created_at DESC`,
        params,
      );

      return res.rows.map((r) => this.mapInvitation(r));
    });
  }

  async respondInvitation(
    principal: GigaOpsPrincipal,
    id: string,
    input: unknown,
  ): Promise<WfoInvitationRecordV1> {
    const data: RespondWfoInvitationV1 = RespondWfoInvitationV1Schema.parse(input);
    const newStatus = data.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `UPDATE gigalibs_workforce.wfo_invitations
         SET status = $3, responded_at = now(), response_reason = $4, updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [principal.tenantId, id, newStatus, data.reason ?? null],
      );
      if (!res.rowCount || res.rowCount === 0) {
        throw new NotFoundException(`Invitation ${id} not found.`);
      }

      return this.mapInvitation(res.rows[0]);
    });
  }

  // ─── Digital Contracts ─────────────────────────────────────────────────────

  async generateContract(
    principal: GigaOpsPrincipal,
    engagementId: string,
    input: unknown,
  ): Promise<WfoContractRecordV1> {
    const data: GenerateWfoContractV1 = GenerateWfoContractV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_contracts (
          tenant_id, engagement_id, position_id, worker_id, template_code, title, terms_text, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SENT', $8)
        RETURNING *`,
        [
          principal.tenantId,
          engagementId,
          data.positionId,
          data.workerId,
          data.templateCode,
          data.title,
          data.termsText,
          principal.subject,
        ],
      );

      return this.mapContract(res.rows[0]);
    });
  }

  async signContract(
    principal: GigaOpsPrincipal,
    id: string,
    input: unknown,
  ): Promise<WfoContractRecordV1> {
    const data: SignWfoContractV1 = SignWfoContractV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `UPDATE gigalibs_workforce.wfo_contracts
         SET status = 'SIGNED', signature_hash = $3, signed_by_ip = $4, signed_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [principal.tenantId, id, data.signatureHash, data.signedByIp ?? null],
      );
      if (!res.rowCount || res.rowCount === 0) {
        throw new NotFoundException(`Contract ${id} not found.`);
      }

      return this.mapContract(res.rows[0]);
    });
  }

  async approveContract(
    principal: GigaOpsPrincipal,
    id: string,
  ): Promise<WfoContractRecordV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `UPDATE gigalibs_workforce.wfo_contracts
         SET status = 'APPROVED', approved_by = $3, approved_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [principal.tenantId, id, principal.subject],
      );
      if (!res.rowCount || res.rowCount === 0) {
        throw new NotFoundException(`Contract ${id} not found.`);
      }

      return this.mapContract(res.rows[0]);
    });
  }

  // ─── Private Mappers ─────────────────────────────────────────────────────────

  private mapInvitation(row: any): WfoInvitationRecordV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      engagementId: row.engagement_id,
      positionId: row.position_id,
      workerId: row.worker_id,
      status: row.status,
      rateOverride: row.rate_override ? Number(row.rate_override) : null,
      message: row.message,
      respondedAt: row.responded_at ? row.responded_at.toISOString() : null,
      responseReason: row.response_reason,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapContract(row: any): WfoContractRecordV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      engagementId: row.engagement_id,
      positionId: row.position_id,
      workerId: row.worker_id,
      templateCode: row.template_code,
      title: row.title,
      status: row.status,
      fileUrl: row.file_url,
      termsText: row.terms_text,
      signatureHash: row.signature_hash,
      signedAt: row.signed_at ? row.signed_at.toISOString() : null,
      signedByIp: row.signed_by_ip,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
