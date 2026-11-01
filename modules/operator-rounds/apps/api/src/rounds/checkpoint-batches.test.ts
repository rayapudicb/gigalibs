import { createHash, randomUUID } from 'node:crypto';
import type { RoundCheckpointDraftV1 } from '@gigalibs/contracts';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RoutesService } from './routes.service.js';

const routeId = randomUUID();
const uploadId = randomUUID();
const draft = {
  id: routeId, tenant_id: 'tenant-a', route_code: 'R-1', title: 'Boiler', description: null, revision: 1,
  state: 'DRAFT', owning_unit_id: null, site_ref: null, schedule: {}, version: 4, created_by: 'author-a',
  approved_by: null, published_at: null, created_at: new Date(), updated_at: new Date(), request_sha256: 'x',
};
const context = (subject = 'author-a') => ({
  principal: {
    tenantId: 'tenant-a', subject, permissions: ['operator-rounds.routes.manage'], organization: { mode: 'TENANT' },
    placeScope: { mode: 'ALL' }, departmentScope: { mode: 'ALL' },
  },
  correlationId: randomUUID(),
}) as never;
const point = (position: number): RoundCheckpointDraftV1 => ({
  position, label: `Checkpoint ${position}`, assetRef: randomUUID(), meterRef: null, tagCode: `TAG-${position}`,
  proofMode: 'NFC', readingKind: 'BOOLEAN', unitCode: null, nominal: null, amberLow: null, amberHigh: null,
  redLow: null, redHigh: null, choices: [], instructions: null, branchRules: [], photoOnException: false,
});
type Query = (sql: string, values: unknown[]) => Promise<{ rows: unknown[] }>;
const service = (query: Query) => new RoutesService({
  withTenantTransaction: vi.fn(async (tenant: string, run: (client: { query: Query }) => Promise<unknown>) => {
    expect(tenant).toBe('tenant-a');
    return run({ query });
  }),
} as never);
const route = (sql: string) => sql.includes('FROM gigalibs_operator_rounds.route_templates WHERE tenant_id=$1 AND id=$2');

describe('Rounds checkpoint upload: stage', () => {
  const batch = { routeVersion: 4, uploadId, batchIndex: 0, batchCount: 2, checkpoints: [point(1)] };
  const summary = (overrides: Record<string, unknown> = {}) =>
    ({ rows: [{ uploaded_by: null, batch_count: null, staged: '0', uploads: '0', ...overrides }] });

  it('stores a new batch and prunes stale uploads first', async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
      if (route(sql)) return { rows: [draft] };
      if (sql.includes('SELECT min(uploaded_by)')) return summary();
      if (sql.includes('INSERT INTO gigalibs_operator_rounds.checkpoint_upload_batches')) return { rows: [{ batch_index: 0 }] };
      return { rows: [] };
    });
    await expect(service(query).stageCheckpointBatch(context(), routeId, batch))
      .resolves.toMatchObject({ uploadId, batchIndex: 0, batchCount: 2, received: 1, replayed: false });
    expect(calls.indexOf('DELETE FROM')).toBeLessThan(calls.indexOf('INSERT INTO'));
  });

  it('refuses another author adding to an upload', async () => {
    const query = vi.fn(async (sql: string) =>
      route(sql) ? { rows: [draft] } : sql.includes('SELECT min(uploaded_by)') ? summary({ uploaded_by: 'author-b', batch_count: 2 }) : { rows: [] });
    await expect(service(query).stageCheckpointBatch(context(), routeId, batch)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a changed batch count, too many open uploads and more than 1,000 checkpoints', async () => {
    const run = (held: Record<string, unknown>) => service(vi.fn(async (sql: string) =>
      route(sql) ? { rows: [draft] } : sql.includes('SELECT min(uploaded_by)') ? summary(held) : { rows: [] }))
      .stageCheckpointBatch(context(), routeId, batch);
    await expect(run({ uploaded_by: 'author-a', batch_count: 3 })).rejects.toBeInstanceOf(ConflictException);
    await expect(run({ uploads: '20' })).rejects.toBeInstanceOf(ConflictException);
    await expect(run({ uploaded_by: 'author-a', batch_count: 2, staged: '1000' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats an identical repeat as a replay and a different repeat as a conflict', async () => {
    const same = createHash('sha256').update(JSON.stringify(batch.checkpoints)).digest('hex');
    const repeat = (stored: string) => service(vi.fn(async (sql: string) => {
      if (route(sql)) return { rows: [draft] };
      if (sql.includes('SELECT min(uploaded_by)')) return summary({ uploaded_by: 'author-a', batch_count: 2 });
      if (sql.includes('SELECT payload_sha256')) return { rows: [{ payload_sha256: stored }] };
      return { rows: [] };
    })).stageCheckpointBatch(context(), routeId, batch);
    await expect(repeat(same)).resolves.toMatchObject({ replayed: true });
    await expect(repeat('0'.repeat(64))).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a published route or a changed version before staging anything', async () => {
    const query = vi.fn(async (sql: string) => route(sql) ? { rows: [{ ...draft, version: 5 }] } : { rows: [] });
    await expect(service(query).stageCheckpointBatch(context(), routeId, batch)).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('checkpoint_upload_batches'))).toBe(false);
  });
});

