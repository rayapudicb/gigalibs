import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getControl, POST as postControl } from '../app/api/control/[...path]/route';

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}));

const upstreamFetch = vi.fn<typeof fetch>();

function accessToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1_000) + 300 }),
  ).toString('base64url');
  return `test.${payload}.test`;
}

describe('Wave 2 / Accounts Payable Route Security Boundary & Anti-Mock Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', upstreamFetch);
    vi.stubEnv('CONTROL_PLANE_API_URL', 'https://control.example.invalid');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('denies unauthenticated GET /api/control/ap/invoices with HTTP 401', async () => {
    cookieStore.get.mockReturnValue(undefined);

    const req = new Request('https://platform.example.invalid/api/control/ap/invoices', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['ap', 'invoices'] }) };

    const res = await getControl(req, context);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.detail).toBe('Authentication required.');
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('proxies authenticated GET /api/control/ap/invoices to upstream control plane', async () => {
    cookieStore.get.mockReturnValue({ value: accessToken() });
    const realInvoices = [
      {
        id: 'inv_101',
        invoiceNumber: 'INV-2026-001',
        status: 'PENDING_MATCH',
        totalMinor: '150000',
      },
    ];
    upstreamFetch.mockResolvedValue(Response.json({ items: realInvoices }));

    const req = new Request('https://platform.example.invalid/api/control/ap/invoices', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['ap', 'invoices'] }) };

    const res = await getControl(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual(realInvoices);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    expect(upstreamFetch.mock.calls[0]?.[0]).toBe(
      'https://control.example.invalid/api/v1/ap/invoices',
    );
  });

  it('proxies authenticated POST /api/control/ap/actions with authorization and payload', async () => {
    cookieStore.get.mockReturnValue({ value: accessToken() });
    const actionResult = {
      actionId: 'act_001',
      status: 'SUBMITTED',
      decision: 'APPROVED',
    };
    upstreamFetch.mockResolvedValue(Response.json(actionResult));

    const payload = JSON.stringify({ actionType: 'AP_APPROVE_FOR_PAYMENT', invoiceId: 'inv_101' });
    const req = new Request('https://platform.example.invalid/api/control/ap/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const context = { params: Promise.resolve({ path: ['ap', 'actions'] }) };

    const res = await postControl(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(actionResult);
    expect(upstreamFetch.mock.calls[0]?.[0]).toBe(
      'https://control.example.invalid/api/v1/ap/actions',
    );
  });

  it('rejects unsupported control-plane routes with HTTP 404', async () => {
    cookieStore.get.mockReturnValue({ value: accessToken() });

    const req = new Request('https://platform.example.invalid/api/control/unknown-module/records', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['unknown-module', 'records'] }) };

    const res = await getControl(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Unsupported control-plane route.');
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('fails closed with HTTP 503 on upstream AP failure without fabricating mock data', async () => {
    cookieStore.get.mockReturnValue({ value: accessToken() });
    upstreamFetch.mockRejectedValue(new Error('Connection refused to control plane'));

    const req = new Request('https://platform.example.invalid/api/control/ap/invoices', {
      method: 'GET',
    });
    const context = { params: Promise.resolve({ path: ['ap', 'invoices'] }) };

    const res = await getControl(req, context);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.detail).toBeDefined();
    expect(body.items).toBeUndefined();
  });
});
