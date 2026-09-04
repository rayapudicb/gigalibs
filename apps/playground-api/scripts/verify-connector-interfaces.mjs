import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { prisma, disconnectDb } from '@gigalibs/db'

try { process.loadEnvFile?.('../../.env') } catch {}

const baseUrl = process.env.CONTROL_API_URL ?? process.env.CONTROL_PLANE_API_URL
const webhookSecret = process.env.EXECUTION_EVENT_SIGNING_SECRET
const databaseEndpoint = process.env.CONNECTOR_CERT_DATABASE_ENDPOINT

if (!baseUrl) throw new Error('CONTROL_API_URL or CONTROL_PLANE_API_URL is required')
if (!webhookSecret) throw new Error('EXECUTION_EVENT_SIGNING_SECRET is required')
if (!databaseEndpoint) throw new Error('CONNECTOR_CERT_DATABASE_ENDPOINT is required')

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }),
  })
  const raw = await response.text()
  let body = null
  if (raw) {
    try { body = JSON.parse(raw) } catch { body = raw }
  }
  assert.ok(
    (options.statuses ?? [200]).includes(response.status),
    `${options.method ?? 'GET'} ${path} returned ${response.status}: ${raw}`,
  )
  return { status: response.status, body }
}

async function createTenant(label) {
  const suffix = `${Date.now().toString(36)}-${process.pid}-${randomBytes(4).toString('hex')}`
  const registration = await request('/api/v1/auth/register', {
    method: 'POST',
    statuses: [201],
    body: {
      email: `connector-certification-${suffix}@example.test`,
      password: randomBytes(32).toString('base64url'),
      name: `${label} Owner`,
    },
  })
  const tenant = await request('/api/v1/tenants', {
    method: 'POST',
    token: registration.body.accessToken,
    statuses: [201],
    body: {
      name: `${label} ${suffix}`,
      slug: `connector-certification-${suffix}`,
      plan: 'ENTERPRISE',
      isolationMode: 'ROW_LEVEL_SECURITY',
      region: 'ap-south-1',
    },
  })
  const selected = await request('/api/v1/auth/select-tenant', {
    method: 'POST',
    token: registration.body.accessToken,
    body: { tenantId: tenant.body.id },
  })
  await request('/api/v1/tenants/current/status', {
    method: 'PATCH',
    token: selected.body.accessToken,
    body: { status: 'ACTIVE', reason: 'Connector interface integration certification' },
  })
  return { tenant: tenant.body, token: selected.body.accessToken }
}

async function createContract(token, environmentId, connectionId, eventType, properties) {
  const contract = await request('/api/v1/operational-intelligence/data-contracts', {
    method: 'POST',
    token,
    statuses: [201],
    body: {
      environmentId,
      connectionId,
      name: `Contract for ${eventType}`,
      eventType,
    },
  })
  await request(`/api/v1/operational-intelligence/data-contracts/${contract.body.id}/publish`, {
    method: 'POST',
    token,
    statuses: [201],
    body: {
      jsonSchema: {
        type: 'object',
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
      },
      mapping: {},
      compatibilityMode: 'BACKWARD',
    },
  })
}

function storageClient() {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION,
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.STORAGE_SECRET_KEY,
    },
  })
}

async function ensureCertificationBucket(client) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: process.env.STORAGE_BUCKET }))
  } catch (error) {
    if (process.env.CONNECTOR_CERTIFICATION_CREATE_STORAGE_BUCKET !== 'true') throw error
    await client.send(new CreateBucketCommand({ Bucket: process.env.STORAGE_BUCKET }))
  }
}

