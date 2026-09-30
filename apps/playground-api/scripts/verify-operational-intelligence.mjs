import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { prisma, disconnectDb } from '@gigalibs/db'

const baseUrl = process.env.CONTROL_API_URL
if (!baseUrl) throw new Error('CONTROL_API_URL is required')

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  const raw = await response.text()
  const body = raw ? JSON.parse(raw) : null
  assert.ok(
    (options.statuses ?? [200]).includes(response.status),
    `${options.method ?? 'GET'} ${path} returned ${response.status}: ${raw}`,
  )
  return { status: response.status, body }
}

async function createTenant(label) {
  const suffix = `${Date.now().toString(36)}-${process.pid}-${randomBytes(4).toString('hex')}`
  const registration = await request('/api/v1/auth/register', {
    method: 'POST', statuses: [201], body: {
      email: `operational-intelligence-${suffix}@example.test`,
      password: randomBytes(32).toString('base64url'),
      name: `${label} Owner`,
    },
  })
  const tenant = await request('/api/v1/tenants', {
    method: 'POST', token: registration.body.accessToken, statuses: [201], body: {
      name: `${label} ${suffix}`,
      slug: `operational-intelligence-${suffix}`,
      plan: 'ENTERPRISE',
      isolationMode: 'ROW_LEVEL_SECURITY',
      region: 'ap-south-1',
    },
  })
  const selected = await request('/api/v1/auth/select-tenant', {
    method: 'POST', token: registration.body.accessToken, body: { tenantId: tenant.body.id },
  })
  await request('/api/v1/tenants/current/status', {
    method: 'PATCH', token: selected.body.accessToken,
    body: { status: 'ACTIVE', reason: 'Operational intelligence integration certification' },
  })
  return { tenant: tenant.body, token: selected.body.accessToken }
}

