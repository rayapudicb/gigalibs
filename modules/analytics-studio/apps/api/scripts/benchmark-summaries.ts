/**
 * Summary benchmark (WI-OI-103c, acceptance 3: 95% of dashboard questions under 1 s at 10 million rows).
 *
 * A throwaway PostgreSQL 16 (stock settings, loading shortcuts only) holds 10M synthetic harvest records. Seven
 * dashboard questions run through the real query engine, from the raw rows and from their summaries, with random
 * filter values; every summary answer is checked against the raw answer. The answer cache is bypassed (a new engine
 * per question), so the timings are the engine's.
 *
 *   BENCH_ROWS=10000000 pnpm --filter @gigalibs/analytics-api exec tsx scripts/benchmark-summaries.ts
 */

import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { AnalyticsQueryV1Schema, type AnalyticsQueryInputV1, type AnalyticsQueryResultV1 } from '@gigalibs/contracts';
import type { AnalyticsPrincipal } from '../src/auth/authorization.js';
import { DatabaseService } from '../src/database/database.service.js';
import { DatasetService } from '../src/datasets/dataset.service.js';
import { FormulaMeasureService } from '../src/query-engine/formula-measure.service.js';
import { QueryEngineService } from '../src/query-engine/query-engine.service.js';
import { loadDatasetFields } from '../src/query-engine/dataset-fields.js';
import { summaryShapeFor } from '../src/query-engine/summary-plan.js';
import { SummaryService } from '../src/query-engine/summary.service.js';
import { startThrowawayPostgres } from './throwaway-postgres.js';

const ROWS = Number(process.env.BENCH_ROWS ?? 10_000_000);
const RAW_RUNS = Number(process.env.BENCH_RAW_RUNS ?? 3);
const SUMMARY_RUNS = Number(process.env.BENCH_SUMMARY_RUNS ?? 20);
const TENANT = 'bench-tenant';
/** The dashboard's shared filters: every tile's summary also holds these fields. */
const DASHBOARD_FILTERS = ['farm', 'crop'];