try {
  const storage = storageClient()
  await ensureCertificationBucket(storage)

  const owner = await createTenant('Connector Interfaces')
  const environment = await request('/api/v1/operational-intelligence/environments', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      slug: 'connector-certification',
      displayName: 'Connector Certification',
      kind: 'TEST',
      region: 'ap-south-1',
      retentionDays: 30,
    },
  })

  const webhookCredential = await request(
    '/api/v1/operational-intelligence/credential-references',
    {
      method: 'POST',
      token: owner.token,
      statuses: [201],
      body: {
        environmentId: environment.body.id,
        label: 'Webhook signing secret',
        provider: 'DEPLOYMENT_SECRET',
        reference: 'env://EXECUTION_EVENT_SIGNING_SECRET',
        authType: 'HMAC_SHA256',
      },
    },
  )
  assert.equal(webhookCredential.body.referenceConfigured, true)
  assert.equal('reference' in webhookCredential.body, false)

  const databaseCredential = await request(
    '/api/v1/operational-intelligence/credential-references',
    {
      method: 'POST',
      token: owner.token,
      statuses: [201],
      body: {
        environmentId: environment.body.id,
        label: 'Read-only certification database',
        provider: 'DEPLOYMENT_SECRET',
        reference: 'env://CONNECTOR_CERT_DATABASE_CREDENTIAL',
        authType: 'USERNAME_PASSWORD',
      },
    },
  )
  assert.equal('reference' in databaseCredential.body, false)

  const webhook = await request('/api/v1/operational-intelligence/connections', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      environmentId: environment.body.id,
      credentialReferenceId: webhookCredential.body.id,
      slug: 'signed-operational-events',
      name: 'Signed operational events',
      interfaceType: 'WEBHOOK',
      mode: 'READ_ONLY',
      configuration: {
        signatureHeader: 'x-gigalibs-signature',
        timestampHeader: 'x-gigalibs-timestamp',
        maxSkewSeconds: 300,
        sampleRecordLimit: 25,
      },
    },
  })
  assert.equal(
    webhook.body.endpoint,
    `/api/v1/operational-intelligence/webhooks/${webhook.body.id}`,
  )
  const webhookTest = await request(
    `/api/v1/operational-intelligence/connections/${webhook.body.id}/test`,
    { method: 'POST', token: owner.token, statuses: [201] },
  )
  assert.equal(webhookTest.body.status, 'READY')
  assert.equal(webhookTest.body.checks.signatureVerificationConfigured, true)

  const webhookEventType = 'operations.telemetry-observed.v1'
  await createContract(
    owner.token,
    environment.body.id,
    webhook.body.id,
    webhookEventType,
    {
      assetId: { type: 'string', minLength: 1, maxLength: 128 },
      metricName: { type: 'string', minLength: 1, maxLength: 128 },
      value: { type: 'number' },
      unit: { type: 'string', minLength: 1, maxLength: 32 },
    },
  )
  const webhookEventId = randomUUID()
  const webhookEnvelope = {
    eventId: webhookEventId,
    eventType: webhookEventType,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
    actor: { type: 'source-system', id: 'connector-certification' },
    entityRefs: { assetId: 'asset-certification' },
    classification: 'INTERNAL',
    payload: {
      assetId: 'asset-certification',
      metricName: 'queueDepth',
      value: 17,
      unit: 'messages',
    },
  }
  const webhookRaw = JSON.stringify(webhookEnvelope)
  const webhookTimestamp = String(Math.floor(Date.now() / 1_000))
  const webhookSignature = `sha256=${createHmac('sha256', webhookSecret)
    .update(webhookTimestamp)
    .update('.')
    .update(webhookRaw)
    .digest('hex')}`
  const sourceEventsBeforeInvalidSignature = await prisma.sourceEvent.count({
    where: { sourceConnectionId: webhook.body.id },
  })
  await request(webhook.body.endpoint, {
    method: 'POST',
    body: webhookRaw,
    statuses: [401],
    headers: {
      'x-gigalibs-timestamp': webhookTimestamp,
      'x-gigalibs-signature': `sha256=${'0'.repeat(64)}`,
    },
  })
  assert.equal(
    await prisma.sourceEvent.count({ where: { sourceConnectionId: webhook.body.id } }),
    sourceEventsBeforeInvalidSignature,
  )
  const acceptedWebhook = await request(webhook.body.endpoint, {
    method: 'POST',
    body: webhookRaw,
    statuses: [202],
    headers: {
      'x-gigalibs-timestamp': webhookTimestamp,
      'x-gigalibs-signature': webhookSignature,
    },
  })
  assert.equal(acceptedWebhook.body.status, 'VALIDATED')
  assert.equal(acceptedWebhook.body.duplicate, false)
  const replayedWebhook = await request(webhook.body.endpoint, {
    method: 'POST',
    body: webhookRaw,
    statuses: [202],
    headers: {
      'x-gigalibs-timestamp': webhookTimestamp,
      'x-gigalibs-signature': webhookSignature,
    },
  })
  assert.equal(replayedWebhook.body.id, acceptedWebhook.body.id)
  assert.equal(replayedWebhook.body.duplicate, true)
  const webhookProfile = await request(
    `/api/v1/operational-intelligence/connections/${webhook.body.id}/profile`,
    { method: 'POST', token: owner.token, statuses: [201] },
  )
  assert.equal(webhookProfile.body.schema.type, 'object')

  const database = await request('/api/v1/operational-intelligence/connections', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      environmentId: environment.body.id,
      credentialReferenceId: databaseCredential.body.id,
      slug: 'control-database-readonly',
      name: 'Control database read-only profile',
      interfaceType: 'POSTGRESQL',
      mode: 'READ_ONLY',
      endpoint: databaseEndpoint,
      configuration: {
        schemaName: 'public',
        tableName: 'tenants',
        columns: ['id', 'slug', 'name', 'status'],
        sampleRecordLimit: 10,
        connectionTimeoutSeconds: 10,
        statementTimeoutMs: 10_000,
        sslMode: 'DISABLE',
      },
    },
  })
  const databaseTest = await request(
    `/api/v1/operational-intelligence/connections/${database.body.id}/test`,
    { method: 'POST', token: owner.token, statuses: [201] },
  )
  assert.equal(databaseTest.body.checks.readOnlyTransaction, true)
  assert.equal(typeof databaseTest.body.checks.sourceRoleHasWritePrivileges, 'boolean')
  assert.equal(
    databaseTest.body.status,
    databaseTest.body.checks.sourceRoleHasWritePrivileges ? 'READY_WITH_LIMITS' : 'READY',
  )
  const databaseProfile = await request(
    `/api/v1/operational-intelligence/connections/${database.body.id}/profile`,
    { method: 'POST', token: owner.token, statuses: [201] },
  )
  assert.equal(databaseProfile.body.schema.type, 'object')
  assert.ok(databaseProfile.body.recordCountObserved >= 1)

  const fileConnection = await request('/api/v1/operational-intelligence/connections', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      environmentId: environment.body.id,
      slug: 'verified-source-files',
      name: 'Verified source files',
      interfaceType: 'FILE_UPLOAD',
      mode: 'READ_ONLY',
      configuration: {
        acceptedContentTypes: ['application/json', 'text/csv'],
        csvDelimiter: ',',
        sampleRecordLimit: 25,
      },
    },
  })
  const fileTest = await request(
    `/api/v1/operational-intelligence/connections/${fileConnection.body.id}/test`,
    { method: 'POST', token: owner.token, statuses: [201] },
  )
  assert.equal(fileTest.body.status, 'READY')
  assert.equal(fileTest.body.checks.objectStorageReachable, true)

  const fileEventType = 'coldchain.temperature-observed.v1'
  await createContract(
    owner.token,
    environment.body.id,
    fileConnection.body.id,
    fileEventType,
    {
      batchId: { type: 'string', minLength: 1, maxLength: 128 },
      facilityId: { type: 'string', minLength: 1, maxLength: 128 },
      temperatureC: { type: 'number' },
      observedAt: { type: 'string', format: 'date-time' },
    },
  )
  const filePayload = {
    batchId: `batch-${randomUUID()}`,
    facilityId: 'facility-certification',
    temperatureC: 4.1,
    observedAt: new Date().toISOString(),
  }
  const fileBytes = Buffer.from(JSON.stringify(filePayload), 'utf8')
  const fileChecksum = createHash('sha256').update(fileBytes).digest('hex')
  const upload = await request(
    `/api/v1/operational-intelligence/connections/${fileConnection.body.id}/files/upload-request`,
    {
      method: 'POST',
      token: owner.token,
      statuses: [201],
      body: {
        fileName: 'cold-chain-observation.json',
        contentType: 'application/json',
        byteSize: fileBytes.length,
        checksumSha256: fileChecksum,
      },
    },
  )
  const uploadResponse = await fetch(upload.body.uploadUrl, {
    method: 'PUT',
    headers: upload.body.requiredHeaders,
    body: fileBytes,
  })
  const uploadFailure = uploadResponse.ok ? '' : await uploadResponse.text()
  assert.ok(
    uploadResponse.ok,
    `Object upload returned ${uploadResponse.status}: ${uploadFailure}`,
  )
  const fileEventId = randomUUID()
  const completedFile = await request(
    `/api/v1/operational-intelligence/connections/${fileConnection.body.id}/files/${upload.body.fileId}/complete`,
    {
      method: 'POST',
      token: owner.token,
      statuses: [201],
      body: {
        operation: 'INGEST',
        eventId: fileEventId,
        eventType: fileEventType,
        eventVersion: 1,
        occurredAt: filePayload.observedAt,
        correlationId: randomUUID(),
        idempotencyKey: randomUUID(),
        actor: { type: 'source-file', id: 'connector-certification' },
        entityRefs: { batchId: filePayload.batchId },
        classification: 'RESTRICTED',
      },
    },
  )
  assert.equal(completedFile.body.status, 'INGESTED')
  assert.equal(completedFile.body.duplicate, false)
  assert.equal(completedFile.body.storageCleanupPending, false)
  const completedReplay = await request(
    `/api/v1/operational-intelligence/connections/${fileConnection.body.id}/files/${upload.body.fileId}/complete`,
    {
      method: 'POST',
      token: owner.token,
      statuses: [201],
      body: {
        operation: 'INGEST',
        eventId: fileEventId,
        eventType: fileEventType,
        eventVersion: 1,
        occurredAt: filePayload.observedAt,
        correlationId: randomUUID(),
        idempotencyKey: randomUUID(),
        actor: { type: 'source-file', id: 'connector-certification' },
        entityRefs: { batchId: filePayload.batchId },
        classification: 'RESTRICTED',
      },
    },
  )
  assert.equal(completedReplay.body.duplicate, true)

  const storedFile = await prisma.sourceFileImport.findUnique({
    where: { id: upload.body.fileId },
  })
  assert.ok(storedFile)
  assert.equal(storedFile.status, 'INGESTED')
  assert.equal(storedFile.actualByteSize, fileBytes.length)
  assert.equal(storedFile.checksumSha256, fileChecksum)
  assert.equal(storedFile.classification, 'RESTRICTED')
  assert.ok(storedFile.sourceEventId)
  assert.ok(storedFile.storageDeletedAt)
  const storedFileEvent = await prisma.sourceEvent.findUnique({
    where: { id: storedFile.sourceEventId },
  })
  assert.ok(storedFileEvent)
  assert.equal(storedFileEvent.eventId, fileEventId)
  assert.equal(storedFileEvent.sourceConnectionId, fileConnection.body.id)
  assert.equal(storedFileEvent.classification, 'RESTRICTED')
  await assert.rejects(
    storage.send(
      new HeadObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: storedFile.storageKey }),
    ),
  )

  const outsider = await createTenant('Connector Isolation')
  for (const connectionId of [webhook.body.id, database.body.id, fileConnection.body.id]) {
    await request(`/api/v1/operational-intelligence/connections/${connectionId}`, {
      token: outsider.token,
      statuses: [404],
    })
  }
  await request(
    `/api/v1/operational-intelligence/connections/${fileConnection.body.id}/files`,
    { token: outsider.token, statuses: [404] },
  )
  await request(`/api/v1/operational-intelligence/events/${webhookEventId}`, {
    token: outsider.token,
    statuses: [404],
  })

  const health = await request(
    `/api/v1/operational-intelligence/connections/${database.body.id}/health`,
    { token: owner.token },
  )
  assert.equal(
    health.body.statusReasonCode,
    databaseTest.body.checks.sourceRoleHasWritePrivileges
      ? 'SOURCE_ROLE_HAS_WRITE_PRIVILEGES'
      : null,
  )

  console.log(JSON.stringify({
    status: 'passed',
    tenantId: owner.tenant.id,
    connections: {
      webhook: webhook.body.id,
      postgresql: database.body.id,
      fileUpload: fileConnection.body.id,
    },
    checks: [
      'credential-references-without-secret-disclosure',
      'server-generated-webhook-endpoint',
      'hmac-sha256-timestamp-and-raw-body-verification',
      'invalid-webhook-signature-rejected-without-event-write',
      'webhook-contract-validation-and-idempotent-replay',
      'postgresql-host-port-policy-and-read-only-transaction',
      'database-source-write-privilege-readiness-diagnostic',
      'real-database-schema-profile',
      'object-storage-bucket-readiness',
      'presigned-direct-file-upload',
      'content-type-size-metadata-and-sha256-file-verification',
      'classified-file-lineage-to-encrypted-source-event',
      'temporary-source-object-deletion',
      'file-completion-idempotency',
      'cross-tenant-connector-file-and-event-denial',
    ],
  }, null, 2))
} finally {
  await disconnectDb()
}
