import 'reflect-metadata';
import { createHash, createHmac, generateKeyPairSync, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { signPlatformContextToken, type PlatformContextV1 } from '@gigalibs/auth-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.CONNECTOR_HUB_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

// WI-OI-120e (U3.2, P0-08): inbound webhooks over real HTTP on PostgreSQL, with the real migrations and the
// non-superuser runtime role (RLS forced). The endpoint ID decides the tenant; a header never does; the signature is
// checked over the exact bytes sent; a connection without a secret refuses.
integration('Connector Hub inbound webhooks on PostgreSQL', () => {
  const keys = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'der' },
  });
  const tenantA = `hub-wh-a-${randomUUID()}`;
  const tenantB = `hub-wh-b-${randomUUID()}`;
  let app: INestApplication;
  let base = '';
  let services: {
    db: import('../database/database.service.js').DatabaseService;
    connectors: import('../connectors/connectors.service.js').ConnectorsService;
  };
  const connA = { id: '', slug: '', endpoint: '', secret: '' };
  const connB = { id: '', slug: '', endpoint: '', secret: '' };

  const token = (tenantId: string, scopes: string[]) => {
    const now = Math.floor(Date.now() / 1000);
    return signPlatformContextToken(
      {
        iss: 'gigalibs-control-plane',
        aud: 'gigalibs-connector-hub-api',
        sub: `user-${tenantId}`,
        tenant_id: tenantId,
        session_id: randomUUID(),
        auth_version: 1,
        roles: ['MANAGER'],
        granted_scopes: scopes,
        persona_type: 'OPERATIONS_SUPERVISOR',
        org_scope: { mode: 'FLAT_TENANT' },
        entitlement: { module_key: 'connections', status: 'ENABLED', version: 'v1' },
        iat: now,
        exp: now + 300,
        jti: randomUUID(),
      } as PlatformContextV1,
      keys.privateKey,
    );
  };
  const sign = (secret: string, raw: string) => createHmac('sha256', secret).update(raw).digest('hex');
  const deliver = (endpoint: string, raw: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/connectors/v1/webhooks/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: raw,
    });
  const journal = async (tenantId: string, connectionId: string) =>
    (
      await services.db.queryWithTenant(
        tenantId,
        'SELECT idempotency_key, raw_payload, payload_sha256, headers FROM gigalibs_connectors.raw_ingestion_journal WHERE connection_id = $1 ORDER BY received_at',
        [connectionId],
      )
    ).rows;

  beforeAll(async () => {
    Object.assign(process.env, {
      CONNECTOR_HUB_API_HOST: '127.0.0.1',
      CONNECTOR_HUB_API_PORT: '4100',
      CONNECTOR_HUB_CORS_ORIGINS: 'http://localhost:5180',
      CONNECTORS_DATABASE_URL: databaseUrl,
      CONNECTOR_HUB_DATABASE_POOL_SIZE: '4',
      CONNECTOR_VAULT_KEY: 'integration-test-vault-key-that-is-long-enough',
      CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION: '9',
      CONNECTOR_HUB_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: keys.publicKey.toString('base64'),
      CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS: '127.0.0.1',
      CONNECTOR_HUB_ALLOW_INSECURE_OUTBOUND: 'true',
    });
    delete process.env.WORKFLOW_STUDIO_API_URL;
    const [{ Module }, { NestFactory }, { DatabaseModule }, { DatabaseService }, { WebhooksModule }, { VaultCryptoService }, { ConnectorsService }] =
      await Promise.all([
        import('@nestjs/common'),
        import('@nestjs/core'),
        import('../database/database.module.js'),
        import('../database/database.service.js'),
        import('./webhooks.module.js'),
        import('../connectors/vault-crypto.service.js'),
        import('../connectors/connectors.service.js'),
      ]);
    @Module({ imports: [DatabaseModule, WebhooksModule] })
    class WebhookProofModule {}
    app = await NestFactory.create(WebhookProofModule, { logger: false, rawBody: true });
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    const db = new DatabaseService();
    await expect(db.readiness()).resolves.toMatchObject({ migrationVersion: 9 });
    services = { db, connectors: new ConnectorsService(db, new VaultCryptoService()) };

    for (const [tenantId, target] of [
      [tenantA, connA],
      [tenantB, connB],
    ] as const) {
      const created = await services.connectors.createConnection(tenantId, {
        connector_code: 'SALESFORCE_CRM',
        name: 'Inbound proof',
        slug: `inbound-${tenantId.slice(-8)}`,
      });
      Object.assign(target, {
        id: created.id,
        slug: created.slug,
        endpoint: created.webhook_endpoint_id,
        secret: created.webhook_secret,
      });
    }
  });

  afterAll(async () => {
    await app?.close();
    await services?.db.onModuleDestroy();
  });

  it('gives each connection its own unguessable endpoint, shows the secret once, and never again', async () => {
    expect(connA.endpoint).toMatch(/^[0-9a-f-]{36}$/);
    expect(connA.endpoint).not.toBe(connB.endpoint);
    expect(connA.secret).toMatch(/^whsec_/);
    const read = await services.connectors.getConnectionById(tenantA, connA.id);
    expect(read).not.toHaveProperty('webhook_secret');
    expect(read).toMatchObject({ webhook_secret_configured: true, webhook_endpoint_id: connA.endpoint });
    const listed = await services.connectors.getConnections(tenantA);
    expect(listed[0]).not.toHaveProperty('webhook_secret');
  });

  it("refuses a delivery that only names a tenant, and stores nothing", async () => {
    const raw = JSON.stringify({ event_id: `forged-${randomUUID()}` });
    const forged = await deliver(connA.endpoint, raw, { 'X-Tenant-Id': tenantB });
    expect(forged.status).toBe(401);
    const wrongSecret = await deliver(connA.endpoint, raw, { 'X-Signature-SHA256': sign(connB.secret, raw), 'X-Tenant-Id': tenantA });
    expect(wrongSecret.status).toBe(401);
    expect(await journal(tenantA, connA.id)).toHaveLength(0);
  });

  it("accepts a signature over the exact bytes sent, files it under the endpoint's tenant, and stores it once", async () => {
    const eventId = `evt-${randomUUID()}`;
    const raw = `{ "event_id" : "${eventId}",   "amount": 12.50 }`;
    const headers = { 'X-Signature-SHA256': `sha256=${sign(connA.secret, raw)}`, 'X-Tenant-Id': tenantB, Authorization: 'Basic c2VjcmV0' };
    const first = await deliver(connA.endpoint, raw, headers);
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({ success: true, status: 'INGESTED', connection_id: connA.id });
    const replay = await deliver(connA.endpoint, raw, headers);
    await expect(replay.json()).resolves.toMatchObject({ status: 'DUPLICATE' });

    const stored = await journal(tenantA, connA.id);
    expect(stored).toHaveLength(1);
    // raw_payload is JSONB (normalised by PostgreSQL); the hash records the exact bytes that were signed.
    expect(stored[0]).toMatchObject({
      idempotency_key: eventId,
      raw_payload: { event_id: eventId, amount: 12.5 },
      payload_sha256: createHash('sha256').update(raw).digest('hex'),
    });
    expect(stored[0].headers).not.toHaveProperty('authorization');
    expect(await journal(tenantB, connA.id)).toHaveLength(0);
  });

  it('answers 404 for an unknown endpoint and 400 for one that is not a UUID', async () => {
    const raw = JSON.stringify({ event_id: 'x' });
    expect((await deliver(randomUUID(), raw, { 'X-Signature-SHA256': sign(connA.secret, raw) })).status).toBe(404);
    expect((await deliver(connA.slug, raw, { 'X-Signature-SHA256': sign(connA.secret, raw) })).status).toBe(400);
  });

  it('sends a test delivery only for the signed-in tenant, and only with connections:test', async () => {
    const send = (bearer: string, slug: string) =>
      fetch(`${base}/api/connectors/v1/connections/${slug}/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ event_type: 'test.ping' }),
      });
    const ok = await send(token(tenantA, ['connections:read', 'connections:test']), connA.slug);
    expect(ok.status).toBe(201);
    await expect(ok.json()).resolves.toMatchObject({ success: true, status: 'INGESTED', test_delivery: true, connection_id: connA.id });
    expect((await send(token(tenantB, ['connections:test']), connA.slug)).status).toBe(404);
    expect((await send(token(tenantA, ['connections:read']), connA.slug)).status).toBe(403);
    expect((await send('not-a-token', connA.slug)).status).toBe(401);
  });

  it('refuses every delivery once the connection has no signing secret', async () => {
    await services.db.queryWithTenant(tenantB, 'UPDATE gigalibs_connectors.tenant_connections SET webhook_secret = NULL WHERE id = $1', [connB.id]);
    const raw = JSON.stringify({ event_id: `after-${randomUUID()}` });
    expect((await deliver(connB.endpoint, raw, { 'X-Signature-SHA256': sign(connB.secret, raw) })).status).toBe(401);
    expect((await deliver(connB.endpoint, raw)).status).toBe(401);
    expect(await journal(tenantB, connB.id)).toHaveLength(0);
  });
});
