import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { disconnectDb, prisma } from '@gigalibs/db';

const baseUrl = process.env.CONTROL_API_URL;
if (!baseUrl) throw new Error('CONTROL_API_URL is required');

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
  return { status: response.status, body };
}

async function createTenant(label) {
  const suffix = `${Date.now().toString(36)}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const registration = await request('/api/v1/auth/register', {
    method: 'POST',
    statuses: [201],
    body: {
      email: `ap-outcome-${suffix}@example.test`,
      password: randomBytes(32).toString('base64url'),
      name: `${label} Owner`,
    },
  });
  const tenant = await request('/api/v1/tenants', {
    method: 'POST',
    token: registration.body.accessToken,
    statuses: [201],
    body: {
      name: `${label} ${suffix}`,
      slug: `ap-outcome-${suffix}`,
      plan: 'ENTERPRISE',
      isolationMode: 'ROW_LEVEL_SECURITY',
      region: 'ap-south-1',
    },
  });
  const selected = await request('/api/v1/auth/select-tenant', {
    method: 'POST',
    token: registration.body.accessToken,
    body: { tenantId: tenant.body.id },
  });
  await request('/api/v1/tenants/current/status', {
    method: 'PATCH',
    token: selected.body.accessToken,
    body: { status: 'ACTIVE', reason: 'AP outcome production acceptance certification' },
  });
  return { tenant: tenant.body, token: selected.body.accessToken };
}

function tokenSubject(accessToken) {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(typeof payload.sub, 'string');
  return payload.sub;
}

async function createVerifier(tenantId) {
  const suffix = `${Date.now().toString(36)}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const registration = await request('/api/v1/auth/register', {
    method: 'POST',
    statuses: [201],
    body: {
      email: `ap-verifier-${suffix}@example.test`,
      password: randomBytes(32).toString('base64url'),
      name: 'Independent Value Verifier',
    },
  });
  const userId = tokenSubject(registration.body.accessToken);
  await prisma.tenantMember.create({
    data: { tenantId, userId, role: 'MANAGER', status: 'ACTIVE' },
  });
  const selected = await request('/api/v1/auth/select-tenant', {
    method: 'POST',
    token: registration.body.accessToken,
    body: { tenantId },
  });
  return { userId, token: selected.body.accessToken };
}

const string = (extra = {}) => ({ type: 'string', ...extra });
const integer = (extra = {}) => ({ type: 'integer', ...extra });
const object = (properties, required) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const array = (items) => ({ type: 'array', items, minItems: 1, maxItems: 10000 });

const schemas = {
  'ap.purchase-order.received.v1': object(
    {
      purchaseOrderId: string({ minLength: 1, maxLength: 128 }),
      supplierId: string({ minLength: 1, maxLength: 128 }),
      supplierName: string({ minLength: 1, maxLength: 200 }),
      currency: string({ pattern: '^[A-Z]{3}$' }),
      status: string({ minLength: 1, maxLength: 80 }),
      orderedAt: string({ format: 'date-time' }),
      lines: array(
        object(
          {
            lineNumber: integer({ minimum: 1 }),
            description: string({ minLength: 1, maxLength: 1000 }),
            quantity: string({ pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,6})?$' }),
            unitPriceMinor: integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
          },
          ['lineNumber', 'description', 'quantity', 'unitPriceMinor'],
        ),
      ),
    },
    ['purchaseOrderId', 'supplierId', 'supplierName', 'currency', 'status', 'orderedAt', 'lines'],
  ),
  'ap.goods-receipt.received.v1': object(
    {
      goodsReceiptId: string({ minLength: 1, maxLength: 128 }),
      purchaseOrderId: string({ minLength: 1, maxLength: 128 }),
      receivedAt: string({ format: 'date-time' }),
      lines: array(
        object(
          {
            purchaseOrderLineNumber: integer({ minimum: 1 }),
            quantityReceived: string({ pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,6})?$' }),
          },
          ['purchaseOrderLineNumber', 'quantityReceived'],
        ),
      ),
    },
    ['goodsReceiptId', 'purchaseOrderId', 'receivedAt', 'lines'],
  ),
  'ap.invoice.received.v1': object(
    {
      supplierInvoiceId: string({ minLength: 1, maxLength: 128 }),
      invoiceNumber: string({ minLength: 1, maxLength: 128 }),
      supplierId: string({ minLength: 1, maxLength: 128 }),
      supplierName: string({ minLength: 1, maxLength: 200 }),
      purchaseOrderId: string({ minLength: 1, maxLength: 128 }),
      currency: string({ pattern: '^[A-Z]{3}$' }),
      invoiceDate: string({ format: 'date-time' }),
      taxMinor: integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
      totalMinor: integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
      lines: array(
        object(
          {
            lineNumber: integer({ minimum: 1 }),
            purchaseOrderLineNumber: integer({ minimum: 1 }),
            description: string({ minLength: 1, maxLength: 1000 }),
            quantity: string({ pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,6})?$' }),
            unitPriceMinor: integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
            totalMinor: integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
          },
          [
            'lineNumber',
            'purchaseOrderLineNumber',
            'description',
            'quantity',
            'unitPriceMinor',
            'totalMinor',
          ],
        ),
      ),
    },
    [
      'supplierInvoiceId',
      'invoiceNumber',
      'supplierId',
      'supplierName',
      'purchaseOrderId',
      'currency',
      'invoiceDate',
      'taxMinor',
      'totalMinor',
      'lines',
    ],
  ),
};

