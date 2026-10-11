/** WI-OI-120aa: the Work Orders stock-issue retry must not bypass part/storeroom scope. */
import { describe, expect, it, vi } from 'vitest';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import type { AssetsService } from '../assets/assets.service.js';
import type { DatabaseService } from '../database/database.service.js';
import { PartsService } from '../parts/parts.service.js';
import { WorkOrdersService } from './work-orders.service.js';

const workOrderId = '550e8400-e29b-41d4-a716-446655440001';
const partId = '550e8400-e29b-41d4-a716-446655440002';
const storeroomId = '550e8400-e29b-41d4-a716-446655440003';
const requestKey = '550e8400-e29b-41d4-a716-446655440004';
const principal = {
  tenantId: 'tenant-a', subject: 'worker-a', departmentScope: { mode: 'DEPARTMENTS', departmentIds: ['north'] },
  placeScope: { mode: 'ALL' },
} as unknown as CmmsPrincipal;
const context: CmmsCommandContext = { principal, correlationId: 'r5-proof' };

function services() {
  const query = vi.fn(async () => ({ rows: [{ id: workOrderId, status: 'IN_PROGRESS', department_id: 'north', site_ref: null }] }));
  const database = {
    withTenantTransaction: vi.fn(async (_tenant: string, operation: (client: unknown) => Promise<unknown>) => operation({ query })),
  } as unknown as DatabaseService;
  const parts = new PartsService(database);
  const orders = new WorkOrdersService(database, {} as AssetsService, parts);
  return { orders, parts, query };
}

describe('WI-OI-120aa Work Orders stock-issue retry', () => {
  it('refuses an out-of-department part before looking up a replay', async () => {
    const { orders, parts } = services();
    vi.spyOn(parts, 'visiblePartRow').mockResolvedValue({ department_id: 'south', site_ref: null });
    const replay = vi.spyOn(parts, 'replayedMovement');
    await expect(orders.issuePart(context, workOrderId, { partId, quantity: 1, idempotencyKey: requestKey })).rejects.toMatchObject({ status: 403 });
    expect(replay).not.toHaveBeenCalled();
  });

  it('checks the storeroom before returning a replay to a department-scoped member', async () => {
    const { orders, parts } = services();
    vi.spyOn(parts, 'visiblePartRow').mockResolvedValue({ department_id: 'north', site_ref: null });
    vi.spyOn(parts, 'assertWritableStoreroom').mockRejectedValue({ status: 403 });
    const replay = vi.spyOn(parts, 'replayedMovement');
    await expect(orders.issuePart(context, workOrderId, { partId, quantity: 1, storeroomId, idempotencyKey: requestKey })).rejects.toMatchObject({ status: 403 });
    expect(replay).not.toHaveBeenCalled();
  });

  it('rejects a same-key replay with a different stock amount', async () => {
    const { orders, parts } = services();
    vi.spyOn(parts, 'visiblePartRow').mockResolvedValue({ department_id: 'north', site_ref: null });
    vi.spyOn(parts, 'replayedMovement').mockResolvedValue({
      workOrderId, partId, movementType: 'ISSUE', quantityDelta: -2, storeroomId: null, binLocation: null,
    } as Awaited<ReturnType<PartsService['replayedMovement']>>);
    const movement = vi.spyOn(parts, 'applyMovement');
    await expect(orders.issuePart(context, workOrderId, { partId, quantity: 1, idempotencyKey: requestKey })).rejects.toMatchObject({ status: 409 });
    expect(movement).not.toHaveBeenCalled();
  });
});
