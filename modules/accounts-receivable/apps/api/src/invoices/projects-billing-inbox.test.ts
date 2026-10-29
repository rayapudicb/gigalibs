import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import { PROJECT_INVOICE_DRAFT_REQUESTED_V1 } from '@gigalibs/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsBillingInboxController } from './projects-billing-inbox.controller.js';
import { ProjectsBillingInboxGuard, loadProjectsBillingInboxConfig } from './projects-billing-inbox.guard.js';

const tenantId = 'a0000000-0000-4000-a000-000000000001';
const billingRequestId = 'a0000000-0000-4000-a000-000000000002';
const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { format: 'der', type: 'spki' },
  privateKeyEncoding: { format: 'der', type: 'pkcs8' },
});
const payload = {
  billingRequestId,
  requestKey: 'a0000000-0000-4000-a000-000000000003',
  projectId: 'a0000000-0000-4000-a000-000000000004',
  projectCode: 'PRJ-1',
  orgUnitId: 'north',
  customerPartyId: 'a0000000-0000-4000-a000-000000000005',
  currencyCode: 'USD',
  billingKind: 'TIME_MATERIALS' as const,
  requestedAt: '2026-10-28T00:00:00.000Z',
  lines: [
    {
      sourceLineId: 'a0000000-0000-4000-a000-000000000006',
      description: 'Labor 2026-10-01 · Task (tech)',
      quantity: '2.000000',
      unitPriceMinor: '5000',
      lineTotalMinor: '10000',
    },
  ],
};
const envelope = {
  messageId: 'msg-1',
  tenantId,
  eventType: PROJECT_INVOICE_DRAFT_REQUESTED_V1,
  aggregateType: 'project_billing_request',
  aggregateId: billingRequestId,
  aggregateVersion: 1,
  correlationId: 'corr-1',
  causationId: null,
  schemaVersion: 1,
  payload,
  occurredAt: '2026-10-28T00:00:00.000Z',
};

describe('Projects billing signed AR inbox', () => {
  it('accepts only the body-bound project-operations token', () => {
    const guard = new ProjectsBillingInboxGuard(
      loadProjectsBillingInboxConfig({
        AR_PROJECTS_INBOX_RELAY_PUBLIC_KEY_BASE64: publicKey.toString('base64'),
      }),
    );
    const rawBody = Buffer.from(JSON.stringify(envelope));
    const token = signRelayToken(
      {
        audience: 'gigalibs-ar-projects-inbox',
        source: 'project-operations',
        tenantId,
        messageId: envelope.messageId,
        body: rawBody.toString('utf8'),
      },
      createPrivateKey({ key: privateKey, format: 'der', type: 'pkcs8' })
        .export({ format: 'pem', type: 'pkcs8' })
        .toString(),
    );
    const request = { headers: { authorization: `Bearer ${token}` }, rawBody, body: envelope };
    expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never)).toBe(true);
  });

  it('routes only a matching billing envelope to invoice issue', async () => {
    const issueInvoiceFromProjectBilling = vi.fn(async () => ({ invoiceId: 'invoice-1', duplicate: false }));
    const controller = new ProjectsBillingInboxController({ issueInvoiceFromProjectBilling } as never);
    const request = { relayClaims: { tenant_id: tenantId, message_id: envelope.messageId } } as never;
    await expect(controller.receive(request, { ...envelope, aggregateId: 'wrong-id' })).rejects.toThrow();
    expect(issueInvoiceFromProjectBilling).not.toHaveBeenCalled();
    await expect(controller.receive(request, envelope)).resolves.toMatchObject({ status: 'PROCESSED', invoiceId: 'invoice-1' });
    expect(issueInvoiceFromProjectBilling).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId }),
      payload,
      'corr-1',
      'msg-1',
    );
  });
});
