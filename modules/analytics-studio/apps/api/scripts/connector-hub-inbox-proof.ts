/**
 * WI-OI-104e real-database proof: Connector Hub records delivered to the Analytics inbox become a CONNECTOR_HUB
 * source that the existing discovery, mapping and dataset steps use unchanged. WI-OI-105b–d: Geospatial place facts
 * keep the place directory, records are tagged with their place, and place scope limits every answer. Runs on a throwaway PostgreSQL with
 * every migration and a non-superuser role (RLS forced). Usage: pnpm --filter @gigalibs/analytics-api proof:connector-hub-inbox
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { compatibleChartTypes, resultShape } from '@gigalibs/contracts';
import type { AnalyticsPrincipal } from '../src/auth/authorization.js';
import { DatabaseService } from '../src/database/database.service.js';
import { DatasetService } from '../src/datasets/dataset.service.js';
import { ConnectorHubInboxService, HUB_RECORDS_TABLE } from '../src/inbox/connector-hub-inbox.js';
import { PlaceAnalyticsService } from '../src/places/place-analytics.service.js';
import { SampleFarmService } from '../src/places/sample-farm.service.js';
import { ChartViewService } from '../src/query-engine/chart-view.service.js';
import { FormulaMeasureService } from '../src/query-engine/formula-measure.service.js';
import { QueryEngineService } from '../src/query-engine/query-engine.service.js';
import { SummaryService } from '../src/query-engine/summary.service.js';
import { SchemaDiscoveryService } from '../src/schema-discovery/schema-discovery.service.js';
import { startThrowawayPostgres } from './throwaway-postgres.js';

const step = (text: string) => console.log(`== ${text}`);
const principal = (tenantId: string): AnalyticsPrincipal => ({
  tenantId,
  subject: 'analyst-1',
  sessionId: 'session-analyst-1',
  authVersion: 1,
  permissions: ['analytics:*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  orgScope: { mode: 'FLAT_TENANT' },
  spatialScope: { mode: 'UNBOUNDED' },
});
const envelope = (tenantId: string, sourceId: string, record: Record<string, unknown>, occurredAt: string, extra: Record<string, unknown> = {}) => ({
  messageId: `evt-${randomUUID()}`,
  tenantId,
  eventType: 'CONNECTOR_RECORD_PULLED_V1',
  aggregateType: 'connector_record',
  aggregateId: `conn-farm:${sourceId}`,
  aggregateVersion: 1,
  correlationId: 'schedule:proof',
  causationId: null,
  schemaVersion: 1,
  payload: { hubConnectionId: 'conn-farm', connectionName: 'farmOS harvests', connectorCode: 'GENERIC_REST_PULL', syncJobId: 'sync-1', sourceId, payloadSha256: 'x', record },
  occurredAt,
  ...extra,
});

const postgres = await startThrowawayPostgres(`gigalibs-analytics-inbox-proof-${process.pid}`);
const db = new DatabaseService({ databaseUrl: postgres.runtimeUrl, databasePoolSize: 5 } as never);
try {
  await db.onModuleInit();
  const inbox = new ConnectorHubInboxService(db);
  const farm = principal('farm-tenant');
  const other = principal('other-tenant');

  step('1. pulled records arrive once each, as one CONNECTOR_HUB source per Hub connection');
  const harvests = [
    { id: 'h-1', field: 'North', crop: 'maize', quantity: 12, unit: 'Quintals', harvested_on: '2026-09-21', plot: { area: { value: 2, unit: 'acres' } } },
    { id: 'h-2', field: 'North', crop: 'rice', quantity: 8, unit: 'qtl', harvested_on: '2026-09-22', plot: { area: { value: 1.5, unit: 'ha' } } },
    { id: 'h-3', field: 'South', crop: 'maize', quantity: 9.5, unit: 'bushel', harvested_on: '2026-09-23', plot: { area: { value: 1, unit: 'ha' } } },
  ];
  const first = envelope('farm-tenant', 'h-1', harvests[0]!, '2026-09-24T06:00:00.000Z');
  const stored = await inbox.receive(first);
  assert.equal(stored.status, 'stored');
  assert.deepEqual(await inbox.receive(first), { status: 'duplicate' });
  for (const [index, harvest] of harvests.slice(1).entries()) {
    assert.equal((await inbox.receive(envelope('farm-tenant', harvest.id, harvest, `2026-09-24T06:00:0${index + 1}.000Z`))).status, 'stored');
  }
  // A newer version of h-2 pulled later, and an older copy of h-3 that arrives late.
  await inbox.receive(envelope('farm-tenant', 'h-2', { ...harvests[1]!, quantity: 8.4 }, '2026-09-25T06:00:00.000Z', { payload: { ...first.payload, sourceId: 'h-2', syncJobId: 'sync-2', record: { ...harvests[1]!, quantity: 8.4 } } }));
  await inbox.receive(envelope('farm-tenant', 'h-3', { ...harvests[2]!, quantity: 1 }, '2026-09-20T06:00:00.000Z'));
  await inbox.receive(envelope('other-tenant', 'x-1', { id: 'x-1', crop: 'wheat' }, '2026-09-24T06:00:00.000Z'));
  await assert.rejects(inbox.receive({ ...first, messageId: 'evt-bad', eventType: 'SOMETHING_ELSE' }), /Only CONNECTOR_RECORD_PULLED_V1/);
  await assert.rejects(inbox.receive({ ...first, messageId: 'evt-bad-2', payload: { ...first.payload, record: 'not an object' } }), /incomplete/);
  const sources = await new SchemaDiscoveryService(db).listSources(farm);
  assert.deepEqual(sources.map((source) => [source.sourceType, source.displayName]), [['CONNECTOR_HUB', 'farmOS harvests']]);
  const sourceId = sources[0]!.id;
  assert.equal(stored.sourceConnectionId, sourceId);
  assert.equal((await new SchemaDiscoveryService(db).listSources(other)).length, 1);
  const runs = await db.queryWithTenant<{ hub_sync_job_id: string; rows_fetched: string }>(
    'farm-tenant',
    'SELECT hub_sync_job_id, rows_fetched::text FROM gigalibs_analytics.source_sync_runs WHERE connection_id = $1 ORDER BY hub_sync_job_id',
    [sourceId],
  );
  assert.deepEqual(runs.rows.map((run) => [run.hub_sync_job_id, run.rows_fetched]), [['sync-1', '4'], ['sync-2', '1']]);

  step('2. discovery, mapping and a dataset build work on it unchanged; the latest pulled version of each record wins');
  const discovery = new SchemaDiscoveryService(db);
  const schema = await discovery.discoverSchema(farm, sourceId, HUB_RECORDS_TABLE);
  const fields = JSON.stringify(schema);
  for (const field of ['crop', 'quantity', 'unit', 'harvested_on', 'plot.area.value', 'plot.area.unit']) assert.ok(fields.includes(field), `discovered ${field}`);
  const fieldMappings = [
    { sourceField: 'id', analyticalField: 'harvest_id', analyticalType: 'string' },
    { sourceField: 'field', analyticalField: 'field', analyticalType: 'string' },
    { sourceField: 'crop', analyticalField: 'crop', analyticalType: 'string' },
    // WI-OI-104e: each record names its own unit; the dataset holds kilograms and hectares.
    { sourceField: 'quantity', analyticalField: 'yield_kg', analyticalType: 'number', unit: { to: 'kg', fromField: 'unit' } },
    { sourceField: 'plot.area.value', analyticalField: 'area_ha', analyticalType: 'number', unit: { to: 'ha', fromField: 'plot.area.unit' } },
    { sourceField: 'harvested_on', analyticalField: 'harvested_on', analyticalType: 'date' },
  ] as const;
  await assert.rejects(
    discovery.createMapping(farm, { connectionId: sourceId, displayName: 'Bad', sourceTableName: HUB_RECORDS_TABLE, fieldMappings: [{ sourceField: 'quantity', analyticalField: 'q', analyticalType: 'number', unit: { to: 'ha', from: 'kg' } }] }),
    /measure different things/,
  );
  const mapping = await discovery.createMapping(farm, { connectionId: sourceId, displayName: 'Harvests', sourceTableName: HUB_RECORDS_TABLE, fieldMappings: [...fieldMappings] });
  const version = (await discovery.publishMappingVersion(farm, mapping.id, { fieldMappings: [...fieldMappings] })).latestVersionNumber!;
  const datasets = new DatasetService(db);
  const built = await datasets.buildDatasetVersion(farm, { mappingId: mapping.id, mappingVersion: version });
  assert.equal(built.buildStatus, 'READY', built.buildError ?? '');
  const rows = await db.queryWithTenant<{ analytical_payload: Record<string, unknown> }>(
    'farm-tenant',
    'SELECT analytical_payload FROM gigalibs_analytics.dataset_record_versions WHERE dataset_version_id = $1',
    [built.id],
  );
  assert.equal(rows.rows.length, 3, 'one dataset row per source record');
  const byId = Object.fromEntries(rows.rows.map((row) => [row.analytical_payload.harvest_id, row.analytical_payload]));
  assert.deepEqual([byId['h-1']?.yield_kg, byId['h-1']?.area_ha], [1200, 0.80937128448], 'quintals to kg, acres to ha');
  assert.equal(byId['h-2']?.yield_kg, 840, 'the newer h-2 version (8.4 qtl) wins');
  assert.equal(byId['h-3']?.yield_kg, null, 'an unknown unit (bushel) is left empty, never guessed');
  assert.equal(byId['h-3']?.area_ha, 1, 'the late older h-3 copy does not replace the newer one');

  step('3. a scheduled rebuild moves the model on it to the new data, and the chained summary build readies its chart');
  const summaries = new SummaryService(db);
  const engine = new QueryEngineService(db, summaries);
  const chartViews = new ChartViewService(db, engine, summaries);
  const model = await datasets.createSemanticModel(farm, {
    datasetVersionId: built.id,
    displayName: 'Harvests',
    measures: [{ measureName: 'total_yield_kg', aggregateFn: 'SUM', fieldReference: 'yield_kg', displayLabel: 'Yield (kg)' }],
  });
  const view = await chartViews.create(farm, { name: 'Yield by crop', query: { semanticModelId: model.id, measures: ['total_yield_kg'], dimensions: ['crop'] }, visual: { type: 'table' } });
  const maize = async () => (await engine.runSpec(farm, view.query)).rows.find((row) => row[0] === 'maize')?.[1];
  assert.equal(await maize(), 1200, 'before: h-1 only (h-3 has an unknown unit)');
  const h4 = { id: 'h-4', field: 'South', crop: 'maize', quantity: 2, unit: 'tonnes', harvested_on: '2026-09-26', plot: { area: { value: 1, unit: 'ha' } } };
  await inbox.receive(envelope('farm-tenant', 'h-4', h4, '2026-09-26T06:00:00.000Z', { payload: { ...first.payload, sourceId: 'h-4', syncJobId: 'sync-3', record: h4 } }));
  const rebuilt = await datasets.buildDatasetVersion(farm, { mappingId: mapping.id });
  assert.equal(rebuilt.buildStatus, 'READY');
  assert.deepEqual(rebuilt.refreshedModelIds, [model.id], 'the model follows the rebuild of the same mapping version');
  assert.equal(await maize(), 3200, 'after: plus 2 tonnes, as 2000 kg');
  const audit = await db.queryWithTenant<{ n: number }>(
    'farm-tenant',
    "SELECT count(*)::int AS n FROM gigalibs_analytics.analytics_audit_log WHERE event_type = 'SEMANTIC_MODEL_REFRESHED' AND entity_id = $1",
    [model.id],
  );
  assert.equal(audit.rows[0]!.n, 1);
  const chained = await summaries.ensureForDatasetVersion('farm-tenant', rebuilt.id);
  assert.deepEqual(chained, { ready: 1, failed: 0, building: 0 }, 'the saved chart has its summary on the new version');
  assert.equal((await new QueryEngineService(db, summaries).runSpec(farm, view.query)).answeredFrom, 'summary');

  step('5. Geospatial place facts keep the place directory: versions, old-style facts, moves, and producer routing');
  const placeFact = (placeId: string, version: number, payload: Record<string, unknown>, tenantId = 'farm-tenant') => ({
    messageId: `evt-${randomUUID()}`,
    tenantId,
    eventType: 'SpatialNodeChangedV1',
    aggregateType: 'SPATIAL_NODE',
    aggregateId: placeId,
    aggregateVersion: version,
    correlationId: 'proof',
    causationId: null,
    schemaVersion: 1,
    payload: { nodeId: placeId, change: 'CREATED', previousPath: null, parentId: null, countryCode: null, subdivisionCode: null, timeZone: null, status: 'ACTIVE', aggregateVersion: version, ...payload },
    occurredAt: '2026-09-30T10:00:00.000Z',
  });
  const square = (x: number, y: number, size: number) => ({ type: 'Polygon', coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] });
  const FARM_A = '00000000-0000-4000-8000-00000000fa01';
  const FARM_B = '00000000-0000-4000-8000-00000000fb01';
  const BLOCK = '00000000-0000-4000-8000-00000000b101';
  const ROW = '00000000-0000-4000-8000-00000000c101';
  await inbox.receivePlace(placeFact(FARM_A, 2, { path: 'FARM_A', nodeTypeCode: 'FARM', displayName: 'Farm A', boundary: square(77.5, 12.9, 0.02), latitude: 12.91, longitude: 77.51 }));
  await inbox.receivePlace(placeFact(FARM_B, 1, { path: 'FARM_B', nodeTypeCode: 'FARM', displayName: 'Farm B', boundary: square(77.6, 12.9, 0.02) }));
  await inbox.receivePlace(placeFact(BLOCK, 1, { path: 'FARM_A.BLOCK_1', parentId: FARM_A, nodeTypeCode: 'BLOCK', displayName: 'Block 1', boundary: square(77.5, 12.9, 0.005) }));
  await inbox.receivePlace(placeFact(ROW, 1, { path: 'FARM_A.BLOCK_1.ROW_1', parentId: BLOCK, nodeTypeCode: 'ROW', displayName: 'Row 1' }));
  // An older version arrives late, and an old-style fact (no name, point or boundary) keeps what is held.
  assert.equal((await inbox.receivePlace(placeFact(FARM_A, 1, { path: 'FARM_A', nodeTypeCode: 'FARM', displayName: 'Stale name' }))).status, 'stale');
  await inbox.receivePlace(placeFact(FARM_A, 3, { change: 'UPDATED', path: 'FARM_A', nodeTypeCode: 'FARM' }));
  const directory = async () =>
    Object.fromEntries(
      (await db.queryWithTenant<{ place_id: string; path: string; depth: number; display_name: string; area_m2: number | null; version: number; min_longitude: number | null }>(
        'farm-tenant',
        'SELECT place_id, path, depth, display_name, area_m2, version, min_longitude FROM gigalibs_analytics.place_directory',
      )).rows.map((row) => [row.place_id, row]),
    );
  let held = await directory();
  assert.deepEqual([held[FARM_A]!.display_name, held[FARM_A]!.version, held[FARM_A]!.min_longitude], ['Farm A', 3, 77.5]);
  assert.ok(held[FARM_A]!.area_m2! > 4_700_000 && held[FARM_A]!.area_m2! < 4_900_000, `area ${held[FARM_A]!.area_m2} m² computed from the boundary`);
  // Block 1 moves from Farm A to Farm B: it and the row under it take the new path.
  await inbox.receivePlace(placeFact(BLOCK, 2, { change: 'MOVED', path: 'FARM_B.BLOCK_1', previousPath: 'FARM_A.BLOCK_1', parentId: FARM_B, nodeTypeCode: 'BLOCK', displayName: 'Block 1', boundary: square(77.6, 12.9, 0.005) }));
  held = await directory();
  assert.deepEqual([held[BLOCK]!.path, held[ROW]!.path, held[ROW]!.depth], ['FARM_B.BLOCK_1', 'FARM_B.BLOCK_1.ROW_1', 3]);
  assert.equal(Object.keys(await (async () => Object.fromEntries((await db.queryWithTenant<{ place_id: string }>('other-tenant', 'SELECT place_id FROM gigalibs_analytics.place_directory')).rows.map((row) => [row.place_id, row])))()).length, 0);
  // Each producer may deliver only its own event.
  await assert.rejects(inbox.receiveFrom('geospatial', first), /may not deliver/);
  await assert.rejects(inbox.receiveFrom('connector-hub', placeFact(FARM_A, 9, { path: 'FARM_A', nodeTypeCode: 'FARM' })), /may not deliver/);
  await assert.rejects(inbox.receivePlace(placeFact(FARM_A, 10, { path: 'FARM_A', nodeTypeCode: 'FARM', status: 'GONE' })), /not valid/);

  step('6. records are tagged with the smallest place holding them, and a member with a place scope sees only theirs');
  const scouting = [
    { id: 's-1', lat: 12.905, lon: 77.51, plot_code: 'FARM_A', pests: 10 },
    { id: 's-2', lat: 12.902, lon: 77.602, plot_code: 'BLOCK_1', pests: 20 },
    { id: 's-3', lat: 13.5, lon: 78, plot_code: 'NOWHERE', pests: 5 },
    { id: 's-4', lat: 12.915, lon: 77.615, plot_code: FARM_B, pests: 7 },
  ];
  for (const record of scouting) {
    await inbox.receive(envelope('farm-tenant', record.id, record, '2026-09-30T07:00:00.000Z', {
      aggregateId: `conn-plots:${record.id}`,
      payload: { ...first.payload, hubConnectionId: 'conn-plots', connectionName: 'Field scouting', syncJobId: 'sync-p', sourceId: record.id, record },
    }));
  }
  const scoutingSource = (await discovery.listSources(farm)).find((source) => source.displayName === 'Field scouting')!.id;
  const scoutingFields = (place: Record<string, unknown>, sourceField: string) => [
    { sourceField: 'id', analyticalField: 'scouting_id', analyticalType: 'string' },
    { sourceField: 'pests', analyticalField: 'pests', analyticalType: 'number' },
    // The place field's source may also be mapped as a plain field.
    { sourceField: 'lat', analyticalField: 'lat', analyticalType: 'number' },
    { sourceField, analyticalField: 'place', analyticalType: 'string', place },
  ];
  await assert.rejects(
    discovery.createMapping(farm, { connectionId: scoutingSource, displayName: 'Bad', sourceTableName: HUB_RECORDS_TABLE, fieldMappings: [{ sourceField: 'lat', analyticalField: 'place', analyticalType: 'string', place: { longitudeField: 'lon', byCode: true } }] as never }),
    /either from a point/,
  );
  await assert.rejects(
    discovery.createMapping(farm, { connectionId: scoutingSource, displayName: 'Bad', sourceTableName: HUB_RECORDS_TABLE, fieldMappings: [{ sourceField: 'id', analyticalField: 'place_id', analyticalType: 'string' }] }),
    /reserved for place tagging/,
  );
  const buildScouting = async (name: string, fieldMappings: ReturnType<typeof scoutingFields>) => {
    const created = await discovery.createMapping(farm, { connectionId: scoutingSource, displayName: name, sourceTableName: HUB_RECORDS_TABLE, fieldMappings: fieldMappings as never });
    const published = (await discovery.publishMappingVersion(farm, created.id, { fieldMappings: fieldMappings as never })).latestVersionNumber!;
    const dataset = await datasets.buildDatasetVersion(farm, { mappingId: created.id, mappingVersion: published });
    assert.equal(dataset.buildStatus, 'READY', dataset.buildError ?? '');
    const tagged = await db.queryWithTenant<{ analytical_payload: Record<string, unknown> }>(
      'farm-tenant',
      'SELECT analytical_payload FROM gigalibs_analytics.dataset_record_versions WHERE dataset_version_id = $1',
      [dataset.id],
    );
    return { dataset, byId: Object.fromEntries(tagged.rows.map((row) => [row.analytical_payload.scouting_id, row.analytical_payload])) };
  };
  const byPoint = await buildScouting('Scouting by point', scoutingFields({ longitudeField: 'lon' }, 'lat'));
  const placeOf = (record: Record<string, unknown> | undefined) => [record?.place, record?.place_id, record?.place_path];
  assert.deepEqual(placeOf(byPoint.byId['s-1']), ['Farm A', FARM_A, 'FARM_A']);
  assert.deepEqual(placeOf(byPoint.byId['s-2']), ['Block 1', BLOCK, 'FARM_B.BLOCK_1'], 'the smallest place holding the point');
  assert.deepEqual(placeOf(byPoint.byId['s-3']), ['Unplaced', null, null]);
  assert.deepEqual(placeOf(byPoint.byId['s-4']), ['Farm B', FARM_B, 'FARM_B']);
  assert.equal(byPoint.dataset.unplacedCount, 1);
  assert.equal((await datasets.getDatasetVersion(farm, byPoint.dataset.id)).unplacedCount, 1, 'the count is kept on the dataset');
  const byCode = await buildScouting('Scouting by code', scoutingFields({ byCode: true }, 'plot_code'));
  assert.deepEqual(['s-1', 's-2', 's-3', 's-4'].map((id) => byCode.byId[id]?.place), ['Farm A', 'Block 1', 'Unplaced', 'Farm B'], 'a code or a place id');
  assert.equal(byCode.dataset.unplacedCount, 1);
  assert.equal((await datasets.getDatasetVersion(farm, built.id)).unplacedCount, undefined, 'a dataset without places has no count');

  const scoutingModel = await datasets.createSemanticModel(farm, {
    datasetVersionId: byPoint.dataset.id,
    displayName: 'Scouting',
    measures: [{ measureName: 'pests', aggregateFn: 'SUM', fieldReference: 'pests', displayLabel: 'Pests' }],
  });
  const byPlace = { semanticModelId: scoutingModel.id, measures: ['pests'], dimensions: ['place'], sort: [{ by: 'place', direction: 'asc' as const }] };
  const scopedTo = (placeIds: string[]): AnalyticsPrincipal => ({ ...farm, subject: 'agronomist-1', spatialScope: { mode: 'SCOPED_PLACES', place_ids: placeIds } });
  const answer = async (who: AnalyticsPrincipal) => (await engine.runSpec(who, byPlace)).rows;
  assert.deepEqual(await answer(farm), [['Block 1', 20], ['Farm A', 10], ['Farm B', 7], ['Unplaced', 5]]);
  assert.deepEqual(await answer(scopedTo([FARM_B])), [['Block 1', 20], ['Farm B', 7]], 'Farm B and the block moved into it');
  assert.deepEqual(await answer(scopedTo([FARM_A])), [['Farm A', 10]], 'the block moved out of Farm A goes with it');
  assert.deepEqual(await answer(scopedTo([BLOCK])), [['Block 1', 20]]);
  assert.deepEqual(await answer(scopedTo([])), [], 'no place assigned: nothing, not everything');
  assert.deepEqual(await answer(scopedTo(['00000000-0000-4000-8000-0000000000ff'])), [], 'a place Analytics does not know yet');
  await assert.rejects(engine.runSpec(scopedTo([FARM_A]), view.query), (error: { response?: { code?: string } }) => error.response?.code === 'SPATIAL_SCOPE_DENIED');
  // A summary covering the question exists, but a scoped question is answered from the rows (D3).
  await chartViews.create(farm, { name: 'Pests by place', query: byPlace, visual: { type: 'table' } });
  let ensured = await summaries.ensureForDatasetVersion('farm-tenant', byPoint.dataset.id);
  for (let wait = 0; ensured.building > 0 && wait < 50; wait += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    ensured = await summaries.ensureForDatasetVersion('farm-tenant', byPoint.dataset.id);
  }
  assert.deepEqual(ensured, { ready: 1, failed: 0, building: 0 });
  const uncached = new QueryEngineService(db, summaries);
  assert.equal((await uncached.runSpec(farm, byPlace)).answeredFrom, 'summary');
  const scopedAnswer = await uncached.runSpec(scopedTo([FARM_A]), byPlace);
  assert.deepEqual([scopedAnswer.answeredFrom, scopedAnswer.rows], ['rows', [['Farm A', 10]]]);

  // WI-OI-105e: a question about one farm, the place directory for pickers and the map, and the place map chart.
  const farmB = { ...byPlace, placeUnder: FARM_B };
  assert.deepEqual((await uncached.runSpec(farm, farmB)).rows, [['Block 1', 20], ['Farm B', 7]]);
  assert.deepEqual((await uncached.runSpec(scopedTo([FARM_A]), farmB)).rows, [], 'another farm, outside the scope');
  assert.deepEqual((await uncached.runSpec(scopedTo([BLOCK]), farmB)).rows, [['Block 1', 20]]);
  await assert.rejects(uncached.runSpec(farm, { ...view.query, placeUnder: FARM_B }), /no places to filter by/);
  const places = new PlaceAnalyticsService(db);
  const ids = (directory: { places: readonly { id: string }[] }) => directory.places.map((place) => place.id);
  assert.deepEqual(ids(await places.directory(scopedTo([FARM_B]), {})), [FARM_B, BLOCK, ROW]);
  assert.deepEqual(ids(await places.directory(farm, { maxDepth: '1' })), [FARM_A, FARM_B]);
  const map = await places.directory(farm, { under: FARM_B, boundaries: 'true', maxDepth: '1' });
  assert.deepEqual(ids(map), [FARM_B, BLOCK]);
  assert.equal(map.places[1]!.boundary?.type, 'Polygon');
  assert.deepEqual(ids(await places.directory(scopedTo([BLOCK]), { under: FARM_B })), [BLOCK, ROW], 'the farm itself is outside the scope');
  const byPlaceId = { semanticModelId: scoutingModel.id, measures: ['pests'], dimensions: ['place_id'], placeUnder: FARM_B };
  const mapAnswer = await uncached.runSpec(farm, byPlaceId);
  assert.ok(compatibleChartTypes(resultShape(mapAnswer)).includes('place_map'));
  await chartViews.create(farm, { name: 'Pests on Farm B', query: byPlaceId, visual: { type: 'place_map' } });

  step('7. the Demo Lab sample farm (synthetic source) still loads under the new source rule');
  const formulas = new FormulaMeasureService(db);
  const sample = new SampleFarmService(db, discovery, datasets, formulas);
  const loaded = await sample.load(principal('demo-farm'), 'inbox-proof');
  assert.equal(loaded.rawRecords, 960);

  console.log('CONNECTOR HUB INBOX PROOF PASS');
} finally {
  await db.onModuleDestroy().catch(() => undefined);
  postgres.stop();
}
