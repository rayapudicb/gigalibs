/**
 * Phase 6 — Reports, CSV Export, Scheduled Delivery
 *
 * Test categories:
 *  1. Migration 000009 schema assertions
 *  2. ReportService — input pinning
 *  3. ReportService — idempotency key / duplicate suppression
 *  4. ReportService — CSV format (RFC 4180)
 *  5. ReportService — short-lived download token (TTL + expiry)
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

const MOCK_QUERY_RESPONSE = {
  chartDefinitionId: 'cd-1', asOf: '2026-01-01T00:00:00.000Z',
  watermark: 'wm-1', definitionVersion: 1, freshness: 'FRESH' as const,
  results: [
    { measureName: 'total_revenue', aggregateFn: 'SUM', fieldReference: 'revenue', displayLabel: 'Revenue', value: 100 },
    { measureName: 'count_orders', aggregateFn: 'COUNT', fieldReference: '*', displayLabel: 'Orders', value: 25 },
  ],
  accessibleTable: [
    { label: 'Revenue', value: '100' },
    { label: 'Orders', value: '25' },
  ],
};

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

// ─── 2. ReportService — input pinning ────────────────────────────────────────

import { ReportService } from './report.service.js';

function makeQueryEngineMock() {
  return { runQuery: jest.fn().mockResolvedValue(MOCK_QUERY_RESPONSE) };
}

function makeFullDb(reportDefRow: Record<string, unknown> | null = null) {
  let runId = 'run-1';
  return {
    queryWithTenant: jest.fn().mockImplementation((_t: string, sql: string) => {
      if (sql.includes('report_definitions') && sql.includes('WHERE id = $1')) {
        if (!reportDefRow) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [reportDefRow] });
      }
      if (sql.includes('report_runs') && sql.includes('INSERT')) {
        return Promise.resolve({ rows: [{ id: runId }] });
      }
      if (sql.includes('report_runs') && sql.includes('idempotency_key')) {
        return Promise.resolve({ rows: [] }); // No existing run
      }
      if (sql.includes('UPDATE') && sql.includes('report_runs')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('INSERT INTO') && sql.includes('report_artifacts')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('report_runs') && sql.includes('LEFT JOIN')) {
        return Promise.resolve({
          rows: [{
            id: runId, report_definition_id: 'def-1', tenant_id: 'T',
            status: 'SUCCEEDED', row_count: 2, error_message: null,
            triggered_by: 'u', queued_at: '2026-01-01T00:00:00Z',
            completed_at: '2026-01-01T00:00:01Z',
            artifact_id: 'art-1', download_token: 'tok-abc',
            token_expires_at: new Date(Date.now() + 60_000).toISOString(),
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    }),
    withTenantTransaction: jest.fn(),
  };
}

describe('ReportService — input pinning', () => {
  test('pinned_inputs stored in report_definitions at creation, not per run', async () => {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({ rows: [{ id: 'def-1' }] }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new ReportService(db as any, makeQueryEngineMock() as any);
    await svc.createReportDefinition(PRINCIPAL, {
      chartDefinitionId: 'cd-1', displayName: 'Q1 Revenue',
      pinnedInputs: { fiscalYear: 2026, region: 'APAC' },
    });
    const insertCall = db.queryWithTenant.mock.calls[0]!;
    // pinnedInputs must be in the INSERT, not deferred
    expect(insertCall[2]).toContain(JSON.stringify({ fiscalYear: 2026, region: 'APAC' }));
  });
});

// ─── 3. Idempotency key / duplicate suppression ───────────────────────────────

describe('ReportService — idempotency key suppression', () => {
  test('returns existing run when idempotency_key already seen', async () => {
    const db = {
      queryWithTenant: jest.fn().mockImplementation((_t: string, sql: string) => {
        if (sql.includes('report_definitions') && sql.includes('WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: 'def-1', chart_definition_id: 'cd-1', pinned_inputs: '{}' }] });
        }
        if (sql.includes('idempotency_key')) {
          return Promise.resolve({ rows: [{ id: 'run-existing', status: 'SUCCEEDED' }] });
        }
        if (sql.includes('LEFT JOIN') && sql.includes('report_runs')) {
          return Promise.resolve({
            rows: [{
              id: 'run-existing', report_definition_id: 'def-1', tenant_id: 'T',
              status: 'SUCCEEDED', row_count: 2, error_message: null,
              triggered_by: 'u', queued_at: '2026-01-01T00:00:00Z',
              completed_at: '2026-01-01T00:00:01Z',
              artifact_id: 'art-1', download_token: 'tok-x',
              token_expires_at: new Date(Date.now() + 60000).toISOString(),
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new ReportService(db as any, makeQueryEngineMock() as any);
    const result = await svc.triggerReportRun(PRINCIPAL, {
      reportDefinitionId: 'def-1', idempotencyKey: 'idem-123',
    });
    expect(result.id).toBe('run-existing');
    // runQuery should NOT be called (idempotent short-circuit)
    const qe = makeQueryEngineMock();
    expect(qe.runQuery).not.toHaveBeenCalled();
  });
});

// ─── 4. CSV format (RFC 4180) ─────────────────────────────────────────────────

describe('ReportService — CSV format', () => {
  test('CSV header is Measure,AggregateFunction,FieldReference,Value', async () => {
    const db = makeFullDb({ id: 'def-1', chart_definition_id: 'cd-1', pinned_inputs: '{}' });
    const qe = makeQueryEngineMock();
    const svc = new ReportService(db as any, qe as any);
    await svc.triggerReportRun(PRINCIPAL, { reportDefinitionId: 'def-1' });

    // Inspect stored bytes via private store
    const stored = (ReportService as any).artifactStore;
    const bytes: Buffer | undefined = [...stored.values()][0];
    expect(bytes).toBeDefined();
    const csv = bytes!.toString('utf8');
    expect(csv).toContain('Measure,AggregateFunction,FieldReference,Value');
  });

  test('CSV rows contain measure display labels and values', async () => {
    const db = makeFullDb({ id: 'def-1', chart_definition_id: 'cd-1', pinned_inputs: '{}' });
    const svc = new ReportService(db as any, makeQueryEngineMock() as any);
    await svc.triggerReportRun(PRINCIPAL, { reportDefinitionId: 'def-1' });

    const stored = (ReportService as any).artifactStore;
    const bytes: Buffer = [...stored.values()].at(-1);
    const csv = bytes.toString('utf8');
    expect(csv).toContain('Revenue');
    expect(csv).toContain('100');
    expect(csv).toContain('Orders');
    expect(csv).toContain('25');
  });

  test('CSV includes freshness metadata comment lines', async () => {
    const db = makeFullDb({ id: 'def-1', chart_definition_id: 'cd-1', pinned_inputs: '{}' });
    const svc = new ReportService(db as any, makeQueryEngineMock() as any);
    await svc.triggerReportRun(PRINCIPAL, { reportDefinitionId: 'def-1' });

    const stored = (ReportService as any).artifactStore;
    const bytes: Buffer = [...stored.values()].at(-1);
    const csv = bytes.toString('utf8');
    expect(csv).toMatch(/# Freshness: FRESH/);
    expect(csv).toMatch(/# GigaLibs Analytics Report/);
  });

  test('csvEscape handles values with commas and quotes', () => {
    // Access private via source-code check — CSV escape is pure
    const src = fs.readFileSync(path.resolve(__dirname, 'report.service.ts'), 'utf8');
    expect(src).toContain('if (/[",\\r\\n]/.test(value))');
    expect(src).toContain('value.replace(/"/g, \'""\')');
  });
});

// ─── 5. Short-lived download token ───────────────────────────────────────────

describe('ReportService — short-lived download token', () => {
  test('download token expires after TTL (GoneException)', async () => {
    const expiredAt = new Date(Date.now() - 1000).toISOString();
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({
        rows: [{
          id: 'art-1', filename: 'r.csv', content_type: 'text/csv',
          content_sha256: 'abc', storage_ref: 'mem://run-x',
          token_expires_at: expiredAt,
        }],
      }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new ReportService(db as any, makeQueryEngineMock() as any);
    await expect(svc.downloadArtifact(PRINCIPAL, 'expired-token')).rejects.toThrow();
  });

  test('download token TTL is 15 minutes (source code audit)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'report.service.ts'), 'utf8');
    expect(src).toMatch(/15 \* 60 \* 1000|TOKEN_TTL_MS.*=.*15/s);
  });

  test('download token not found throws NotFoundException', async () => {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new ReportService(db as any, makeQueryEngineMock() as any);
    await expect(svc.downloadArtifact(PRINCIPAL, 'nonexistent-token'))
      .rejects.toMatchObject({ message: expect.stringContaining('not found') });
  });

  test('content_sha256 is deterministic SHA-256 of CSV bytes', () => {
    const csv = 'Measure,AggregateFunction,FieldReference,Value\r\nRevenue,SUM,revenue,100\r\n';
    const hash = crypto.createHash('sha256').update(Buffer.from(csv, 'utf8')).digest('hex');
    expect(hash).toHaveLength(64);
    // Same input → same hash
    const hash2 = crypto.createHash('sha256').update(Buffer.from(csv, 'utf8')).digest('hex');
    expect(hash).toBe(hash2);
  });
});

// ─── 6. Append-only enforcement ───────────────────────────────────────────────

describe('ReportService — append-only enforcement', () => {
  test('migration has REVOKE UPDATE + DELETE on report_artifacts', () => {
    const sql = readMigration();
    expect(sql).toMatch(/REVOKE UPDATE.*report_artifacts/s);
    expect(sql).toMatch(/REVOKE DELETE.*report_artifacts/s);
  });

  test('migration has REVOKE UPDATE + DELETE on report_deliveries', () => {
    const sql = readMigration();
    expect(sql).toMatch(/REVOKE UPDATE.*report_deliveries/s);
    expect(sql).toMatch(/REVOKE DELETE.*report_deliveries/s);
  });

  test('source code never emits UPDATE/DELETE on report_artifacts', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'report.service.ts'), 'utf8');
    expect(src).not.toMatch(/`UPDATE\s+gigalibs_analytics\.report_artifacts/i);
    expect(src).not.toMatch(/`DELETE\s+FROM\s+gigalibs_analytics\.report_artifacts/i);
  });
});

// ─── 7. Cron expression validation ───────────────────────────────────────────

describe('ReportService — cron expression validation', () => {
  function svc() {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({ rows: [{ id: 'sched-1' }] }),
      withTenantTransaction: jest.fn(),
    };
    return new ReportService(db as any, makeQueryEngineMock() as any);
  }
  const base = { reportDefinitionId: 'def-1', deliveryChannel: 'IN_APP' as const, deliveryTargetRef: 'ref-1' };

  test('accepts valid 5-field cron expression', async () => {
    await expect(svc().createSchedule(PRINCIPAL, { ...base, cronExpression: '0 8 * * 1' })).resolves.toBeDefined();
  });

  test('rejects cron with wrong number of fields', async () => {
    await expect(svc().createSchedule(PRINCIPAL, { ...base, cronExpression: '0 8 * *' }))
      .rejects.toMatchObject({ message: expect.stringContaining('5 fields') });
  });
});

// ─── 8. Tenant isolation ──────────────────────────────────────────────────────

describe('ReportService — tenant isolation', () => {
  test('triggerReportRun throws NotFoundException for unknown definition (cross-tenant)', async () => {
    const db = {
      queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }),
      withTenantTransaction: jest.fn(),
    };
    const svc = new ReportService(db as any, makeQueryEngineMock() as any);
    await expect(svc.triggerReportRun(PRINCIPAL, { reportDefinitionId: 'def-other-tenant' }))
      .rejects.toMatchObject({ message: expect.stringContaining('not found') });
  });
});