const log = (text: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${text}`);
const ms = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6;
const pick = <T>(values: readonly T[]) => values[randomInt(values.length)]!;
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};
const principal: AnalyticsPrincipal = {
  tenantId: TENANT,
  subject: 'bench-steward',
  sessionId: 'bench',
  authVersion: 1,
  permissions: ['analytics:*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
};
const FARMS = Array.from({ length: 100 }, (_, i) => `Farm ${String(i).padStart(3, '0')}`);
const CROPS = ['Rice', 'Maize', 'Wheat', 'Cotton', 'Chickpea', 'Soybean', 'Barley', 'Millet'];
const YEARS = [2023, 2024, 2025];

const postgres = await startThrowawayPostgres(`gigalibs-analytics-bench-${process.pid}`);
const admin = new pg.Client({ connectionString: postgres.adminUrl });
const db = new DatabaseService({ databaseUrl: postgres.runtimeUrl, databasePoolSize: 4 } as never);
try {
  await admin.connect();
  await db.onModuleInit();

  log(`seeding ${ROWS.toLocaleString()} rows`);
  const connectionId = randomUUID();
  const mappingId = randomUUID();
  const datasetVersionId = randomUUID();
  await admin.query(
    `INSERT INTO gigalibs_analytics.source_connections (id, tenant_id, display_name, source_type, host, port, database_name, ssl_mode, status, created_by)
     VALUES ($1, $2, 'Benchmark harvests (synthetic)', 'SYNTHETIC', 'bench.invalid', 1, 'bench', 'disable', 'ACTIVE', 'bench')`,
    [connectionId, TENANT],
  );
  await admin.query(
    `INSERT INTO gigalibs_analytics.data_studio_mappings (id, connection_id, tenant_id, display_name, source_table_name, lifecycle, created_by)
     VALUES ($1, $2, $3, 'Benchmark harvests', 'bench_harvests', 'PUBLISHED', 'bench')`,
    [mappingId, connectionId, TENANT],
  );
  const fieldMappings = [
    ['record_id', 'string'], ['farm', 'string'], ['field', 'string'], ['crop', 'string'], ['harvest_date', 'date'],
    ['area_ha', 'number'], ['yield_kg', 'number'], ['input_cost', 'number'], ['latitude', 'number'], ['longitude', 'number'],
  ].map(([name, type]) => ({ sourceField: name, analyticalField: name, analyticalType: type }));
  await admin.query(
    `INSERT INTO gigalibs_analytics.studio_mapping_versions (mapping_id, tenant_id, version_number, field_mappings, content_hash, published_by)
     VALUES ($1, $2, 1, $3::jsonb, repeat('a', 64), 'bench')`,
    [mappingId, TENANT, JSON.stringify(fieldMappings)],
  );
  await admin.query(
    `INSERT INTO gigalibs_analytics.analytical_dataset_versions (id, mapping_id, mapping_version, tenant_id, version_number, build_status, record_count, built_by, completed_at)
     VALUES ($1, $2, 1, $3, 1, 'BUILDING', 0, 'bench', NULL)`,
    [datasetVersionId, mappingId, TENANT],
  );
  const loadStart = process.hrtime.bigint();
  const BATCH = 500_000;
  for (let from = 1; from <= ROWS; from += BATCH) {
    const to = Math.min(ROWS, from + BATCH - 1);
    await admin.query(
      `INSERT INTO gigalibs_analytics.dataset_record_versions (dataset_version_id, mapping_id, tenant_id, analytical_payload, source_pk_hash)
       SELECT $1, $2, $3, jsonb_build_object(
                'record_id', 'R' || g,
                'farm', 'Farm ' || lpad((g % 100)::text, 3, '0'),
                'field', 'F' || lpad((g % 1000)::text, 4, '0'),
                'crop', (ARRAY['Rice','Maize','Wheat','Cotton','Chickpea','Soybean','Barley','Millet'])[1 + ((g / 1000) % 8)::int],
                'harvest_date', to_char(date '2023-01-01' + (g % 1095)::int, 'YYYY-MM-DD'),
                'area_ha', round((0.2 + random())::numeric, 2),
                'yield_kg', round((500 + random() * 5000)::numeric),
                'input_cost', round((1000 + random() * 20000)::numeric),
                'latitude', round((16 + (g % 100) * 0.01)::numeric, 4),
                'longitude', round((80 + ((g / 100) % 100) * 0.01)::numeric, 4)),
              md5(g::text)
         FROM generate_series($4::bigint, $5::bigint) AS g`,
      [datasetVersionId, mappingId, TENANT, from, to],
    );
    if (to % 2_000_000 === 0 || to === ROWS) log(`  ${to.toLocaleString()} rows`);
  }
  await admin.query(
    `UPDATE gigalibs_analytics.analytical_dataset_versions SET build_status = 'READY', record_count = $2, completed_at = now() WHERE id = $1`,
    [datasetVersionId, ROWS],
  );
  await admin.query('VACUUM ANALYZE gigalibs_analytics.dataset_record_versions');
  const loadMs = ms(loadStart);
  const size = (await admin.query<{ size: string }>(`SELECT pg_size_pretty(pg_total_relation_size('gigalibs_analytics.dataset_record_versions')) AS size`)).rows[0]!.size;
  log(`loaded in ${(loadMs / 1000).toFixed(0)} s; table with indexes ${size}`);

  const model = await new DatasetService(db).createSemanticModel(principal, {
    datasetVersionId,
    displayName: 'Benchmark harvests',
    measures: [
      { measureName: 'total_yield_kg', aggregateFn: 'SUM', fieldReference: 'yield_kg', displayLabel: 'Yield (kg)' },
      { measureName: 'harvested_area_ha', aggregateFn: 'SUM', fieldReference: 'area_ha', displayLabel: 'Area (ha)' },
      { measureName: 'input_cost', aggregateFn: 'SUM', fieldReference: 'input_cost', displayLabel: 'Input cost' },
      { measureName: 'avg_yield_kg', aggregateFn: 'AVG', fieldReference: 'yield_kg', displayLabel: 'Average yield (kg)' },
      { measureName: 'harvest_logs', aggregateFn: 'COUNT', fieldReference: 'record_id', displayLabel: 'Harvest logs' },
    ],
  });
  const formulas = new FormulaMeasureService(db);
  const formula = await formulas.create(principal, {
    semanticModelId: model.id,
    name: 'yield_per_hectare',
    definition: {
      displayLabel: 'Yield per hectare',
      unit: 'kg/ha',
      expression: { kind: 'binary', operator: 'divide', left: { kind: 'measure', name: 'total_yield_kg' }, right: { kind: 'measure', name: 'harvested_area_ha' } },
    },
  });
  await formulas.submit(principal, formula.id, formula.versions[0]!.id, { reason: null });
  await formulas.approve({ ...principal, subject: 'bench-checker' }, formula.id, formula.versions[0]!.id, { reason: null });

  const year = () => pick(YEARS);
  const questions: Array<{ name: string; make: () => AnalyticsQueryInputV1 }> = [
    { name: 'Yield by month', make: () => ({ semanticModelId: model.id, measures: ['total_yield_kg'], time: { field: 'harvest_date', grain: 'month' } }) },
    { name: 'Yield per hectare by crop and quarter', make: () => ({ semanticModelId: model.id, measures: ['yield_per_hectare'], dimensions: ['crop'], time: { field: 'harvest_date', grain: 'quarter' } }) },
    {
      name: 'Yield by farm in one year',
      make: () => {
        const y = year();
        return { semanticModelId: model.id, measures: ['total_yield_kg'], dimensions: ['farm'], filters: [{ field: 'harvest_date', op: 'between', from: `${y}-01-01`, to: `${y}-12-31` }] };
      },
    },
    { name: 'One farm by field', make: () => ({ semanticModelId: model.id, measures: ['total_yield_kg', 'harvested_area_ha'], dimensions: ['field'], filters: [{ field: 'farm', op: 'eq', value: pick(FARMS) }] }) },
    { name: 'Input cost by crop and farm', make: () => ({ semanticModelId: model.id, measures: ['input_cost'], dimensions: ['crop', 'farm'] }) },
    {
      name: 'KPI totals for a quarter',
      make: () => {
        const y = year();
        const q = pick([['01-01', '03-31'], ['04-01', '06-30'], ['07-01', '09-30'], ['10-01', '12-31']]);
        return { semanticModelId: model.id, measures: ['total_yield_kg', 'harvested_area_ha', 'harvest_logs', 'yield_per_hectare'], filters: [{ field: 'harvest_date', op: 'between', from: `${y}-${q[0]}`, to: `${y}-${q[1]}` }] };
      },
    },
    { name: 'Average yield of two crops', make: () => ({ semanticModelId: model.id, measures: ['avg_yield_kg'], dimensions: ['crop'], filters: [{ field: 'crop', op: 'in', values: [pick(CROPS), pick(CROPS)] }] }) },
  ];

  const fields = await loadDatasetFields(db, TENANT, datasetVersionId);
  const summaries = new SummaryService(db);
  const report: Array<Record<string, unknown>> = [];
  const allSummaryMs: number[] = [];
  for (const question of questions) {
    // As the product does: saving the chart asks for its own summary, saving the dashboard for one that also holds
    // the dashboard's shared filter fields. The engine then picks the smallest one that answers each view.
    const parsed = AnalyticsQueryV1Schema.parse(question.make());
    const built: Array<{ dimensions: readonly string[]; timeField: string | null; rows: number; buildSeconds: number }> = [];
    for (const shape of [summaryShapeFor(parsed, fields)!, summaryShapeFor(parsed, fields, DASHBOARD_FILTERS)!]) {
      const buildStart = process.hrtime.bigint();
      const summaryId = await summaries.ensure(TENANT, datasetVersionId, shape, fields, { wait: true });
      const buildMs = ms(buildStart);
      const row = (await admin.query<{ row_count: number; status: string }>(`SELECT row_count, status FROM gigalibs_analytics.analytics_summaries WHERE id = $1`, [summaryId])).rows[0]!;
      assert.equal(row.status, 'READY');
      built.push({ dimensions: shape.dimensions, timeField: shape.timeField, rows: row.row_count, buildSeconds: +(buildMs / 1000).toFixed(1) });
    }

    const time = async (engine: QueryEngineService, query: AnalyticsQueryInputV1) => {
      const start = process.hrtime.bigint();
      const result = await engine.runSpec(principal, query);
      return { ms: ms(start), result };
    };
    const rawMs: number[] = [];
    const summaryMs: number[] = [];
    for (let run = 0; run < Math.max(RAW_RUNS, SUMMARY_RUNS); run += 1) {
      const query = question.make();
      // Half the views have a dashboard farm filter picked.
      if (run % 2 === 1) query.filters = [...(query.filters ?? []), { field: 'farm', op: 'in', values: [pick(FARMS)] }];
      const fromSummary = await time(new QueryEngineService(db, summaries), query);
      assert.equal(fromSummary.result.answeredFrom, 'summary', question.name);
      summaryMs.push(fromSummary.ms);
      if (run < RAW_RUNS) {
        // The baseline runs without the 15 s statement limit, which refuses raw questions at this size in the product.
        const rawEngine = new QueryEngineService(db);
        (rawEngine as unknown as { runLimited: unknown }).runLimited = (tenantId: string, text: string, params: unknown[]) =>
          db.withTenantTransaction(tenantId, (client) => client.query(text, params));
        const fromRows = await time(rawEngine, query);
        rawMs.push(fromRows.ms);
        assertSameAnswer(fromSummary.result, fromRows.result, question.name);
      }
    }
    allSummaryMs.push(...summaryMs);
    const line = {
      question: question.name,
      summaries: built,
      rawMedianMs: Math.round(percentile(rawMs, 50)),
      summaryMedianMs: Math.round(percentile(summaryMs, 50)),
      summaryP95Ms: Math.round(percentile(summaryMs, 95)),
    };
    report.push(line);
    log(`${question.name}: raw ${line.rawMedianMs} ms, summary p50 ${line.summaryMedianMs} ms / p95 ${line.summaryP95Ms} ms (summaries ${built.map((b) => `${b.rows} rows in ${b.buildSeconds} s`).join(', ')})`);
  }
  const overall = {
    rows: ROWS,
    loadSeconds: Math.round(loadMs / 1000),
    tableSize: size,
    questions: questions.length,
    summaryRuns: allSummaryMs.length,
    summaryP95Ms: Math.round(percentile(allSummaryMs, 95)),
    under1sShare: +(allSummaryMs.filter((value) => value < 1000).length / allSummaryMs.length).toFixed(3),
    postgres: 'postgres:16-alpine, stock settings (fsync, synchronous_commit and full_page_writes off for loading only)',
  };
  console.log(`BENCHMARK ${JSON.stringify({ overall, report })}`);
  log(`overall summary p95 ${overall.summaryP95Ms} ms; ${Math.round(overall.under1sShare * 100)}% under 1 s`);
} finally {
  await db.onModuleDestroy().catch(() => undefined);
  await admin.end().catch(() => undefined);
  postgres.stop();
}

function assertSameAnswer(a: AnalyticsQueryResultV1, b: AnalyticsQueryResultV1, name: string): void {
  assert.deepEqual(a.columns, b.columns, name);
  assert.equal(a.rows.length, b.rows.length, name);
  a.rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      const other = b.rows[r]![c];
      if (typeof cell === 'number' && typeof other === 'number') {
        assert.ok(Math.abs(cell - other) <= 1e-9 * Math.max(1, Math.abs(cell)), `${name} row ${r} col ${c}: ${cell} vs ${other}`);
      } else assert.equal(cell, other, `${name} row ${r} col ${c}`);
    }),
  );
}
