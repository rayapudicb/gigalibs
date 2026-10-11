/** WI-OI-120aa: transaction-local legacy scope checks on mounted CMMS stock and work-order paths. */
import { describe, expect, it, vi } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';
import { PartsService } from './parts.service.js';

const workOrderId = '550e8400-e29b-41d4-a716-446655440001';
const partId = '550e8400-e29b-41d4-a716-446655440002';
const storeroomId = '550e8400-e29b-41d4-a716-446655440003';
const northSite = '550e8400-e29b-41d4-a716-446655440004';
const southSite = '550e8400-e29b-41d4-a716-446655440005';
const requestKey = '550e8400-e29b-41d4-a716-446655440006';

const departmentPrincipal = {
  tenantId: 'tenant-a', subject: 'worker-a', departmentScope: { mode: 'DEPARTMENTS', departmentIds: ['north'] },
  placeScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;
const placePrincipal = {
  ...departmentPrincipal, departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'PLACES', placeIds: [northSite] },
} as CmmsPrincipal;
const context = (principal: CmmsPrincipal): CmmsCommandContext => ({ principal, correlationId: 'r5-proof' });

function serviceWithQuery(query: ReturnType<typeof vi.fn>) {
  const database = {
    withTenantTransaction: vi.fn(async (_tenant: string, operation: (client: unknown) => Promise<unknown>) => operation({ query })),
  } as unknown as DatabaseService;
  return new PartsService(database);
}

const workOrder = (departmentId: string | null, siteRef: string | null = northSite) => ({
  id: workOrderId, wo_number: 'WO-001', status: 'OPEN', department_id: departmentId, site_ref: siteRef,
});
const part = (departmentId: string | null, siteRef: string | null = northSite) => ({
  id: partId, department_id: departmentId, site_ref: siteRef, archived_at: null,
});
const issue = { partId, quantity: 1, idempotencyKey: requestKey };

