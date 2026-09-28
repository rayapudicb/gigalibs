import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { ArConflictError } from '../http/problem.filter.js';
import type { ArPrincipal } from '../auth/authorization.js';

const mockPrincipal: ArPrincipal = {
  subject: 'usr_cert_test',
  tenantId: '11111111-1111-4111-a111-111111111111',
  permissions: ['ar:write', 'ar:read'],
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

describe('PaymentsService', () => {
  describe('record', () => {
    it('rejects invalid currency format or non-positive amount', async () => {
      const mockDb = createMockDatabase(async () => ({ rows: [] }));
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.record(
          mockDraftId,
          { amountMinor: -100, currency: 'USD', paymentMethod: 'ACH' },
          mockPrincipal,
          'corr-1',
        ),
      ).rejects.toThrow();

      await expect(
        service.record(
          mockDraftId,
          { amountMinor: 100, currency: 'invalid', paymentMethod: 'ACH' },
          mockPrincipal,
          'corr-1',
        ),
      ).rejects.toThrow();
    });

    it('throws NotFoundException when invoice does not exist', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return { rows: [] };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.record(
          mockDraftId,
          { amountMinor: 5000, currency: 'USD', paymentMethod: 'WIRE' },
          mockPrincipal,
          'corr-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ArConflictError when invoice is still in DRAFT status', async () => {
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
                total_minor: '10000',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.record(
          mockDraftId,
          { amountMinor: 5000, currency: 'USD', paymentMethod: 'WIRE' },
          mockPrincipal,
          'corr-1',
        ),
      ).rejects.toThrow(ArConflictError);
    });

    it('throws ArConflictError when payment currency does not match invoice currency', async () => {
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
                total_minor: '10000',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.record(
          mockDraftId,
          { amountMinor: 5000, currency: 'USD', paymentMethod: 'WIRE' },
          mockPrincipal,
          'corr-1',
        ),
      ).rejects.toThrow(/does not match/);
    });

    it('throws ArConflictError when invoice has already been voided', async () => {
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
          return { rows: [{ id: 'void-1' }] };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.record(
          mockDraftId,
          { amountMinor: 5000, currency: 'USD', paymentMethod: 'WIRE' },
          mockPrincipal,
          'corr-1',
        ),
      ).rejects.toThrow(ArConflictError);
    });

    it('throws ArConflictError OVERPAYMENT when sum of payments exceeds invoice total', async () => {
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
        if (sql.includes('SELECT COALESCE(SUM(amount_minor)')) {
          return { rows: [{ paid: '8000' }] };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.record(
          mockDraftId,
          { amountMinor: 3000, currency: 'USD', paymentMethod: 'WIRE' },
          mockPrincipal,
          'corr-1',
        ),
      ).rejects.toThrow(/would exceed the invoice total/);
    });

    it('records payment successfully and emits outbox event', async () => {
      const insertedQueries: Array<{ sql: string; params: unknown[] }> = [];
      const mockDb = createMockDatabase(async (sql, params) => {
        insertedQueries.push({ sql, params });
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
        if (sql.includes('SELECT COALESCE(SUM(amount_minor)')) {
          return { rows: [{ paid: '2000' }] };
        }
        if (sql.includes('SELECT id, invoice_id, amount_minor::text')) {
          return {
            rows: [
              {
                id: 'pay-001',
                invoice_id: mockIssuedInvoiceId,
                amount_minor: '5000',
                currency: 'USD',
                payment_method: 'ACH',
                payment_reference: 'REF-ACH-1234',
                notes: 'Partial payment',
                paid_at: '2026-09-16T12:00:00.000Z',
                recorded_by: mockPrincipal.subject,
                created_at: '2026-09-16T12:00:00.000Z',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      const result = await service.record(
        mockDraftId,
        {
          amountMinor: 5000,
          currency: 'USD',
          paymentMethod: 'ACH',
          paymentReference: 'REF-ACH-1234',
          notes: 'Partial payment',
        },
        mockPrincipal,
        'corr-rec-1',
      );

      expect(result.id).toBe('pay-001');
      expect(result.amountMinor).toBe(5000);
      expect(result.currency).toBe('USD');
      expect(result.paymentMethod).toBe('ACH');
      expect(result.paymentReference).toBe('REF-ACH-1234');

      // Verify outbox insertion occurred
      const outboxInsert = insertedQueries.find((q) => q.sql.includes('gigalibs_ar.outbox_events'));
      expect(outboxInsert).toBeDefined();
      expect(outboxInsert?.params).toContain('ar.invoice.payment-recorded.v1');
    });
  });

  describe('voidInvoice', () => {
    it('returns existing void idempotently if already voided', async () => {
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
        if (sql.includes('SELECT id, invoice_id, reason')) {
          return {
            rows: [
              {
                id: 'existing-void-id',
                invoice_id: mockIssuedInvoiceId,
                reason: 'Prior void reason',
                voided_by: 'prior_admin',
                voided_at: '2026-09-15T00:00:00.000Z',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      const res = await service.voidInvoice(
        mockDraftId,
        { reason: 'Second void attempt' },
        mockPrincipal,
        'corr-void-1',
      );

      expect(res.id).toBe('existing-void-id');
      expect(res.reason).toBe('Prior void reason');
    });

    it('rejects voiding an invoice that is already fully paid', async () => {
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
        if (sql.includes('SELECT id, invoice_id, reason')) {
          return { rows: [] }; // not yet voided
        }
        if (sql.includes('SELECT COALESCE(SUM(amount_minor)')) {
          return { rows: [{ paid: '10000' }] }; // fully paid
        }
        return { rows: [] };
      });
      const service = new PaymentsService(mockDb as any);

      await expect(
        service.voidInvoice(
          mockDraftId,
          { reason: 'Customer requested cancellation' },
          mockPrincipal,
          'corr-void-2',
        ),
      ).rejects.toThrow(/fully paid invoice cannot be voided/);
    });
  });
});
