import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import {
  verifyWorkflowRunLedgerChain,
  type WorkflowLedgerVerificationResult,
} from './workflow-run-seal.js';

@Injectable()
export class RunsService {
  constructor(private readonly db: DatabaseService) {}

  async getRuns(tenantId: string, limit: number = 50): Promise<any[]> {
    const sql = `
      SELECT 
        r.id, r.tenant_id, r.workflow_id, r.workflow_code, r.version, r.correlation_id,
        r.status, r.duration_ms, r.started_at, r.completed_at, r.error_details,
        r.seal_sequence, r.seal_hash, r.previous_seal_hash,
        w.name AS workflow_name, w.category,
        COUNT(s.id)::int AS steps_count
      FROM gigalibs_workflow.workflow_runs r
      JOIN gigalibs_workflow.workflow_definitions w ON r.workflow_id = w.id
      LEFT JOIN gigalibs_workflow.step_executions s ON r.id = s.run_id
      WHERE r.tenant_id = $1
      GROUP BY r.id, w.name, w.category
      ORDER BY r.started_at DESC
      LIMIT $2
    `;
    const res = await this.db.query(sql, [tenantId, limit]);
    return res.rows;
  }

  async getRunById(tenantId: string, runId: string): Promise<any> {
    const runRes = await this.db.query(
      `SELECT r.*, w.name AS workflow_name, w.category 
       FROM gigalibs_workflow.workflow_runs r
       JOIN gigalibs_workflow.workflow_definitions w ON r.workflow_id = w.id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [runId, tenantId]
    );

    if (runRes.rowCount === 0) {
      throw new NotFoundException(`Workflow run '${runId}' not found`);
    }

    const run = runRes.rows[0];

    const stepsRes = await this.db.query(
      `SELECT * FROM gigalibs_workflow.step_executions 
       WHERE run_id = $1 ORDER BY started_at ASC`,
      [runId]
    );

    return {
      ...run,
      steps: stepsRes.rows,
    };
  }

  async getStats(tenantId: string): Promise<any> {
    const res = await this.db.query(
      `SELECT 
        count(*)::int AS total_runs,
        count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_runs,
        count(*) FILTER (WHERE status = 'FAILED')::int AS failed_runs,
        count(*) FILTER (WHERE status = 'RUNNING')::int AS active_runs,
        coalesce(avg(duration_ms), 0)::int AS avg_duration_ms
       FROM gigalibs_workflow.workflow_runs
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return res.rows[0];
  }

  /**
   * Delta-5: Fail-closed cryptographic ledger verification of workflow execution run chain.
   */
  async verifyLedger(tenantId: string): Promise<WorkflowLedgerVerificationResult> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    const res = await this.db.query(
      `SELECT id, tenant_id, workflow_code, version, correlation_id, status,
              completed_at, seal_sequence, seal_hash, previous_seal_hash
       FROM gigalibs_workflow.workflow_runs
       WHERE tenant_id = $1
       ORDER BY seal_sequence ASC NULLS LAST, started_at ASC`,
      [tenantId],
    );

    const records = res.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      workflowCode: row.workflow_code,
      version: row.version,
      correlationId: row.correlation_id,
      status: row.status,
      completedAt:
        row.completed_at instanceof Date
          ? row.completed_at.toISOString()
          : row.completed_at
            ? String(row.completed_at)
            : '',
      sealSequence: row.seal_sequence != null ? Number(row.seal_sequence) : undefined,
      sealHash: row.seal_hash ?? undefined,
      previousSealHash: row.previous_seal_hash ?? undefined,
    }));

    return verifyWorkflowRunLedgerChain(records);
  }
}