async function waitForEvent(token, eventId, expectedStatus = 'PROCESSED') {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const event = await request(`/api/v1/operational-intelligence/events/${eventId}`, { token });
    if (event.body.status === expectedStatus) return event.body;
    if (['QUARANTINED', 'REJECTED'].includes(event.body.status)) {
      assert.fail(
        `Event ${eventId} ended in ${event.body.status}: ${JSON.stringify(event.body.rejectionDetail)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail(`Event ${eventId} did not reach ${expectedStatus}`);
}

async function waitForRecovery(token, exceptionId, idempotencyKey, expectedStatus) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const exception = await request(`/api/v1/exceptions/${exceptionId}`, { token });
    const recovery = exception.body.recoveries.find(
      (item) => item.idempotencyKey === idempotencyKey,
    );
    if (recovery?.status === expectedStatus) return { exception: exception.body, recovery };
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail(`Recovery ${idempotencyKey} did not reach ${expectedStatus}`);
}

try {
  const owner = await createTenant('AP Outcome');
  const environment = await request('/api/v1/operational-intelligence/environments', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      slug: 'acceptance',
      displayName: 'AP acceptance',
      kind: 'TEST',
      region: 'ap-south-1',
      retentionDays: 30,
    },
  });
  const connection = await request('/api/v1/operational-intelligence/connections', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      environmentId: environment.body.id,
      slug: 'ap-erp-read-path',
      name: 'AP ERP read path',
      // WI-OI-104f: the core no longer pulls REST sources; AP facts arrive through the events API below.
      interfaceType: 'FILE_UPLOAD',
      mode: 'READ_ONLY',
      configuration: { acceptedContentTypes: ['application/json'], csvDelimiter: ',', sampleRecordLimit: 25 },
    },
  });
  assert.equal(connection.body.status, 'UNTESTED');

  for (const [eventType, jsonSchema] of Object.entries(schemas)) {
    const contract = await request('/api/v1/operational-intelligence/data-contracts', {
      method: 'POST',
      token: owner.token,
      statuses: [201],
      body: {
        environmentId: environment.body.id,
        connectionId: connection.body.id,
        name: eventType,
        eventType,
      },
    });
    const version = await request(
      `/api/v1/operational-intelligence/data-contracts/${contract.body.id}/publish`,
      {
        method: 'POST',
        token: owner.token,
        statuses: [201],
        body: { jsonSchema, mapping: {}, compatibilityMode: 'BACKWARD' },
      },
    );
    assert.equal(version.body.version, 1);
  }

  const valueDefinition = await request('/api/v1/value/definitions', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      environmentId: environment.body.id,
      outcomeKey: 'ap-processing-cost-avoided',
      name: 'AP processing cost avoided',
      description: 'Net processing cost avoided per evidence-backed AP approval.',
      currency: 'USD',
      classification: 'CONFIDENTIAL',
    },
  });
  const publishedValueDefinition = await request(
    `/api/v1/value/definitions/${valueDefinition.body.id}/publish`,
    {
      method: 'POST',
      token: owner.token,
      statuses: [201],
      body: {
        formulaKind: 'AP_PROCESSING_COST_AVOIDED',
        assumptions: {
          manualMinutesPerCase: 30,
          automatedMinutesPerCase: 5,
          humanReviewMinutesPerCase: 2,
          loadedHourlyCostMinor: 6000,
          monthlyPlatformCostMinor: 10000,
          monthlyIntegrationOperatingCostMinor: 5000,
        },
        baseline: {
          monthlyCaseVolume: 1000,
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
          evidenceReference: 'acceptance://ap-processing-baseline',
        },
        target: { automationRateBps: 8000, targetDate: '2026-12-31' },
      },
    },
  );
  assert.equal(publishedValueDefinition.body.currentVersion, 1);
  assert.equal(publishedValueDefinition.body.classification, 'CONFIDENTIAL');

  const matchRule = await request('/api/v1/ap/rules', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: { name: 'AP three-way acceptance policy', kind: 'AP_THREE_WAY_MATCH' },
  });
  await request(`/api/v1/ap/rules/${matchRule.body.id}/publish`, {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      definition: {
        amountToleranceMinor: 0,
        quantityToleranceBps: 0,
        requireReceipt: true,
        blockCurrencyMismatch: true,
      },
    },
  });
  const actionRule = await request('/api/v1/ap/rules', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: { name: 'AP controlled action acceptance policy', kind: 'AP_ACTION_POLICY' },
  });
  const actionVersion = await request(`/api/v1/ap/rules/${actionRule.body.id}/publish`, {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      definition: {
        actionType: 'AP_APPROVE_FOR_PAYMENT',
        risk: 'HIGH',
        requiresApproval: true,
        requiredApprovals: 1,
        approverRoles: ['TENANT_ADMIN'],
        maxAmountMinor: 100000,
        prohibitSelfApproval: true,
        valueOutcomeKey: valueDefinition.body.outcomeKey,
      },
    },
  });

  const correlationId = randomUUID();
  const sourceIds = {
    purchaseOrderId: `po-${randomUUID()}`,
    supplierInvoiceId: `invoice-${randomUUID()}`,
    goodsReceiptId: `receipt-${randomUUID()}`,
    supplierId: `supplier-${randomUUID()}`,
  };
  const baseCommand = (eventType, payload) => ({
    eventId: randomUUID(),
    tenantId: owner.tenant.id,
    environmentId: environment.body.id,
    sourceId: connection.body.id,
    eventType,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId,
    idempotencyKey: randomUUID(),
    actor: { type: 'acceptance-certification', id: owner.tenant.id },
    entityRefs: sourceIds,
    classification: 'CONFIDENTIAL',
    payload,
  });

  const invoiceCommand = baseCommand('ap.invoice.received.v1', {
    supplierInvoiceId: sourceIds.supplierInvoiceId,
    invoiceNumber: `INV-${randomUUID()}`,
    supplierId: sourceIds.supplierId,
    supplierName: 'Acceptance Supplier',
    purchaseOrderId: sourceIds.purchaseOrderId,
    currency: 'USD',
    invoiceDate: new Date().toISOString(),
    taxMinor: 500,
    totalMinor: 5500,
    lines: [
      {
        lineNumber: 1,
        purchaseOrderLineNumber: 1,
        description: 'Acceptance item',
        quantity: '10',
        unitPriceMinor: 500,
        totalMinor: 5000,
      },
    ],
  });
  const invoiceEvent = await request('/api/v1/operational-intelligence/events/ingest', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: invoiceCommand,
  });
  await waitForEvent(owner.token, invoiceCommand.eventId);
  const invoices = await request('/api/v1/ap/invoices?limit=10', { token: owner.token });
  const invoice = invoices.body.items.find(
    (item) => item.externalId === sourceIds.supplierInvoiceId,
  );
  assert.ok(invoice);
  assert.equal(invoice.status, 'EXCEPTION');
  assert.equal(invoice.matchEvaluations[0].outcome, 'INCOMPLETE');
  assert.equal(invoice.sourceEvent.classification, 'CONFIDENTIAL');

  const openExceptions = await request(
    '/api/v1/exceptions?limit=10&status=OPEN&kind=MISSING_EVIDENCE',
    { token: owner.token },
  );
  const missingEvidence = openExceptions.body.items.find(
    (item) => item.supplierInvoice?.invoiceNumber === invoice.invoiceNumber,
  );
  assert.ok(missingEvidence);
  assert.equal(missingEvidence.classification, 'CONFIDENTIAL');
  assert.equal(missingEvidence.sourceEvent.classification, 'CONFIDENTIAL');

  const purchaseOrderCommand = baseCommand('ap.purchase-order.received.v1', {
    purchaseOrderId: sourceIds.purchaseOrderId,
    supplierId: sourceIds.supplierId,
    supplierName: 'Acceptance Supplier',
    currency: 'USD',
    status: 'OPEN',
    orderedAt: new Date().toISOString(),
    lines: [{ lineNumber: 1, description: 'Acceptance item', quantity: '10', unitPriceMinor: 500 }],
  });
  await request('/api/v1/operational-intelligence/events/ingest', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: purchaseOrderCommand,
  });
  await waitForEvent(owner.token, purchaseOrderCommand.eventId);

  const receiptCommand = baseCommand('ap.goods-receipt.received.v1', {
    goodsReceiptId: sourceIds.goodsReceiptId,
    purchaseOrderId: sourceIds.purchaseOrderId,
    receivedAt: new Date().toISOString(),
    lines: [{ purchaseOrderLineNumber: 1, quantityReceived: '10' }],
  });
  await request('/api/v1/operational-intelligence/events/ingest', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: receiptCommand,
  });
  await waitForEvent(owner.token, receiptCommand.eventId);

  const detail = await request(`/api/v1/ap/invoices/${invoice.id}`, { token: owner.token });
  assert.equal(detail.body.status, 'PENDING_APPROVAL');
  assert.equal(detail.body.matchEvaluations[0].outcome, 'MATCHED');
  assert.ok(detail.body.matchEvaluations[0].evidenceBundle.items.length >= 2);
  assert.equal(detail.body.matchEvaluations[0].findings.length, 0);
  assert.ok(detail.body.matchEvaluations.some((evaluation) => evaluation.outcome === 'INCOMPLETE'));
  assert.equal(detail.body.actions.length, 1);
  assert.equal(detail.body.sourceEvent.classification, 'CONFIDENTIAL');
  const action = detail.body.actions[0];
  assert.equal(action.status, 'PENDING_APPROVAL');
  assert.equal(action.policyRuleVersionId, actionVersion.body.id);

  const resolvedException = await request(`/api/v1/exceptions/${missingEvidence.id}`, {
    token: owner.token,
  });
  assert.equal(resolvedException.body.status, 'RESOLVED');
  assert.ok(resolvedException.body.resolvedAt);

  const replayed = await request('/api/v1/operational-intelligence/events/ingest', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: invoiceCommand,
  });
  assert.equal(replayed.body.id, invoiceEvent.body.id);
  assert.equal(replayed.body.duplicate, true);
  assert.equal(await prisma.businessAction.count({ where: { supplierInvoiceId: invoice.id } }), 1);

  const approved = await request(`/api/v1/ap/actions/${action.id}/approve`, {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: { reason: 'Three-way evidence and immutable policy checks passed.' },
  });
  assert.equal(approved.body.status, 'SUCCEEDED');
  assert.equal(approved.body.result.status, 'SUCCEEDED');
  assert.equal(approved.body.supplierInvoice.status, 'APPROVED_FOR_PAYMENT');

  const approvalReplay = await request(`/api/v1/ap/actions/${action.id}/approve`, {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: { reason: 'Three-way evidence and immutable policy checks passed.' },
  });
  assert.equal(approvalReplay.body.approvals.length, 1);
  assert.equal(await prisma.actionResult.count({ where: { actionId: action.id } }), 1);

  const valueEvents = await request('/api/v1/value/events?limit=10&status=CALCULATED', {
    token: owner.token,
  });
  const valueEvent = valueEvents.body.items.find((item) => item.businessAction?.id === action.id);
  assert.ok(valueEvent);
  assert.equal(valueEvent.classification, 'CONFIDENTIAL');
  assert.equal(valueEvent.grossValueMinor, '2500');
  assert.equal(valueEvent.allocatedCostMinor, '215');
  assert.equal(valueEvent.netValueMinor, '2285');

  await request(`/api/v1/value/events/${valueEvent.id}/verify`, {
    method: 'POST',
    token: owner.token,
    statuses: [403],
    body: { reason: 'Owner must be prevented from self-verifying derived value.' },
  });
  const verifier = await createVerifier(owner.tenant.id);
  const verifiedValue = await request(`/api/v1/value/events/${valueEvent.id}/verify`, {
    method: 'POST',
    token: verifier.token,
    statuses: [201],
    body: { reason: 'Formula, baseline evidence, source lineage, and allocated cost verified.' },
  });
  assert.equal(verifiedValue.body.status, 'VERIFIED');
  assert.equal(verifiedValue.body.approvals[0].approverId, verifier.userId);

  const valueReport = await request('/api/v1/value/report', { token: owner.token });
  const verifiedReportRow = valueReport.body.rows.find(
    (row) => row.status === 'VERIFIED' && row.definition?.id === valueDefinition.body.id,
  );
  assert.ok(verifiedReportRow);
  assert.equal(verifiedReportRow.eventCount, 1);
  assert.equal(verifiedReportRow.netValueMinor, '2285');

  await assert.rejects(
    prisma.evidenceBundle.update({
      where: { id: detail.body.matchEvaluations[0].evidenceBundle.id },
      data: { summary: 'Mutation must be rejected' },
    }),
  );
  await assert.rejects(
    prisma.valueEvent.update({
      where: { id: valueEvent.id },
      data: { classification: 'INTERNAL' },
    }),
  );

  const outsider = await createTenant('AP Isolation');
  await request(`/api/v1/ap/invoices/${invoice.id}`, { token: outsider.token, statuses: [404] });
  await request(`/api/v1/ap/actions/${action.id}`, { token: outsider.token, statuses: [404] });
  await request(`/api/v1/exceptions/${missingEvidence.id}`, {
    token: outsider.token,
    statuses: [404],
  });
  await request(`/api/v1/value/definitions/${valueDefinition.body.id}`, {
    token: outsider.token,
    statuses: [404],
  });
  await request(`/api/v1/value/events/${valueEvent.id}`, {
    token: outsider.token,
    statuses: [404],
  });

  const storedEvents = await prisma.sourceEvent.findMany({
    where: { tenantId: owner.tenant.id, correlationId },
    select: { id: true, status: true },
  });
  assert.equal(storedEvents.length, 3);
  assert.ok(storedEvents.every((event) => event.status === 'PROCESSED'));
  assert.equal(
    await prisma.controlOutboxEvent.count({
      where: { aggregateId: { in: storedEvents.map((event) => event.id) }, status: 'PUBLISHED' },
    }),
    3,
  );

  const failedInvoiceId = `invoice-${randomUUID()}`;
  const invalidPayload = {
    supplierInvoiceId: failedInvoiceId,
    invoiceNumber: `INV-${randomUUID()}`,
    supplierId: sourceIds.supplierId,
    supplierName: 'Acceptance Supplier',
    purchaseOrderId: `po-${randomUUID()}`,
    currency: 'USD',
    invoiceDate: new Date().toISOString(),
    taxMinor: 0,
    totalMinor: 1000,
    lines: [
      {
        lineNumber: 1,
        purchaseOrderLineNumber: 1,
        description: 'Correction item A',
        quantity: '1',
        unitPriceMinor: 500,
        totalMinor: 500,
      },
      {
        lineNumber: 1,
        purchaseOrderLineNumber: 2,
        description: 'Correction item B',
        quantity: '1',
        unitPriceMinor: 500,
        totalMinor: 500,
      },
    ],
  };
  const failingCommand = {
    ...baseCommand('ap.invoice.received.v1', invalidPayload),
    correlationId: randomUUID(),
    classification: 'RESTRICTED',
  };
  await request('/api/v1/operational-intelligence/events/ingest', {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: failingCommand,
  });
  await waitForEvent(owner.token, failingCommand.eventId, 'QUARANTINED');
  const processingExceptions = await request(
    '/api/v1/exceptions?limit=100&status=OPEN&kind=PROCESSING_FAILURE',
    { token: owner.token },
  );
  const processingFailure = processingExceptions.body.items.find(
    (item) => item.sourceEvent?.eventId === failingCommand.eventId,
  );
  assert.ok(processingFailure);
  assert.equal(processingFailure.classification, 'RESTRICTED');
  assert.equal(processingFailure.retryable, true);

  const retryKey = randomUUID();
  await request(`/api/v1/exceptions/${processingFailure.id}/retry`, {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      reason: 'Retry the unchanged source event through the durable outbox.',
      idempotencyKey: retryKey,
    },
  });
  const failedRetry = await waitForRecovery(owner.token, processingFailure.id, retryKey, 'FAILED');
  assert.equal(failedRetry.exception.status, 'OPEN');

  const replayKey = randomUUID();
  await request(`/api/v1/exceptions/${processingFailure.id}/replay`, {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      reason: 'Replay the immutable source payload as a new event.',
      idempotencyKey: replayKey,
    },
  });
  const failedReplay = await waitForRecovery(
    owner.token,
    processingFailure.id,
    replayKey,
    'FAILED',
  );
  assert.ok(failedReplay.recovery.replaySourceEvent);
  assert.equal(failedReplay.exception.status, 'OPEN');

  const correctedPayload = {
    ...invalidPayload,
    lines: invalidPayload.lines.map((line, index) => ({ ...line, lineNumber: index + 1 })),
  };
  const editKey = randomUUID();
  await request(`/api/v1/exceptions/${processingFailure.id}/edit-and-replay`, {
    method: 'POST',
    token: owner.token,
    statuses: [201],
    body: {
      reason: 'Correct the duplicate source line number and replay through the active contract.',
      idempotencyKey: editKey,
      replacementPayload: correctedPayload,
    },
  });
  const successfulRecovery = await waitForRecovery(
    owner.token,
    processingFailure.id,
    editKey,
    'SUCCEEDED',
  );
  assert.equal(successfulRecovery.exception.status, 'RESOLVED');
  assert.equal(successfulRecovery.recovery.replaySourceEvent.status, 'PROCESSED');
  assert.equal(
    successfulRecovery.recovery.replaySourceEvent.eventId,
    `replay-${successfulRecovery.recovery.id}`,
  );
  assert.equal(
    await prisma.supplierInvoice.count({
      where: { tenantId: owner.tenant.id, externalId: failedInvoiceId },
    }),
    1,
  );

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        tenantId: owner.tenant.id,
        supplierInvoiceId: invoice.id,
        actionId: action.id,
        checks: [
          'real-readiness-checked-source',
          'versioned-ap-data-contracts',
          'immutable-tenant-owned-match-and-action-policy',
          'encrypted-durable-invoice-po-receipt-ingestion',
          'out-of-order-invoice-reconciliation-without-database-correction',
          'deterministic-match-history-and-evidence-citations',
          'human-approval-and-allowlisted-idempotent-action',
          'duplicate-source-replay-does-not-duplicate-action',
          'immutable-evidence-database-enforcement',
          'cross-tenant-invoice-and-action-denial',
          'automatic-classified-exception-open-and-resolution',
          'explicit-value-definition-classification-and-immutable-formula',
          'higher-classification-inheritance-on-value-event',
          'independent-value-verification-and-recognized-reporting',
          'immutable-value-event-database-enforcement',
          'cross-tenant-exception-and-value-denial',
          'durable-outbox-processing-completion',
          'terminal-processing-failure-classification',
          'durable-retry-and-replay-failure-history',
          'contract-validated-edit-and-replay-recovery',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await disconnectDb();
}
