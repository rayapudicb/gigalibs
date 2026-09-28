import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  DemoLabGenerateRequestV1Schema,
  type DemoLabDatasetV1,
  type DemoLabGenerateRequestV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

/**
 * WI-OI-064e: synthetic data for isolated, labelled Demo Lab tenants. The web BFF only calls this for tenants
 * carrying the `demo-lab` feature, with the demo profile of the tenant's activated industry pack. Every fact is
 * origin SYNTHETIC; generation replaces the previous synthetic set in one transaction, so a failure leaves nothing
 * partial and a rerun is safe.
 */
@Injectable()
export class DemoLabService {
  constructor(private readonly db: DatabaseService) {}

  async generate(principal: AnalyticsPrincipal, rawBody: unknown, correlationId: string): Promise<DemoLabDatasetV1> {
    assertUnscoped(principal);
    const request = parse(rawBody);
    const from = shiftDays(request.endDate, -(request.days - 1));
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      await client.query('SELECT * FROM gigalibs_analytics.reset_synthetic_facts($1)', [principal.tenantId]);
      const inserted = await client.query(generationSql(request.demoProfile.zonesPerSite > 0), parameters(principal.tenantId, request));
      const facts = inserted.rowCount ?? 0;
      const rollupRows = await rebuild(client, principal.tenantId, from, request.endDate);
      await audit(client, principal, 'DEMO_DATA_GENERATED', correlationId, {
        from,
        to: request.endDate,
        facts,
        rollupRows,
        seed: request.seed,
        regions: request.demoProfile.regions,
        sitesPerRegion: request.demoProfile.sitesPerRegion,
        zonesPerSite: request.demoProfile.zonesPerSite,
      });
      return { facts, rollupRows, from, to: request.endDate };
    });
  }

  /** Removes every synthetic fact of the tenant and rebuilds rollups for any live facts that remain. */
  async reset(principal: AnalyticsPrincipal, correlationId: string): Promise<DemoLabDatasetV1> {
    assertUnscoped(principal);
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const reset = await client.query<{ deleted_facts: string; deleted_rollups: string }>(
        'SELECT deleted_facts::text, deleted_rollups::text FROM gigalibs_analytics.reset_synthetic_facts($1)',
        [principal.tenantId],
      );
      const remaining = await client.query<{ first: string | null; last: string | null }>(
        `SELECT (min(occurred_at) AT TIME ZONE 'UTC')::date::text AS first,
                (max(occurred_at) AT TIME ZONE 'UTC')::date::text AS last
           FROM gigalibs_analytics.operational_facts WHERE tenant_id = $1`,
        [principal.tenantId],
      );
      const { first, last } = remaining.rows[0] ?? { first: null, last: null };
      const rollupRows = first && last ? await rebuild(client, principal.tenantId, first, last) : 0;
      const deletedFacts = Number(reset.rows[0]?.deleted_facts ?? 0);
      await audit(client, principal, 'DEMO_DATA_RESET', correlationId, {
        deletedFacts,
        deletedRollups: Number(reset.rows[0]?.deleted_rollups ?? 0),
        rebuiltRollupRows: rollupRows,
      });
      return { facts: 0, rollupRows, from: first, to: last };
    });
  }

  /** Synthetic fact count and window currently held by the tenant. */
  async status(principal: AnalyticsPrincipal): Promise<DemoLabDatasetV1> {
    const result = await this.db.queryWithTenant<{ facts: string; first: string | null; last: string | null }>(
      principal.tenantId,
      `SELECT count(*)::text AS facts,
              (min(occurred_at) AT TIME ZONE 'UTC')::date::text AS first,
              (max(occurred_at) AT TIME ZONE 'UTC')::date::text AS last
         FROM gigalibs_analytics.operational_facts
        WHERE tenant_id = $1 AND origin = 'SYNTHETIC'`,
      [principal.tenantId],
    );
    const rollups = await this.db.queryWithTenant<{ rows: string }>(
      principal.tenantId,
      'SELECT count(*)::text AS rows FROM gigalibs_analytics.place_rollups WHERE tenant_id = $1',
      [principal.tenantId],
    );
    const row = result.rows[0];
    return { facts: Number(row?.facts ?? 0), rollupRows: Number(rollups.rows[0]?.rows ?? 0), from: row?.first ?? null, to: row?.last ?? null };
  }
}

/**
 * Leaves are zones (or sites when the profile has no zones): hours, cost and carbon per leaf per day. Sites carry
 * spend and downtime per day. Deterministic variation: a per-region level, a weekday effect and seeded daily noise.
 * Every value, including the place-code prefixes, is a bound parameter.
 */
