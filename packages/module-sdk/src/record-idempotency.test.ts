import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IDEMPOTENCY_RETENTION_DAYS,
  ModuleIdempotencyStore,
  loadIdempotencyRetentionDays,
} from './record-idempotency.js';

// WI-OI-120ae: the retention window of stored Idempotency-Key answers, per module.
describe('idempotency answer retention', () => {
  it('defaults to 7 days and reads <PREFIX>_IDEMPOTENCY_RETENTION_DAYS within 1 to 365', () => {
    expect(DEFAULT_IDEMPOTENCY_RETENTION_DAYS).toBe(7);
    expect(loadIdempotencyRetentionDays({}, 'WORKFORCE')).toBe(7);
    expect(
      loadIdempotencyRetentionDays({ WORKFORCE_IDEMPOTENCY_RETENTION_DAYS: '' }, 'WORKFORCE'),
    ).toBe(7);
    expect(
      loadIdempotencyRetentionDays({ WORKFORCE_IDEMPOTENCY_RETENTION_DAYS: '30' }, 'WORKFORCE'),
    ).toBe(30);
    for (const bad of ['0', '366', '1.5', 'seven', '-3']) {
      expect(() =>
        loadIdempotencyRetentionDays({ WORKFORCE_IDEMPOTENCY_RETENTION_DAYS: bad }, 'WORKFORCE'),
      ).toThrow('WORKFORCE_IDEMPOTENCY_RETENTION_DAYS');
    }
  });

  it('refuses a window shorter than a day', () => {
    const database = { withTenantTransaction: async () => null };
    expect(() => new ModuleIdempotencyStore(database as never, { retentionDays: 0 })).toThrow(
      'retentionDays',
    );
    expect(() => new ModuleIdempotencyStore(database as never, { retentionDays: 2.5 })).toThrow(
      'retentionDays',
    );
  });

  it("sweeps only the claiming tenant's expired answers, in a bounded batch, before it claims", async () => {
    const queries: { text: string; values: unknown[] }[] = [];
    const client = {
      query: async (text: string, values: unknown[]) => {
        queries.push({ text, values });
        return { rowCount: 1, rows: [] };
      },
    };
    const database = {
      withTenantTransaction: async (
        _tenantId: string,
        operation: (c: typeof client) => Promise<unknown>,
      ) => operation(client),
    };
    const store = new ModuleIdempotencyStore(database as never, { retentionDays: 14 });
    await store.claim(
      'tenant-a',
      '0b6c3a4e-9d61-4e3f-8a55-2f1c7d9e0a11',
      'create:x',
      'a'.repeat(64),
    );
    expect(queries[0]?.text).toMatch(/DELETE FROM record_idempotency/);
    expect(queries[0]?.text).toMatch(
      /state = 'COMPLETED' AND completed_at < now\(\) - make_interval\(days => \$2\)/,
    );
    expect(queries[0]?.text).toMatch(/LIMIT \$3/);
    expect(queries[0]?.values).toEqual(['tenant-a', 14, 500]);
    expect(queries[1]?.text).toMatch(/INSERT INTO record_idempotency/);
  });
});
