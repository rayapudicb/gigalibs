/**
 * WI-OI-083a — the manifest-generated gateways answer exactly like the hand-written allow-lists they replace, for
 * every method and path in a corpus built three independent ways: from the manifest templates, from the frozen CMMS
 * regular expressions, and from a Workforce path list transcribed from the frozen code; plus negative variants.
 */
import { describe, expect, it } from 'vitest';
import { generatedModuleGateways } from '../lib/generated/module-gateways';
import { generatedModuleUpstreams } from '../lib/generated/module-upstreams';
import { moduleGatewayConfig } from '../lib/module-gateway';
import {
  LEGACY_CMMS_ROUTES,
  legacyCmmsPermission,
  legacyWorkforcePermission,
} from './fixtures/legacy-module-gateways';

const requiredCmmsPermission = moduleGatewayConfig('physical-operations-cmms').requiredPermission;
const requiredWorkforcePermission = moduleGatewayConfig('gigaops').requiredPermission;
const requiredArPermission = moduleGatewayConfig('accounts-receivable').requiredPermission;

/** Oracle transcribed from the hand-written `/api/ar` route, with UUID segments tightened to match `spec.gateway` (WI-OI-120gz). */
function legacyArPermission(method: string, path: readonly string[]): string | null {
  if (path.some((part) => !/^[A-Za-z0-9._:-]{1,100}$/.test(part))) return null;
  const joined = path.join('/');
  const id = path[2];
  const isUuid = typeof id === 'string' && new RegExp(`^${UUID_SEGMENT}$`).test(id);
  if (method === 'POST' && joined === 'v1/setup') return 'ar:write';
  if (joined === 'v1/customers') return method === 'GET' || method === 'POST' ? (method === 'GET' ? 'ar:read' : 'ar:write') : null;
  if (path.length === 3 && path[0] === 'v1' && path[1] === 'customers') return method === 'GET' && isUuid ? 'ar:read' : null;
  if (joined === 'v1/invoices') return method === 'GET' || method === 'POST' ? (method === 'GET' ? 'ar:read' : 'ar:write') : null;
  if (joined === 'v1/invoices/aging') return method === 'GET' ? 'ar:read' : null;
  if (path.length === 3 && path[0] === 'v1' && path[1] === 'invoices') {
    return isUuid ? (method === 'GET' ? 'ar:read' : method === 'PATCH' ? 'ar:write' : null) : null;
  }
  if (path.length === 4 && path[0] === 'v1' && path[1] === 'invoices' && isUuid) {
    const sub = path[3];
    if (sub === 'issue') return method === 'POST' ? 'ar:issue' : null;
    if (sub === 'deliver') return method === 'POST' ? 'ar:write' : null;
    if (sub === 'deliveries' || sub === 'pdf') return method === 'GET' ? 'ar:read' : null;
    if (sub === 'payments') return method === 'GET' ? 'ar:read' : method === 'POST' ? 'ar:write' : null;
    if (sub === 'checkout-session') return method === 'POST' ? 'ar:write' : null;
    if (sub === 'download-url') return method === 'GET' ? 'ar:read' : null;
    if (sub === 'void') return method === 'GET' ? 'ar:read' : method === 'POST' ? 'ar:write' : null;
    if (sub === 'credit-notes' || sub === 'collections') {
      return method === 'GET' ? 'ar:read' : method === 'POST' ? 'ar:write' : null;
    }
  }
  if (joined === 'v1/work-sources') return method === 'POST' ? 'ar:write' : null;
  if (path.length === 4 && path[0] === 'v1' && path[1] === 'work-sources') {
    const wsId = path[2];
    if (!new RegExp(`^${UUID_SEGMENT}$`).test(wsId)) return null;
    const sub = path[3];
    if (sub === 'records' || sub === 'generate-invoice') return method === 'POST' ? 'ar:write' : null;
    if (sub === 'summary' || sub === 'family') return method === 'GET' ? 'ar:read' : null;
  }
  return null;
}

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'];
const ID = '3f2b6c1e-9a4d-4e1f-8b2a-7c5d9e0f1a2b';
const UUID_SEGMENT = '[0-9a-fA-F-]{36}';

