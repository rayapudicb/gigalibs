/**
 * WI-OI-083a — the manifest-generated gateways answer exactly like the hand-written allow-lists they replace, for
 * every method and path in a corpus built three independent ways: from the manifest templates, from the frozen CMMS
 * regular expressions, and from a Workforce path list transcribed from the frozen code; plus negative variants.
 */
import { describe, expect, it } from 'vitest';
import { requiredCmmsPermission } from '../lib/cmms-proxy';
import { generatedModuleGateways } from '../lib/generated/module-gateways';
import { generatedModuleUpstreams } from '../lib/generated/module-upstreams';
import { requiredWorkforcePermission } from '../lib/workforce-proxy';
import {
  LEGACY_CMMS_ROUTES,
  legacyCmmsPermission,
  legacyWorkforcePermission,
} from './fixtures/legacy-module-gateways';

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'];
const ID = '3f2b6c1e-9a4d-4e1f-8b2a-7c5d9e0f1a2b';

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
  it('CMMS: every method and path in the corpus', () => {
    const legacyPaths = LEGACY_CMMS_ROUTES.flatMap(([, pattern]) =>
      fromLegacyRegex(pattern.source),
    );
    const corpus = withNegatives([...fromTemplates('physical-operations-cmms'), ...legacyPaths]);
    let allowed = 0;
    for (const path of corpus) {
      for (const method of METHODS) {
        const expected = legacyCmmsPermission(method, path.split('/'));
        expect({
          method,
          path,
          permission: requiredCmmsPermission(method, path.split('/')),
        }).toEqual({ method, path, permission: expected });
        if (expected) allowed += 1;
      }
    }
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
  });
});
