import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import { describe, expect, it, vi } from 'vitest';
import { OrdersFulfillmentInboxController } from './orders-fulfillment-inbox.controller.js';
import { OrdersFulfillmentInboxGuard, loadOrdersFulfillmentInboxConfig } from './orders-fulfillment-inbox.guard.js';

const tenantId = 'a0000000-0000-4000-a000-000000000001';
const fulfillmentId = 'a0000000-0000-4000-a000-000000000002';
const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { format: 'der', type: 'spki' },
  privateKeyEncoding: { format: 'der', type: 'pkcs8' },
});
const payload = {
  fulfillmentId, orderId: 'a0000000-0000-4000-a000-000000000003', orderNumber: 'SO-1', orgUnitId: 'north',
  customerPartyId: 'a0000000-0000-4000-a000-000000000004', currencyCode: 'USD',
  issueId: 'a0000000-0000-4000-a000-000000000005', dispatchedAt: '2026-10-28T00:00:00.000Z',
  lines: [{ orderLineId: 'a0000000-0000-4000-a000-000000000006', productId: 'a0000000-0000-4000-a000-000000000007',
    productCode: 'P1', productName: 'Part', quantity: '1.000000', unitPriceMinor: '100',
    uomId: 'a0000000-0000-4000-a000-000000000008' }],
};
const envelope = { messageId: 'msg-1', tenantId, eventType: 'orders.fulfillment.dispatched.v1',
  aggregateType: 'fulfillment_order', aggregateId: fulfillmentId, aggregateVersion: 1,
  correlationId: 'corr-1', causationId: null, schemaVersion: 1, payload,
  occurredAt: '2026-10-28T00:00:00.000Z' };

describe('Orders fulfillment signed AR inbox', () => {
  it('accepts only the body-bound Orders token and rejects an altered body', () => {
    const guard = new OrdersFulfillmentInboxGuard(loadOrdersFulfillmentInboxConfig({
      AR_ORDERS_INBOX_RELAY_PUBLIC_KEY_BASE64: publicKey.toString('base64'),
    }));
    const rawBody = Buffer.from(JSON.stringify(envelope));
    const token = signRelayToken({ audience: 'gigalibs-ar-orders-inbox', source: 'orders', tenantId,
      messageId: envelope.messageId, body: rawBody.toString('utf8') }, createPrivateKey({ key: privateKey, format: 'der', type: 'pkcs8' }).export({ format: 'pem', type: 'pkcs8' }).toString());
    const request = { headers: { authorization: `Bearer ${token}` }, rawBody, body: envelope };
    expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never)).toBe(true);
    expect(() => guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ ...request,
      rawBody: Buffer.from(JSON.stringify({ ...envelope, payload: { ...payload, orgUnitId: 'south' } })) }) }) } as never)).toThrow();
  });

  it('routes only a matching fulfillment envelope to invoice issue', async () => {
    const issueInvoiceFromFulfillment = vi.fn(async () => ({ invoiceId: 'invoice-1', duplicate: false }));
    const controller = new OrdersFulfillmentInboxController({ issueInvoiceFromFulfillment } as never);
    const request = { relayClaims: { tenant_id: tenantId, message_id: envelope.messageId } } as never;
    await expect(controller.receive(request, { ...envelope, aggregateId: 'wrong-id' })).rejects.toThrow();
    expect(issueInvoiceFromFulfillment).not.toHaveBeenCalled();
    await expect(controller.receive(request, envelope)).resolves.toMatchObject({ status: 'PROCESSED', invoiceId: 'invoice-1' });
    expect(issueInvoiceFromFulfillment).toHaveBeenCalledWith(expect.objectContaining({ tenantId }), payload, 'corr-1', 'msg-1');
  });
});