/** WI-EAM-001 routes deliberately added after the frozen CMMS gateway oracle. */
function intendedCmmsPermission(method: string, path: string): string | null {
  if (method === 'GET' && path === 'v1/spaces/tree') return 'cmms.assets.read';
  if (method === 'POST' && path === 'v1/spaces') return 'cmms.assets.write';
  if (new RegExp(`^v1/spaces/${UUID_SEGMENT}$`).test(path)) {
    if (method === 'GET') return 'cmms.assets.read';
    if (method === 'PATCH' || method === 'DELETE') return 'cmms.assets.write';
  }
  if (method === 'GET' && new RegExp(`^v1/spaces/${UUID_SEGMENT}/assets$`).test(path)) {
    return 'cmms.assets.read';
  }
  if (method === 'POST' && new RegExp(`^v1/spaces/${UUID_SEGMENT}/cad-layers$`).test(path)) {
    return 'cmms.assets.write';
  }
  const screenRoute = SCREEN_ROUTES_U19A.find(
    ([routeMethod, pattern]) => routeMethod === method && new RegExp(`^v1/${pattern.replaceAll('{id}', UUID_SEGMENT)}$`).test(path),
  );
  return screenRoute?.[2] ?? null;
}

/**
 * WI-OI-120h (U19a): the routes the CMMS screens call that the API already served, with the permission each CMMS API
 * controller requires (`@RequirePermissions`), transcribed from the controllers rather than the manifest.
 */
const SCREEN_ROUTES_U19A: readonly (readonly [string, string, string])[] = [
  ['GET', 'classifications/tree', 'cmms.assets.read'],
  ['GET', 'classifications/{id}', 'cmms.assets.read'],
  ['POST', 'classifications', 'cmms.assets.write'],
  ['PATCH', 'classifications/{id}', 'cmms.assets.write'],
  ['DELETE', 'classifications/{id}', 'cmms.assets.write'],
  ['GET', 'classifications/{id}/spec-definitions', 'cmms.assets.read'],
  ['POST', 'classifications/spec-definitions', 'cmms.assets.write'],
  ['GET', 'assets/{id}/specs', 'cmms.assets.read'],
  ['PUT', 'assets/{id}/specs', 'cmms.assets.write'],
  ['GET', 'assets/{id}/equipment-tree', 'cmms.assets.read'],
  ['POST', 'assets/{id}/cascade-status', 'cmms.assets.write'],
  ['POST', 'meters/telemetry/batch', 'cmms.meters.write'],
  ['GET', 'meters/triggers', 'cmms.meters.read'],
  ['POST', 'meters/triggers', 'cmms.meters.write'],
  ['PATCH', 'meters/triggers/{id}', 'cmms.meters.write'],
  ['DELETE', 'meters/triggers/{id}', 'cmms.meters.write'],
  ['GET', 'parts/storerooms', 'cmms.parts.read'],
  ['POST', 'parts/storerooms', 'cmms.parts.write'],
  ['PATCH', 'parts/storerooms/{id}', 'cmms.parts.write'],
  ['DELETE', 'parts/storerooms/{id}', 'cmms.parts.write'],
  ['GET', 'parts/balances', 'cmms.parts.read'],
  ['PUT', 'parts/balances', 'cmms.parts.write'],
  ['POST', 'parts/work-orders/{id}/issue', 'cmms.parts.write'],
  ['POST', 'parts/work-orders/{id}/return', 'cmms.parts.write'],
  ['GET', 'parts/work-orders/{id}/tco', 'cmms.parts.read'],
  ['GET', 'failure-codes/tree', 'cmms.assets.read'],
  ['GET', 'failure-codes', 'cmms.assets.read'],
  ['POST', 'failure-codes', 'cmms.assets.write'],
  ['PATCH', 'failure-codes/{id}', 'cmms.assets.write'],
  ['DELETE', 'failure-codes/{id}', 'cmms.assets.write'],
  ['GET', 'job-plans', 'cmms.assets.read'],
  ['GET', 'job-plans/{id}', 'cmms.assets.read'],
  ['POST', 'job-plans', 'cmms.assets.write'],
  ['PATCH', 'job-plans/{id}', 'cmms.assets.write'],
  ['POST', 'job-plans/{id}/apply-to-work-order/{id}', 'cmms.assets.write'],
  ['POST', 'work-orders/{id}/failure-attribution', 'cmms.assets.write'],
];

