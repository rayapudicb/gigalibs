/**
 * WI-OI-120h (U19a): every CMMS screen call reaches a CMMS API route through the web gateway.
 *
 * - Each call in the screen client (`modules/physical-operations-cmms/web/src/api.ts`) has a gateway route with a
 *   permission, and the API serves every gateway route. Before U19a, 36 calls had no route and one named a path the
 *   API did not serve.
 * - PUT and DELETE pass the generic gateway with the same same-site check, permission check and write headers as POST
 *   and PATCH; a route forwards only the methods its manifest lists.
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gatewayRoute from '../app/api/[gateway]/[...path]/route';
import { generatedModuleGateways } from '../lib/generated/module-gateways';
import { tenantModulePermission } from '../lib/module-access';
import { moduleGatewayConfig } from '../lib/module-gateway';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));

const repository = join(__dirname, '../../..');
const CMMS = join(repository, 'modules/physical-operations-cmms');
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';
const requiredPermission = moduleGatewayConfig('physical-operations-cmms').requiredPermission;

/** Each `requestCmms(path, init)` call in the screen client, as a method and a concrete path. */
function screenCalls(): { name: string; method: string; path: string }[] {
  const source = readFileSync(join(CMMS, 'web/src/api.ts'), 'utf8');
  const calls: { name: string; method: string; path: string }[] = [];
  const entry = /^ {2}(\w+): \([^)]*\)[^=]*=>([\s\S]*?)(?=^ {2}(?:\w+: \(|\/\/)|^\};)/gm;
  for (const [, name, body] of source.matchAll(entry)) {
    // The first path literal, also when a ternary chooses it; it ends at a ternary that appends a query string.
    const path = /requestCmms<[\s\S]*?>\(\s*(?:\w+\s*\?\s*)?['`](\/(?:[^'`$]|\$\{(?!\w+\s*\?)[^}]*\})*)/.exec(body!)?.[1];
    if (!path) throw new Error(`The screen client's ${name} call has no path this test can read.`);
    const concrete = path.replace(/\$\{[^}]*\}/g, ID).split('?')[0]!;
    const method = /\bpost\(/.test(body!)
      ? 'POST'
      : /\bpatch\(/.test(body!)
        ? 'PATCH'
        : (/method: '(PUT|DELETE)'/.exec(body!)?.[1] ?? 'GET');
    calls.push({ name: name!, method, path: `v1${concrete}` });
  }
  return calls;
}

/** Each route the CMMS API controllers serve, as a method and a template with `{id}` parameters. */
function apiRoutes(): Set<string> {
  const routes = new Set<string>();
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.controller.ts')) {
        const source = readFileSync(file, 'utf8');
        const prefix = /@Controller\(\s*'([^']*)'/.exec(source)?.[1];
        if (prefix === undefined) continue;
        for (const [, method, sub] of source.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?/g)) {
          const path = [prefix, sub].filter(Boolean).join('/').replace(/:\w+/g, '{id}');
          routes.add(`${method!.toUpperCase()} ${path}`);
        }
      }
    }
  };
  walk(join(CMMS, 'apps/api/src'));
  return routes;
}

