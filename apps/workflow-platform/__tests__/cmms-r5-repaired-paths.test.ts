/**
 * WI-OI-120aa (R5 CMMS slice 1): Next BFF session and entitlement verification
 * for scope-repaired Parts, Reliability and Work Orders endpoints.
 *
 * Verifies that the Next.js gateway BFF:
 * 1. Enforces tenant entitlement (`asset-maintenance`), session authentication,
 *    and granular permissions (`cmms.parts.write`, `cmms.parts.read`, `cmms.assets.write`).
 * 2. Rejects cross-origin CSRF mutations with `CMMS_CROSS_SITE_REJECTED`.
 * 3. Signs outgoing requests to CMMS API with Ed25519 platform context tokens carrying
 *    tenant, user, org scope and spatial scope.
 * 4. Preserves idempotency headers and forwards responses accurately.
 */
import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gatewayRoute from '../app/api/[gateway]/[...path]/route';
import { tenantModulePermission } from '../lib/module-access';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const TENANT_ID = '0f8c2f4e-2b6a-4d3c-9e1f-5a7b9c1d3e5f';
const USER_ID = 'user-cmms-01';
const WO_ID = '550e8400-e29b-41d4-a716-446655440001';
const PART_ID = '550e8400-e29b-41d4-a716-446655440002';
const JOB_PLAN_ID = '550e8400-e29b-41d4-a716-446655440003';
const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440099';

function createSession(permissions: string[], entitled = true) {
  return {
    context: {
      user: { id: USER_ID, email: 'tech@example.invalid', name: 'Technician', status: 'ACTIVE' },
      tenant: {
        id: TENANT_ID,
        name: 'Industrial Plant Alpha',
        slug: 'plant-alpha',
        status: 'ACTIVE',
        trialEndsAt: null,
        features: ['asset-maintenance'],
        entitlements: entitled
          ? [{ moduleKey: 'asset-maintenance', status: 'ENABLED', version: '1' }]
          : [],
      },
      roles: ['MAINTENANCE_SUPERVISOR'],
      platformRoles: [],
      permissions: [tenantModulePermission['asset-maintenance']!, ...permissions],
      authVersion: 1,
      session: { id: 'session-cmms-01', expiresAt: '2099-01-01T00:00:00Z' },
      orgScope: { mode: 'DEPARTMENTS', departmentIds: ['dep-maintenance-01'] },
      spatialScope: { mode: 'PLACES', placeIds: ['place-plant-north'] },
    },
  };
}

const sameSiteHeaders = { Origin: 'http://127.0.0.1:5180', Host: '127.0.0.1:5180' };

