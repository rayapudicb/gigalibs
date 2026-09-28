import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { WorkSourcesService } from './work-sources.service.js';
import { ArConflictError } from '../http/problem.filter.js';
import type { ArPrincipal } from '../auth/authorization.js';

const mockPrincipal: ArPrincipal = {
  subject: 'usr_event_billing_mgr',
  tenantId: '11111111-1111-4111-a111-111111111111',
  permissions: ['ar:write', 'ar:read'],
  issuer: 'https://auth.gigalibs.test',
};

const mockCustomerId = '22222222-2222-4222-a222-222222222222';
const mockWorkSourceId = '33333333-3333-4333-a333-333333333333';
const mockBillingEntityId = '44444444-4444-4444-a444-444444444444';

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

describe('FR-17-EB: Universal Work-Source Event Billing & Supplemental Invoicing', () => {
  describe('createWorkSource', () => {
    it('registers a work source for an active customer', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.customers')) {
          return { rows: [{ id: mockCustomerId }] };
        }
        return { rows: [] };
      });
      const service = new WorkSourcesService(mockDb as any);

      const result = await service.createWorkSource(
        {
          customerId: mockCustomerId,
          sourceType: 'EVENT',
          sourceReference: 'EVT-2026-FESTIVAL',
          name: 'Summer Arts Festival 2026',
        },
        mockPrincipal,
      );

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Summer Arts Festival 2026');
      expect(result.sourceReference).toBe('EVT-2026-FESTIVAL');
      expect(mockDb.client.query).toHaveBeenCalledWith(
        expect.stringContaining('gigalibs_ar.work_sources'),
        expect.arrayContaining([mockPrincipal.tenantId, expect.any(String), mockCustomerId, 'EVENT', 'EVT-2026-FESTIVAL']),
      );
    });

    it('rejects work source registration if customer does not exist', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.customers')) {
          return { rows: [] };
        }
        return { rows: [] };
      });
      const service = new WorkSourcesService(mockDb as any);

      await expect(
        service.createWorkSource(
          {
            customerId: mockCustomerId,
            sourceType: 'EVENT',
            sourceReference: 'EVT-2026-FESTIVAL',
            name: 'Summer Arts Festival 2026',
          },
          mockPrincipal,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('ingestRecords & Markup Calculation', () => {
    it('calculates billed rate and total from percentage and flat markup', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.work_sources')) {
          return { rows: [{ id: mockWorkSourceId }] };
        }
        return { rows: [] };
      });
      const service = new WorkSourcesService(mockDb as any);

      // raw_cost = 10000 ($100), quantity = 8, markupPercentBp = 3500 (35%), markupFlatMinor = 500 ($5)
      // expected billed_rate = 10000 * 1.35 + 500 = 14000 ($140)
      // expected billed_total = 8 * 14000 = 112000 ($1,120)
      const result = await service.ingestRecords(
        mockWorkSourceId,
        {
          records: [
            {
              externalRecordId: 'REC-001',
              resourceName: 'Alex Mercer',
              resourceRole: 'Lead Sound Engineer',
              category: 'CREW_LABOR',
              quantity: 8,
              rawCostMinor: 10000,
              markupPercentBp: 3500,
              markupFlatMinor: 500,
              approvalStatus: 'APPROVED',
            },
          ],
        },
        mockPrincipal,
      );

      expect(result.ingested).toBe(1);
      expect(mockDb.client.query).toHaveBeenCalledWith(
        expect.stringContaining('gigalibs_ar.billable_source_records'),
        expect.arrayContaining([14000, 112000, 'APPROVED']),
      );
    });
  });

  describe('FR-17-EB-01 & EB-14: 30-Record Supplemental Billing Lifecycle', () => {
    it('returns accurate summary counts and amounts', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.work_sources') && sql.includes('SELECT')) {
          return {
            rows: [
              { id: mockWorkSourceId, source_reference: 'EVT-2026-FESTIVAL', name: 'Summer Festival' },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.billable_source_records') && sql.includes('COUNT(*)')) {
          return {
            rows: [
              {
                total_records: '30',
                unique_workers: '18',
                pending: '4',
                approved: '26',
                rejected: '0',
                reserved: '0',
                invoiced: '0',
                ready_to_bill: '26',
                raw_cost: '260000',
                ready_minor: '351000',
                invoiced_minor: '0',
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new WorkSourcesService(mockDb as any);

      const summary = await service.getSummary(mockWorkSourceId, mockPrincipal);

      expect(summary.totalRecords).toBe(30);
      expect(summary.uniqueWorkers).toBe(18);
      expect(summary.counts.approved).toBe(26);
      expect(summary.counts.pending).toBe(4);
      expect(summary.counts.readyToBill).toBe(26);
      expect(summary.amounts.readyToBillMinor).toBe(351000);
    });

    it('generates original invoice for the first 26 approved records (FR-17-EB-14 Stage 1)', async () => {
      const records26 = Array.from({ length: 26 }, (_, i) => ({
        id: `rec-${i + 1}`,
        resource_name: `Worker ${i + 1}`,
        resource_role: 'Stage Crew',
        category: 'CREW_LABOR',
        quantity: '8',
        billed_rate_minor: '13500',
        billed_total_minor: '108000', // 8 * 13500
      }));

      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.work_sources') && sql.includes('SELECT')) {
          return {
            rows: [
              {
                id: mockWorkSourceId,
                customer_id: mockCustomerId,
                source_reference: 'EVT-2026',
                name: 'Summer Festival',
              },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.billable_source_records') && sql.includes('FOR UPDATE')) {
          return { rows: records26 };
        }
        if (sql.includes('gigalibs_ar.invoice_families') && sql.includes('MAX(sequence_number)')) {
          return { rows: [{ max_seq: null }] }; // First invoice in family!
        }
        if (sql.includes('gigalibs_ar.billing_entities')) {
          return { rows: [{ id: mockBillingEntityId }] };
        }
        return { rows: [] };
      });
      const service = new WorkSourcesService(mockDb as any);

      const result = await service.generateInvoice(
        mockWorkSourceId,
        { currency: 'USD', taxRateBp: 1000 }, // 10% tax
        mockPrincipal,
        'corr-gen-1',
      );

      // 26 records * 108000 = 2,808,000 subtotal
      // tax (10%) = 280,800
      // total = 3,088,800
      expect(result.sequenceNumber).toBe(0);
      expect(result.familyRole).toBe('ORIGINAL');
      expect(result.recordCount).toBe(26);
      expect(result.subtotalMinor).toBe(2808000);
      expect(result.taxMinor).toBe(280800);
      expect(result.totalMinor).toBe(3088800);

      // Verify records marked RESERVED
      expect(mockDb.client.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE gigalibs_ar.billable_source_records"),
        expect.arrayContaining([result.draftId, mockPrincipal.tenantId, expect.any(Array)]),
      );

      // Verify invoice_families recorded
      expect(mockDb.client.query).toHaveBeenCalledWith(
        expect.stringContaining('gigalibs_ar.invoice_families'),
        expect.arrayContaining([mockPrincipal.tenantId, expect.any(String), mockWorkSourceId, result.draftId, 0, 'ORIGINAL', 26]),
      );

      // Verify outbox event emitted
      expect(mockDb.client.query).toHaveBeenCalledWith(
        expect.stringContaining('ar.work-source.invoice-generated.v1'),
        expect.any(Array),
      );
    });

    it('rejects invoice generation when zero records are ready to bill (FR-17-EB-01)', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.work_sources') && sql.includes('SELECT')) {
          return {
            rows: [
              {
                id: mockWorkSourceId,
                customer_id: mockCustomerId,
                source_reference: 'EVT-2026',
                name: 'Summer Festival',
              },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.billable_source_records') && sql.includes('FOR UPDATE')) {
          return { rows: [] }; // 0 eligible records
        }
        return { rows: [] };
      });
      const service = new WorkSourcesService(mockDb as any);

      await expect(
        service.generateInvoice(mockWorkSourceId, {}, mockPrincipal, 'corr-gen-empty'),
      ).rejects.toThrow(ArConflictError);
    });

    it('generates supplemental sequence 1 for the 4 later-approved records (FR-17-EB-14 Stage 2)', async () => {
      const records4 = Array.from({ length: 4 }, (_, i) => ({
        id: `rec-late-${i + 1}`,
        resource_name: `Late Worker ${i + 1}`,
        resource_role: 'Spotlight Operator',
        category: 'CREW_LABOR',
        quantity: '8',
        billed_rate_minor: '13500',
        billed_total_minor: '108000',
      }));

      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.work_sources') && sql.includes('SELECT')) {
          return {
            rows: [
              {
                id: mockWorkSourceId,
                customer_id: mockCustomerId,
                source_reference: 'EVT-2026',
                name: 'Summer Festival',
              },
            ],
          };
        }
        if (sql.includes('gigalibs_ar.billable_source_records') && sql.includes('FOR UPDATE')) {
          return { rows: records4 }; // Exactly 4 newly approved records
        }
        if (sql.includes('gigalibs_ar.invoice_families') && sql.includes('MAX(sequence_number)')) {
          return { rows: [{ max_seq: '0' }] }; // Existing original is seq 0!
        }
        if (sql.includes('gigalibs_ar.billing_entities')) {
          return { rows: [{ id: mockBillingEntityId }] };
        }
        return { rows: [] };
      });
      const service = new WorkSourcesService(mockDb as any);

      const result = await service.generateInvoice(
        mockWorkSourceId,
        { currency: 'USD', taxRateBp: 0 },
        mockPrincipal,
        'corr-gen-supp-1',
      );

      // Sequence must be 1, familyRole must be SUPPLEMENTAL
      expect(result.sequenceNumber).toBe(1);
      expect(result.familyRole).toBe('SUPPLEMENTAL');
      expect(result.recordCount).toBe(4);
      expect(result.subtotalMinor).toBe(432000); // 4 * 108000
      expect(result.totalMinor).toBe(432000);

      // Family record inserted with sequence 1
      expect(mockDb.client.query).toHaveBeenCalledWith(
        expect.stringContaining('gigalibs_ar.invoice_families'),
        expect.arrayContaining([mockPrincipal.tenantId, expect.any(String), mockWorkSourceId, result.draftId, 1, 'SUPPLEMENTAL', 4]),
      );
    });

    it('returns the complete family lineage in sequence (FR-17-EB-03)', async () => {
      const mockDb = createMockDatabase(async (sql) => {
        if (sql.includes('gigalibs_ar.module_tenants')) {
          return { rows: [{ id: mockPrincipal.tenantId, oidc_issuer: mockPrincipal.issuer, status: 'ACTIVE' }] };
        }
        if (sql.includes('gigalibs_ar.invoice_families')) {
          return {
            rows: [
              {
                invoice_id: 'inv-orig-1',
                sequence_number: 0,
                family_role: 'ORIGINAL',
                record_count: 26,
                status: 'ISSUED',
                total_minor: '3088800',
                currency: 'USD',
                created_at: new Date().toISOString(),
              },
              {
                invoice_id: 'inv-supp-1',
                sequence_number: 1,
                family_role: 'SUPPLEMENTAL',
                record_count: 4,
                status: 'DRAFT',
                total_minor: '432000',
                currency: 'USD',
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      });
      const service = new WorkSourcesService(mockDb as any);

      const family = await service.getFamily(mockWorkSourceId, mockPrincipal);

      expect(family.items).toHaveLength(2);
      expect(family.items[0]!.sequenceNumber).toBe(0);
      expect(family.items[0]!.familyRole).toBe('ORIGINAL');
      expect(family.items[0]!.recordCount).toBe(26);
      expect(family.items[1]!.sequenceNumber).toBe(1);
      expect(family.items[1]!.familyRole).toBe('SUPPLEMENTAL');
      expect(family.items[1]!.recordCount).toBe(4);
    });
  });
});
