import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service.js';
import { ArConflictError } from '../http/problem.filter.js';
import type { ArPrincipal } from '../auth/authorization.js';

const mockPrincipal: ArPrincipal = {
  subject: 'usr_cert_test',
  tenantId: '11111111-1111-4111-a111-111111111111',
  permissions: ['ar:write', 'ar:read'],
  issuer: 'https://auth.gigalibs.test',
};

const mockInvoiceId = '33333333-3333-4333-a333-333333333333';

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

function createMockStorage(overrides = {}) {
  return {
    isEnabled: vi.fn(() => false),
    putPdfObject: vi.fn(async () => null),
    getPdfBytes: vi.fn(async () => null),
    createDownloadUrl: vi.fn(async () => null),
    ...overrides,
  };
}

describe('DeliveriesService', () => {
  describe('list', () => {
    it('throws NotFoundException when invoice does not exist', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('SELECT id FROM gigalibs_ar.invoices')) {
          return { rows: [] };
        }
        return { rows: [] };
      });
      const service = new DeliveriesService(mockDb as any, createMockStorage() as any);

      await expect(service.list(mockInvoiceId, mockPrincipal)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns delivery history mapped when invoice exists', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('SELECT id FROM gigalibs_ar.invoices')) {
          return { rows: [{ id: mockInvoiceId }] };
        }
        if (sql.includes('SELECT id, invoice_id, pdf_render_id')) {
          return {
            rows: [
              {
                id: 'del-001',
                invoice_id: mockInvoiceId,
                pdf_render_id: 'pdf-001',
                recipient_email: 'client@example.com',
                recipient_name: 'Client Acme',
                subject_line: 'Invoice INV-001',
                status: 'SENT',
                failure_reason: null,
                sent_at: '2026-09-16T12:00:00.000Z',
                delivered_by: mockPrincipal.subject,
                created_at: '2026-09-16T12:00:00.000Z',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new DeliveriesService(mockDb as any, createMockStorage() as any);

      const res = await service.list(mockInvoiceId, mockPrincipal);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.status).toBe('SENT');
      expect(res.items[0]?.recipientEmail).toBe('client@example.com');
    });
  });

  describe('deliver', () => {
    it('returns replayed 200 result when idempotency key already exists', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('SELECT id, invoice_id, pdf_render_id')) {
          return {
            rows: [
              {
                id: 'del-existing',
                invoice_id: mockInvoiceId,
                pdf_render_id: 'pdf-existing',
                recipient_email: 'client@example.com',
                recipient_name: 'Client Acme',
                subject_line: 'Invoice INV-001',
                status: 'SENT',
                failure_reason: null,
                sent_at: '2026-09-16T12:00:00.000Z',
                delivered_by: mockPrincipal.subject,
                created_at: '2026-09-16T12:00:00.000Z',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new DeliveriesService(mockDb as any, createMockStorage() as any);

      const result = await service.deliver(mockInvoiceId, mockPrincipal, 'idem-del-1', 'corr-del-1');
      expect(result.status).toBe(200);
      expect(result.replayed).toBe(true);
      expect(result.body.id).toBe('del-existing');
    });

    it('throws ArConflictError INVOICE_NOT_ISSUED when invoice has no invoice_number', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('FROM gigalibs_ar.invoices i')) {
          return {
            rows: [
              {
                id: mockInvoiceId,
                invoice_number: null, // not yet issued
                currency: 'USD',
                issue_date: '2026-09-16',
                due_date: '2026-10-16',
                subtotal_minor: '1000',
                tax_minor: '0',
                total_minor: '1000',
                customer_id: 'cust-1',
                seller_snapshot: { legalName: 'Seller Inc', locale: 'en-US', timeZone: 'UTC' },
                buyer_snapshot: { legalName: 'Buyer LLC', billingEmail: 'buyer@example.com' },
                invoice_footer_text: null,
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new DeliveriesService(mockDb as any, createMockStorage() as any);

      await expect(
        service.deliver(mockInvoiceId, mockPrincipal, 'idem-del-2', 'corr-del-2'),
      ).rejects.toThrow(ArConflictError);
    });

    it('records FAILED status with failure reason when mailer transport rejects', async () => {
      const insertedQueries: Array<{ sql: string; params: unknown[] }> = [];
      const mockDb = createMockDatabase(async (sql, params) => {
        insertedQueries.push({ sql, params });
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('FROM gigalibs_ar.invoices i')) {
          return {
            rows: [
              {
                id: mockInvoiceId,
                invoice_number: 'INV-000042',
                currency: 'USD',
                issue_date: '2026-09-16',
                due_date: '2026-10-16',
                subtotal_minor: '5000',
                tax_minor: '0',
                total_minor: '5000',
                customer_id: 'cust-1',
                seller_snapshot: { legalName: 'Seller Inc', locale: 'en-US', timeZone: 'UTC' },
                buyer_snapshot: { legalName: 'Buyer LLC', billingEmail: 'buyer@example.com' },
                invoice_footer_text: 'Thank you for your business.',
              },
            ],
          };
        }
        if (sql.includes('FROM gigalibs_ar.invoice_lines')) {
          return {
            rows: [
              {
                position: 1,
                description: 'Product Engineering',
                quantity: '1',
                unit_amount_minor: '5000',
                amount_minor: '5000',
              },
            ],
          };
        }
        if (sql.includes('FROM gigalibs_ar.invoice_deliveries') && sql.includes('idempotency_key = $3')) {
          return { rows: [] }; // No existing delivery for this idempotency key
        }
        if (sql.includes('FROM gigalibs_ar.invoice_deliveries') && sql.includes('id = $2')) {
          return {
            rows: [
              {
                id: 'del-failed-01',
                invoice_id: mockInvoiceId,
                pdf_render_id: 'pdf-render-01',
                recipient_email: 'buyer@example.com',
                recipient_name: 'Buyer LLC',
                subject_line: 'Invoice INV-000042 from Seller Inc',
                status: 'FAILED',
                failure_reason: 'ECONNREFUSED 127.0.0.1:587',
                sent_at: null,
                delivered_by: mockPrincipal.subject,
                created_at: '2026-09-16T12:00:00.000Z',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const service = new DeliveriesService(mockDb as any, createMockStorage() as any);
      // Mock mailer to simulate SMTP connection failure
      (service as any).mailer = {
        sendMail: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:587')),
      };

      const result = await service.deliver(mockInvoiceId, mockPrincipal, 'idem-del-fail', 'corr-del-3');
      expect(result.status).toBe(409);
      expect(result.body.status).toBe('FAILED');
      expect(result.body.failureReason).toContain('ECONNREFUSED');
      expect(result.body.sentAt).toBeNull();

      // Verify that PDF render was still persisted in the transaction
      const pdfInsert = insertedQueries.find((q) =>
        q.sql.includes('INSERT INTO gigalibs_ar.invoice_pdf_renders'),
      );
      expect(pdfInsert).toBeDefined();
    });

    it('records SENT status with sentAt timestamp when mailer succeeds', async () => {
      const insertedQueries: Array<{ sql: string; params: unknown[] }> = [];
      const mockDb = createMockDatabase(async (sql, params) => {
        insertedQueries.push({ sql, params });
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('FROM gigalibs_ar.invoices i')) {
          return {
            rows: [
              {
                id: mockInvoiceId,
                invoice_number: 'INV-000042',
                currency: 'USD',
                issue_date: '2026-09-16',
                due_date: '2026-10-16',
                subtotal_minor: '5000',
                tax_minor: '0',
                total_minor: '5000',
                customer_id: 'cust-1',
                seller_snapshot: { legalName: 'Seller Inc', locale: 'en-US', timeZone: 'UTC' },
                buyer_snapshot: { legalName: 'Buyer LLC', billingEmail: 'buyer@example.com' },
                invoice_footer_text: 'Thank you for your business.',
              },
            ],
          };
        }
        if (sql.includes('FROM gigalibs_ar.invoice_lines')) {
          return {
            rows: [
              {
                position: 1,
                description: 'Product Engineering',
                quantity: '1',
                unit_amount_minor: '5000',
                amount_minor: '5000',
              },
            ],
          };
        }
        if (sql.includes('FROM gigalibs_ar.invoice_deliveries') && sql.includes('idempotency_key = $3')) {
          return { rows: [] }; // No existing delivery for this idempotency key
        }
        if (sql.includes('FROM gigalibs_ar.invoice_deliveries') && sql.includes('id = $2')) {
          return {
            rows: [
              {
                id: 'del-sent-01',
                invoice_id: mockInvoiceId,
                pdf_render_id: 'pdf-render-01',
                recipient_email: 'buyer@example.com',
                recipient_name: 'Buyer LLC',
                subject_line: 'Invoice INV-000042 from Seller Inc',
                status: 'SENT',
                failure_reason: null,
                sent_at: '2026-09-16T12:00:00.000Z',
                delivered_by: mockPrincipal.subject,
                created_at: '2026-09-16T12:00:00.000Z',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const service = new DeliveriesService(mockDb as any, createMockStorage() as any);
      // Mock mailer to simulate successful SMTP dispatch
      (service as any).mailer = {
        sendMail: vi.fn().mockResolvedValue({ messageId: 'msg-001' }),
      };

      const result = await service.deliver(mockInvoiceId, mockPrincipal, 'idem-del-success', 'corr-del-4');
      expect(result.status).toBe(201);
      expect(result.body.status).toBe('SENT');
      expect(result.body.sentAt).toBeTruthy();
    });
  });

  describe('getDownloadUrl', () => {
    it('returns presigned URL when S3 storage is enabled and storage_key is present', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_pdf_renders')) {
          return {
            rows: [
              {
                invoice_number: 'INV-2026-0001',
                storage_key: 'tenants/1111/invoices/3333/render-1.pdf',
                storage_provider: 'S3',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const mockStorage = createMockStorage({
        isEnabled: vi.fn(() => true),
        createDownloadUrl: vi.fn(async () => ({
          url: 'https://s3.amazonaws.com/gigalibs-invoices/presigned-token',
          expiresAt: '2026-09-16T13:00:00.000Z',
        })),
      });

      const service = new DeliveriesService(mockDb as any, mockStorage as any);
      const res = await service.getDownloadUrl(mockInvoiceId, mockPrincipal);

      expect(res.downloadUrl).toContain('https://s3.amazonaws.com');
      expect(res.filename).toBe('INV-2026-0001.pdf');
      expect(res.expiresAt).toBeDefined();
    });

    it('falls back to local download endpoint when S3 storage is not enabled', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_pdf_renders')) {
          return {
            rows: [
              {
                invoice_number: 'INV-2026-0002',
                storage_key: null,
                storage_provider: 'DATABASE',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const service = new DeliveriesService(mockDb as any, createMockStorage() as any);
      const res = await service.getDownloadUrl(mockInvoiceId, mockPrincipal);

      expect(res.downloadUrl).toBe(`/v1/invoices/${mockInvoiceId}/pdf`);
      expect(res.filename).toBe('INV-2026-0002.pdf');
    });

    it('throws NotFoundException if invoice has no rendered PDF', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        return { rows: [] };
      });

      const service = new DeliveriesService(mockDb as any, createMockStorage() as any);
      await expect(service.getDownloadUrl(mockInvoiceId, mockPrincipal)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