function fromTemplates(module: string): string[] {
  return generatedModuleGateways[module]!.routes.flatMap((route) => {
    let paths = [''];
    for (const segment of route.template.split('/')) {
      const options = segment === '{id}' ? [ID] : segment.split('|');
      paths = paths.flatMap((prefix) =>
        options.map((option) => (prefix ? `${prefix}/${option}` : option)),
      );
    }
    return paths;
  });
}

/** Expands the frozen CMMS regular expressions (non-nested groups, alternation and `?`) into concrete paths. */
function fromLegacyRegex(source: string): string[] {
  const body = source
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replaceAll('\\/', '/')
    .replaceAll('[0-9a-fA-F-]{36}', ID);
  const group = /\(([^()]*)\)(\?)?/.exec(body);
  if (!group) return [body];
  const options = group[1]!.split('|');
  if (group[2]) options.push('');
  return options.flatMap((option) =>
    fromLegacyRegex(
      body.slice(0, group.index) + option + body.slice(group.index + group[0].length),
    ),
  );
}

const WORKFORCE_LEGACY_PATHS = [
  'v1/runtime/tenant-scope',
  'v1/pack',
  'v1/resources',
  `v1/resources/${ID}`,
  `v1/resources/${ID}/capabilities`,
  'v1/capabilities',
  'v1/job-profiles',
  `v1/job-profiles/${ID}`,
  `v1/job-profiles/${ID}/revisions`,
  'v1/positions',
  `v1/positions/${ID}`,
  'v1/engagements',
  `v1/engagements/${ID}/end`,
  `v1/engagements/${ID}/cancel`,
  'v1/availability',
  'v1/availability-patterns',
  `v1/availability-patterns/${ID}/end`,
  'v1/absence-types',
  `v1/absence-types/${ID}`,
  'v1/absences',
  `v1/absences/${ID}/approve`,
  `v1/absences/${ID}/reject`,
  `v1/absences/${ID}/cancel`,
  'v1/working-calendars',
  `v1/working-calendars/${ID}/closures`,
  `v1/working-calendars/${ID}/closures/${ID}/withdraw`,
  'v1/work-requirements',
  `v1/work-requirements/${ID}`,
  `v1/work-requirements/${ID}/candidates`,
  `v1/work-requirements/${ID}/cancel`,
  'v1/bookings',
  `v1/bookings/${ID}/status`,
  'v1/punches',
  'v1/timesheets/preview',
  'v1/timesheets',
  `v1/timesheets/${ID}`,
  `v1/timesheets/${ID}/approve`,
  `v1/timesheets/${ID}/reject`,
  'v1/time-corrections',
  'v1/time-exceptions',
  `v1/time-exceptions/${ID}/resolve`,
  'v1/pay-packs',
  'v1/pay-rates',
  'v1/pay-runs',
  `v1/pay-runs/${ID}`,
  `v1/pay-runs/${ID}/verification`,
  `v1/pay-runs/${ID}/approve`,
  `v1/pay-runs/${ID}/void`,
  `v1/pay-runs/${ID}/exports`,
  'v1/pay-exports',
  `v1/pay-exports/${ID}`,
  `v1/pay-exports/${ID}/file`,
  `v1/pay-exports/${ID}/reconciliation`,
  `v1/pay-exports/${ID}/acknowledge`,
];