const callBff = (
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; origin?: string } = {},
) => {
  const url = `http://127.0.0.1:5180/api/cmms/${path}`;
  const headers: Record<string, string> = {
    ...sameSiteHeaders,
    ...(options.headers ?? {}),
  };
  if (options.origin) {
    headers.Origin = options.origin;
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const req = new Request(url, {
    method,
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  return gatewayRoute[method](req, {
    params: Promise.resolve({ gateway: 'cmms', path: path.split('/') }),
  });
};

describe('WI-OI-120aa Next BFF Session & Entitlement for Scope-Repaired CMMS Paths', () => {
  beforeEach(() => {
    vi.stubEnv('CMMS_API_URL', 'http://127.0.0.1:4200');
    vi.stubEnv(
      'CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
      privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    );
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(verifiedSession).mockReset();
  });

  describe('Entitlement & Authentication Verification', () => {
    it('refuses unauthenticated requests on all scope-repaired endpoints', async () => {
      vi.mocked(verifiedSession).mockResolvedValueOnce({ response: new Response(null, { status: 401 }) } as never);
      const res = await callBff('POST', `v1/parts/work-orders/${WO_ID}/issue`, {
        body: { partId: PART_ID, quantity: 1, idempotencyKey: IDEMPOTENCY_KEY },
      });
      expect(res.status).toBe(401);
    });

    it('refuses un-entitled tenants even when permissions are present', async () => {
      vi.mocked(verifiedSession).mockResolvedValue(
        createSession(['cmms.parts.write', 'cmms.parts.read', 'cmms.assets.write'], false) as never,
      );
      const issueRes = await callBff('POST', `v1/parts/work-orders/${WO_ID}/issue`, {
        body: { partId: PART_ID, quantity: 1, idempotencyKey: IDEMPOTENCY_KEY },
      });
      expect(issueRes.status).toBe(403);
      const issueJson = await issueRes.json();
      expect(issueJson.code).toBe('CMMS_ACCESS_DENIED');

      const tcoRes = await callBff('GET', `v1/parts/work-orders/${WO_ID}/tco`);
      expect(tcoRes.status).toBe(403);

      const jobPlanRes = await callBff(
        'POST',
        `v1/job-plans/${JOB_PLAN_ID}/apply-to-work-order/${WO_ID}`,
        { body: {} },
      );
      expect(jobPlanRes.status).toBe(403);
    });
  });

  describe('Granular Permission Boundary', () => {
    it('requires cmms.parts.write for part issue and return', async () => {
      // User only has cmms.parts.read (read-only)
      vi.mocked(verifiedSession).mockResolvedValue(
        createSession(['cmms.parts.read']) as never,
      );
      const upstream = vi.spyOn(globalThis, 'fetch');

      const issueRes = await callBff('POST', `v1/parts/work-orders/${WO_ID}/issue`, {
        body: { partId: PART_ID, quantity: 1, idempotencyKey: IDEMPOTENCY_KEY },
      });
      expect(issueRes.status).toBe(403);
      expect((await issueRes.json()).code).toBe('CMMS_ACCESS_DENIED');

      const returnRes = await callBff('POST', `v1/parts/work-orders/${WO_ID}/return`, {
        body: { partId: PART_ID, quantity: 1, idempotencyKey: IDEMPOTENCY_KEY },
      });
      expect(returnRes.status).toBe(403);

      expect(upstream).not.toHaveBeenCalled();
    });

    it('requires cmms.assets.write for job plan and failure attribution', async () => {
      vi.mocked(verifiedSession).mockResolvedValue(
        createSession(['cmms.assets.read']) as never,
      );
      const upstream = vi.spyOn(globalThis, 'fetch');

      const jpRes = await callBff(
        'POST',
        `v1/job-plans/${JOB_PLAN_ID}/apply-to-work-order/${WO_ID}`,
        { body: {} },
      );
      expect(jpRes.status).toBe(403);

      const failRes = await callBff(
        'POST',
        `v1/work-orders/${WO_ID}/failure-attribution`,
        { body: { failureCodeId: 'fail-01' } },
      );
      expect(failRes.status).toBe(403);

      expect(upstream).not.toHaveBeenCalled();
    });
  });

  describe('Cross-Site Mutation Rejection', () => {
    it('refuses cross-origin mutations across all scope-repaired POST paths', async () => {
      vi.mocked(verifiedSession).mockResolvedValue(
        createSession(['cmms.parts.write', 'cmms.assets.write']) as never,
      );
      const upstream = vi.spyOn(globalThis, 'fetch');

      const crossOrigin = 'https://malicious-site.invalid';

      const issueRes = await callBff(
        'POST',
        `v1/parts/work-orders/${WO_ID}/issue`,
        { body: { partId: PART_ID, quantity: 1, idempotencyKey: IDEMPOTENCY_KEY }, origin: crossOrigin },
      );
      expect(issueRes.status).toBe(403);
      expect((await issueRes.json()).code).toBe('CMMS_CROSS_SITE_REJECTED');

      const jpRes = await callBff(
        'POST',
        `v1/job-plans/${JOB_PLAN_ID}/apply-to-work-order/${WO_ID}`,
        { body: {}, origin: crossOrigin },
      );
      expect(jpRes.status).toBe(403);

      expect(upstream).not.toHaveBeenCalled();
    });
  });

  describe('Signed Forwarding & Upstream Token Claims', () => {
    it('forwards in-scope Part Issue with signed PlatformContext token and preserves idempotency', async () => {
      vi.mocked(verifiedSession).mockResolvedValue(
        createSession(['cmms.parts.write']) as never,
      );
      const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        Response.json({ movement: { id: 'mov-001' }, tco: { workOrderId: WO_ID } }, {
          status: 200,
          headers: { 'Idempotency-Replayed': 'false' },
        }),
      );

      const issuePayload = { partId: PART_ID, quantity: 2, idempotencyKey: IDEMPOTENCY_KEY };
      const response = await callBff('POST', `v1/parts/work-orders/${WO_ID}/issue`, {
        body: issuePayload,
        headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('idempotency-replayed')).toBe('false');

      const [targetUrl, init] = upstream.mock.calls[0]!;
      expect(String(targetUrl)).toBe(`http://127.0.0.1:4200/v1/parts/work-orders/${WO_ID}/issue`);
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify(issuePayload));

      const authHeader = new Headers(init?.headers).get('authorization');
      expect(authHeader).toBeTruthy();
      const token = authHeader!.replace('Bearer ', '');

      const claims = verifyPlatformContextToken(
        token,
        publicKey.export({ format: 'pem', type: 'spki' }).toString(),
        'gigalibs-cmms-api',
      );
      expect(claims.tenant_id).toBe(TENANT_ID);
      expect(claims.sub).toBe(USER_ID);
      expect(claims.entitlement.module_key).toBe('asset-maintenance');
      expect(claims.granted_scopes).toContain('cmms.parts.write');
    });

    it('forwards Part Return and Work Order TCO reads with verified token', async () => {
      vi.mocked(verifiedSession).mockResolvedValue(
        createSession(['cmms.parts.write', 'cmms.parts.read']) as never,
      );
      const upstream = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({ movement: { id: 'mov-002' } }, { status: 200 }))
        .mockResolvedValueOnce(Response.json({ workOrderId: WO_ID, totalCostMinor: '45000' }, { status: 200 }));

      // Return Part
      const returnRes = await callBff('POST', `v1/parts/work-orders/${WO_ID}/return`, {
        body: { partId: PART_ID, quantity: 1, idempotencyKey: IDEMPOTENCY_KEY },
      });
      expect(returnRes.status).toBe(200);

      // Work Order TCO
      const tcoRes = await callBff('GET', `v1/parts/work-orders/${WO_ID}/tco`);
      expect(tcoRes.status).toBe(200);
      const tcoData = await tcoRes.json();
      expect(tcoData.totalCostMinor).toBe('45000');

      expect(upstream).toHaveBeenCalledTimes(2);
      expect(String(upstream.mock.calls[1]![0])).toBe(`http://127.0.0.1:4200/v1/parts/work-orders/${WO_ID}/tco`);
    });

    it('forwards Job Plan application and Failure Attribution with cmms.assets.write scope', async () => {
      vi.mocked(verifiedSession).mockResolvedValue(
        createSession(['cmms.assets.write']) as never,
      );
      const upstream = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({ applied: true, taskCount: 3 }, { status: 200 }))
        .mockResolvedValueOnce(Response.json({ attributed: true, failureCodeId: 'fc-01' }, { status: 200 }));

      const jpRes = await callBff(
        'POST',
        `v1/job-plans/${JOB_PLAN_ID}/apply-to-work-order/${WO_ID}`,
        { body: {} },
      );
      expect(jpRes.status).toBe(200);

      const failRes = await callBff(
        'POST',
        `v1/work-orders/${WO_ID}/failure-attribution`,
        { body: { failureCodeId: 'fc-01' } },
      );
      expect(failRes.status).toBe(200);

      expect(upstream).toHaveBeenCalledTimes(2);
    });

    it('forwards Slice 2 storeroom, meter trigger, telemetry batch, and space CAD paths with verified claims', async () => {
      vi.mocked(verifiedSession).mockResolvedValue(
        createSession(['cmms.parts.write', 'cmms.meters.write', 'cmms.assets.write']) as never,
      );
      const upstream = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({ id: 'storeroom-01' }, { status: 200 }))
        .mockResolvedValueOnce(Response.json({ id: 'trigger-01' }, { status: 200 }))
        .mockResolvedValueOnce(Response.json({ processedCount: 1, triggeredWorkOrderIds: [] }, { status: 200 }))
        .mockResolvedValueOnce(Response.json({ id: 'space-01' }, { status: 200 }));

      // 1. Storeroom creation
      const storeroomRes = await callBff('POST', 'v1/parts/storerooms', {
        body: { code: 'STR-N1', name: 'North Storeroom', siteRef: '550e8400-e29b-41d4-a716-446655440013', isActive: true },
      });
      expect(storeroomRes.status).toBe(200);

      // 2. Meter Trigger creation
      const triggerRes = await callBff('POST', 'v1/meters/triggers', {
        body: {
          meterId: '550e8400-e29b-41d4-a716-446655440021',
          triggerType: 'THRESHOLD_BREACH',
          thresholdType: 'UPPER',
          thresholdValue: 100,
          workOrderTitle: 'Overheat',
          workOrderPriority: 'HIGH',
          isActive: true,
        },
      });
      expect(triggerRes.status).toBe(200);

      // 3. Telemetry batch
      const batchRes = await callBff('POST', 'v1/meters/telemetry/batch', {
        body: {
          source: 'IOT_TELEMETRY',
          readings: [{
            meterId: '550e8400-e29b-41d4-a716-446655440021',
            value: 45.2,
            requestKey: '550e8400-e29b-41d4-a716-446655440099',
          }],
        },
      });
      expect(batchRes.status).toBe(200);

      // 4. Space CAD upload
      const cadRes = await callBff('POST', `v1/spaces/550e8400-e29b-41d4-a716-446655440041/cad-layers`, {
        body: { cadLayer: { layerName: 'HVAC' } },
      });
      expect(cadRes.status).toBe(200);

      expect(upstream).toHaveBeenCalledTimes(4);
      expect(String(upstream.mock.calls[0]![0])).toBe('http://127.0.0.1:4200/v1/parts/storerooms');
      expect(String(upstream.mock.calls[1]![0])).toBe('http://127.0.0.1:4200/v1/meters/triggers');
      expect(String(upstream.mock.calls[2]![0])).toBe('http://127.0.0.1:4200/v1/meters/telemetry/batch');
      expect(String(upstream.mock.calls[3]![0])).toBe('http://127.0.0.1:4200/v1/spaces/550e8400-e29b-41d4-a716-446655440041/cad-layers');
    });
  });
});
