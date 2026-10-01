/**
 * Real-database proof (WI-OI-103c): the Analytics services, unmocked, against a throwaway PostgreSQL 16 with every
 * migration applied and a non-superuser runtime role (row-level security on, append-only tables enforced).
 *
 * It walks the owner's review path: Demo Lab sample farm → maker-checker formula → question → chart view with its
 * summary (answer equal to the raw rows) → dashboard with shared filters → CSV report → tenant isolation.
 *
 *   pnpm --filter @gigalibs/analytics-api exec tsx scripts/real-database-proof.ts
 */

import assert from 'node:assert/strict';
import type { AnalyticsQueryInputV1, AnalyticsQueryResultV1 } from '@gigalibs/contracts';
import type { AnalyticsPrincipal } from '../src/auth/authorization.js';
import { DatabaseService } from '../src/database/database.service.js';
import { DatasetService } from '../src/datasets/dataset.service.js';
import { SampleFarmService } from '../src/places/sample-farm.service.js';
import { ChartViewService } from '../src/query-engine/chart-view.service.js';
import { DashboardService } from '../src/query-engine/dashboard.service.js';
import { FormulaMeasureService } from '../src/query-engine/formula-measure.service.js';
import { QueryEngineService } from '../src/query-engine/query-engine.service.js';
import { SummaryService } from '../src/query-engine/summary.service.js';
import { ReportService } from '../src/reports/report.service.js';
import { SchemaDiscoveryService } from '../src/schema-discovery/schema-discovery.service.js';
import { startThrowawayPostgres } from './throwaway-postgres.js';

const step = (text: string) => console.log(`== ${text}`);
const principal = (subject: string, tenantId = 'demo-farm'): AnalyticsPrincipal => ({
  tenantId,
  subject,
  sessionId: `session-${subject}`,
  authVersion: 1,
  permissions: ['analytics:*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
});
const sameRows = (a: AnalyticsQueryResultV1, b: AnalyticsQueryResultV1) => {
  assert.deepEqual(a.columns, b.columns);
  assert.equal(a.rows.length, b.rows.length);
  a.rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      const other = b.rows[r]![c];
      if (typeof cell === 'number' && typeof other === 'number') assert.ok(Math.abs(cell - other) <= 1e-9 * Math.max(1, Math.abs(cell)), `row ${r} col ${c}: ${cell} vs ${other}`);
      else assert.equal(cell, other);
    }),
  );
};