/** Near misses around every known path: extra and missing segments, malformed and upper-case ids, unknown paths. */
function withNegatives(paths: string[]): string[] {
  const variants = paths.flatMap((path) => [
    path,
    `${path}/extra`,
    path.split('/').slice(0, -1).join('/'),
    path.replaceAll(ID, 'not-an-identifier'),
    path.replaceAll(ID, ID.toUpperCase()),
    path.replaceAll(ID, `${ID}0`),
  ]);
  return [
    ...new Set([
      ...variants,
      'v1',
      'v1/unknown',
      'v2/assets',
      'v1/punches/preview',
      'v1/pay-runs/approve',
    ]),
  ].filter(Boolean);
}

describe('manifest-generated gateways equal the hand-written allow-lists', () => {
  // WI-OI-120be (W1 Security review, 2026-10-16): the CMMS routes that differ from the frozen hand-written allow-list
  // (37e5556), each accepted by the review. Executing work takes write or execute-own at the gateway: the record API
  // checks assignment, while the REST controllers still serve these paths to write holders only, and must add the same
  // assignment check before they are relaxed (W1-A review). Staffing stays write only (finding W2), so it matches the
  // oracle and is not listed. Any other difference fails.
  const EXECUTE = ['cmms.work-orders.write', 'cmms.work-orders.execute-own'];
  const CMMS_REVIEWED: Readonly<Record<string, unknown>> = {
    'POST v1/requests/search': 'cmms.requests.read',
    'POST v1/requests': 'cmms.requests.create',
    'GET v1/requests/{id}': 'cmms.requests.read',
    'POST v1/requests/{id}/triage': 'cmms.requests.write',
    'POST v1/requests/{id}/cancel': 'cmms.requests.create',
    'POST v1/work-orders/{id}/status': EXECUTE,
    'POST v1/work-orders/{id}/sign-off': 'cmms.work-orders.write',
    'POST v1/work-orders/{id}/tasks': EXECUTE,
    'POST v1/work-orders/{id}/labour': EXECUTE,
    'POST v1/work-orders/{id}/parts': EXECUTE,
    'POST v1/work-orders/{id}/notes': EXECUTE,
    'PATCH v1/work-orders/{id}/tasks/{id}': EXECUTE,
    'GET v1/meters/{id}': 'cmms.meters.read',
  };
  it('CMMS: every method and path in the corpus', () => {
    const legacyPaths = LEGACY_CMMS_ROUTES.flatMap(([, pattern]) =>
      fromLegacyRegex(pattern.source),
    );
    const corpus = withNegatives([...fromTemplates('physical-operations-cmms'), ...legacyPaths]);
    let allowed = 0;
    const differences: Array<{ method: string; path: string; permission: unknown; reviewed: unknown }> = [];
    for (const path of corpus) {
      for (const method of METHODS) {
        const template = path.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '{id}');
        const expected =
          CMMS_REVIEWED[`${method} ${template}`] ??
          legacyCmmsPermission(method, path.split('/')) ??
          intendedCmmsPermission(method, path);
        const permission = requiredCmmsPermission(method, path.split('/'));
        const seen = differences.some((d) => d.method === method && d.path === template);
        if (!seen && JSON.stringify(permission) !== JSON.stringify(expected)) differences.push({ method, path: template, permission, reviewed: expected });
        if (expected) allowed += 1;
      }
    }
    expect(differences).toEqual([]);
    expect(legacyPaths.length).toBeGreaterThanOrEqual(30);
    expect(allowed).toBeGreaterThanOrEqual(30);
  });

  it('Workforce: every method and path in the corpus, including any-of permissions', () => {
    const corpus = withNegatives([...fromTemplates('gigaops'), ...WORKFORCE_LEGACY_PATHS]);
    let allowed = 0;
    for (const path of corpus) {
      for (const method of METHODS) {
        const expected = legacyWorkforcePermission(method, path.split('/'));
        expect({
          method,
          path,
          permission: requiredWorkforcePermission(method, path.split('/')),
        }).toEqual({ method, path, permission: expected });
        if (expected) allowed += 1;
      }
    }
    expect(allowed).toBeGreaterThanOrEqual(70);
  });

  it('Accounts Receivable: manifest routes match the removed hand-written allow-list (WI-OI-120gz)', () => {
    const corpus = withNegatives(fromTemplates('accounts-receivable'));
    let allowed = 0;
    for (const path of corpus) {
      for (const method of METHODS) {
        const expected = legacyArPermission(method, path.split('/'));
        expect({
          method,
          path,
          permission: requiredArPermission(method, path.split('/')),
        }).toEqual({ method, path, permission: expected });
        if (expected) allowed += 1;
      }
    }
    expect(allowed).toBeGreaterThanOrEqual(20);
  });

  it('generates the same upstream table the shell hard-coded before WI-OI-083c', () => {
    const pick = (entry: { environmentKey: string; port: string; serviceHostname: string }) => ({
      environmentKey: entry.environmentKey,
      port: entry.port,
      serviceHostname: entry.serviceHostname,
    });
    expect(
      Object.fromEntries(
        Object.entries(generatedModuleUpstreams).map(([key, entry]) => [key, pick(entry)]),
      ),
    ).toEqual({
      analytics: {
        environmentKey: 'ANALYTICS_API_URL',
        port: '4400',
        serviceHostname: 'analytics-api',
      },
      ar: { environmentKey: 'AR_API_URL', port: '3400', serviceHostname: 'ar-api' },
      cmms: { environmentKey: 'CMMS_API_URL', port: '4200', serviceHostname: 'cmms-api' },
      'connector-hub': {
        environmentKey: 'CONNECTOR_HUB_API_URL',
        port: '4100',
        serviceHostname: 'connector-hub-api',
      },
      geospatial: {
        environmentKey: 'GEOSPATIAL_API_URL',
        port: '4720',
        serviceHostname: 'geospatial-api',
      },
      'product-catalogue': {
        environmentKey: 'PRODUCT_CATALOGUE_API_URL',
        port: '4790',
        serviceHostname: 'module-host',
      },
      'universal-inventory': {
        environmentKey: 'UNIVERSAL_INVENTORY_API_URL',
        port: '4790',
        serviceHostname: 'module-host',
      },
      'universal-orders': {
        environmentKey: 'UNIVERSAL_ORDERS_API_URL',
        port: '4790',
        serviceHostname: 'module-host',
      },
      'universal-procurement': {
        environmentKey: 'UNIVERSAL_PROCUREMENT_API_URL',
        port: '4790',
        serviceHostname: 'module-host',
      },
      'financial-operations': {
        environmentKey: 'FINANCIAL_OPERATIONS_API_URL',
        port: '4790',
        serviceHostname: 'module-host',
      },
      workforce: {
        environmentKey: 'WORKFORCE_API_URL',
        port: '4700',
        serviceHostname: 'workforce-api',
      },
    });
  });

  it('keeps each module identity the proxies had', () => {
    expect(generatedModuleGateways['physical-operations-cmms']).toMatchObject({
      basePaths: ['/api/cmms'],
      catalogKey: 'asset-maintenance',
      audience: 'gigalibs-cmms-api',
      upstream: 'cmms',
      signingKeyEnvironment: 'CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
      codePrefix: 'CMMS',
      routeNoun: 'CMMS',
      serviceName: 'Asset & Maintenance',
      entitlementName: 'Asset & Maintenance',
    });
    expect(generatedModuleGateways.gigaops).toMatchObject({
      basePaths: ['/api/workforce', '/api/gigaops'],
      catalogKey: 'gigaops',
      audience: 'gigalibs-workforce-api',
      upstream: 'workforce',
      signingKeyEnvironment: 'WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
      codePrefix: 'WORKFORCE',
      routeNoun: 'Workforce',
      serviceName: 'GigaOps Workforce',
      entitlementName: 'GigaOps',
    });
    expect(generatedModuleGateways['accounts-receivable']).toMatchObject({
      basePaths: ['/api/ar'],
      catalogKey: 'accounts-receivable',
      audience: 'gigalibs-ar-api',
      upstream: 'ar',
      signingKeyEnvironment: 'AR_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
      codePrefix: 'AR',
      routeNoun: 'Accounts Receivable',
      serviceName: 'Accounts Receivable',
      entitlementName: 'Accounts Receivable',
    });
  });
});
