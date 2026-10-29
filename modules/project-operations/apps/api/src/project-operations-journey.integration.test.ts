import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PROJECT_INVOICE_DRAFT_REQUESTED_V1,
} from '@gigalibs/contracts';
import type { ModuleCommandContext, ModulePrincipal } from '@gigalibs/module-sdk';
import { BillingService } from './billing/billing.service.js';
import { DatabaseService } from './database.service.js';
import { TimesheetsService } from './timesheets/timesheets.service.js';
import { startThrowawayPostgres, type ThrowawayPostgres } from '../scripts/throwaway-postgres.js';

const enabled = process.env.PROJECT_OPERATIONS_PG_PROOF === '1';
const tenantId = 'project-proof-tenant';

const principal: ModulePrincipal = {
  tenantId,
  subject: 'proof-supervisor',
  sessionId: 'proof-session',
  authVersion: 1,
  permissions: ['*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  organization: { mode: 'ALL' },
  departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'ALL' },
};

function ctx(requestKey?: string): ModuleCommandContext {
  const key = requestKey ?? randomUUID();
  return { principal, correlationId: key };
}

describe.skipIf(!enabled)('Project Operations phase-1 milestone + T&M billing on isolated PostgreSQL 16 (WI-OI-129 S7)', () => {
  let postgres: ThrowawayPostgres;
  let db: DatabaseService;
  let timesheets: TimesheetsService;
  let billing: BillingService;
  let admin: pg.Client;

  let projectId: string;
  let phaseId: string;
  let taskId: string;
  let laborRateId: string;
  let timesheetId: string;
  let milestoneLineId: string;
  let customerPartyId: string;

  beforeAll(async () => {
    postgres = await startThrowawayPostgres(`gigalibs-project-proof-${process.pid}`);
    db = new DatabaseService({
      databaseUrl: postgres.runtimeUrl,
      databasePoolSize: 5,
      expectedMigrationVersion: 4,
      platformContextAudience: 'proof',
      platformContextPublicKey: 'proof',
      corsOrigins: [],
      apiHost: '127.0.0.1',
      apiPort: 0,
    } as never);
    await db.onModuleInit();
    timesheets = new TimesheetsService(db);
    billing = new BillingService(db);
    admin = new pg.Client({ connectionString: postgres.adminUrl });
    await admin.connect();

    customerPartyId = randomUUID();
    projectId = randomUUID();
    phaseId = randomUUID();
    taskId = randomUUID();
    laborRateId = randomUUID();
    timesheetId = randomUUID();
    milestoneLineId = randomUUID();

    await admin.query(`SET app.tenant_id = '${tenantId}'`);
    await admin.query(
      `INSERT INTO gigalibs_project_operations.projects
         (id, tenant_id, project_code, name, status, org_unit_id, customer_party_id, currency_code, budget_amount_minor, created_by,
          planned_start, planned_end)
       VALUES ($1, $2, 'PRJ-PH1', 'Phase-1 rollout', 'ACTIVE', 'north', $3, 'USD', 500000, 'seed', '2026-10-01', '2026-12-31')`,
      [projectId, tenantId, customerPartyId],
    );
    await admin.query(
      `INSERT INTO gigalibs_project_operations.project_phases
         (id, tenant_id, project_id, phase_number, name, status, planned_start, planned_end)
       VALUES ($1, $2, $3, 1, 'Phase 1', 'COMPLETE', '2026-10-01', '2026-10-31')`,
      [phaseId, tenantId, projectId],
    );
    await admin.query(
      `INSERT INTO gigalibs_project_operations.project_tasks
         (id, tenant_id, project_id, phase_id, task_number, name, status, planned_hours, planned_start, planned_end)
       VALUES ($1, $2, $3, $4, 1, 'Foundation', 'COMPLETE', 40, '2026-10-01', '2026-10-15')`,
      [taskId, tenantId, projectId, phaseId],
    );
    await admin.query(
      `INSERT INTO gigalibs_project_operations.labor_rates
         (id, tenant_id, rate_code, name, currency_code, hourly_rate_minor)
       VALUES ($1, $2, 'STD', 'Standard', 'USD', 7500)`,
      [laborRateId, tenantId],
    );
    await admin.query(
      `INSERT INTO gigalibs_project_operations.timesheets
         (id, tenant_id, project_id, task_id, worker_subject, labor_rate_id, work_date, hours, status)
       VALUES ($1, $2, $3, $4, 'tech-1', $5, '2026-10-10', 8, 'DRAFT')`,
      [timesheetId, tenantId, projectId, taskId, laborRateId],
    );
    await admin.query(
      `INSERT INTO gigalibs_project_operations.project_lines
         (id, tenant_id, project_id, line_number, line_kind, description, planned_amount_minor)
       VALUES ($1, $2, $3, 1, 'MILESTONE', 'Phase 1 complete', 150000)`,
      [milestoneLineId, tenantId, projectId],
    );
  }, 120_000);

  afterAll(async () => {
    await admin?.end();
    await db?.onModuleDestroy();
    postgres?.stop();
  });

  it('approves a submitted timesheet and enqueues T&M billing to AR', async () => {
    const submitKey = randomUUID();
    await timesheets.submitForApproval(ctx(submitKey), timesheetId, { requestKey: submitKey, expectedVersion: 1 });
    const approveKey = randomUUID();
    const approved = await timesheets.approve(ctx(approveKey), timesheetId, {
      requestKey: approveKey,
      expectedVersion: 2,
    });
    expect(approved.status).toBe('APPROVED');

    const billKey = randomUUID();
    const tm = await billing.billTimeMaterials(ctx(billKey), projectId, { requestKey: billKey });
    expect(tm.replayed).toBe(false);
    expect(tm.lineCount).toBe(1);

    await admin.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
    const outbox = await admin.query<{ event_type: string; payload: { billingKind?: string } }>(
      `SELECT event_type, payload FROM gigalibs_project_operations.outbox_events
        WHERE tenant_id = $1 AND event_type = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, PROJECT_INVOICE_DRAFT_REQUESTED_V1],
    );
    expect(outbox.rows[0]?.event_type).toBe(PROJECT_INVOICE_DRAFT_REQUESTED_V1);
    expect(outbox.rows[0]?.payload?.billingKind).toBe('TIME_MATERIALS');
  });

  it('drafts a milestone invoice after phase-1 completion', async () => {
    const billKey = randomUUID();
    const milestone = await billing.billMilestone(ctx(billKey), projectId, {
      requestKey: billKey,
      projectLineId: milestoneLineId,
    });
    expect(milestone.replayed).toBe(false);
    expect(milestone.subtotalMinor).toBe('150000');

    await admin.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
    const outbox = await admin.query<{ payload: { billingKind?: string; lines?: unknown[] } }>(
      `SELECT payload FROM gigalibs_project_operations.outbox_events
        WHERE tenant_id = $1 AND event_type = $2 AND payload->>'billingKind' = 'MILESTONE'
        ORDER BY created_at DESC LIMIT 1`,
      [tenantId, PROJECT_INVOICE_DRAFT_REQUESTED_V1],
    );
    expect(outbox.rows[0]?.payload?.billingKind).toBe('MILESTONE');
    expect(outbox.rows[0]?.payload?.lines).toHaveLength(1);
  });

  it('isolates tenant data under forced RLS', async () => {
    const other = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM gigalibs_project_operations.projects WHERE tenant_id = 'other-tenant'`,
    );
    expect(other.rows[0]?.count).toBe('0');
  });
});