describe('WI-OI-120aa Parts legacy-scope boundary', () => {
  it('refuses an out-of-department work order before touching a part or stock', async () => {
    const query = vi.fn(async () => ({ rows: [workOrder('south')] }));
    const service = serviceWithQuery(query);
    const movement = vi.spyOn(service, 'applyMovement');
    await expect(service.issuePartToWorkOrder(context(departmentPrincipal), workOrderId, issue)).rejects.toMatchObject({ status: 403 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(movement).not.toHaveBeenCalled();
  });

  it('refuses a part outside the caller scope even when the work order is writable', async () => {
    const query = vi.fn(async () => ({ rows: [workOrder('north')] }));
    const service = serviceWithQuery(query);
    vi.spyOn(service, 'visiblePartRow').mockResolvedValue(part('south'));
    const movement = vi.spyOn(service, 'applyMovement');
    await expect(service.returnPartFromWorkOrder(context(departmentPrincipal), workOrderId, issue)).rejects.toMatchObject({ status: 403 });
    expect(movement).not.toHaveBeenCalled();
  });

  it('does not replay the same key for another work order or changed quantity', async () => {
    const query = vi.fn(async () => ({ rows: [workOrder('north')] }));
    const service = serviceWithQuery(query);
    vi.spyOn(service, 'visiblePartRow').mockResolvedValue(part('north'));
    vi.spyOn(service, 'replayedMovement').mockResolvedValue({
      workOrderId, partId, movementType: 'ISSUE', quantityDelta: -2, storeroomId: null, binLocation: null,
    } as Awaited<ReturnType<PartsService['replayedMovement']>>);
    const movement = vi.spyOn(service, 'applyMovement');
    await expect(service.issuePartToWorkOrder(context(departmentPrincipal), workOrderId, issue)).rejects.toMatchObject({ status: 409 });
    expect(movement).not.toHaveBeenCalled();
  });

  it('allows an in-scope issue and an identical authorized retry without another movement', async () => {
    const query = vi.fn(async () => ({ rows: [workOrder('north')] }));
    const service = serviceWithQuery(query);
    vi.spyOn(service, 'visiblePartRow').mockResolvedValue(part('north'));
    const movement = { id: 'movement-1', workOrderId, partId, movementType: 'ISSUE', quantityDelta: -1,
      storeroomId: null, binLocation: null } as Awaited<ReturnType<PartsService['applyMovement']>>;
    vi.spyOn(service, 'applyMovement').mockResolvedValue(movement);
    vi.spyOn(service, 'calculateWorkOrderTco').mockResolvedValue({ workOrderId } as Awaited<ReturnType<PartsService['calculateWorkOrderTco']>>);
    vi.spyOn(service, 'replayedMovement').mockResolvedValueOnce(null).mockResolvedValueOnce(movement);
    const first = await service.issuePartToWorkOrder(context(departmentPrincipal), workOrderId, issue);
    const retry = await service.issuePartToWorkOrder(context(departmentPrincipal), workOrderId, issue);
    expect(first.movement.id).toBe('movement-1');
    expect(retry.movement.id).toBe('movement-1');
    expect(service.applyMovement).toHaveBeenCalledTimes(1);
  });

  it('restricts direct-ID TCO reads with the same legacy read predicate as work orders', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const service = serviceWithQuery(query);
    await expect(service.getWorkOrderTco(placePrincipal, workOrderId)).rejects.toMatchObject({ status: 404 });
    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('wo.site_ref = ANY($3::uuid[])');
    expect(values).toEqual(['tenant-a', workOrderId, [northSite]]);
  });

  it('checks direct movement part ownership before any balance or ledger update', async () => {
    const query = vi.fn(async () => ({ rows: [part('south')] }));
    const service = serviceWithQuery(query);
    await expect(service.applyMovement({ query } as never, context(departmentPrincipal), {
      partId, movementType: 'ADJUSTMENT', quantityDelta: 1, idempotencyKey: requestKey,
    })).rejects.toMatchObject({ status: 403 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)\b/.test(sql))).toBe(false);
  });

  it('fails closed for a department-scoped member referencing a storeroom with no department owner', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('cmms_storerooms')
      ? [{ site_ref: northSite }] : [part('north')] }));
    const service = serviceWithQuery(query);
    await expect(service.applyMovement({ query } as never, context(departmentPrincipal), {
      partId, movementType: 'ISSUE', quantityDelta: -1, idempotencyKey: requestKey, storeroomId,
    })).rejects.toMatchObject({ status: 403 });
    expect(query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)\b/.test(sql))).toBe(false);
  });

  it('refuses a storeroom at another site for a place-scoped member', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('cmms_storerooms')
      ? [{ site_ref: southSite }] : [part(null, northSite)] }));
    const service = serviceWithQuery(query);
    await expect(service.applyMovement({ query } as never, context(placePrincipal), {
      partId, movementType: 'ISSUE', quantityDelta: -1, idempotencyKey: requestKey, storeroomId,
    })).rejects.toMatchObject({ status: 403 });
    expect(query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)\b/.test(sql))).toBe(false);
  });

  it('checks work-order scope before a direct RETURN movement or replay', async () => {
    const query = vi.fn(async () => ({ rows: [workOrder('south')] }));
    const service = serviceWithQuery(query);
    const replay = vi.spyOn(service, 'replayedMovement');
    await expect(service.recordMovement(context(departmentPrincipal), partId, {
      movementType: 'RETURN', workOrderId, quantity: 1, idempotencyKey: requestKey,
    })).rejects.toMatchObject({ status: 403 });
    expect(replay).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not present a changed direct stock request as an idempotent replay', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const service = serviceWithQuery(query);
    vi.spyOn(service, 'visiblePartRow').mockResolvedValue(part('north'));
    vi.spyOn(service, 'replayedMovement').mockResolvedValue({
      partId, movementType: 'ADJUSTMENT', quantityDelta: -1, workOrderId: null,
    } as Awaited<ReturnType<PartsService['replayedMovement']>>);
    const movement = vi.spyOn(service, 'applyMovement');
    await expect(service.recordMovement(context(departmentPrincipal), partId, {
      movementType: 'ADJUSTMENT', quantityDelta: -2, reason: 'Cycle count', idempotencyKey: requestKey,
    })).rejects.toMatchObject({ status: 409 });
    expect(movement).not.toHaveBeenCalled();
  });
});