function generationSql(withZones: boolean): string {
  const leafPath = withZones
    ? `s.site_path || '.' || $12 || '_' || z.z`
    : 's.site_path';
  return `
    WITH day_list AS (
      SELECT ($2::date - d) AS day FROM generate_series(0, $3::int - 1) AS d
    ),
    region_list AS (
      SELECT r, $10 || '_' || lpad(r::text, 2, '0') AS region_code,
             0.8 + 0.4 * ((abs(hashtext($4::text || ':region:' || r)) % 100) / 100.0) AS region_level
        FROM generate_series(1, $5::int) AS r
    ),
    site_list AS (
      SELECT rl.region_code || '.' || $11 || '_' || lpad(((rl.r - 1) * $6::int + s)::text, 3, '0') AS site_path,
             rl.region_level
        FROM region_list rl, generate_series(1, $6::int) AS s
    ),
    leaf_list AS (
      SELECT ${leafPath} AS leaf_path, s.region_level
        FROM site_list s ${withZones ? ', generate_series(1, $7::int) AS z' : ''}
       -- Keeps the zone prefix parameter typed when the profile has no zones.
       WHERE $12::text IS NOT NULL
    ),
    leaf_days AS (
      SELECT l.leaf_path, d.day,
             ($8::numeric / GREATEST($7::int, 1)) * l.region_level
               * CASE WHEN extract(isodow FROM d.day) IN (6, 7) THEN 0.75 ELSE 1 END
               * (0.85 + 0.3 * ((abs(hashtext($4::text || ':' || l.leaf_path || ':' || d.day)) % 1000) / 1000.0)) AS hours
        FROM leaf_list l, day_list d
    ),
    site_days AS (
      SELECT s.site_path, d.day, s.region_level,
             0.7 + 0.6 * ((abs(hashtext($4::text || ':s:' || s.site_path || ':' || d.day)) % 1000) / 1000.0) AS noise
        FROM site_list s, day_list d
    ),
    generated AS (
      SELECT ld.leaf_path AS path, ld.day, v.fact_type, v.quantity, v.currency
        FROM leaf_days ld
       CROSS JOIN LATERAL (VALUES
         ('LABOUR_HOURS', ld.hours, NULL::text),
         ('LABOUR_COST', ld.hours * $9::numeric, $15::text),
         ('CARBON_KG', ld.hours * $13::numeric, NULL::text)
       ) AS v(fact_type, quantity, currency)
      UNION ALL
      SELECT sd.site_path, sd.day, v.fact_type, v.quantity, v.currency
        FROM site_days sd
       CROSS JOIN LATERAL (VALUES
         ('SPEND', $14::numeric * sd.region_level * sd.noise, $15::text),
         ('DOWNTIME_MINUTES', $16::numeric * (1.6 - sd.noise), NULL::text)
       ) AS v(fact_type, quantity, currency)
    )
    INSERT INTO gigalibs_analytics.operational_facts
      (tenant_id, fact_type, place_id, place_path, occurred_at, quantity, currency_code, origin, source, source_event_id)
    SELECT $1, g.fact_type, md5($1 || ':' || g.path)::uuid, g.path::ltree,
           (g.day + time '12:00') AT TIME ZONE 'UTC', round(g.quantity, 4), g.currency,
           'SYNTHETIC', 'demo-lab', g.fact_type || ':' || g.path || ':' || g.day
      FROM generated g`;
}

function parameters(tenantId: string, request: DemoLabGenerateRequestV1): unknown[] {
  const profile = request.demoProfile;
  const [region, site, zone] = request.placeTypes;
  return [
    tenantId, //                                 $1
    request.endDate, //                          $2
    request.days, //                             $3
    request.seed, //                             $4
    profile.regions, //                          $5
    profile.sitesPerRegion, //                   $6
    Math.max(profile.zonesPerSite, 1), //        $7
    profile.labourHoursPerSitePerDay, //         $8
    profile.labourCostPerHour, //                $9
    region!.code, //                             $10
    site!.code, //                               $11
    zone?.code ?? 'ZONE', //                     $12
    profile.carbonKgPerLabourHour, //            $13
    profile.spendPerSitePerDay, //               $14
    profile.currency, //                         $15
    profile.downtimeMinutesPerSitePerDay, //     $16
  ];
}

async function rebuild(client: PoolClient, tenantId: string, from: string, to: string): Promise<number> {
  const result = await client.query<{ rows: string }>(
    'SELECT gigalibs_analytics.rebuild_place_rollups($1, $2::date, $3::date)::text AS rows',
    [tenantId, from, to],
  );
  // Bulk writes outpace autovacuum; fresh statistics keep drill-downs on the rollup primary key.
  await client.query('SELECT gigalibs_analytics.refresh_place_rollup_statistics()');
  return Number(result.rows[0]?.rows ?? 0);
}

async function audit(
  client: PoolClient,
  principal: AnalyticsPrincipal,
  eventType: 'DEMO_DATA_GENERATED' | 'DEMO_DATA_RESET',
  correlationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO gigalibs_analytics.analytics_audit_log
       (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload, correlation_id)
     VALUES ($1, $2::gigalibs_analytics.audit_event_type, $3, $4, 'DEMO_DATASET', $5::jsonb, $6)`,
    [principal.tenantId, eventType, principal.subject, `demo-lab:${principal.tenantId}`, JSON.stringify(payload), correlationId],
  );
}

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function assertUnscoped(principal: AnalyticsPrincipal): void {
  if (principal.spatialScope.mode !== 'UNBOUNDED') {
    throw new ForbiddenException({ code: 'SPATIAL_SCOPE_DENIED', message: 'Demo Lab data is managed by unscoped members only.' });
  }
}

function parse(value: unknown): DemoLabGenerateRequestV1 {
  const result = DemoLabGenerateRequestV1Schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: 'ANALYTICS_VALIDATION_FAILED',
      message: result.error.issues[0]?.message ?? 'The request is invalid.',
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return result.data;
}
