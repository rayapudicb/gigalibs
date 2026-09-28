import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreditNotesService } from './credit-notes.service.js';
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

describe('CreditNotesService', () => {
  describe('issue', () => {
    it('rejects invalid inputs such as invalid date or empty lines', async () => {
      const mockDb = createMockDatabase(async () => ({ rows: [] }));
      const service = new CreditNotesService(mockDb as any);

      await expect(
        service.issue(
          mockDraftId,
          { reason: 'Discount', issueDate: 'not-a-date', lines: [] },
          mockPrincipal,
          'corr-cn-1',
        ),
      ).rejects.toThrow();
    });

    it('throws NotFoundException when invoice does not exist', async () => {
      const mockDb = createMockDatabase(async () => ({ rows: [] }));
      const service = new CreditNotesService(mockDb as any);

      await expect(
        service.issue(
          mockDraftId,
          {
            reason: 'Billing adjustment',
            issueDate: '2026-09-16',
            lines: [{ description: 'Adjustment item', quantity: 1, unitAmountMinor: 1000 }],
          },
          mockPrincipal,
          'corr-cn-2',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ArConflictError when invoice is still in DRAFT status', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return {
            rows: [
              {
                id: mockDraftId,
                issued_invoice_id: null,
                currency: 'USD',
                status: 'DRAFT',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new CreditNotesService(mockDb as any);

      await expect(
        service.issue(
          mockDraftId,
          {
            reason: 'Billing adjustment',
            issueDate: '2026-09-16',
            lines: [{ description: 'Adjustment item', quantity: 1, unitAmountMinor: 1000 }],
          },
          mockPrincipal,
          'corr-cn-3',
        ),
      ).rejects.toThrow(ArConflictError);
    });

    it('issues credit note, inserts payment record of CREDIT_NOTE and outbox event', async () => {
      const insertedQueries: Array<{ sql: string; params: unknown[] }> = [];
      const mockDb = createMockDatabase(async (sql, params) => {
        insertedQueries.push({ sql, params });
        if (sql.includes('SELECT d.id, d.issued_invoice_id, d.currency, d.status')) {
          return {
            rows: [
              {
                id: mockDraftId,
                issued_invoice_id: mockIssuedInvoiceId,
                currency: 'USD',
                status: 'ISSUED',
              },
            ],
          };
        }
        if (sql.includes('SELECT COALESCE(MAX(CAST(REGEXP_REPLACE')) {
          return { rows: [{ next_seq: '5' }] };
        }
        return { rows: [] };
      });
      const service = new CreditNotesService(mockDb as any);

      const result = await service.issue(
        mockDraftId,
        {
          reason: 'Customer credit for SLA downtime',
          issueDate: '2026-09-16',
          lines: [
            { description: 'SLA refund 10%', quantity: 1, unitAmountMinor: 2500 },
          ],
        },
        mockPrincipal,
        'corr-cn-issue-1',
      );

      expect(result.creditNoteNumber).toBe('CN-000005');
      expect(result.subtotalMinor).toBe(2500);
      expect(result.totalMinor).toBe(2500);
      expect(result.currency).toBe('USD');
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]?.amountMinor).toBe(2500);

      // Verify that a corresponding CREDIT_NOTE payment record was created
      const paymentInsert = insertedQueries.find((q) =>
        q.sql.includes('INSERT INTO gigalibs_ar.payment_records'),
      );
      expect(paymentInsert).toBeDefined();
      expect(paymentInsert?.sql).toContain("'CREDIT_NOTE'");

      // Verify outbox event creation
      const outboxInsert = insertedQueries.find((q) =>
        q.sql.includes('INSERT INTO gigalibs_ar.outbox_events'),
      );
      expect(outboxInsert).toBeDefined();
      expect(outboxInsert?.sql).toContain('ar.invoice.credit-note-issued.v1');
    });
  });

  describe('logCollectionEvent', () => {
    it('throws BadRequestException when REMINDER_SENT has no channel', async () => {
      const mockDb = createMockDatabase(async () => ({ rows: [] }));
      const service = new CreditNotesService(mockDb as any);

      await expect(
        service.logCollectionEvent(
          mockDraftId,
          { eventType: 'REMINDER_SENT' },
          mockPrincipal,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records collection event and returns mapped response', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.invoice_drafts')) {
          return { rows: [{ issued_invoice_id: mockIssuedInvoiceId }] };
        }
        return { rows: [] };
      });
      const service = new CreditNotesService(mockDb as any);

      const res = await service.logCollectionEvent(
        mockDraftId,
        { eventType: 'REMINDER_SENT', channel: 'EMAIL', note: 'Sent gentle reminder' },
        mockPrincipal,
      );

      expect(res.invoiceId).toBe(mockIssuedInvoiceId);
      expect(res.eventType).toBe('REMINDER_SENT');
      expect(res.channel).toBe('EMAIL');
      expect(res.note).toBe('Sent gentle reminder');
      expect(res.actor).toBe(mockPrincipal.subject);
    });
  });

  describe('aging', () => {
    it('queries aging view and maps aging rows correctly', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.invoice_aging')) {
          return {
            rows: [
              {
                invoice_id: mockIssuedInvoiceId,
                draft_id: mockDraftId,
                invoice_number: 'INV-000001',
                customer_id: 'cust-1',
                currency: 'USD',
                total_minor: '10000',
                amount_paid_minor: '4000',
                amount_due_minor: '6000',
                due_date: '2026-08-01',
                days_overdue: '46',
                aging_bucket: 'OVERDUE_31_60',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new CreditNotesService(mockDb as any);

      const report = await service.aging(mockPrincipal);
      expect(report.items).toHaveLength(1);
      const row = report.items[0]!;
      expect(row.invoiceNumber).toBe('INV-000001');
      expect(row.totalMinor).toBe(10000);
      expect(row.amountPaidMinor).toBe(4000);
      expect(row.amountDueMinor).toBe(6000);
      expect(row.daysOverdue).toBe(46);
      expect(row.agingBucket).toBe('OVERDUE_31_60');
    });
  });
});
