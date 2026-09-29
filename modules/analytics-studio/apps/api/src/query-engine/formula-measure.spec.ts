import { ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { FormulaMeasureService } from './formula-measure.service.js';

const FORMULA = '00000000-0000-4000-8000-000000000010';
const VERSION = '00000000-0000-4000-8000-000000000011';
const MODEL = '00000000-0000-4000-8000-000000000012';
const maker = { tenantId: 'tenant-a', subject: 'maker' } as AnalyticsPrincipal;
const checker = { tenantId: 'tenant-a', subject: 'checker' } as AnalyticsPrincipal;
const definition = {
  displayLabel: 'Hours per order',
  description: null,
  unit: 'hours/order',
  expression: {
    kind: 'binary' as const,
    operator: 'divide' as const,
    left: { kind: 'measure' as const, name: 'labour_hours' },
    right: { kind: 'measure' as const, name: 'work_orders' },
  },
};

interface Review {
  decision: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  actor_subject: string;
  reason: string | null;
  recorded_at: string;
}

function harness(initialReviews: Review[] = []) {
  const state = {
    published: null as string | null,
    reviews: [...initialReviews],
    auditEvents: [] as string[],
  };
  const versionRow = () => {
    const submitted = state.reviews.find((review) => review.decision === 'SUBMITTED');
    const terminal = state.reviews.find((review) => review.decision === 'APPROVED' || review.decision === 'REJECTED');
    return {
      id: VERSION,
      version_number: 1,
      definition,
      content_hash: 'a'.repeat(64),
      created_by: 'maker',
      created_at: '2026-09-29T00:00:00.000Z',
      submitted_by: submitted?.actor_subject ?? null,
      submitted_at: submitted?.recorded_at ?? null,
      terminal_decision: terminal?.decision ?? null,
      reviewed_by: terminal?.actor_subject ?? null,
      review_reason: terminal?.reason ?? null,
      reviewed_at: terminal?.recorded_at ?? null,
    };
  };
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM gigalibs_analytics.formula_measures WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: FORMULA, semantic_model_id: MODEL, measure_name: 'hours_per_order', created_by: 'maker', created_at: '2026-09-29T00:00:00.000Z', current_published_version_id: state.published }] };
      }
      if (sql.includes('FROM gigalibs_analytics.formula_measures WHERE id = $1') && !sql.includes('FOR UPDATE')) {
        return { rows: [{ id: FORMULA, semantic_model_id: MODEL, measure_name: 'hours_per_order', created_by: 'maker', created_at: '2026-09-29T00:00:00.000Z', current_published_version_id: state.published }] };
      }
      if (sql.includes('FROM gigalibs_analytics.formula_measure_versions') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: VERSION, version_number: 1, created_by: 'maker' }] };
      }
      if (sql.includes('SELECT v.id, v.version_number')) return { rows: [versionRow()] };
      if (sql.includes('SELECT decision FROM gigalibs_analytics.formula_measure_reviews')) {
        return { rows: state.reviews.map(({ decision }) => ({ decision })) };
      }
      if (sql.includes('INSERT INTO gigalibs_analytics.formula_measure_reviews')) {
        state.reviews.push({
          decision: params[2] as Review['decision'],
          actor_subject: params[3] as string,
          reason: params[4] as string | null,
          recorded_at: '2026-09-29T01:00:00.000Z',
        });
        return { rows: [] };
      }
      if (sql.includes('UPDATE gigalibs_analytics.formula_measures')) {
        state.published = params[1] as string;
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO gigalibs_analytics.analytics_audit_log')) {
        state.auditEvents.push(params[1] as string);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
  const db = {
    withTenantTransaction: vi.fn(async (_tenant: string, callback: (transaction: typeof client) => Promise<unknown>) => callback(client)),
  };
  return { service: new FormulaMeasureService(db as never), state, db, client };
}

describe('FormulaMeasureService maker-checker', () => {
  it('lets the maker submit an immutable version and records the transition', async () => {
    const { service, state, db } = harness();
    const result = await service.submit(maker, FORMULA, VERSION, { reason: 'Ready for domain review' });
    expect(result.versions[0]?.state).toBe('PENDING_REVIEW');
    expect(state.auditEvents).toEqual(['FORMULA_MEASURE_SUBMITTED']);
    expect(db.withTenantTransaction).toHaveBeenCalledWith('tenant-a', expect.any(Function));
  });

  it('refuses self-approval even when the version was submitted', async () => {
    const { service } = harness([
      { decision: 'SUBMITTED', actor_subject: 'maker', reason: null, recorded_at: '2026-09-29T00:30:00.000Z' },
    ]);
    await expect(service.approve(maker, FORMULA, VERSION, { reason: null })).rejects.toThrow(ForbiddenException);
  });

  it('publishes atomically when a different subject approves and records who reviewed it', async () => {
    const { service, state, client } = harness([
      { decision: 'SUBMITTED', actor_subject: 'maker', reason: null, recorded_at: '2026-09-29T00:30:00.000Z' },
    ]);
    const result = await service.approve(checker, FORMULA, VERSION, { reason: 'Formula and unit verified' });
    expect(result.publishedVersionId).toBe(VERSION);
    expect(result.versions[0]).toMatchObject({ state: 'PUBLISHED', createdBy: 'maker', reviewedBy: 'checker' });
    expect(state.auditEvents).toEqual(['FORMULA_MEASURE_PUBLISHED']);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE gigalibs_analytics.formula_measure_versions'))).toBe(false);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE gigalibs_analytics.formula_measure_reviews'))).toBe(false);
  });
});

describe('Migration 000016', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../../db/migrations/000016_formula_measure_versions.up.sql'),
    'utf8',
  );

  it('creates tenant-isolated formula, immutable-version and immutable-review tables', () => {
    for (const table of ['formula_measures', 'formula_measure_versions', 'formula_measure_reviews']) {
      expect(sql).toContain(`CREATE TABLE gigalibs_analytics.${table}`);
      expect(sql).toMatch(new RegExp(`ALTER TABLE gigalibs_analytics\\.%I ENABLE ROW LEVEL SECURITY`));
      expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    }
    expect(sql).toMatch(/REVOKE UPDATE, DELETE ON gigalibs_analytics\.formula_measure_versions/);
    expect(sql).toMatch(/REVOKE UPDATE, DELETE ON gigalibs_analytics\.formula_measure_reviews/);
  });

  it('prevents a published-version pointer crossing formula identities and records ledger 16', () => {
    expect(sql).toMatch(/FOREIGN KEY \(id, tenant_id, current_published_version_id\)/);
    expect(sql).toMatch(/FOREIGN KEY \(semantic_model_id, tenant_id\)/);
    expect(sql).toMatch(/FOREIGN KEY \(formula_measure_version_id, tenant_id\)/);
    expect(sql).toMatch(/VALUES \(16, '000016_formula_measure_versions'/);
  });
});
