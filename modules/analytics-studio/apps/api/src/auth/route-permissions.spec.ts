import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { HealthController } from '../health/health.controller.js';
import { ConnectorHubInboxGuard } from '../inbox/connector-hub-inbox.js';
import { ANALYTICS_PERMISSIONS, PlatformContextAuthorizationGuard, declaredPermissions } from './authorization.js';

type Constructor = abstract new (...args: never[]) => unknown;

function controllersOf(module: unknown, seen = new Set<unknown>()): Constructor[] {
  const target = (module as { module?: unknown })?.module ?? module;
  if (!target || seen.has(target)) return [];
  seen.add(target);
  const own = (Reflect.getMetadata('controllers', target as object) ?? []) as Constructor[];
  const imports = (Reflect.getMetadata('imports', target as object) ?? []) as unknown[];
  return [...own, ...imports.flatMap((child) => controllersOf(child, seen))];
}

const join = (...parts: string[]) => parts.filter(Boolean).join('/').replace(/\/+/g, '/').replace(/\/$/, '');

function routes(): Array<{ route: string; guarded: boolean; relay: boolean; permissions: readonly string[] | undefined }> {
  return [...new Set(controllersOf(AppModule))].flatMap((controller) => {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const guards = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[];
    const prototype = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(prototype).flatMap((name) => {
      const handler = prototype[name] as object;
      const paths = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      if (name === 'constructor' || paths === undefined) return [];
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
      return (Array.isArray(paths) ? paths : [paths]).map((path) => ({
        route: `${method} ${join(base, path)}`,
        guarded:
          guards.includes(PlatformContextAuthorizationGuard) ||
          ((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[]).includes(PlatformContextAuthorizationGuard),
        relay: guards.includes(ConnectorHubInboxGuard),
        permissions: declaredPermissions(handler, controller),
      }));
    });
  });
}

// WI-OI-103e (ADR-0016 F16): the agreed permission of every Analytics route. Reading source internals (connections
// and sync runs) is part of managing them; discovery and dataset builds belong to mapping.
const EXPECTED: Record<string, string> = {
  'GET v1/setup/status': 'analytics:read',
  'POST v1/setup': 'analytics:action',
  'GET v1/metrics/summary': 'analytics:read',
  'GET v1/metrics/timeseries': 'analytics:read',
  'GET v1/metrics/lineage/:metricKey': 'analytics:read',
  'GET v1/actions': 'analytics:read',
  'POST v1/actions': 'analytics:action',
  'POST v1/connectors': 'analytics:connectors:write',
  'GET v1/connectors': 'analytics:connectors:write',
  'GET v1/connectors/:id': 'analytics:connectors:write',
  'POST v1/connectors/:id/test': 'analytics:connectors:write',
  'DELETE v1/connectors/:id': 'analytics:connectors:write',
  'POST v1/connectors/:id/sync': 'analytics:connectors:write',
  'GET v1/connectors/:id/sync': 'analytics:connectors:write',
  'GET v1/connectors/sync-runs/:runId': 'analytics:connectors:write',
  'POST v1/connectors/:id/discover': 'analytics:mappings:write',
  'GET v1/sources': 'analytics:mappings:write',
  'GET v1/schemas/:schemaId': 'analytics:read',
  'POST v1/mappings': 'analytics:mappings:write',
  'GET v1/mappings': 'analytics:read',
  'POST v1/mappings/:id/publish': 'analytics:mappings:write',
  'POST v1/datasets/build': 'analytics:mappings:write',
  'POST v1/datasets/:datasetVersionId/summaries': 'analytics:mappings:write',
  'GET v1/datasets/:datasetVersionId': 'analytics:read',
  'GET v1/datasets/by-mapping/:mappingId': 'analytics:read',
  'POST v1/semantic-models': 'analytics:models:write',
  'GET v1/semantic-models/:modelId': 'analytics:read',
  'GET v1/semantic-models': 'analytics:read',
  'GET v1/semantic-models/:modelId/catalog': 'analytics:read',
  'POST v1/formula-measures': 'analytics:models:write',
  'GET v1/formula-measures/model/:semanticModelId': 'analytics:read',
  'GET v1/formula-measures/:formulaMeasureId': 'analytics:read',
  'POST v1/formula-measures/:formulaMeasureId/versions': 'analytics:models:write',
  'POST v1/formula-measures/:formulaMeasureId/versions/:versionId/submit': 'analytics:models:write',
  'POST v1/formula-measures/:formulaMeasureId/versions/:versionId/approve': 'analytics:models:publish',
  'POST v1/formula-measures/:formulaMeasureId/versions/:versionId/reject': 'analytics:models:publish',
  'POST v1/query/run': 'analytics:read',
  'POST v1/query/spec': 'analytics:read',
  'POST v1/charts': 'analytics:charts:write',
  'GET v1/charts': 'analytics:read',
  'GET v1/charts/:chartId/render': 'analytics:read',
  'POST v1/chart-views': 'analytics:charts:write',
  'GET v1/chart-views': 'analytics:read',
  'GET v1/chart-views/:id': 'analytics:read',
  'GET v1/chart-views/:id/data': 'analytics:read',
  'POST v1/dashboards': 'analytics:dashboards:write',
  'GET v1/dashboards': 'analytics:read',
  'GET v1/dashboards/:dashboardId': 'analytics:read',
  'PATCH v1/dashboards/:dashboardId': 'analytics:dashboards:write',
  'POST v1/dashboards/:dashboardId/data': 'analytics:read',
  'GET v1/dashboards/:dashboardId/filter-values/:field': 'analytics:read',
  'POST v1/reports/definitions': 'analytics:reports:write',
  'GET v1/reports/definitions': 'analytics:read',
  'GET v1/reports/definitions/:definitionId': 'analytics:read',
  'POST v1/reports/runs': 'analytics:reports:write',
  'GET v1/reports/runs/:runId': 'analytics:read',
  'GET v1/reports/definitions/:definitionId/runs': 'analytics:read',
  'GET v1/reports/download/:token': 'analytics:export',
  'GET v1/lineage/:nodeType/:nodeId': 'analytics:read',
  'GET v1/audit': 'analytics:read',
  'GET v1/places/drilldown': 'analytics:read',
  'POST v1/places/metric-drilldown': 'analytics:read',
  'POST v1/places/rollups/rebuild': 'analytics:action',
  'GET v1/demo-lab/dataset': 'analytics:read',
  'POST v1/demo-lab/generate': 'analytics:action',
  'POST v1/demo-lab/reset': 'analytics:action',
  'GET v1/demo-lab/sample-farm': 'analytics:read',
  'POST v1/demo-lab/sample-farm': 'analytics:action',
};

describe('Analytics route permissions', () => {
  const all = routes();

  it('guards every route except health, and each guarded route names exactly one known permission', () => {
    const unguarded = all.filter((route) => !route.guarded && !route.relay).map((route) => route.route);
    // WI-OI-104e: the one relay route answers only Connector Hub's relay token, never a user context.
    expect(all.filter((route) => route.relay).map((route) => [route.route, route.guarded])).toEqual([['POST internal/v1/inbox', false]]);
    const healthRoutes = Object.getOwnPropertyNames(HealthController.prototype).length > 1;
    expect(healthRoutes).toBe(true);
    expect(unguarded.sort()).toEqual(['GET v1/health', 'GET v1/health/live', 'GET v1/health/ready']);
    for (const route of all.filter((candidate) => candidate.guarded)) {
      expect([route.route, route.permissions?.length]).toEqual([route.route, 1]);
      expect(ANALYTICS_PERMISSIONS).toContain(route.permissions![0]);
    }
  });

  it('matches the agreed permission table exactly', () => {
    const actual = Object.fromEntries(
      all.filter((route) => route.guarded).map((route) => [route.route, route.permissions?.[0] ?? '(none)']),
    );
    expect(actual).toEqual(EXPECTED);
  });
});
