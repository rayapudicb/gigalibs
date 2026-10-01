import { SHIPPED_COUNTRY_PACKS, SHIPPED_INDUSTRY_PACKS } from '@gigalibs/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WorkforcePackService } from './pack.service.js';

const principal = { tenantId: 'tenant-1', subject: 'admin-1', spatialScope: { mode: 'UNBOUNDED' } } as never;
const application = (kind: 'INDUSTRY' | 'COUNTRY', section: unknown, checksum = `sha256:${'a'.repeat(64)}`) => ({
  kind,
  key: kind === 'INDUSTRY' ? 'agriculture' : 'IN',
  version: '1.0',
  checksum,
  publishedVersionId: '00000000-0000-4000-8000-0000000000d1',
  section,
});

function database(heldChecksum: string | null) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      if (sql.includes('FOR UPDATE')) return { rows: heldChecksum ? [{ checksum: heldChecksum }] : [] };
      if (sql.includes('SELECT kind, pack_key')) {
        return { rows: [{ kind: 'INDUSTRY', pack_key: 'agriculture', pack_version: '1.0', checksum: `sha256:${'a'.repeat(64)}`, published_version_id: 'v', section: {}, applied_at: new Date(0) }] };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
  return { db: { withTenantTransaction: vi.fn(async (_tenant: string, work: (c: typeof client) => unknown) => work(client)) }, statements };
}

// WI-OI-107: Workforce keeps its section of the active packs, validated against its own section schemas.
describe('WorkforcePackService', () => {
  const agriculture = SHIPPED_INDUSTRY_PACKS.find((pack) => pack.slug === 'agriculture')!.modules.gigaops;

  it('stores a valid section once per pack kind and audits it; an identical re-send changes nothing', async () => {
    const fresh = database(null);
    const applied = await new WorkforcePackService(fresh.db as never).apply({ principal, correlationId: 'pack:a1' }, application('INDUSTRY', agriculture));
    expect(applied.status).toBe('APPLIED');
    expect(fresh.statements.some((s) => s.sql.includes('INSERT INTO gigalibs_workforce.pack_sections'))).toBe(true);
    expect(fresh.statements.some((s) => s.sql.includes("'WORKFORCE_PACK_APPLIED'"))).toBe(true);
    const same = database(`sha256:${'a'.repeat(64)}`);
    expect((await new WorkforcePackService(same.db as never).apply({ principal, correlationId: 'pack:a2' }, application('INDUSTRY', agriculture))).status).toBe('UNCHANGED');
    expect(same.statements.some((s) => s.sql.includes('INSERT'))).toBe(false);
  });

  it('accepts a country section, and refuses a section that does not match Workforce or a malformed application', async () => {
    const rules = SHIPPED_COUNTRY_PACKS.find((pack) => pack.code === 'IN')!.modules.gigaops;
    expect((await new WorkforcePackService(database(null).db as never).apply({ principal, correlationId: 'c' }, application('COUNTRY', rules))).status).toBe('APPLIED');
    const service = new WorkforcePackService(database(null).db as never);
    await expect(service.apply({ principal, correlationId: 'c' }, application('INDUSTRY', rules))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.apply({ principal, correlationId: 'c' }, application('INDUSTRY', { vocabulary: { terms: { workUnit: 'x' } } }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.apply({ principal, correlationId: 'c' }, { ...application('INDUSTRY', agriculture), checksum: 'md5:1' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
