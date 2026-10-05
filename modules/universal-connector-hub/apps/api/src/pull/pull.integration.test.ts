import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { verifyRelayToken } from '@gigalibs/auth-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.CONNECTOR_HUB_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

// WI-OI-104d: the Hub's pull path end to end on PostgreSQL with the real migrations and the non-superuser runtime role
// (RLS forced): connection with a pull source, encrypted OAuth2 client, paging with a watermark, quarantine, dedupe,
// the lease, failures, and tenant isolation.
integration('Connector Hub pulls on PostgreSQL', () => {
  const records: Array<Record<string, string | number>> = [
    { id: 'h-1', crop: 'maize', kg: 1200, updated_at: '2026-09-21T00:00:00Z' },
    { id: 'h-2', crop: 'rice', kg: 800, updated_at: '2026-09-22T00:00:00Z' },
    { id: 'h-3', crop: 'maize', kg: 950, updated_at: '2026-09-23T00:00:00Z' },
    { crop: 'no id', updated_at: '2026-09-23T00:00:00Z' },
    { id: 'h-4', crop: 'wheat', kg: 400, updated_at: '2026-09-24T00:00:00Z' },
  ];
  const seen: string[] = [];
  let failing = false;
  let server: Server;
  let base = '';
  let services: {
    connectors: import('../connectors/connectors.service.js').ConnectorsService;
    sync: import('../sync/sync.service.js').SyncService;
    db: import('../database/database.service.js').DatabaseService;
  };
  const tenantA = `hub-a-${randomUUID()}`;
  const tenantB = `hub-b-${randomUUID()}`;

  beforeAll(async () => {
    server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://local');
      const send = (status: number, value: unknown) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
      if (url.pathname === '/oauth/token') {
        let body = '';
        for await (const chunk of request) body += chunk;
        const form = new URLSearchParams(body);
        return form.get('client_secret') === 'farm-secret' ? send(200, { access_token: 'live-token', expires_in: 3600 }) : send(401, { error: 'invalid_client' });
      }
      if (request.headers.authorization !== 'Bearer live-token') return send(401, { error: 'unauthorized' });
      if (failing) return send(500, { error: 'down' });
      seen.push(url.search);
      const since = url.searchParams.get('changed_since');
      const page = Number(url.searchParams.get('page'));
      const visible = records.filter((record) => !since || String(record.updated_at) >= since);
      return send(200, { data: visible.slice((page - 1) * 2, page * 2) });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    Object.assign(process.env, {
      CONNECTOR_HUB_API_HOST: '127.0.0.1',
      CONNECTOR_HUB_API_PORT: '4100',
      CONNECTOR_HUB_CORS_ORIGINS: 'http://localhost:5180',
      CONNECTORS_DATABASE_URL: databaseUrl,
      CONNECTOR_HUB_DATABASE_POOL_SIZE: '4',
      CONNECTOR_VAULT_KEY: 'integration-test-vault-key-that-is-long-enough',
      CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION: '9',
      CONNECTOR_HUB_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS: '127.0.0.1',
      CONNECTOR_HUB_ALLOW_INSECURE_OUTBOUND: 'true',
    });
    const [{ DatabaseService }, { VaultCryptoService }, { ConnectorsService }, { SyncService }] = await Promise.all([
      import('../database/database.service.js'),
      import('../connectors/vault-crypto.service.js'),
      import('../connectors/connectors.service.js'),
      import('../sync/sync.service.js'),
    ]);
    const db = new DatabaseService();
    await expect(db.readiness()).resolves.toMatchObject({ migrationVersion: 9 });
    const vault = new VaultCryptoService();
    services = { db, connectors: new ConnectorsService(db, vault), sync: new SyncService(db, vault) };
  });

  afterAll(async () => {
    await services?.db.onModuleDestroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const source = () => ({
    baseUrl: base,
    resourcePath: '/v1/harvests',
    recordsPath: 'data',
    watermark: { field: 'updated_at', param: 'changed_since', format: 'iso' },
    paging: { style: 'page', size: 2 },
    auth: { kind: 'oauth2-client-credentials', tokenUrl: `${base}/oauth/token`, clientAuth: 'body' },
  });

  it('pulls every page as the stored OAuth2 client, quarantines the unidentifiable record, and records the watermark', async () => {
    const { connection } = await services.connectors.createConnection(tenantA, {
      connector_code: 'GENERIC_REST_PULL',
      name: 'Farm harvests',
      slug: 'farm-harvests',
      auth_type: 'OAUTH2_CLIENT_CREDENTIALS',
      configuration: { source: source() },
    }).then((created) => ({ connection: created }));
    await expect(services.sync.triggerSync(tenantA, connection.id)).rejects.toMatchObject({ status: 424 });
    expect(await services.connectors.storePullCredentials(tenantA, connection.id, { kind: 'oauth2-client-credentials', clientId: 'farm', clientSecret: 'farm-secret' }))
      .toEqual({ success: true, connection_id: connection.id, kind: 'oauth2-client-credentials' });
    const stored = await services.db.queryWithTenant(tenantA, 'SELECT encrypted_data, credential_type FROM gigalibs_connectors.connector_credentials WHERE connection_id = $1', [connection.id]);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].encrypted_data).not.toContain('farm-secret');

    const first = await services.sync.triggerSync(tenantA, connection.id);
    expect(first).toMatchObject({ records_synced: 4, records_quarantined: 1, duplicates_skipped: 0, pages: 3, truncated: false, cursor_before: null, cursor_after: '2026-09-24T00:00:00.000Z' });
    const quarantine = await services.sync.listQuarantine(tenantA, connection.id);
    expect(quarantine).toMatchObject([{ reason: 'The record has no usable id at "id".', raw_payload: { crop: 'no id' } }]);
    const journal = await services.db.queryWithTenant(tenantA, "SELECT count(*)::int AS n FROM gigalibs_connectors.raw_ingestion_journal WHERE connection_id = $1 AND event_type = 'generic_rest_pull.pulled'", [connection.id]);
    expect(journal.rows[0].n).toBe(4);
  });

  it('pulls only changes since the watermark, skips what it already has, and journals a changed record as a new version', async () => {
    const id = 'farm-harvests';
    seen.length = 0;
    const second = await services.sync.triggerSync(tenantA, id, {}, 'schedule:abc');
    expect(seen[0]).toContain('changed_since=2026-09-24T00%3A00%3A00.000Z');
    expect(second).toMatchObject({ records_synced: 0, duplicates_skipped: 1, cursor_after: '2026-09-24T00:00:00.000Z' });
    records[4] = { ...records[4], kg: 420, updated_at: '2026-09-25T00:00:00Z' };
    expect(await services.sync.triggerSync(tenantA, id)).toMatchObject({ records_synced: 1, cursor_after: '2026-09-25T00:00:00.000Z' });
    const full = await services.sync.triggerSync(tenantA, id, { from_start: true });
    expect(full).toMatchObject({ records_synced: 0, duplicates_skipped: 4, records_quarantined: 1 });
    const jobs = (await services.sync.listSyncJobs(tenantA, id)) as Array<{ job_type: string; status: string }>;
    expect(jobs.map((job) => job.job_type)).toContain('SCHEDULED');
    expect(jobs.every((job) => job.status === 'COMPLETED' || job.status === 'FAILED')).toBe(true);
  });

  it('runs one pull per connection at a time, and records a failure without moving the watermark', async () => {
    const id = 'farm-harvests';
    await services.db.queryWithTenant(tenantA, "UPDATE gigalibs_connectors.tenant_connections SET sync_lease_expires_at = now() + interval '1 minute' WHERE slug = $1", [id]);
    await expect(services.sync.triggerSync(tenantA, id)).rejects.toMatchObject({ status: 409 });
    await services.db.queryWithTenant(tenantA, "UPDATE gigalibs_connectors.tenant_connections SET sync_lease_expires_at = now() - interval '1 second' WHERE slug = $1", [id]);
    failing = true;
    await expect(services.sync.triggerSync(tenantA, id)).rejects.toMatchObject({ status: 502 });
    failing = false;
    const [latest] = (await services.sync.listSyncJobs(tenantA, id)) as Array<{ status: string; error_details: { kind: string; status: number }; cursor_after: string | null }>;
    expect(latest).toMatchObject({ status: 'FAILED', error_details: { kind: 'unavailable', status: 500 }, cursor_after: null });
    const connection = await services.connectors.getConnectionById(tenantA, id);
    expect([connection.status, connection.sync_lease_expires_at]).toEqual(['ERROR', null]);
    expect(await services.sync.triggerSync(tenantA, id)).toMatchObject({ cursor_before: '2026-09-25T00:00:00.000Z', records_synced: 0 });
  });

  it('keeps another workspace out, and refuses a source off the allowlist or without one', async () => {
    await expect(services.sync.listSyncJobs(tenantB, 'farm-harvests')).resolves.toEqual([]);
    await expect(services.sync.listQuarantine(tenantB, 'farm-harvests')).resolves.toEqual([]);
    await expect(services.sync.triggerSync(tenantB, 'farm-harvests')).rejects.toMatchObject({ status: 404 });
    await services.connectors.configureSource(tenantA, 'farm-harvests', { ...source(), baseUrl: 'https://not-allowed.example' });
    await expect(services.sync.triggerSync(tenantA, 'farm-harvests')).rejects.toMatchObject({ status: 424 });
    await expect(services.connectors.configureSource(tenantA, 'farm-harvests', { ...source(), paging: { style: 'sideways' } })).rejects.toMatchObject({ status: 400 });
    const { connection } = await services.connectors.createConnection(tenantA, { connector_code: 'CUSTOM_WEBHOOK', name: 'Push only', slug: 'push-only' }).then((created) => ({ connection: created }));
    await expect(services.sync.triggerSync(tenantA, connection.id)).rejects.toThrow('no pull source');
  });

  // WI-OI-104e: a connection that sends to Analytics writes one outbox fact per newly journalled record, and the
  // relay signs and delivers each to the Analytics inbox; a message the inbox refuses is dead-lettered.
  it('relays newly pulled records to the Analytics inbox, once, and dead-letters a refused message', async () => {
    const { signingKey, verify } = relayKeys();
    const received: Array<{ sourceId: string; connectionName: string; record: unknown; tenantId: string }> = [];
    const inbox = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      const claims = verify(String(request.headers.authorization ?? '').replace('Bearer ', ''), body);
      const envelope = JSON.parse(body) as { tenantId: string; eventType: string; payload: { sourceId: string; connectionName: string; record: unknown } };
      if (!claims || envelope.eventType !== 'CONNECTOR_RECORD_PULLED_V1') return response.writeHead(401).end();
      if (envelope.payload.sourceId === 'h-2') return response.writeHead(400).end('{"message":"refused"}');
      received.push({ ...envelope.payload, tenantId: envelope.tenantId });
      response.writeHead(202).end('{}');
    });
    await new Promise<void>((resolve) => inbox.listen(0, '127.0.0.1', resolve));
    try {
      const { connection } = await services.connectors
        .createConnection(tenantA, { connector_code: 'GENERIC_REST_PULL', name: 'Relay feed', slug: 'relay-feed', configuration: { source: source() } })
        .then((created) => ({ connection: created }));
      await services.connectors.storePullCredentials(tenantA, connection.id, { kind: 'oauth2-client-credentials', clientId: 'farm', clientSecret: 'farm-secret' });
      await expect(services.connectors.setDelivery(tenantA, connection.id, { analytics: 'yes' })).rejects.toMatchObject({ status: 400 });
      await services.connectors.setDelivery(tenantA, connection.id, { analytics: true });
      const pulled = (await services.sync.triggerSync(tenantA, connection.id)) as { records_synced: number };
      const outbox = async () =>
        (await services.db.queryWithTenant(tenantA, `SELECT status, payload->>'sourceId' AS source_id FROM gigalibs_connectors.outbox_events WHERE payload->>'hubConnectionId' = $1 ORDER BY created_at`, [connection.id])).rows as Array<{ status: string; source_id: string }>;
      expect((await outbox()).length).toBe(pulled.records_synced);
      await services.sync.triggerSync(tenantA, connection.id, { from_start: true });
      expect((await outbox()).length).toBe(pulled.records_synced);
      expect(await services.db.queryWithTenant(tenantB, 'SELECT count(*)::int AS n FROM gigalibs_connectors.outbox_events').then((result) => result.rows[0].n)).toBe(0);

      const { AnalyticsOutboxRelay } = await import('../relay/analytics-relay.js');
      const relay = new AnalyticsOutboxRelay(services.db, {
        inboxPublicKey: null,
        outbound: { targetOrigin: `http://127.0.0.1:${(inbox.address() as AddressInfo).port}`, privateKey: signingKey },
        intervalMs: 1000,
      });
      await relay.tick();
      const settled = await outbox();
      expect(settled.filter((row) => row.status === 'PUBLISHED').length).toBe(pulled.records_synced - 1);
      expect(settled.find((row) => row.source_id === 'h-2')?.status).toBe('FAILED');
      expect(received.map((message) => message.sourceId).sort()).toEqual(settled.filter((row) => row.status === 'PUBLISHED').map((row) => row.source_id).sort());
      expect(received[0]).toMatchObject({ tenantId: tenantA, connectionName: 'Relay feed', record: expect.objectContaining({ crop: expect.any(String) }) });
      expect(await relay.tick()).toBe(0);
    } finally {
      await new Promise<void>((resolve) => inbox.close(() => resolve()));
    }
  });

  // WI-OI-105e: a connection can send its records to Geospatial as places, read with the connection's field names.
  it('sends newly pulled records to the Geospatial inbox as places, with their own relay key', async () => {
    const { signingKey, verify } = relayKeys('gigalibs-geospatial-inbox');
    const received: Array<{ sourceId: string; place: Record<string, unknown> }> = [];
    const inbox = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      const claims = verify(String(request.headers.authorization ?? '').replace('Bearer ', ''), body);
      const envelope = JSON.parse(body) as { eventType: string; payload: { sourceId: string; place: Record<string, unknown> } };
      if (!claims || envelope.eventType !== 'CONNECTOR_PLACE_PULLED_V1') return response.writeHead(401).end();
      received.push(envelope.payload);
      response.writeHead(202).end('{}');
    });
    await new Promise<void>((resolve) => inbox.listen(0, '127.0.0.1', resolve));
    try {
      const connection = await services.connectors.createConnection(tenantA, {
        connector_code: 'GENERIC_REST_PULL',
        name: 'Land feed',
        slug: 'land-feed',
        configuration: { source: source() },
      });
      await services.connectors.storePullCredentials(tenantA, connection.id, { kind: 'oauth2-client-credentials', clientId: 'farm', clientSecret: 'farm-secret' });
      await expect(services.connectors.setDelivery(tenantA, connection.id, { places: { nodeTypeCode: 'FIELD', nameField: 'crop', geometryField: 'a..b' } })).rejects.toMatchObject({ status: 400 });
      const set = await services.connectors.setDelivery(tenantA, connection.id, { places: { nodeTypeCode: 'FIELD', nameField: 'crop', geometryField: 'geom', codeField: 'id' } });
      expect(set).toMatchObject({ deliver_to_analytics: false, place_delivery: { nodeTypeCode: 'FIELD', geometryField: 'geom' } });
      const pulled = (await services.sync.triggerSync(tenantA, connection.id)) as { records_synced: number };
      const facts = await services.db.queryWithTenant<{ event_type: string; aggregate_type: string; aggregate_version: number }>(
        tenantA,
        `SELECT event_type, aggregate_type, aggregate_version FROM gigalibs_connectors.outbox_events WHERE payload->>'hubConnectionId' = $1`,
        [connection.id],
      );
      expect(facts.rows.length).toBe(pulled.records_synced);
      expect(facts.rows.every((fact) => fact.event_type === 'CONNECTOR_PLACE_PULLED_V1' && fact.aggregate_type === 'connector_place' && fact.aggregate_version === 1)).toBe(true);

      const { AnalyticsOutboxRelay, GeospatialPlaceRelay } = await import('../relay/analytics-relay.js');
      const outbound = { targetOrigin: `http://127.0.0.1:${(inbox.address() as AddressInfo).port}`, privateKey: signingKey };
      expect(await new AnalyticsOutboxRelay(services.db, { inboxPublicKey: null, outbound, intervalMs: 1000 }).tick()).toBe(0);
      expect(await new GeospatialPlaceRelay(services.db, { inboxPublicKey: null, outbound, intervalMs: 1000 }).tick()).toBe(pulled.records_synced);
      expect(received.find((fact) => fact.sourceId === 'h-1')?.place).toEqual({ nodeTypeCode: 'FIELD', code: 'h-1', name: 'maize', geometry: null, parentSourceId: null });
      await services.connectors.setDelivery(tenantA, connection.id, { places: null });
      await services.sync.triggerSync(tenantA, connection.id, { from_start: true });
      expect((await services.db.queryWithTenant(tenantA, `SELECT 1 FROM gigalibs_connectors.outbox_events WHERE payload->>'hubConnectionId' = $1`, [connection.id])).rows.length).toBe(pulled.records_synced);
    } finally {
      await new Promise<void>((resolve) => inbox.close(() => resolve()));
    }
  });
});

function relayKeys(audience = 'gigalibs-analytics-inbox') {
  const pair = generateKeyPairSync('ed25519');
  const publicPem = pair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
  return {
    signingKey: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    verify: (token: string, body: string) => {
      try {
        return verifyRelayToken(token, publicPem, { audience, source: 'connector-hub', body });
      } catch {
        return null;
      }
    },
  };
}