describe('CMMS screens reach their API through the gateway', () => {
  it('gives every call in the screen client a gateway route with a permission', () => {
    const calls = screenCalls();
    const entries = readFileSync(join(CMMS, 'web/src/api.ts'), 'utf8').match(/^ {2}\w+: \(/gm) ?? [];
    expect(calls.length).toBe(entries.length);
    expect(calls.length).toBeGreaterThanOrEqual(76);
    const unrouted = calls.filter(({ method, path }) => !requiredPermission(method, path.split('/')));
    expect(unrouted).toEqual([]);
  });

  it('routes only paths the CMMS API serves, with the methods it serves', () => {
    const served = apiRoutes();
    const missing = generatedModuleGateways['physical-operations-cmms']!.routes.flatMap((route) =>
      route.template
        .split('/')
        .reduce<string[]>((paths, segment) => paths.flatMap((prefix) => segment.split('|').map((option) => (prefix ? `${prefix}/${option}` : option))), [''])
        .flatMap((path) => Object.keys(route.methods).map((method) => `${method} ${path}`))
        .filter((route) => !served.has(route)),
    );
    expect(missing).toEqual([]);
  });
});

const { privateKey } = generateKeyPairSync('ed25519');
const session = (permissions: string[]) => ({
  context: {
    user: { id: 'user-cmms', email: 'planner@example.invalid', name: 'Planner', status: 'ACTIVE' },
    tenant: {
      id: '0f8c2f4e-2b6a-4d3c-9e1f-5a7b9c1d3e5f',
      name: 'Plant',
      slug: 'plant',
      status: 'ACTIVE',
      features: ['asset-maintenance'],
      entitlements: [{ moduleKey: 'asset-maintenance', status: 'ENABLED', version: '1' }],
    },
    roles: ['MAINTENANCE_PLANNER'],
    platformRoles: [],
    permissions: [tenantModulePermission['asset-maintenance']!, ...permissions],
    authVersion: 1,
    session: { id: 'session-cmms', expiresAt: '2099-01-01T00:00:00Z' },
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
  },
});
const sameSite = { Origin: 'http://127.0.0.1:5180', Host: '127.0.0.1:5180' };
const send = (method: 'PUT' | 'DELETE' | 'GET', path: string, init: RequestInit = {}) =>
  gatewayRoute[method](new Request(`http://127.0.0.1:5180/api/cmms/${path}`, { method, ...init }), {
    params: Promise.resolve({ gateway: 'cmms', path: path.split('/') }),
  });

describe('PUT and DELETE through the generic module gateway', () => {
  beforeEach(() => {
    vi.stubEnv('CMMS_API_URL', 'http://127.0.0.1:4200');
    vi.stubEnv('CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(verifiedSession).mockReset();
  });

  it('forwards a same-site PUT with its body and write headers', async () => {
    vi.mocked(verifiedSession).mockResolvedValue(session(['cmms.assets.write']) as never);
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ items: [] }));
    const key = '3f2c8a3e-6b1d-4c2a-9f4e-1a2b3c4d5e6f';
    const body = JSON.stringify({ specs: [{ specDefinitionId: ID, value: '12.5' }] });
    const response = await send('PUT', `v1/assets/${ID}/specs`, {
      headers: { ...sameSite, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body,
    });
    expect(response.status).toBe(200);
    const [target, init] = upstream.mock.calls[0]!;
    expect(String(target)).toBe(`http://127.0.0.1:4200/v1/assets/${ID}/specs`);
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(body);
    expect(new Headers(init?.headers).get('idempotency-key')).toBe(key);
  });

  it('forwards a same-site DELETE without a body and passes a 204 back', async () => {
    vi.mocked(verifiedSession).mockResolvedValue(session(['cmms.meters.write']) as never);
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const response = await send('DELETE', `v1/meters/triggers/${ID}`, { headers: sameSite });
    expect(response.status).toBe(204);
    const [target, init] = upstream.mock.calls[0]!;
    expect(String(target)).toBe(`http://127.0.0.1:4200/v1/meters/triggers/${ID}`);
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
  });

  it('refuses a cross-site DELETE, a DELETE without the write permission, and a method the route does not list', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    vi.mocked(verifiedSession).mockResolvedValue(session(['cmms.meters.write', 'cmms.assets.write']) as never);
    const crossSite = await send('DELETE', `v1/meters/triggers/${ID}`, { headers: { Origin: 'https://attacker.example', Host: '127.0.0.1:5180' } });
    expect([crossSite.status, (await crossSite.json()).code]).toEqual([403, 'CMMS_CROSS_SITE_REJECTED']);
    const unlisted = await send('DELETE', `v1/assets/${ID}`, { headers: sameSite });
    expect([unlisted.status, (await unlisted.json()).code]).toEqual([404, 'CMMS_ROUTE_UNSUPPORTED']);
    vi.mocked(verifiedSession).mockResolvedValue(session(['cmms.meters.read']) as never);
    const readOnly = await send('DELETE', `v1/meters/triggers/${ID}`, { headers: sameSite });
    expect([readOnly.status, (await readOnly.json()).code]).toEqual([403, 'CMMS_ACCESS_DENIED']);
    expect(upstream).not.toHaveBeenCalled();
  });
});
