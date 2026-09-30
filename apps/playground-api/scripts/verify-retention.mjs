import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { disconnectDb, prisma } from '@gigalibs/db';

try {
  process.loadEnvFile?.('../../.env');
} catch {}

const baseUrl = process.env.CONTROL_API_URL ?? process.env.CONTROL_PLANE_API_URL;
if (!baseUrl) throw new Error('CONTROL_API_URL or CONTROL_PLANE_API_URL is required');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  assert.ok(
    (options.statuses ?? [200]).includes(response.status),
    `${options.method ?? 'GET'} ${path} returned ${response.status}: ${raw}`,
  );
  return body;
}

const suffix = `${Date.now().toString(36)}-${process.pid}-${randomBytes(4).toString('hex')}`;

try {
  const registration = await request('/api/v1/auth/register', {
    method: 'POST',
    statuses: [201],
    body: {
      email: `retention-certification-${suffix}@example.test`,
      password: randomBytes(32).toString('base64url'),
      name: 'Retention Certification Owner',
    },
  });
  const tenant = await request('/api/v1/tenants', {
    method: 'POST',
    token: registration.accessToken,
    statuses: [201],
    body: {
      name: `Retention certification ${suffix}`,
      slug: `retention-certification-${suffix}`,
      plan: 'ENTERPRISE',
      isolationMode: 'ROW_LEVEL_SECURITY',
      region: 'ap-south-1',
    },
  });
  const selected = await request('/api/v1/auth/select-tenant', {
    method: 'POST',
    token: registration.accessToken,
    body: { tenantId: tenant.id },
  });
  const token = selected.accessToken;
  await request('/api/v1/tenants/current/status', {
    method: 'PATCH',
    token,
    body: { status: 'ACTIVE', reason: 'Retention integration certification' },
  });

  const environment = await request('/api/v1/operational-intelligence/environments', {
    method: 'POST',
    token,
    statuses: [201],
    body: {
      slug: 'retention-certification',
      displayName: 'Retention certification',
      kind: 'TEST',
      region: 'ap-south-1',
      retentionDays: 1,
    },
  });
  const connection = await request('/api/v1/operational-intelligence/connections', {
    method: 'POST',
    token,
    statuses: [201],
    body: {
      environmentId: environment.id,
      slug: 'retention-source',
      name: 'Retention source',
      // WI-OI-104f: the core no longer pulls REST sources; retention is certified on pushed events.
      interfaceType: 'FILE_UPLOAD',
      mode: 'READ_ONLY',
      configuration: { acceptedContentTypes: ['application/json'], csvDelimiter: ',', sampleRecordLimit: 1 },
    },
  });
  const contract = await request('/api/v1/operational-intelligence/data-contracts', {
    method: 'POST',
    token,
    statuses: [201],
    body: {
      environmentId: environment.id,
      connectionId: connection.id,
      name: 'Retention certification event',
      eventType: 'retention.certification.v1',
    },
  });
  const contractVersion = await request(
    `/api/v1/operational-intelligence/data-contracts/${contract.id}/publish`,
    {
      method: 'POST',
      token,
      statuses: [201],
      body: {
        jsonSchema: {
          type: 'object',
          properties: { recordId: { type: 'string' } },
          required: ['recordId'],
          additionalProperties: false,
        },
        mapping: {},
        compatibilityMode: 'BACKWARD',
      },
    },
  );

  const eventId = randomUUID();
  const { PayloadCryptoService, sourceEventAuthenticatedContext } = await import(
    '../dist/payload-crypto.service.js'
  );
  const encrypted = new PayloadCryptoService().encrypt(
    { recordId: randomUUID() },
    sourceEventAuthenticatedContext(tenant.id, eventId, 'retention.certification.v1', 1),
  );
  const event = await prisma.sourceEvent.create({
    data: {
      eventId,
      tenantId: tenant.id,
      environmentId: environment.id,
      sourceConnectionId: connection.id,
      dataContractVersionId: contractVersion.id,
      eventType: 'retention.certification.v1',
      eventVersion: 1,
      occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1_000),
      receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000),
      correlationId: randomUUID(),
      idempotencyKey: randomUUID(),
      actorType: 'certification',
      actorId: tenant.id,
      entityRefs: { recordId: eventId },
      classification: 'RESTRICTED',
      payloadCiphertext: Uint8Array.from(encrypted.ciphertext),
      payloadIv: Uint8Array.from(encrypted.iv),
      payloadAuthTag: Uint8Array.from(encrypted.authTag),
      payloadHash: encrypted.hash,
      payloadKeyVersion: encrypted.keyVersion,
      status: 'PROCESSED',
      processedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000),
    },
  });

  const hold = await request('/api/v1/operational-intelligence/retention-holds', {
    method: 'POST',
    token,
    statuses: [201],
    body: {
      environmentId: environment.id,
      reason: 'Preserve source payload while retention legal-hold behavior is certified.',
    },
  });
  const { DataRetentionWorker } = await import('../dist/data-retention.worker.js');
  const worker = new DataRetentionWorker();
  await worker.tick();
  const heldEvent = await prisma.sourceEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(heldEvent.payloadPurgedAt, null);
  assert.ok(heldEvent.payloadCiphertext.length > 0);

  await request(`/api/v1/operational-intelligence/retention-holds/${hold.id}/release`, {
    method: 'POST',
    token,
    statuses: [201],
    body: { reason: 'Retention legal-hold certification completed successfully.' },
  });
  await worker.tick();
  const purgedEvent = await prisma.sourceEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.ok(purgedEvent.payloadPurgedAt);
  assert.equal(purgedEvent.payloadCiphertext.length, 0);
  assert.equal(purgedEvent.payloadIv.length, 0);
  assert.equal(purgedEvent.payloadAuthTag.length, 0);
  assert.equal(purgedEvent.payloadHash, event.payloadHash);

  const metadata = await request(`/api/v1/operational-intelligence/events/${eventId}`, { token });
  assert.ok(metadata.payloadPurgedAt);
  assert.equal(metadata.payloadHash, event.payloadHash);
  assert.equal('payloadCiphertext' in metadata, false);
  const execution = await prisma.dataRetentionExecution.findFirst({
    where: { tenantId: tenant.id, environmentId: environment.id, status: 'SUCCEEDED' },
    orderBy: { startedAt: 'desc' },
  });
  assert.equal(execution?.sourceEventsPurged, 1);
  const audit = await prisma.auditLog.findFirst({
    where: {
      tenantId: tenant.id,
      resource: 'source-event-payload-retention',
      resourceId: execution?.id,
    },
  });
  assert.ok(audit);

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        tenantId: tenant.id,
        environmentId: environment.id,
        sourceEventId: event.id,
        checks: [
          'tenant-scoped-legal-hold-create-and-release',
          'active-hold-blocks-payload-erasure',
          'expired-encrypted-payload-bytes-erased',
          'immutable-payload-hash-retained',
          'retention-execution-evidence-persisted',
          'retention-audit-evidence-persisted',
          'event-metadata-reports-purge-without-payload-disclosure',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await disconnectDb();
}