const postgres = await startThrowawayPostgres(`gigalibs-analytics-proof-${process.pid}`);
const db = new DatabaseService({ databaseUrl: postgres.runtimeUrl, databasePoolSize: 5 } as never);
try {
  await db.onModuleInit();
  const maker = principal('maker-1');
  const checker = principal('checker-1');
  const outsider = principal('someone', 'other-tenant');

  const summaries = new SummaryService(db);
  const engine = new QueryEngineService(db, summaries);
  const rawEngine = () => new QueryEngineService(db); // no summaries, fresh cache: always the raw rows
  const formulas = new FormulaMeasureService(db);
  const chartViews = new ChartViewService(db, engine, summaries);
  const dashboards = new DashboardService(db, engine, summaries);
  const reports = new ReportService(db, chartViews, dashboards);
  const sampleFarm = new SampleFarmService(db, new SchemaDiscoveryService(db), new DatasetService(db), formulas);

  step('1. Demo Lab sample farm loads through source, discovery, mapping, dataset and model');
  const loaded = await sampleFarm.load(maker, 'proof-load-1');
  assert.equal(loaded.loaded, true);
  assert.equal(loaded.rawRecords, 960);
  assert.equal(loaded.formula?.state, 'PENDING_REVIEW');
  const again = await sampleFarm.load(maker, 'proof-load-2');
  assert.equal(again.connectionId, loaded.connectionId);
  assert.equal(again.rawRecords, 960);
  const modelId = loaded.semanticModelId!;

  step('2. maker-checker: the maker cannot approve; a second person can');
  await assert.rejects(formulas.approve(maker, loaded.formula!.id, loaded.formula!.versionId, { reason: null }), /second person/);
  await formulas.approve(checker, loaded.formula!.id, loaded.formula!.versionId, { reason: 'Checked against the field records.' });

  step('3. yield per hectare by crop equals total yield divided by area');
  const byCrop = await engine.runSpec(maker, {
    semanticModelId: modelId,
    measures: ['yield_per_hectare', 'total_yield_kg', 'harvested_area_ha'],
    dimensions: ['crop'],
  });
  assert.equal(byCrop.rows.length, 5);
  for (const [, perHa, yieldKg, area] of byCrop.rows as Array<[string, number, number, number]>) {
    assert.ok(Math.abs(perHa - yieldKg / area) < 1e-6);
  }
  assert.ok(byCrop.measureVersions.yield_per_hectare);

  step('4. a saved chart gets its summary, and the summary answers exactly as the raw rows');
  const question: AnalyticsQueryInputV1 = {
    semanticModelId: modelId,
    measures: ['yield_per_hectare', 'total_yield_kg', 'harvest_logs'],
    dimensions: ['crop'],
    time: { field: 'harvest_date', grain: 'quarter' },
  };
  const view = await chartViews.create(maker, { name: 'Yield per hectare by crop', query: question, visual: { type: 'table' } });
  let ready = await summaries.ready(maker.tenantId, byCrop.datasetVersionId);
  for (let wait = 0; ready.length === 0 && wait < 60; wait += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    ready = await summaries.ready(maker.tenantId, byCrop.datasetVersionId);
  }
  assert.equal(ready.length, 1, 'the chart view summary was built');
  const fromSummary = await new QueryEngineService(db, summaries).runSpec(maker, view.query);
  const fromRows = await rawEngine().runSpec(maker, view.query);
  assert.equal(fromSummary.answeredFrom, 'summary');
  assert.equal(fromRows.answeredFrom, 'rows');
  sameRows(fromSummary, fromRows);

  step('5. a dashboard with a shared farm filter and date range');
  const dashboard = await dashboards.create(maker, {
    name: 'Farm overview',
    filters: [{ field: 'farm', label: 'Farm' }],
    tiles: [{ chartViewId: view.id, size: 'large' }],
  });
  const farms = await dashboards.filterValues(maker, dashboard.id, 'farm');
  assert.deepEqual(farms.values, ['Sample Farm Hill', 'Sample Farm North', 'Sample Farm River']);
  const filtered = await dashboards.data(maker, dashboard.id, {
    time: { from: '2025-01-01', to: '2025-12-31' },
    filters: [{ field: 'farm', values: ['Sample Farm North'] }],
  });
  const tile = filtered.tiles[0]!;
  assert.equal(tile.error, null);
  assert.deepEqual(tile.applied, ['Date range', 'Farm']);
  assert.ok(tile.result!.rows.length > 0);
  const unfiltered = await rawEngine().runSpec(maker, view.query);
  const filteredYield = (tile.result!.rows as unknown[][]).reduce((sum, row) => sum + Number(row[3]), 0);
  const allYield = (unfiltered.rows as unknown[][]).reduce((sum, row) => sum + Number(row[3]), 0);
  assert.ok(filteredYield > 0 && filteredYield < allYield, 'the farm and date filters narrow the answer');

  step('6. a CSV report of the saved chart');
  const report = await reports.createReportDefinition(maker, { name: 'Yield per hectare', source: { chartViewId: view.id } });
  const run = await reports.triggerReportRun(maker, { reportDefinitionId: report.id });
  assert.equal(run.status, 'SUCCEEDED', run.errorMessage ?? '');
  const file = await reports.downloadArtifact(maker, run.download!.token);
  const csv = file.bytes.toString('utf8');
  assert.match(csv, /harvest_date \(quarter\),crop,Yield per hectare,Yield \(kg\),Harvest logs/);
  assert.equal(csv.trim().split('\r\n').length, 4 + run.rowCount!);

  step('7. Reports v2: multi-format report (CSV, XLSX, PDF) and safe token renewal (WI-OI-106)');
  const v2Report = await reports.createReportDefinition(maker, {
    name: 'Yield per hectare multi-format',
    source: { chartViewId: view.id },
    formats: ['CSV', 'XLSX', 'PDF'],
  });
  const v2Run = await reports.triggerReportRun(maker, { reportDefinitionId: v2Report.id });
  assert.equal(v2Run.status, 'SUCCEEDED', v2Run.errorMessage ?? '');
  assert.equal(v2Run.files.length, 3);
  assert.deepEqual(v2Run.files.map((f) => f.format), ['CSV', 'XLSX', 'PDF']);

  // Safe renewal of XLSX download token
  const renewedXlsx = await reports.generateDownloadToken(maker, v2Run.id, 'XLSX');
  assert.equal(renewedXlsx.format, 'XLSX');
  assert.ok(renewedXlsx.token);
  const downloadedXlsx = await reports.downloadArtifact(maker, renewedXlsx.token);
  assert.equal(downloadedXlsx.filename, renewedXlsx.filename);
  assert.ok(downloadedXlsx.bytes.length > 0);

  // Cross-tenant download with renewed token is rejected with 404
  await assert.rejects(reports.downloadArtifact(outsider, renewedXlsx.token), /not found/);

  // Scoped principal cross-user renewal is rejected
  const scopedUser = {
    ...maker,
    subject: 'other-farm-worker',
    spatialScope: { mode: 'SCOPED' as const, placeIds: ['other-place'] },
  };
  await assert.rejects(reports.generateDownloadToken(scopedUser, v2Run.id, 'PDF'), /own place scope/);

  step('8. another tenant sees none of it');
  assert.deepEqual(await chartViews.list(outsider), []);
  assert.deepEqual(await dashboards.list(outsider), []);
  await assert.rejects(engine.runSpec(outsider, view.query), /not found/);
  await assert.rejects(reports.downloadArtifact(outsider, run.download!.token), /not found/);

  console.log('REAL DATABASE PROOF PASSED');
} finally {
  await db.onModuleDestroy();
  postgres.stop();
}
