/**
 * WI-OI-104e real-database proof: Connector Hub records delivered to the Analytics inbox become a CONNECTOR_HUB
 * source that the existing discovery, mapping and dataset steps use unchanged. Runs on a throwaway PostgreSQL with
 * every migration and a non-superuser role (RLS forced). Usage: pnpm --filter @gigalibs/analytics-api proof:connector-hub-inbox
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AnalyticsPrincipal } from '../src/auth/authorization.js';
import { ConnectorService } from '../src/connectors/connector.service.js';
import { DatabaseService } from '../src/database/database.service.js';
import { DatasetService } from '../src/datasets/dataset.service.js';
import { ConnectorHubInboxService, HUB_RECORDS_TABLE } from '../src/inbox/connector-hub-inbox.js';
import { SampleFarmService } from '../src/places/sample-farm.service.js';
import { FormulaMeasureService } from '../src/query-engine/formula-measure.service.js';
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
    { id: 'h-1', field: 'North', crop: 'maize', quantity: 12, unit: 'quintal', harvested_on: '2026-09-21' },
    { id: 'h-2', field: 'North', crop: 'rice', quantity: 8, unit: 'quintal', harvested_on: '2026-09-22' },
    { id: 'h-3', field: 'South', crop: 'maize', quantity: 9.5, unit: 'quintal', harvested_on: '2026-09-23' },
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
  const sources = await new ConnectorService(db).listConnections(farm);
  assert.deepEqual(sources.map((source) => [source.sourceType, source.displayName]), [['CONNECTOR_HUB', 'farmOS harvests']]);
  const sourceId = sources[0]!.id;
  assert.equal(stored.sourceConnectionId, sourceId);
  assert.equal((await new ConnectorService(db).listConnections(other)).length, 1);
  const runs = await db.queryWithTenant<{ hub_sync_job_id: string; rows_fetched: string }>(
    'farm-tenant',
    'SELECT hub_sync_job_id, rows_fetched::text FROM gigalibs_analytics.source_sync_runs WHERE connection_id = $1 ORDER BY hub_sync_job_id',
    [sourceId],
  );
  assert.deepEqual(runs.rows.map((run) => [run.hub_sync_job_id, run.rows_fetched]), [['sync-1', '4'], ['sync-2', '1']]);

  step('2. discovery, mapping and a dataset build work on it unchanged; the latest pulled version of each record wins');
  const discovery = new SchemaDiscoveryService(db, new ConnectorService(db));
  const schema = await discovery.discoverSchema(farm, sourceId, HUB_RECORDS_TABLE);
  const fields = JSON.stringify(schema);
  for (const field of ['crop', 'quantity', 'unit', 'harvested_on']) assert.ok(fields.includes(field), `discovered ${field}`);
  const fieldMappings = [
    { sourceField: 'id', analyticalField: 'harvest_id', analyticalType: 'string' },
    { sourceField: 'field', analyticalField: 'field', analyticalType: 'string' },
    { sourceField: 'crop', analyticalField: 'crop', analyticalType: 'string' },
    { sourceField: 'quantity', analyticalField: 'quantity', analyticalType: 'number' },
    { sourceField: 'harvested_on', analyticalField: 'harvested_on', analyticalType: 'date' },
  ] as const;
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
  const text = JSON.stringify(rows.rows);
  assert.ok(text.includes('8.4'), 'the newer h-2 version wins');
  assert.ok(text.includes('9.5') && !/"quantity":1[,}]/.test(text), 'the late older h-3 copy does not replace the newer one');

  step('3. the Demo Lab sample farm (synthetic source) still loads under the new source rule');
  const formulas = new FormulaMeasureService(db);
  const sample = new SampleFarmService(db, discovery, datasets, formulas);
  const loaded = await sample.load(principal('demo-farm'), 'inbox-proof');
  assert.equal(loaded.rawRecords, 960);

  console.log('CONNECTOR HUB INBOX PROOF PASS');
} finally {
  await db.onModuleDestroy().catch(() => undefined);
  postgres.stop();
}
