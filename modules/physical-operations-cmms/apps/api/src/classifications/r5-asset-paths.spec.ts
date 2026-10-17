import { describe, expect, it, vi } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import { ReliabilityService } from '../reliability/reliability.service.js';
import { ClassificationsService } from './classifications.service.js';

// WI-OI-120be (W1 review A, H2 and M2; owner decision D3a): asset specifications, the equipment tree and the status
// cascade respect unit and site access; shared reference data is changed with workspace-wide access only.
const assetId = '550e8400-e29b-41d4-a716-446655440010';
const northPlanner = {
  tenantId: 'tenant-a',
  subject: 'planner-north',
  permissions: ['cmms.assets.read', 'cmms.assets.write'],
  organization: {
    mode: 'UNITS',
    tree_version: 'v1',
    read_roots: ['north'],
    write_roots: ['north'],
  },
  departmentScope: { mode: 'DEPARTMENTS', departmentIds: ['north'] },
  placeScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;
const workspacePlanner = {
  ...northPlanner,
  organization: undefined,
  departmentScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;
const context = (principal: CmmsPrincipal): CmmsCommandContext => ({
  principal,
  correlationId: 'r5-assets',
});

function services(answers: Array<{ rows: unknown[] }>) {
  const query = vi.fn(async () => answers.shift() ?? { rows: [] });
  const database = {
    withTenantTransaction: vi.fn(
      async (_tenant: string, operation: (client: unknown) => Promise<unknown>) =>
        operation({ query }),
    ),
  } as unknown as DatabaseService;
  return {
    classifications: new ClassificationsService(database),
    reliability: new ReliabilityService(database),
    query,
  };
}
const sqlOf = (query: ReturnType<typeof vi.fn>) => query.mock.calls.map(([sql]) => String(sql));

describe('asset paths under unit and site access', () => {
  it('finds a South asset not at all for a North member: specifications and tree are not found', async () => {
    const specs = services([{ rows: [] }]);
    await expect(specs.classifications.getAssetSpecs(northPlanner, assetId)).rejects.toMatchObject({
      status: 404,
    });
    expect(sqlOf(specs.query)[0]).toMatch(/a\.department_id IS NULL OR a\.department_id = ANY/);
    const tree = services([{ rows: [] }]);
    await expect(
      tree.classifications.getEquipmentTree(northPlanner, assetId),
    ).rejects.toMatchObject({ status: 404 });
    // The root and every child carry the scope.
    expect(sqlOf(tree.query)[0]).toMatch(/a\.department_id = ANY[\s\S]*child\.department_id = ANY/);
  });

  it('refuses a North planner changing the specifications of a shared asset, before any write', async () => {
    const { classifications, query } = services([
      { rows: [{ id: assetId, department_id: null, site_ref: null }] },
    ]);
    await expect(
      classifications.setAssetSpecs(context(northPlanner), assetId, { specs: [] }),
    ).rejects.toMatchObject({
      response: { code: 'CMMS_OUT_OF_SCOPE' },
    });
    expect(
      sqlOf(query).some((sql) => sql.includes('INSERT INTO gigalibs_cmms.cmms_asset_specs')),
    ).toBe(false);
  });

  it('cascades nothing when any descendant is outside what the caller may change', async () => {
    const { classifications, query } = services([
      { rows: [{ id: assetId, department_id: 'north', site_ref: null }] },
      {
        rows: [
          { id: 'child-north', version: 1, department_id: 'north', site_ref: null },
          { id: 'child-south', version: 1, department_id: 'south', site_ref: null },
        ],
      },
    ]);
    await expect(
      classifications.cascadeStatus(context(northPlanner), assetId, 'OFFLINE', 'Shutdown'),
    ).rejects.toMatchObject({
      response: { code: 'CMMS_OUT_OF_SCOPE' },
    });
    expect(sqlOf(query).some((sql) => /^\s*UPDATE gigalibs_cmms\.assets/.test(sql))).toBe(false);
  });
});

describe('shared reference data (D3a)', () => {
  it('is refused to a member held to units, before anything is read', async () => {
    const { classifications, reliability, query } = services([]);
    const refused = { response: { code: 'CMMS_OUT_OF_SCOPE' } };
    await expect(
      classifications.create(context(northPlanner), { code: 'PUMP', name: 'Pumps' }),
    ).rejects.toMatchObject(refused);
    await expect(reliability.createFailureCode(context(northPlanner), {})).rejects.toMatchObject(
      refused,
    );
    await expect(reliability.createJobPlan(context(northPlanner), {})).rejects.toMatchObject(
      refused,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('is open to a workspace-wide member (the request then reaches validation)', async () => {
    const { reliability } = services([]);
    await expect(
      reliability.createFailureCode(context(workspacePlanner), {}),
    ).rejects.not.toMatchObject({
      response: { code: 'CMMS_OUT_OF_SCOPE' },
    });
  });
});
