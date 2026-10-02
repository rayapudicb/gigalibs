import {
  type WfoComplianceAuditReportItemV1,
  type WfoComplianceDashboardSummaryV1,
} from '@gigalibs/contracts';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

@Injectable()
export class WfoComplianceService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  async getSummary(principal: GigaOpsPrincipal): Promise<WfoComplianceDashboardSummaryV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const workersRes = await client.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE compliance_status = 'COMPLIANT')::int as compliant,
           COUNT(*) FILTER (WHERE compliance_status = 'PENDING')::int as pending,
           COUNT(*) FILTER (WHERE compliance_status = 'EXPIRED')::int as expired
         FROM gigalibs_workforce.wfo_workers
         WHERE tenant_id = $1`,
        [principal.tenantId],
      );

      const docsRes = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'PENDING')::int as pending_docs,
           COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at BETWEEN now() AND now() + interval '30 days')::int as expiring_docs
         FROM gigalibs_workforce.wfo_compliance_documents
         WHERE tenant_id = $1`,
        [principal.tenantId],
      );

      const row = workersRes.rows[0] || { total: 0, compliant: 0, pending: 0, expired: 0 };
      const docRow = docsRes.rows[0] || { pending_docs: 0, expiring_docs: 0 };

      const total = Number(row.total || 0);
      const compliant = Number(row.compliant || 0);
      const pending = Number(row.pending || 0);
      const expired = Number(row.expired || 0);

      const complianceRatePct = total > 0 ? Number(((compliant / total) * 100).toFixed(1)) : 100;

      return {
        totalWorkers: total,
        compliantWorkers: compliant,
        pendingWorkers: pending,
        expiredWorkers: expired,
        complianceRatePct,
        pendingDocumentsCount: Number(docRow.pending_docs || 0),
        expiring30DaysCount: Number(docRow.expiring_docs || 0),
      };
    });
  }

  async getAuditReport(principal: GigaOpsPrincipal): Promise<WfoComplianceAuditReportItemV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT
           d.worker_id as "workerId",
           w.first_name || ' ' || w.last_name as "workerName",
           w.email,
           d.document_type as "documentType",
           d.document_number as "documentNumber",
           d.status,
           d.expires_at::text as "expiresAt",
           d.verified_at::text as "verifiedAt",
           d.verified_by as "verifiedBy"
         FROM gigalibs_workforce.wfo_compliance_documents d
         JOIN gigalibs_workforce.wfo_workers w
           ON w.id = d.worker_id AND w.tenant_id = d.tenant_id
         WHERE d.tenant_id = $1
         ORDER BY d.created_at DESC`,
        [principal.tenantId],
      );

      return res.rows;
    });
  }

  async getVerificationQueue(principal: GigaOpsPrincipal): Promise<any[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT
           d.id,
           d.worker_id as "workerId",
           w.first_name || ' ' || w.last_name as "workerName",
           w.email,
           d.document_type as "documentType",
           d.document_number as "documentNumber",
           d.file_url as "fileUrl",
           d.status,
           d.expires_at::text as "expiresAt",
           d.created_at::text as "createdAt"
         FROM gigalibs_workforce.wfo_compliance_documents d
         JOIN gigalibs_workforce.wfo_workers w
           ON w.id = d.worker_id AND w.tenant_id = d.tenant_id
         WHERE d.tenant_id = $1 AND d.status = 'PENDING'
         ORDER BY d.created_at ASC`,
        [principal.tenantId],
      );

      return res.rows;
    });
  }
}
