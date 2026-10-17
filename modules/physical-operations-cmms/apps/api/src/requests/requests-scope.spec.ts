import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AssetsService } from '../assets/assets.service.js';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import type { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { RequestsService } from './requests.service.js';

// WI-OI-120be (W1 reviews A H1, B M1, C M2; owner decision D2a): requests carry their asset's unit and site; planners see
// and change those in their units and sites; everyone else sees only the requests they raised.
const unitPrincipal = (subject: string, permissions: string[]) =>
  ({
    tenantId: 'tenant-a',
    subject,
    permissions,
    organization: {
      mode: 'UNITS',
      tree_version: 'v1',
      read_roots: ['north'],
      write_roots: ['north'],
    },
    departmentScope: { mode: 'DEPARTMENTS', departmentIds: ['north', 'north-line-1'] },
    placeScope: { mode: 'ALL' },
  }) as unknown as CmmsPrincipal;
const northPlanner = unitPrincipal('planner-north', [
  'cmms:read',
  'cmms.requests.read',
  'cmms.requests.create',
  'cmms.requests.write',
]);
const northTechnician = unitPrincipal('tech-north', [
  'cmms:read',
  'cmms.requests.read',
  'cmms.requests.create',
  'cmms.work-orders.read',
]);
const context = (principal: CmmsPrincipal): CmmsCommandContext => ({
  principal,
  correlationId: 'r5-requests',
});

function service(rows: Array<Record<string, unknown>> = []) {
  const query = vi.fn(async () => ({ rows }));
  const database = {
    withTenantTransaction: vi.fn(
      async (_tenant: string, operation: (client: unknown) => Promise<unknown>) =>
        operation({ query }),
    ),
  } as unknown as DatabaseService;
  const assets = { visibleAsset: vi.fn() } as unknown as AssetsService;
  return {
    requests: new RequestsService(database, assets, {} as WorkOrdersService),
    query,
    assets,
  };
}
const southRequest = {
  id: randomUUID(),
  tenant_id: 'tenant-a',
  request_number: 'REQ-000009',
  title: 'South leak',
  status: 'PENDING',
  priority: 'HIGH',
  requester_subject: 'someone-south',
  department_id: 'south',
  site_ref: null,
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('maintenance requests under unit and site access', () => {
  it('lets a planner search the requests in their units, and their own, but not unit-less ones (W1-A review, M1)', async () => {
    const { requests, query } = service();
    await requests.search(northPlanner, {});
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('(r.requester_subject = $2 OR (r.department_id = ANY($3::text[])))');
    expect(sql).not.toMatch(/department_id IS NULL/);
    expect(values.slice(1, 3)).toEqual(['planner-north', ['north', 'north-line-1']]);
  });

  it('lets a workspace-wide planner search every request', async () => {
    const { requests, query } = service();
    const workspacePlanner = {
      ...northPlanner,
      organization: undefined,
      departmentScope: { mode: 'ALL' },
    } as unknown as CmmsPrincipal;
    await requests.search(workspacePlanner, {});
    const [sql] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).not.toMatch(/requester_subject|department_id/);
  });

  it('keeps everyone without cmms.requests.write to their own requests, whatever else they hold', async () => {
    const { requests, query } = service();
    await requests.search(northTechnician, { requesterSubject: 'someone-else' });
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/r\.requester_subject = \$2/);
    expect(values).toContain('tech-north');
    expect(values).not.toContain('someone-else');
  });

  it('answers not found for a request outside what the caller may see', async () => {
    const { requests } = service([]);
    await expect(requests.get(northTechnician, southRequest.id)).rejects.toThrow(NotFoundException);
  });

  it('refuses a planner deciding or cancelling a request in another unit', async () => {
    const { requests, query } = service([southRequest]);
    await expect(
      requests.triage(context(northPlanner), southRequest.id, {
        action: 'REJECT',
        reason: 'Not ours',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CMMS_OUT_OF_SCOPE' },
    });
    await expect(requests.cancel(context(northPlanner), southRequest.id, {})).rejects.toMatchObject(
      {
        response: { code: 'CMMS_OUT_OF_SCOPE' },
      },
    );
    // Only the two locked reads ran; nothing was updated.
    expect(query.mock.calls.some(([sql]) => /^\s*UPDATE\s/.test(String(sql)))).toBe(false);
  });

  it('lets a planner cancel their own pending request outside their units (W1-A review, L1)', async () => {
    const own = { ...southRequest, requester_subject: 'planner-north', department_id: null };
    const { requests, query } = service([own]);
    await requests.cancel(context(northPlanner), own.id, {});
    expect(
      query.mock.calls.some(([sql]) =>
        /^\s*UPDATE gigalibs_cmms\.maintenance_requests/.test(String(sql)),
      ),
    ).toBe(true);
  });

  it('refuses accepting a request into a work order without work-order write, before any read', async () => {
    const { requests, query } = service([southRequest]);
    const triageOnly = unitPrincipal('triage-only', [
      'cmms:read',
      'cmms.requests.read',
      'cmms.requests.write',
    ]);
    await expect(
      requests.triage(context(triageOnly), southRequest.id, { action: 'ACCEPT' }),
    ).rejects.toMatchObject({ response: { code: 'CMMS_PERMISSION_DENIED' } });
    expect(query).not.toHaveBeenCalled();
  });

  it("gives a new request its asset's unit and site", async () => {
    const { requests, query, assets } = service([
      { ...southRequest, department_id: 'north-line-1', site_ref: 'site-1' },
    ]);
    const assetId = randomUUID();
    vi.mocked(assets.visibleAsset).mockResolvedValue({
      id: assetId,
      siteRef: 'site-1',
      departmentId: 'north-line-1',
    } as never);
    query.mockResolvedValueOnce({ rows: [{ last_value: '7' }] });
    await requests.submit(context(northTechnician), { title: 'Pump noise', assetId });
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO gigalibs_cmms.maintenance_requests'),
    ) as unknown as [string, unknown[]];
    expect(insert[0]).toMatch(/asset_id, site_ref, department_id/);
    expect(insert[1].slice(6, 9)).toEqual([assetId, 'site-1', 'north-line-1']);
  });
});