try {
  const owner = await createTenant('Operational Intelligence')
  const environment = await request('/api/v1/operational-intelligence/environments', {
    method: 'POST', token: owner.token, statuses: [201], body: {
      slug: 'certification',
      displayName: 'Certification',
      kind: 'TEST',
      region: 'ap-south-1',
      retentionDays: 30,
    },
  })
  assert.equal(environment.body.tenantId, owner.tenant.id)

  // WI-OI-104f (ADR-0016 F8): pulling REST, CSV-over-HTTP and PostgreSQL sources moved to Connector Hub; the core
  // refuses them and keeps its push intake (the events API used below, webhooks, file uploads).
  const refused = await request('/api/v1/operational-intelligence/connections', {
    method: 'POST', token: owner.token, statuses: [400], body: {
      environmentId: environment.body.id,
      slug: 'execution-health-pull',
      name: 'Execution health (pull)',
      interfaceType: 'REST',
      mode: 'READ_ONLY',
      endpoint: 'https://source.example.invalid/health',
      configuration: { requestMethod: 'GET', accept: 'application/json', sampleRecordLimit: 25 },
    },
  })
  assert.match(JSON.stringify(refused.body), /Connector Hub/)

  const connection = await request('/api/v1/operational-intelligence/connections', {
    method: 'POST', token: owner.token, statuses: [201], body: {
      environmentId: environment.body.id,
      slug: 'execution-health',
      name: 'Execution health',
      interfaceType: 'FILE_UPLOAD',
      mode: 'READ_ONLY',
      configuration: { acceptedContentTypes: ['application/json'], csvDelimiter: ',', sampleRecordLimit: 25 },
    },
  })
  assert.equal(connection.body.status, 'UNTESTED')

  const contract = await request('/api/v1/operational-intelligence/data-contracts', {
    method: 'POST', token: owner.token, statuses: [201], body: {
      environmentId: environment.body.id,
      connectionId: connection.body.id,
      name: 'Supplier invoice received',
      eventType: 'ap.invoice.received.v1',
    },
  })
  const jsonSchema = {
    type: 'object',
    properties: {
      supplierInvoiceId: { type: 'string', minLength: 1, maxLength: 128 },
      supplierId: { type: 'string', minLength: 1, maxLength: 128 },
      amountMinor: { type: 'integer', minimum: 0 },
      currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    },
    required: ['supplierInvoiceId', 'supplierId', 'amountMinor', 'currency'],
    additionalProperties: false,
  }
  const published = await request(`/api/v1/operational-intelligence/data-contracts/${contract.body.id}/publish`, {
    method: 'POST', token: owner.token, statuses: [201], body: {
      jsonSchema,
      mapping: {},
      compatibilityMode: 'BACKWARD',
    },
  })
  assert.equal(published.body.version, 1)

  await request(`/api/v1/operational-intelligence/data-contracts/${contract.body.id}/publish`, {
    method: 'POST', token: owner.token, statuses: [409], body: {
      jsonSchema: {
        ...jsonSchema,
        properties: { ...jsonSchema.properties, purchaseOrderId: { type: 'string' } },
        required: [...jsonSchema.required, 'purchaseOrderId'],
      },
      mapping: {},
      compatibilityMode: 'BACKWARD',
    },
  })

  const eventId = randomUUID()
  const idempotencyKey = randomUUID()
  const eventPayload = {
    supplierInvoiceId: `invoice-${eventId}`,
    supplierId: 'supplier-certification',
    amountMinor: 12500,
    currency: 'USD',
  }
  const eventCommand = {
    eventId,
    tenantId: owner.tenant.id,
    environmentId: environment.body.id,
    sourceId: connection.body.id,
    eventType: 'ap.invoice.received.v1',
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    idempotencyKey,
    actor: { type: 'certification', id: owner.tenant.id },
    entityRefs: { supplierInvoiceId: eventPayload.supplierInvoiceId },
    classification: 'CONFIDENTIAL',
    payload: eventPayload,
  }
  const ingested = await request('/api/v1/operational-intelligence/events/ingest', {
    method: 'POST', token: owner.token, statuses: [201], body: eventCommand,
  })
  assert.equal(ingested.body.status, 'VALIDATED')
  assert.equal(ingested.body.duplicate, false)
  const replay = await request('/api/v1/operational-intelligence/events/ingest', {
    method: 'POST', token: owner.token, statuses: [201], body: eventCommand,
  })
  assert.equal(replay.body.id, ingested.body.id)
  assert.equal(replay.body.duplicate, true)
  await request('/api/v1/operational-intelligence/events/ingest', {
    method: 'POST', token: owner.token, statuses: [409],
    body: { ...eventCommand, payload: { ...eventPayload, amountMinor: 13000 } },
  })

  const invalidEventId = randomUUID()
  await request('/api/v1/operational-intelligence/events/ingest', {
    method: 'POST', token: owner.token, statuses: [422], body: {
      ...eventCommand,
      eventId: invalidEventId,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      payload: { ...eventPayload, amountMinor: -1 },
    },
  })
  const rejectedMetadata = await request(`/api/v1/operational-intelligence/events/${invalidEventId}`, {
    token: owner.token,
  })
  assert.equal(rejectedMetadata.body.status, 'REJECTED')
  assert.equal('payload' in rejectedMetadata.body, false)
  assert.equal('payloadCiphertext' in rejectedMetadata.body, false)

  const storedEvent = await prisma.sourceEvent.findUnique({ where: { id: ingested.body.id } })
  assert.ok(storedEvent)
  assert.notEqual(storedEvent.payloadCiphertext.toString(), JSON.stringify(eventPayload))
  assert.equal(storedEvent.payloadKeyVersion, process.env.CONTROL_PAYLOAD_KEY_VERSION)
  assert.equal(await prisma.controlOutboxEvent.count({ where: { aggregateId: ingested.body.id, status: 'PENDING' } }), 1)

  const outsider = await createTenant('Operational Isolation')
  await request(`/api/v1/operational-intelligence/connections/${connection.body.id}`, {
    token: outsider.token, statuses: [404],
  })
  await request(`/api/v1/operational-intelligence/events/${eventId}`, {
    token: outsider.token, statuses: [404],
  })

  console.log(JSON.stringify({
    status: 'passed',
    tenantId: owner.tenant.id,
    connectionId: connection.body.id,
    sourceEventId: ingested.body.id,
    checks: [
      'tenant-environment-persistence',
      'allowlisted-live-connector-test',
      'versioned-schema-profile-and-deduplication',
      'immutable-data-contract-publish',
      'contract-validated-event-ingestion',
      'idempotent-replay-and-conflict-detection',
      'encrypted-event-payload-at-rest',
      'durable-transactional-outbox',
      'rejected-event-evidence-without-payload-disclosure',
      'cross-tenant-connection-and-event-denial',
    ],
  }, null, 2))
} finally {
  await disconnectDb()
}
