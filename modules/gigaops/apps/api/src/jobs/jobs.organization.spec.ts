import { describe, expect, it } from 'vitest';
import { JobsService } from './jobs.service.js';

// WI-OI-109e3 (ADR-0018): once the tenant's tree is in force, Workforce positions follow the `organization` claim — read
// by the member's units (and shared positions), changed only in read-write units, owned only by units that hold records.
const tenantId = 'tenant-1';
const replica = {
  ready: new Set(['version-7']),
  closure: new Map([
    ['north', ['north', 'store-101', 'store-102']],
    ['store-101', ['store-101']],
  ]),
  units: new Map([
    ['north', { holds_records: false, type_code: 'REGION' }],
    ['store-101', { holds_records: true, type_code: 'STORE' }],
    ['store-102', { holds_records: true, type_code: 'STORE' }],
  ]),
};

function harness() {
  const statements: Array<{ text: string; values: unknown[] }> = [];
  const client = {
    query: async (text: string, values: unknown[] = []) => {
      statements.push({ text, values });
      if (text.includes('org_replica_versions') && text.includes("status = 'READY' AS ready")) return { rows: replica.ready.has(values[1] as string) ? [{ ready: true }] : [] };
      if (text.includes('org_replica_closure')) return { rows: (values[2] as string[]).flatMap((root) => replica.closure.get(root) ?? []).map((unit_id) => ({ unit_id })) };
      if (text.includes('FROM gigalibs_workforce.org_replica_units u')) {
        const unit = replica.units.get(values[2] as string);
        return { rows: unit ? [{ unit_id: values[2], ...unit }] : [] };
      }
      return { rows: [] };
    },
  };
  const database = { withTenantTransaction: async (_tenant: string, work: (value: typeof client) => unknown) => work(client) };
  return { service: new JobsService(database as never), statements };
}

const principal = (organization: unknown) => ({
  tenantId,
  subject: 'user-1',
  permissions: ['workforce:*'],
  orgScope: { mode: 'SCOPED_DEPARTMENTS', department_ids: [] },
  spatialScope: { mode: 'UNBOUNDED' },
  ...(organization ? { organization } : {}),
}) as never;
const context = (organization: unknown) => ({ principal: principal(organization), correlationId: 'c-1' }) as never;
const regional = { mode: 'UNITS', tree_version: 'version-7', read_roots: ['north'], write_roots: ['store-101'] };
const position = (departmentId: string | null) => ({
  code: 'POS-1',
  jobProfileId: '00000000-0000-4000-8000-000000000001',
  departmentId,
  fte: 1,
  effectiveFrom: '2026-10-01',
});

describe('Workforce positions under the organization claim', () => {
  it('lists the member units and shared positions, from the expanded roots, not the legacy department list', async () => {
    const { service, statements } = harness();
    await service.listPositions(principal(regional), {});
    const list = statements.find((statement) => statement.text.includes('FROM gigalibs_workforce.positions pos'))!;
    expect(list.text).toContain('(pos.department_id IS NULL OR pos.department_id = ANY(');
    expect(list.values).toContainEqual(['north', 'store-101', 'store-102']);
  });

  it('applies no unit filter for tenant-wide authority', async () => {
    const { service, statements } = harness();
    await service.listPositions(principal({ mode: 'TENANT', tree_version: 'version-7' }), {});
    expect(statements.find((statement) => statement.text.includes('FROM gigalibs_workforce.positions pos'))!.text).not.toContain('department_id');
  });

  it('refuses positions outside the member read-write units, and shared ones without tenant-wide authority', async () => {
    const { service } = harness();
    await expect(service.createPosition(context(regional), position('store-102'))).rejects.toMatchObject({ status: 403, response: { code: 'WORKFORCE_OUT_OF_SCOPE' } });
    await expect(service.createPosition(context(regional), position(null))).rejects.toMatchObject({ status: 403, response: { message: expect.stringMatching(/tenant-wide/) } });
  });

  it('refuses a unit that only groups other units as the owner, even for tenant-wide authority', async () => {
    const { service } = harness();
    await expect(service.createPosition(context({ mode: 'TENANT', tree_version: 'version-7' }), position('north'))).rejects.toMatchObject({
      status: 400,
      response: { message: expect.stringMatching(/does not hold records/) },
    });
  });

  it('answers 503 rather than more widely while the named version is still being delivered', async () => {
    const { service } = harness();
    await expect(service.listPositions(principal({ ...regional, tree_version: 'version-8' }), {})).rejects.toMatchObject({ status: 503 });
  });
});
