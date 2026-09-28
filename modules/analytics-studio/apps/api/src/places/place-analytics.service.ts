import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  MetricDrilldownRequestV1Schema,
  PlaceDrilldownQueryV1Schema,
  RebuildPlaceRollupsV1Schema,
  type MetricDrilldownV1,
  type PlaceDrilldownV1,
} from '@gigalibs/contracts';
import type { z } from 'zod';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

/**
 * WI-OI-064b drill-down over hierarchical place rollups. Each query reads one ancestor's children for a day
 * window through the rollup primary key, so latency does not grow with the number of facts.
 */
@Injectable()
export class PlaceAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async drilldown(principal: AnalyticsPrincipal, rawQuery: unknown): Promise<PlaceDrilldownV1> {
    assertUnscoped(principal);
    const query = parse(PlaceDrilldownQueryV1Schema, rawQuery);
    const result = await this.db.queryWithTenant<{ path: string; self: boolean; quantity: string; fact_count: string }>(
      principal.tenantId,
      `SELECT child_path AS path,
              (child_path = ancestor_path) AS self,
              SUM(quantity)::text AS quantity,
              SUM(fact_count)::text AS fact_count
         FROM gigalibs_analytics.place_rollups
        WHERE tenant_id = $1
          AND fact_type = $2
          AND ancestor_path = $3
          AND day BETWEEN $4::date AND $5::date
        GROUP BY child_path, ancestor_path
        ORDER BY child_path`,
      [principal.tenantId, query.factType, query.under, query.from, query.to],
    );
    const items = result.rows.map((row) => ({
      path: row.path,
      code: row.path.split('.').at(-1) ?? '',
      self: row.self,
      quantity: Number(row.quantity),
      factCount: Number(row.fact_count),
    }));
    return {
      factType: query.factType,
      under: query.under,
      from: query.from,
      to: query.to,
      items,
      total: items.reduce((sum, item) => sum + item.quantity, 0),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * WI-OI-064d: drill-down for one catalogue metric. Aggregates read one fact type; ratios read both parts in a
   * single pass and divide the sums, so a total is the ratio of totals rather than a sum of ratios.
   */
  async metricDrilldown(principal: AnalyticsPrincipal, rawBody: unknown): Promise<MetricDrilldownV1> {
    assertUnscoped(principal);
    const request = parse(MetricDrilldownRequestV1Schema, rawBody);
    const metric = request.metric;
    const sides = metric.kind === 'AGGREGATE' ? [metric] : [metric.numerator, metric.denominator];
    // Closed mapping: the only SQL text chosen at runtime is one of these two column names.
    const column = (aggregate: 'SUM' | 'COUNT') => (aggregate === 'SUM' ? 'quantity' : 'fact_count');
    const [first, second] = sides;
    // One single-fact-type index scan per part, combined with UNION ALL: equality on fact_type stays an index
    // condition even with stale planner statistics, unlike `fact_type = ANY(...)` (measured 14 ms vs 1 ms).
    // Parameters are always $1 tenant, $2 first fact type, $3 second fact type, $4 place, $5..$6 window.
    const part = (aggregate: 'SUM' | 'COUNT', slot: 'a' | 'b') => `
      SELECT child_path, ancestor_path,
             ${slot === 'a' ? column(aggregate) : 'NULL::numeric'} AS a,
             ${slot === 'b' ? column(aggregate) : 'NULL::numeric'} AS b
        FROM gigalibs_analytics.place_rollups
       WHERE tenant_id = $1 AND fact_type = ${slot === 'a' ? '$2' : '$3'}
         AND ancestor_path = $4 AND day BETWEEN $5::date AND $6::date
         ${second ? '' : 'AND $3::text IS NOT NULL'}`;
    const result = await this.db.queryWithTenant<{ path: string; self: boolean; a: string | null; b: string | null }>(
      principal.tenantId,
      `SELECT child_path AS path,
              (child_path = ancestor_path) AS self,
              SUM(a)::text AS a,
              SUM(b)::text AS b
         FROM (${part(first!.aggregate, 'a')}
               ${second ? `UNION ALL ${part(second.aggregate, 'b')}` : ''}) AS parts
        GROUP BY child_path, ancestor_path
        ORDER BY child_path`,
      [principal.tenantId, first!.factType, second?.factType ?? first!.factType, request.under, request.from, request.to],
    );
    const valueOf = (a: number | null, b: number | null) =>
      metric.kind === 'AGGREGATE'
        ? { value: a ?? 0, numerator: null, denominator: null }
        : { value: a === null || !b ? null : a / b, numerator: a, denominator: b };
    const num = (value: string | null) => (value === null ? null : Number(value));
    const items = result.rows.map((row) => ({
      path: row.path,
      code: row.path.split('.').at(-1) ?? '',
      self: row.self,
      ...valueOf(num(row.a), num(row.b)),
    }));
    const sum = (values: (number | null)[]) =>
      values.some((value) => value !== null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null;
    return {
      metric: { key: metric.key, label: metric.label, unit: metric.unit, kind: metric.kind },
      under: request.under,
      from: request.from,
      to: request.to,
      items,
      total: valueOf(sum(result.rows.map((row) => num(row.a))), sum(result.rows.map((row) => num(row.b)))),
      generatedAt: new Date().toISOString(),
    };
  }

  /** Recomputes rollups for a window from facts (idempotent) and audits the rebuild. */
  async rebuildRollups(
    principal: AnalyticsPrincipal,
    rawInput: unknown,
    correlationId: string,
  ): Promise<{ from: string; to: string; rollupRows: number }> {
    assertUnscoped(principal);
    const input = parse(RebuildPlaceRollupsV1Schema, rawInput);
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const rebuilt = await client.query<{ rows: string }>(
        'SELECT gigalibs_analytics.rebuild_place_rollups($1, $2::date, $3::date)::text AS rows',
        [principal.tenantId, input.from, input.to],
      );
      const rollupRows = Number(rebuilt.rows[0]?.rows ?? 0);
      // Bulk writes outpace autovacuum; fresh statistics keep drill-downs on the rollup primary key.
      await client.query('SELECT gigalibs_analytics.refresh_place_rollup_statistics()');
      await client.query(
        `INSERT INTO gigalibs_analytics.analytics_audit_log
           (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload, correlation_id)
         VALUES ($1, 'PLACE_ROLLUPS_REBUILT', $2, $3, 'PLACE_ROLLUP', $4::jsonb, $5)`,
        [
          principal.tenantId,
          principal.subject,
          `${input.from}..${input.to}`,
          JSON.stringify({ from: input.from, to: input.to, rollupRows }),
          correlationId,
        ],
      );
      return { from: input.from, to: input.to, rollupRows };
    });
  }
}

// Analytics has no place directory yet, so it cannot resolve assigned place ids to paths; scoped members are
// refused rather than shown the whole estate (registered for the place-directory projection).
function assertUnscoped(principal: AnalyticsPrincipal): void {
  if (principal.spatialScope.mode !== 'UNBOUNDED') {
    throw new ForbiddenException({
      code: 'SPATIAL_SCOPE_DENIED',
      message: 'Place analytics is available to members without a spatial scope for now.',
    });
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: 'ANALYTICS_VALIDATION_FAILED',
      message: result.error.issues[0]?.message ?? 'The request is invalid.',
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return result.data;
}