describe('Rounds checkpoint upload: finalize', () => {
  const staged = (rows: Array<Partial<{ batch_index: number; batch_count: number; route_version: number; uploaded_by: string; checkpoints: unknown[] }>>) =>
    rows.map((row, index) => ({ batch_index: index, batch_count: 2, route_version: 4, uploaded_by: 'author-a', checkpoints: [point(index + 1)], ...row }));
  const finalize = { routeVersion: 4, uploadId, batchCount: 2, checkpointCount: 2 };

  it('replaces the checkpoints from every batch in one transaction, then removes the upload', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (route(sql)) return { rows: [draft] };
      if (sql.includes('FROM gigalibs_operator_rounds.checkpoint_upload_batches') && sql.includes('FOR UPDATE')) return { rows: staged([{}, {}]) };
      if (sql.includes('UPDATE gigalibs_operator_rounds.route_templates')) return { rows: [{ ...draft, version: 5 }] };
      return { rows: [] };
    });
    await expect(service(query).finalizeCheckpoints(context(), routeId, finalize))
      .resolves.toMatchObject({ version: 5, checkpointCount: 2 });
    const inserts = statements.filter((sql) => sql.includes('INSERT INTO gigalibs_operator_rounds.checkpoints'));
    expect(inserts).toHaveLength(2);
    const removeUpload = statements.findIndex((sql) => sql.includes('DELETE FROM gigalibs_operator_rounds.checkpoint_upload_batches'));
    expect(removeUpload).toBeGreaterThan(statements.findIndex((sql) => sql.includes('UPDATE gigalibs_operator_rounds.route_templates')));
  });

  it('refuses a missing, foreign, incomplete or miscounted upload without touching checkpoints', async () => {
    const attempt = async (rows: unknown[], input = finalize, subject = 'author-a') => {
      const query = vi.fn(async (sql: string) =>
        route(sql) ? { rows: [draft] } : sql.includes('FOR UPDATE') && sql.includes('checkpoint_upload_batches') ? { rows } : { rows: [] });
      await expect(service(query).finalizeCheckpoints(context(subject), routeId, input)).rejects.toThrow();
      expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO gigalibs_operator_rounds.checkpoints'))).toBe(false);
    };
    await attempt([]);
    await attempt(staged([{}, { uploaded_by: 'author-b' }]));
    await attempt(staged([{}]));
    await attempt(staged([{}, { batch_index: 2 }]));
    await attempt(staged([{}, { route_version: 3 }]));
    await attempt(staged([{}, {}]), { ...finalize, checkpointCount: 3 });
    await attempt(staged([{}, { checkpoints: [{ position: 'two' }] }]));
  });

  it('re-applies the route rules to the assembled set', async () => {
    const query = vi.fn(async (sql: string) =>
      route(sql) ? { rows: [draft] } : sql.includes('FOR UPDATE') && sql.includes('checkpoint_upload_batches')
        ? { rows: staged([{ checkpoints: [point(1)] }, { checkpoints: [point(1)] }]) } : { rows: [] });
    await expect(service(query).finalizeCheckpoints(context(), routeId, finalize)).rejects.toThrow(/unique/);
  });
});
