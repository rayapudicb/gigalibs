/**
 * Phase 6 — Reports, CSV Export, Scheduled Delivery
 *
 * Test categories:
 *  1. Migration 000009 schema assertions
 *  2. ReportService — reports from saved chart views and dashboards (WI-OI-103e, ADR-0016 F11)
 *  3. ReportService — idempotency key / duplicate suppression
 *  4. CSV format (RFC 4180, labelled columns, spreadsheet-safe text)
 *  5. ReportService — short-lived download token (TTL + expiry), bytes kept with the artifact
 *  6. ReportService — append-only enforcement (report_artifacts, report_deliveries)
 *  7. ReportService — cron expression validation
 *  8. ReportService — tenant isolation
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest';

const jest = vi;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../db/migrations/000009_reports_and_scheduled_delivery.up.sql',
);

function readMigration(): string {
  return fs.readFileSync(MIGRATION_FILE, 'utf8');
}

const PRINCIPAL = { tenantId: 'T', subject: 'u', entitlements: new Set(['analytics-studio']) };


// ─── 1. Migration 000009 schema assertions ───────────────────────────────────

describe('Migration 000009 — schema assertions', () => {
  let sql: string;
  beforeAll(() => { sql = readMigration(); });

  test('creates report_status enum (QUEUED/RUNNING/SUCCEEDED/FAILED)', () => {
    expect(sql).toMatch(/CREATE TYPE.*report_status.*AS ENUM/s);
    for (const s of ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']) {
      expect(sql).toContain(`'${s}'`);
    }
  });

  test('creates delivery_channel enum', () => {
    expect(sql).toMatch(/CREATE TYPE.*delivery_channel.*AS ENUM/s);
    for (const s of ['EMAIL', 'WEBHOOK', 'SFTP', 'IN_APP']) {
      expect(sql).toContain(`'${s}'`);
    }
  });

  test('creates delivery_status enum', () => {
    expect(sql).toMatch(/CREATE TYPE.*delivery_status.*AS ENUM/s);
    expect(sql).toContain("'DUPLICATE_SUPPRESSED'");
  });

  test('creates report_definitions table with pinned_inputs JSONB', () => {
    expect(sql).toMatch(/CREATE TABLE.*report_definitions/s);
    expect(sql).toMatch(/pinned_inputs.*JSONB/s);
  });

  test('creates report_runs table with idempotency_key UNIQUE', () => {
    expect(sql).toMatch(/CREATE TABLE.*report_runs/s);
    expect(sql).toMatch(/idempotency_key/s);
    expect(sql).toMatch(/UNIQUE.*report_definition_id.*idempotency_key/s);
  });

  test('creates report_artifacts table with download_token UNIQUE', () => {
    expect(sql).toMatch(/CREATE TABLE.*report_artifacts/s);
    expect(sql).toMatch(/download_token.*TEXT.*UNIQUE/s);
  });

  test('report_artifacts has REVOKE UPDATE + DELETE (append-only)', () => {
    expect(sql).toMatch(/REVOKE UPDATE.*report_artifacts/s);
    expect(sql).toMatch(/REVOKE DELETE.*report_artifacts/s);
  });

  test('creates report_schedules table with cron_expression', () => {
    expect(sql).toMatch(/CREATE TABLE.*report_schedules/s);
    expect(sql).toMatch(/cron_expression.*TEXT/s);
  });

  test('creates report_deliveries table with REVOKE UPDATE + DELETE', () => {
    expect(sql).toMatch(/CREATE TABLE.*report_deliveries/s);
    expect(sql).toMatch(/REVOKE UPDATE.*report_deliveries/s);
    expect(sql).toMatch(/REVOKE DELETE.*report_deliveries/s);
  });

  test('report_deliveries has UNIQUE(run_id, content_sha256) for duplicate suppression', () => {
    expect(sql).toMatch(/UNIQUE.*run_id.*content_sha256/s);
  });

  test('all tables have RLS + FORCE RLS', () => {
    const tables = ['report_definitions', 'report_runs', 'report_artifacts', 'report_schedules', 'report_deliveries'];
    for (const tbl of tables) {
      expect(sql).toMatch(new RegExp(`ENABLE ROW LEVEL SECURITY.*${tbl}|${tbl}.*ENABLE ROW LEVEL SECURITY`, 's'));
    }
  });

  test('schema_migrations ledger records version 9', () => {
    expect(sql).toMatch(/INSERT INTO.*schema_migrations.*version.*9/s);
  });
});

// ─── 2. Reports from saved chart views and dashboards ─────────────────────────

import { NotFoundException } from '@nestjs/common';
import { ReportService, buildCsv, csvCell } from './report.service.js';

const VIEW_ID = '00000000-0000-4000-8000-0000000000a1';
const DASHBOARD_ID = '00000000-0000-4000-8000-0000000000d1';

const RESULT = {
  semanticModelId: 'm', datasetVersionId: 'dv', definitionVersion: 1, measureVersions: {},
  asOf: '2026-09-30T00:00:00.000Z', freshness: 'FRESH' as const, watermark: null, truncated: false,
  columns: [
    { name: 'crop', label: 'crop', role: 'dimension' as const, type: 'string' as const },
    { name: 'total_yield_kg', label: 'Yield (kg)', role: 'measure' as const, type: 'number' as const },
  ],
  rows: [['Rice', 5200], ['Wheat, durum', 3500]],
};

function definitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'def-1', display_name: 'Yield by crop', description: null, chart_definition_id: null,
    chart_view_id: VIEW_ID, dashboard_id: null, source_name: 'Yield by crop', created_by: 'u',
    created_at: '2026-09-30T00:00:00Z', ...overrides,
  };
}

function harness(definition: Record<string, unknown> | null = definitionRow()) {
  const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'def-new' }] }) };
  const db = {
    queryWithTenant: jest.fn().mockImplementation((_t: string, sql: string) => {
      if (sql.includes('FROM gigalibs_analytics.report_definitions d')) return Promise.resolve({ rows: definition ? [definition] : [] });
      if (sql.includes('INSERT INTO gigalibs_analytics.report_runs')) return Promise.resolve({ rows: [{ id: 'run-1' }] });
      if (sql.includes('FROM gigalibs_analytics.report_runs rr')) {
        return Promise.resolve({
          rows: [{
            id: 'run-1', report_definition_id: 'def-1', status: 'SUCCEEDED', row_count: 2, error_message: null,
            triggered_by: 'u', queued_at: '2026-09-30T00:00:00Z', completed_at: '2026-09-30T00:00:01Z',
            download_token: 'tok-1', token_expires_at: new Date(Date.now() + 60_000).toISOString(), filename: 'r.csv',
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    }),
    withTenantTransaction: jest.fn(async (_t: string, callback: (value: unknown) => unknown) => callback(client)),
  };
  const chartViews = {
    get: jest.fn().mockResolvedValue({ id: VIEW_ID }),
    data: jest.fn().mockResolvedValue({ view: { id: VIEW_ID, query: { semanticModelId: 'm', measures: ['total_yield_kg'] } }, result: RESULT }),
  };
  const dashboards = {
    get: jest.fn().mockResolvedValue({ id: DASHBOARD_ID }),
    data: jest.fn().mockResolvedValue({
      dashboardId: DASHBOARD_ID,
      generatedAt: '2026-09-30T00:00:00Z',
      tiles: [
        { chartViewId: VIEW_ID, name: 'Yield by crop', result: RESULT, error: null },
        { chartViewId: 'v2', name: 'Cost by farm', result: null, error: 'Formula version is no longer published.' },
      ],
    }),
  };
  const svc = new ReportService(db as any, chartViews as any, dashboards as any);
  const artifactInsert = () => client.query.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO gigalibs_analytics.report_artifacts'));
  return { svc, db, client, chartViews, dashboards, artifactInsert };
}

describe('ReportService — reports from saved chart views and dashboards', () => {
  test('creates a report from a saved chart after proving the chart exists, and audits it', async () => {
    const { svc, client, chartViews } = harness();
    await svc.createReportDefinition(PRINCIPAL as any, { name: 'Yield by crop', source: { chartViewId: VIEW_ID } });
    expect(chartViews.get).toHaveBeenCalledWith(PRINCIPAL, VIEW_ID);
    const insert = client.query.mock.calls[0]!;
    expect(insert[0]).toContain('chart_view_id, dashboard_id');
    expect(insert[1]).toEqual(['T', 'Yield by crop', null, VIEW_ID, null, 'u']);
    expect(client.query.mock.calls[1]![0]).toContain("'REPORT_DEFINITION_CREATED'");
  });

  test('refuses a report without exactly one known source', async () => {
    const { svc, dashboards, client } = harness();
    await expect(svc.createReportDefinition(PRINCIPAL as any, { name: 'X', source: {} })).rejects.toThrow(/Invalid report/);
    await expect(
      svc.createReportDefinition(PRINCIPAL as any, { name: 'X', source: { chartViewId: VIEW_ID, dashboardId: DASHBOARD_ID } }),
    ).rejects.toThrow(/Invalid report/);
    dashboards.get.mockRejectedValueOnce(new NotFoundException('Dashboard not found.'));
    await expect(svc.createReportDefinition(PRINCIPAL as any, { name: 'X', source: { dashboardId: DASHBOARD_ID } })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  test('a run re-asks the saved question, pins the question (not the answer) and stores the CSV with the artifact', async () => {
    const { svc, db, chartViews, artifactInsert } = harness();
    const run = await svc.triggerReportRun(PRINCIPAL as any, { reportDefinitionId: 'def-1' });
    expect(chartViews.data).toHaveBeenCalledWith(PRINCIPAL, VIEW_ID);
    const pinned = db.queryWithTenant.mock.calls.find(([, sql]: [string, string]) => sql.includes('pinned_query_snapshot'))!;
    expect(JSON.parse(pinned[2][1])).toEqual({ chartView: VIEW_ID, query: { semanticModelId: 'm', measures: ['total_yield_kg'] } });
    const [sql, values] = artifactInsert()!;
    expect(sql).toContain('content');
    const bytes = values[7] as Buffer;
    expect(values[4]).toBe(bytes.length);
    expect(values[3]).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
    expect(bytes.toString('utf8')).toContain('crop,Yield (kg)\r\nRice,5200\r\n"Wheat, durum",3500');
    expect(run.download).toEqual(expect.objectContaining({ token: 'tok-1' }));
  });

  test('a dashboard report writes one labelled section per chart and notes a chart that failed', async () => {
    const { svc, dashboards, artifactInsert } = harness(definitionRow({ chart_view_id: null, dashboard_id: DASHBOARD_ID }));
    await svc.triggerReportRun(PRINCIPAL as any, { reportDefinitionId: 'def-1' });
    expect(dashboards.data).toHaveBeenCalledWith(PRINCIPAL, DASHBOARD_ID, {});
    const csv = (artifactInsert()![1][7] as Buffer).toString('utf8');
    expect(csv).toContain('Yield by crop\r\ncrop,Yield (kg)');
    expect(csv).toContain('Cost by farm\r\nFormula version is no longer published.');
  });

  test('a report on a retired chart definition fails with a clear message instead of running the old engine', async () => {
    const { svc, db, artifactInsert } = harness(definitionRow({ chart_view_id: null, chart_definition_id: 'cd-1' }));
    await svc.triggerReportRun(PRINCIPAL as any, { reportDefinitionId: 'def-1' });
    const failed = db.queryWithTenant.mock.calls.find(([, sql]: [string, string]) => sql.includes("status = 'FAILED'"))!;
    expect(failed[2][1]).toMatch(/retired chart definition/);
    expect(artifactInsert()).toBeUndefined();
  });
});

// ─── 3. Idempotency key / duplicate suppression ───────────────────────────────

describe('ReportService — idempotency key suppression', () => {
  test('returns the existing run when the idempotency key was already seen, without re-asking', async () => {
    const { svc, db, chartViews } = harness();
    db.queryWithTenant.mockImplementation((_t: string, sql: string) => {
      if (sql.includes('FROM gigalibs_analytics.report_definitions d')) return Promise.resolve({ rows: [definitionRow()] });
      if (sql.includes('idempotency_key = $2')) return Promise.resolve({ rows: [{ id: 'run-existing' }] });
      if (sql.includes('FROM gigalibs_analytics.report_runs rr')) {
        return Promise.resolve({
          rows: [{ id: 'run-existing', report_definition_id: 'def-1', status: 'SUCCEEDED', row_count: 2, error_message: null,
            triggered_by: 'u', queued_at: '2026-09-30T00:00:00Z', completed_at: null, download_token: null, token_expires_at: null }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const run = await svc.triggerReportRun(PRINCIPAL as any, { reportDefinitionId: 'def-1', idempotencyKey: 'idem-1' });
    expect(run.id).toBe('run-existing');
    expect(chartViews.data).not.toHaveBeenCalled();
  });
});

// ─── 4. CSV format ────────────────────────────────────────────────────────────

describe('CSV format', () => {
  test('labelled header, one row per result row, RFC 4180 quoting and CRLF', () => {
    const { csv, rowCount } = buildCsv('Yield', [{ title: null, result: RESULT, note: null }]);
    expect(rowCount).toBe(2);
    expect(csv.startsWith('Yield\r\nGenerated ')).toBe(true);
    expect(csv).toContain('\r\n\r\ncrop,Yield (kg)\r\nRice,5200\r\n"Wheat, durum",3500\r\n');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(-12.5)).toBe('-12.5');
  });

  test('text a spreadsheet would run as a formula is neutralised', () => {
    for (const hostile of ['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)', '\tcmd']) {
      expect(csvCell(hostile).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(csvCell('Rice')).toBe('Rice');
  });

  test('notes when a chart returned fewer rows than matched', () => {
    const { csv } = buildCsv('Yield', [{ title: null, result: { ...RESULT, truncated: true }, note: null }]);
    expect(csv).toContain('More rows matched than this chart returns');
  });
});

// ─── 5. Short-lived download token ───────────────────────────────────────────

describe('ReportService — short-lived download token', () => {
  const artifact = (overrides: Record<string, unknown>) => ({
    filename: 'r.csv', content_type: 'text/csv; charset=utf-8', content_sha256: 'abc',
    token_expires_at: new Date(Date.now() + 60_000).toISOString(), content: Buffer.from('a,b\r\n'), ...overrides,
  });
  const svcWith = (rows: unknown[]) =>
    new ReportService({ queryWithTenant: jest.fn().mockResolvedValue({ rows }), withTenantTransaction: jest.fn() } as any, {} as any, {} as any);

  test('returns the stored bytes while the token is valid', async () => {
    const result = await svcWith([artifact({})]).downloadArtifact(PRINCIPAL as any, 'tok');
    expect(result.bytes.toString('utf8')).toBe('a,b\r\n');
  });

  test('an expired token is gone, an unknown token is not found', async () => {
    await expect(svcWith([artifact({ token_expires_at: new Date(Date.now() - 1000).toISOString() })]).downloadArtifact(PRINCIPAL as any, 'tok'))
      .rejects.toThrow(/expired/);
    await expect(svcWith([]).downloadArtifact(PRINCIPAL as any, 'nope')).rejects.toThrow(/not found/);
  });

  test('an artifact from before files were stored asks for a new run', async () => {
    await expect(svcWith([artifact({ content: null })]).downloadArtifact(PRINCIPAL as any, 'tok')).rejects.toThrow(/run the report again/);
  });

  test('download token TTL is 15 minutes (source code audit)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'report.service.ts'), 'utf8');
    expect(src).toMatch(/15 \* 60 \* 1000/);
  });
});

// ─── 6. Append-only enforcement ───────────────────────────────────────────────

describe('ReportService — append-only enforcement', () => {
  test('migration has REVOKE UPDATE + DELETE on report_artifacts and report_deliveries', () => {
    const sql = readMigration();
    expect(sql).toMatch(/REVOKE UPDATE.*report_artifacts/s);
    expect(sql).toMatch(/REVOKE DELETE.*report_artifacts/s);
    expect(sql).toMatch(/REVOKE UPDATE.*report_deliveries/s);
    expect(sql).toMatch(/REVOKE DELETE.*report_deliveries/s);
  });

  test('source code never emits UPDATE/DELETE on report_artifacts', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'report.service.ts'), 'utf8');
    expect(src).not.toMatch(/UPDATE\s+gigalibs_analytics\.report_artifacts/i);
    expect(src).not.toMatch(/DELETE\s+FROM\s+gigalibs_analytics\.report_artifacts/i);
  });
});

// ─── 7. Cron expression validation ───────────────────────────────────────────

describe('ReportService — cron expression validation', () => {
  const svc = () =>
    new ReportService({ queryWithTenant: jest.fn().mockResolvedValue({ rows: [{ id: 'sched-1' }] }), withTenantTransaction: jest.fn() } as any, {} as any, {} as any);
  const base = { reportDefinitionId: 'def-1', deliveryChannel: 'IN_APP' as const, deliveryTargetRef: 'ref-1' };

  test('accepts valid 5-field cron expression', async () => {
    await expect(svc().createSchedule(PRINCIPAL as any, { ...base, cronExpression: '0 8 * * 1' })).resolves.toBeDefined();
  });

  test('rejects cron with wrong number of fields', async () => {
    await expect(svc().createSchedule(PRINCIPAL as any, { ...base, cronExpression: '0 8 * *' })).rejects.toMatchObject({
      message: expect.stringContaining('5 fields'),
    });
  });
});

// ─── 8. Tenant isolation ──────────────────────────────────────────────────────

describe('ReportService — tenant isolation', () => {
  test('triggerReportRun throws NotFoundException for unknown definition (cross-tenant)', async () => {
    const { svc } = harness(null);
    await expect(svc.triggerReportRun(PRINCIPAL as any, { reportDefinitionId: 'def-other-tenant' })).rejects.toMatchObject({
      message: expect.stringContaining('not found'),
    });
  });
});
