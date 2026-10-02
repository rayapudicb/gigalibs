import {
  type AddWfoExpenseLineV1,
  type CreateWfoExpenseReportV1,
  type VerifyWfoExpenseLineV1,
  type WfoExpenseLineRecordV1,
  type WfoExpenseReportRecordV1,
  AddWfoExpenseLineV1Schema,
  CreateWfoExpenseReportV1Schema,
  VerifyWfoExpenseLineV1Schema,
} from '@gigalibs/contracts';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

export const IRS_STANDARD_MILEAGE_RATE = 0.67;

@Injectable()
export class WfoExpensesService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  async calculateMileage(miles: number, ratePerMile = IRS_STANDARD_MILEAGE_RATE) {
    if (miles < 0) throw new BadRequestException('Miles cannot be negative');
    return {
      miles,
      ratePerMile,
      reimbursementAmount: Number((miles * ratePerMile).toFixed(2)),
    };
  }

  async createReport(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<WfoExpenseReportRecordV1> {
    const data: CreateWfoExpenseReportV1 = CreateWfoExpenseReportV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      // Find worker for this subject
      const workerRes = await client.query(
        `SELECT id FROM gigalibs_workforce.wfo_workers
         WHERE tenant_id = $1 AND (portal_user_id = $2 OR email ILIKE $2) LIMIT 1`,
        [principal.tenantId, principal.subject],
      );

      // Default to first worker or creator worker
      const workerId = workerRes.rowCount && workerRes.rowCount > 0
        ? workerRes.rows[0].id
        : (await client.query(`SELECT id FROM gigalibs_workforce.wfo_workers WHERE tenant_id = $1 LIMIT 1`, [principal.tenantId])).rows[0]?.id;

      if (!workerId) {
        throw new NotFoundException('Worker profile not found for expense claim.');
      }

      const res = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_expense_reports (
          tenant_id, worker_id, engagement_id, title, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          principal.tenantId,
          workerId,
          data.engagementId ?? null,
          data.title,
          data.notes ?? null,
          principal.subject,
        ],
      );

      return this.mapReport(res.rows[0]);
    });
  }

  async listReports(
    principal: GigaOpsPrincipal,
    filters: { workerId?: string; engagementId?: string; status?: string },
  ): Promise<WfoExpenseReportRecordV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let where = `WHERE tenant_id = $1`;
      const params: any[] = [principal.tenantId];
      let idx = 2;

      if (filters.workerId) {
        where += ` AND worker_id = $${idx++}`;
        params.push(filters.workerId);
      }
      if (filters.engagementId) {
        where += ` AND engagement_id = $${idx++}`;
        params.push(filters.engagementId);
      }
      if (filters.status) {
        where += ` AND status = $${idx++}`;
        params.push(filters.status);
      }

      const res = await client.query(
        `SELECT * FROM gigalibs_workforce.wfo_expense_reports ${where} ORDER BY created_at DESC`,
        params,
      );

      return res.rows.map((r) => this.mapReport(r));
    });
  }

  async addExpenseLine(
    principal: GigaOpsPrincipal,
    reportId: string,
    input: unknown,
  ): Promise<WfoExpenseLineRecordV1> {
    const data: AddWfoExpenseLineV1 = AddWfoExpenseLineV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      // Calculate amount if mileage
      let finalAmount = data.amount;
      if (data.expenseType === 'MILEAGE' && data.miles) {
        finalAmount = Number((data.miles * IRS_STANDARD_MILEAGE_RATE).toFixed(2));
      }

      const lineRes = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_expense_lines (
          tenant_id, report_id, expense_type, amount, currency, mileage_from,
          mileage_to, miles, receipt_url, description, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          principal.tenantId,
          reportId,
          data.expenseType,
          finalAmount,
          data.currency,
          data.mileageFrom ?? null,
          data.mileageTo ?? null,
          data.miles ?? null,
          data.receiptUrl ?? null,
          data.description ?? null,
          principal.subject,
        ],
      );

      // Update report total
      await client.query(
        `UPDATE gigalibs_workforce.wfo_expense_reports
         SET total_amount = (
           SELECT COALESCE(SUM(amount), 0) FROM gigalibs_workforce.wfo_expense_lines
           WHERE tenant_id = $1 AND report_id = $2
         ), updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, reportId],
      );

      return this.mapLine(lineRes.rows[0]);
    });
  }

  async verifyLine(
    principal: GigaOpsPrincipal,
    reportId: string,
    lineId: string,
    input: unknown,
  ): Promise<WfoExpenseLineRecordV1> {
    const data: VerifyWfoExpenseLineV1 = VerifyWfoExpenseLineV1Schema.parse(input);
    const newStatus = data.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `UPDATE gigalibs_workforce.wfo_expense_lines
         SET status = $4, approved_by = $5, approved_at = now(), rejection_reason = $6, updated_at = now()
         WHERE tenant_id = $1 AND report_id = $2 AND id = $3
         RETURNING *`,
        [
          principal.tenantId,
          reportId,
          lineId,
          newStatus,
          principal.subject,
          data.reason ?? null,
        ],
      );
      if (!res.rowCount || res.rowCount === 0) {
        throw new NotFoundException(`Expense line ${lineId} not found.`);
      }

      return this.mapLine(res.rows[0]);
    });
  }

  // ─── Mappers ────────────────────────────────────────────────────────────────

  private mapReport(row: any): WfoExpenseReportRecordV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      workerId: row.worker_id,
      engagementId: row.engagement_id,
      title: row.title,
      status: row.status,
      totalAmount: Number(row.total_amount),
      currency: row.currency,
      submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapLine(row: any): WfoExpenseLineRecordV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      reportId: row.report_id,
      expenseType: row.expense_type,
      amount: Number(row.amount),
      currency: row.currency,
      mileageFrom: row.mileage_from,
      mileageTo: row.mileage_to,
      miles: row.miles ? Number(row.miles) : null,
      receiptUrl: row.receipt_url,
      description: row.description,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
