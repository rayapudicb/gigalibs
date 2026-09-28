import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { PaymentsService } from './payments.service.js';
import {
  verifyAdyenSignature,
  verifyStripeSignature,
} from './webhooks.controller.js';
import { ArConflictError } from '../http/problem.filter.js';
import type { ArPrincipal } from '../auth/authorization.js';

const mockPrincipal: ArPrincipal = {
  subject: 'usr_cert_test',
  tenantId: '11111111-1111-4111-a111-111111111111',
  permissions: ['ar:write', 'ar:read', 'ar.invoices.pay'],
  issuer: 'https://auth.gigalibs.test',
};

const mockDraftId = '22222222-2222-4222-a222-222222222222';
const mockIssuedInvoiceId = '33333333-3333-4333-a333-333333333333';

function createMockDatabase(queryHandler: (sql: string, params: unknown[]) => Promise<{ rows: any[] }>) {
  const client = {
    query: vi.fn((sql: string, params: unknown[]) => queryHandler(sql, params)),
  };
  return {
    withTenantTransaction: vi.fn(async (_tenantId: string, fn: (c: any) => Promise<any>) => {
      return fn(client);
    }),
    client,
  };
}

describe('AR-04: Hosted Checkout & Cryptographic Webhooks', () => {
  describe('createCheckoutSession', () => {
    it('creates a Stripe hosted checkout session for an issued invoice with balance', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return {
            rows: [
              {
                id: mockDraftId,
                invoice_id: mockIssuedInvoiceId,
                status: 'ISSUED',
                currency: 'USD',
                total_minor: '10000',
              },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.void_records')) {
          return { rows: [] };
        }
        if (sql.includes('gigalibs_ar.payment_records')) {
          return { rows: [{ paid: '2000' }] }; // remaining: 8000
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      const session = await service.createCheckoutSession(
        mockDraftId,
        {
          provider: 'STRIPE',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        },
        mockPrincipal,
        'corr-123',
      );

      expect(session.provider).toBe('STRIPE');
      expect(session.amountMinor).toBe(8000); // defaults to remaining balance
      expect(session.currency).toBe('USD');
      expect(session.status).toBe('OPEN');
      expect(session.providerUrl).toContain('https://checkout.stripe.com');
      expect(session.providerSessionId).toMatch(/^cs_/);

      // Verify outbox event emitted
      expect(mockDb.client.query).toHaveBeenCalledWith(
        expect.stringContaining('ar.payment.checkout-session-created.v1'),
        expect.any(Array),
      );
    });

    it('creates an Adyen hosted session when requested', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return {
            rows: [
              {
                id: mockDraftId,
                invoice_id: mockIssuedInvoiceId,
                status: 'ISSUED',
                currency: 'EUR',
                total_minor: '5000',
              },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.void_records')) {
          return { rows: [] };
        }
        if (sql.includes('gigalibs_ar.payment_records')) {
          return { rows: [{ paid: '0' }] };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      const session = await service.createCheckoutSession(
        mockDraftId,
        {
          provider: 'ADYEN',
          amountMinor: 3000,
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        },
        mockPrincipal,
        'corr-456',
      );

      expect(session.provider).toBe('ADYEN');
      expect(session.amountMinor).toBe(3000);
      expect(session.providerUrl).toContain('https://test.adyen.link');
      expect(session.providerSessionId).toMatch(/^adyen_/);
    });

    it('rejects checkout session creation if invoice is still in DRAFT', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return {
            rows: [
              {
                id: mockDraftId,
                invoice_id: null,
                status: 'DRAFT',
                currency: 'USD',
                total_minor: '5000',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.createCheckoutSession(
          mockDraftId,
          {
            provider: 'STRIPE',
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel',
          },
          mockPrincipal,
          'corr-123',
        ),
      ).rejects.toThrow(ArConflictError);
    });

    it('rejects checkout session creation if invoice is voided', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return {
            rows: [
              {
                id: mockDraftId,
                invoice_id: mockIssuedInvoiceId,
                status: 'ISSUED',
                currency: 'USD',
                total_minor: '5000',
              },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.void_records')) {
          return { rows: [{ id: 'void-1' }] };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.createCheckoutSession(
          mockDraftId,
          {
            provider: 'STRIPE',
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel',
          },
          mockPrincipal,
          'corr-123',
        ),
      ).rejects.toThrow(ArConflictError);
    });

    it('rejects checkout session creation if invoice is already fully paid', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return {
            rows: [
              {
                id: mockDraftId,
                invoice_id: mockIssuedInvoiceId,
                status: 'ISSUED',
                currency: 'USD',
                total_minor: '5000',
              },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.void_records')) {
          return { rows: [] };
        }
        if (sql.includes('gigalibs_ar.payment_records')) {
          return { rows: [{ paid: '5000' }] };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.createCheckoutSession(
          mockDraftId,
          {
            provider: 'STRIPE',
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel',
          },
          mockPrincipal,
          'corr-123',
        ),
      ).rejects.toThrow(ArConflictError);
    });

    it('rejects checkout session creation if requested amount exceeds remaining balance', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return {
            rows: [
              {
                id: mockDraftId,
                invoice_id: mockIssuedInvoiceId,
                status: 'ISSUED',
                currency: 'USD',
                total_minor: '5000',
              },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.void_records')) {
          return { rows: [] };
        }
        if (sql.includes('gigalibs_ar.payment_records')) {
          return { rows: [{ paid: '3000' }] }; // remaining 2000
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.createCheckoutSession(
          mockDraftId,
          {
            provider: 'STRIPE',
            amountMinor: 2500, // exceeds remaining 2000
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel',
          },
          mockPrincipal,
          'corr-123',
        ),
      ).rejects.toThrow(ArConflictError);
    });
  });

  describe('HMAC Webhook Signature Verification', () => {
    const secret = 'whsec_test_secret_1234567890';
    const payload = JSON.stringify({ type: 'checkout.session.completed', id: 'evt_test_1' });

    it('validates a correct Stripe signature', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
      const header = `t=${timestamp},v1=${sig}`;

      const valid = verifyStripeSignature(payload, header, secret);
      expect(valid).toBe(true);
    });

    it('rejects a tampered Stripe payload', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
      const header = `t=${timestamp},v1=${sig}`;

      const tampered = JSON.stringify({ type: 'checkout.session.completed', id: 'evt_test_tampered' });
      const valid = verifyStripeSignature(tampered, header, secret);
      expect(valid).toBe(false);
    });

    it('rejects an expired Stripe timestamp (> 300s)', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const signedPayload = `${oldTimestamp}.${payload}`;
      const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
      const header = `t=${oldTimestamp},v1=${sig}`;

      const valid = verifyStripeSignature(payload, header, secret);
      expect(valid).toBe(false);
    });

    it('validates a correct Adyen signature', () => {
      const adyenSecret = 'adyen_hmac_secret_abcdef';
      const expected = crypto.createHmac('sha256', adyenSecret).update(payload, 'utf8').digest('hex');

      const valid = verifyAdyenSignature(payload, expected, adyenSecret);
      expect(valid).toBe(true);

      const invalid = verifyAdyenSignature(payload, 'wrong_signature', adyenSecret);
      expect(invalid).toBe(false);
    });
  });

  describe('processWebhookPayment & Deduplication', () => {
    it('settles invoice payment and updates webhook status to PROCESSED', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.payment_webhook_events') && sql.includes('SELECT')) {
          return { rows: [] }; // not yet seen
        }
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return {
            rows: [
              {
                id: mockDraftId,
                invoice_id: mockIssuedInvoiceId,
                status: 'ISSUED',
                currency: 'USD',
                total_minor: '10000',
              },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.void_records')) {
          return { rows: [] };
        }
        if (sql.includes('gigalibs_ar.payment_records') && sql.includes('SUM')) {
          return { rows: [{ paid: '0' }] };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      const result = await service.processWebhookPayment({
        tenantId: mockPrincipal.tenantId,
        provider: 'STRIPE',
        eventId: 'evt_stripe_100',
        eventType: 'checkout.session.completed',
        payload: { id: 'evt_stripe_100' },
        invoiceId: mockDraftId,
        amountMinor: 10000,
        currency: 'USD',
        paymentReference: 'cs_test_session_123',
        correlationId: 'corr-webhook-1',
      });

      expect(result.status).toBe('PROCESSED');
      expect(result.replayed).toBe(false);
      expect(result.paymentId).toBeDefined();

      // Verify payment record inserted with method CARD
      expect(mockDb.client.query).toHaveBeenCalledWith(
        expect.stringContaining('gigalibs_ar.payment_records'),
        expect.arrayContaining([mockPrincipal.tenantId, expect.any(String), mockIssuedInvoiceId, 10000, 'USD']),
      );

      // Verify checkout session updated to COMPLETED
      expect(mockDb.client.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE gigalibs_ar.checkout_sessions"),
        expect.any(Array),
      );
    });

    it('returns idempotent replay if webhook was already processed', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.payment_webhook_events') && sql.includes('SELECT')) {
          return { rows: [{ id: 'wb-evt-1', status: 'PROCESSED' }] };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      const result = await service.processWebhookPayment({
        tenantId: mockPrincipal.tenantId,
        provider: 'STRIPE',
        eventId: 'evt_stripe_100',
        eventType: 'checkout.session.completed',
        payload: { id: 'evt_stripe_100' },
        invoiceId: mockDraftId,
        amountMinor: 10000,
        currency: 'USD',
        correlationId: 'corr-webhook-2',
      });

      expect(result.status).toBe('PROCESSED');
      expect(result.replayed).toBe(true);
      expect(mockDb.client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gigalibs_ar.payment_records'),
        expect.any(Array),
      );
    });
  });
});
