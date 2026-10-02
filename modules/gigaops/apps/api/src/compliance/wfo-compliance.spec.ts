import { describe, expect, it, vi } from 'vitest';
import {
  CreateWfoSupportTicketV1Schema,
  CreateWfoVendorV1Schema,
  WfoSendMessageV1Schema,
} from '@gigalibs/contracts';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WfoCommsService } from '../comms/wfo-comms.service.js';
import { WfoComplianceService } from './wfo-compliance.service.js';

describe('WI-WFO-005: Compliance, Comms & Vendors Service Rules', () => {
  const principal: GigaOpsPrincipal = {
    subject: 'admin-1',
    tenantId: 'tenant-wfo',
    roles: ['TENANT_ADMIN'],
    placeScopes: [],
    attributes: {},
  };

  it('calculates compliance rates and document queues accurately', async () => {
    const mockDb: any = {
      withTenantTransaction: vi.fn().mockImplementation(async (_tenantId, cb) => {
        return cb({
          query: vi.fn().mockImplementation(async (sql: string) => {
            if (sql.includes('FROM gigalibs_workforce.wfo_workers')) {
              return {
                rows: [
                  {
                    total: 100,
                    compliant: 85,
                    pending: 10,
                    expired: 5,
                  },
                ],
              };
            }
            if (sql.includes('FROM gigalibs_workforce.wfo_compliance_documents')) {
              return {
                rows: [
                  {
                    pending_docs: 12,
                    expiring_docs: 7,
                  },
                ],
              };
            }
            return { rows: [] };
          }),
        });
      }),
    };

    const service = new WfoComplianceService(mockDb);
    const summary = await service.getSummary(principal);

    expect(summary.totalWorkers).toBe(100);
    expect(summary.compliantWorkers).toBe(85);
    expect(summary.complianceRatePct).toBe(85.0);
    expect(summary.pendingDocumentsCount).toBe(12);
    expect(summary.expiring30DaysCount).toBe(7);
  });

  it('broadcasts messages to workers and records notification log', async () => {
    const mockDb: any = {
      withTenantTransaction: vi.fn().mockImplementation(async (_tenantId, cb) => {
        return cb({
          query: vi.fn().mockImplementation(async (sql: string, params: any[]) => {
            if (sql.includes('INSERT INTO gigalibs_workforce.wfo_notification_log')) {
              return {
                rows: [
                  {
                    id: '11111111-1111-4111-8111-111111111111',
                    tenantId: 'tenant-wfo',
                    recipientWorkerId: params[1],
                    channel: params[2],
                    eventType: params[3],
                    subject: params[4],
                    body: params[5],
                    deliveryStatus: 'DELIVERED',
                    sentAt: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                  },
                ],
              };
            }
            return { rows: [] };
          }),
        });
      }),
    };

    const commsService = new WfoCommsService(mockDb);
    const result = await commsService.sendMessage(principal, {
      recipientWorkerId: '22222222-2222-4222-8222-222222222222',
      channel: 'SMS',
      subject: 'Shift Reminder',
      body: 'Your shift begins tomorrow at 8:00 AM.',
    });

    expect(result.sentCount).toBe(1);
    expect(result.notifications[0].channel).toBe('SMS');
    expect(result.notifications[0].deliveryStatus).toBe('DELIVERED');
  });

  it('validates vendor registration and worker support ticket schemas', () => {
    const validVendor = {
      name: 'Apex Staffing Solutions',
      contactEmail: 'ops@apexstaffing.com',
      contactPhone: '+1-555-0199',
      paymentTerms: 'NET30',
    };
    expect(() => CreateWfoVendorV1Schema.parse(validVendor)).not.toThrow();

    const validTicket = {
      workerId: '33333333-3333-4333-8333-333333333333',
      category: 'PAYROLL' as const,
      subject: 'Missing overtime premium on paystub',
      description: 'The Sunday overtime was not calculated at 1.5x.',
      priority: 'HIGH' as const,
    };
    expect(() => CreateWfoSupportTicketV1Schema.parse(validTicket)).not.toThrow();
  });
});
