import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileCmmsWorkOrdersController, lensWindow, mobileWorkOrderDetail } from './mobile-cmms-work-orders.controller.js';

// WI-OI-164: the mobile work-order adapter — my work, one work order with its offers, the actions, the sign-off queue.
vi.mock('@gigalibs/auth-core', () => ({ buildPlatformContext: () => ({}), signPlatformContextToken: () => 'signed' }));
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const TASK = '7e4f2b63-8a6c-4a3b-8b72-2a1c9d2e3f40';
const controllerFor = (permissions: string[]) =>
  new MobileCmmsWorkOrdersController({
    moduleSubject: vi.fn(async () => ({ tenant: { id: 't', entitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED' }] }, permissions })),
  } as unknown as MobileAuthService);
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try {
    await work();
  } catch (error) {
    return (error as { getResponse(): { code: string } }).getResponse().code;
  }
  throw new Error('Expected a refusal.');
};
const order = {
  id: ID, woNumber: 'WO-000164', type: 'REACTIVE', priority: 'HIGH', status: 'IN_PROGRESS', title: 'Replace belt', description: null,
  assetId: TASK, assetName: 'Conveyor 2', assignedTo: 'tech-1', dueAt: '2026-11-03T10:00:00.000Z', startedAt: '2026-11-03T08:00:00.000Z',
  completedAt: null, requiresSignature: false, version: 4, updatedAt: '2026-11-03T08:00:00.000Z', completionNotes: null,
  tasks: [{ id: TASK, position: 1, label: 'Isolate', required: true, status: 'PENDING', resultValue: null, notes: null, version: 1 }],
};
const call = (fetch: ReturnType<typeof vi.fn>, index = -1) => {
  const [url, init] = fetch.mock.calls.at(index) as unknown as [URL, RequestInit];
  return { url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

describe('mobile work-order adapter', () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('CMMS_API_URL', 'http://cmms-api:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    fetch = vi.fn(async (url: URL) =>
      String(url).endsWith('/v1/work-orders/search')
        ? Response.json({ items: [order], total: 30, page: 1, pageSize: 25 })
        : String(url).endsWith('/actions')
          ? Response.json({ entity: 'cmms.work-orders', id: ID, actions: [] })
          : Response.json(order),
    );
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('lists my work (assigned or booked) as the app’s v1 page, with a cursor to the next page', async () => {
    const page = (await controllerFor(['cmms.work-orders.read']).list({}, { lens: 'today', pageSize: '25' })) as Record<string, unknown>;
    expect(call(fetch).body).toMatchObject({ mine: true, page: 1, pageSize: 25, sortField: 'dueAt', sortDirection: 'ASC', dueFrom: expect.any(String) });
    expect(page).toMatchObject({ contractVersion: 'mobile-cmms-work-order-page.v1', nextCursor: expect.any(String) });
    expect((page.items as unknown[])[0]).toMatchObject({ id: ID, workOrderNumber: 'WO-000164', asset: { id: TASK, displayName: 'Conveyor 2' }, place: null });
    await controllerFor(['cmms.work-orders.read']).list({}, { cursor: page.nextCursor as string });
    expect(call(fetch).body).toMatchObject({ page: 2 });
  });

  it('refuses an unknown or invalid list input, and a person without the read permission', async () => {
    const reader = controllerFor(['cmms.work-orders.read']);
    expect(await codeOf(() => reader.list({}, { tenant: 'x' }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => reader.list({}, { status: 'CLOSED' }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => reader.list({}, { cursor: 'not-a-cursor' }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => controllerFor([]).list({}, {}))).toBe('MOBILE_SCOPE_DENIED');
  });

  it('opens one work order as the v1 detail, offering no task capture until the server has form manifests', async () => {
    const detail = (await controllerFor(['cmms.work-orders.read']).detail({}, ID)) as Record<string, unknown>;
    expect(detail).toMatchObject({ contractVersion: 'mobile-cmms-work-order-detail.v1', captureSurface: null, tasks: [{ id: TASK, status: 'PENDING' }] });
    expect(mobileWorkOrderDetail({ ...order, status: 'COMPLETED' }).captureSurface).toBeNull();
    await controllerFor(['cmms.work-orders.read']).offers({}, ID);
    expect(call(fetch).url).toBe(`http://cmms-api:4200/v1/records/cmms.work-orders/${ID}/actions`);
  });

  it('runs an action with the version read, then answers the refreshed work order; hold and sign-off need a reason', async () => {
    const technician = controllerFor(['cmms.work-orders.read', 'cmms.work-orders.execute-own']);
    await technician.act({}, ID, 'complete', { expectedVersion: 4 });
    expect(call(fetch, -2)).toMatchObject({ url: `http://cmms-api:4200/v1/records/cmms.work-orders/${ID}/actions/complete`, method: 'POST', body: { expectedVersion: 4 } });
    expect(call(fetch)).toMatchObject({ url: `http://cmms-api:4200/v1/work-orders/${ID}`, method: 'GET' });
    expect(await codeOf(() => technician.act({}, ID, 'hold', { expectedVersion: 4 }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => technician.act({}, ID, 'delete', { expectedVersion: 4 }))).toBe('MOBILE_REQUEST_INVALID');
    expect(await codeOf(() => technician.act({}, ID, 'start', {}))).toBe('MOBILE_REQUEST_INVALID');
    fetch.mockImplementationOnce(async () => Response.json({ code: 'CMMS_SIGN_OFF_FOUR_EYES' }, { status: 403 }));
    expect(await codeOf(() => technician.act({}, ID, 'sign-off', { expectedVersion: 4, reason: 'Checked' }))).toBe('MOBILE_SCOPE_DENIED');
    fetch.mockImplementationOnce(async () => Response.json({ code: 'CMMS_PERMIT_OPEN' }, { status: 409 }));
    expect(await codeOf(() => technician.act({}, ID, 'complete', { expectedVersion: 4 }))).toBe('MOBILE_WORK_ORDER_CONFLICT');
  });

  it('gives the supervisor the completed work awaiting sign-off, and nobody else', async () => {
    await controllerFor(['cmms.work-orders.read', 'cmms.work-orders.write']).awaiting({}, {});
    expect(call(fetch).body).toMatchObject({ awaitingSignOff: true });
    expect(await codeOf(() => controllerFor(['cmms.work-orders.read']).awaiting({}, {}))).toBe('MOBILE_SCOPE_DENIED');
  });

  it('reads Today, Upcoming and Previous as due-date windows, never statuses', () => {
    const now = new Date('2026-11-03T15:00:00Z');
    expect(lensWindow('today', now)).toEqual({ dueFrom: '2026-11-03T00:00:00.000Z', dueBefore: '2026-11-04T00:00:00.000Z' });
    expect(lensWindow('upcoming', now)).toEqual({ dueFrom: '2026-11-04T00:00:00.000Z' });
    expect(lensWindow('previous', now)).toEqual({ dueBefore: '2026-11-03T00:00:00.000Z' });
    expect(lensWindow(undefined, now)).toEqual({});
  });
});
