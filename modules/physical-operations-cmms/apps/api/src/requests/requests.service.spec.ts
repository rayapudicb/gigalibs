import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateCmmsRequestV1Schema,
  TriageCmmsRequestV1Schema,
  CancelCmmsRequestV1Schema,
  SearchCmmsRequestsV1Schema,
} from '@gigalibs/contracts';
import { parseInput } from '../common/command.js';
import { RequestsService } from './requests.service.js';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { cmmsRecordDispatcher } from '../work-orders/cmms-record-adapters.js';
import { MemoryIdempotencyStore } from '../test/memory-idempotency-store.js';

function makePrincipal(subject: string, permissions: string[]): CmmsPrincipal {
  return {
    tenantId: 'tenant-test',
    subject,
    sessionId: 'session-1',
    authVersion: 1,
    permissions,
    roles: [],
    persona: 'OPERATIONS_SUPERVISOR',
    departmentScope: { mode: 'ALL' },
    placeScope: { mode: 'ALL' },
  };
}

function makeContext(principal: CmmsPrincipal): CmmsCommandContext {
  return {
    principal,
    correlationId: randomUUID(),
  };
}

describe('WI-OI-120t (M-CM1 Slice 2): Maintenance Requests Contracts & Service', () => {
  describe('Zod Schema & Input Validation', () => {
    it('validates CreateCmmsRequestV1Schema', () => {
      const valid = parseInput(CreateCmmsRequestV1Schema, {
        title: 'Leaking pipe under sink',
        description: 'Water pooling on floor in kitchen',
        priority: 'HIGH',
      });
      expect(valid.title).toBe('Leaking pipe under sink');
      expect(valid.priority).toBe('HIGH');

      // Default priority is MEDIUM
      const defaultPriority = parseInput(CreateCmmsRequestV1Schema, {
        title: 'Flickering light',
      });
      expect(defaultPriority.priority).toBe('MEDIUM');

      // Rejects empty title
      expect(() => parseInput(CreateCmmsRequestV1Schema, { title: '' })).toThrow(BadRequestException);

      // Rejects invalid priority
      expect(() =>
        parseInput(CreateCmmsRequestV1Schema, { title: 'Test', priority: 'URGENT' }),
      ).toThrow(BadRequestException);
    });

    it('validates TriageCmmsRequestV1Schema', () => {
      const accept = parseInput(TriageCmmsRequestV1Schema, {
        action: 'ACCEPT',
        workOrderType: 'REACTIVE',
        priority: 'HIGH',
        assignedTo: 'tech-alice',
      });
      expect(accept.action).toBe('ACCEPT');
      expect(accept.assignedTo).toBe('tech-alice');

      const reject = parseInput(TriageCmmsRequestV1Schema, {
        action: 'REJECT',
        reason: 'Duplicate of REQ-000042',
      });
      expect(reject.action).toBe('REJECT');
      expect(reject.reason).toBe('Duplicate of REQ-000042');

      // Rejects invalid action
      expect(() =>
        parseInput(TriageCmmsRequestV1Schema, { action: 'POSTPONE' }),
      ).toThrow(BadRequestException);
    });

    it('validates CancelCmmsRequestV1Schema', () => {
      const cancel = parseInput(CancelCmmsRequestV1Schema, {
        reason: 'Resolved itself',
        expectedVersion: 1,
      });
      expect(cancel.reason).toBe('Resolved itself');
      expect(cancel.expectedVersion).toBe(1);
    });

    it('validates SearchCmmsRequestsV1Schema', () => {
      const search = parseInput(SearchCmmsRequestsV1Schema, {
        page: 2,
        pageSize: 25,
        status: 'PENDING',
        priority: 'HIGH',
      });
      expect(search.page).toBe(2);
      expect(search.pageSize).toBe(25);
      expect(search.status).toBe('PENDING');
      expect(search.priority).toBe('HIGH');
    });
  });

  describe('RequestsService Domain Operations', () => {
    let mockClient: any;
    let mockDatabase: any;
    let mockAssets: any;
    let mockWorkOrders: any;
    let service: RequestsService;

    const requesterSubject = 'user-requester';
    const otherRequester = 'user-other';
    const plannerSubject = 'planner-bob';

    const requesterPrincipal = makePrincipal(requesterSubject, [
      'cmms:read',
      'cmms.requests.read',
      'cmms.requests.create',
    ]);
    const plannerPrincipal = makePrincipal(plannerSubject, [
      'cmms:read',
      'cmms.requests.read',
      'cmms.requests.create',
      'cmms.requests.write',
      'cmms.work-orders.write',
    ]);

    beforeEach(() => {
      mockClient = {
        query: vi.fn(),
      };
      mockDatabase = {
        withTenantTransaction: vi.fn(async (_tenantId, callback) => callback(mockClient)),
      };
      mockAssets = {
        visibleAsset: vi.fn().mockResolvedValue({ id: randomUUID(), name: 'Main Chiller' }),
      };
      mockWorkOrders = {
        createWithClient: vi.fn().mockResolvedValue('wo-12345678-1234-4234-8234-1234567890ab'),
      };
      service = new RequestsService(mockDatabase, mockAssets, mockWorkOrders);
    });

    it('submits a request and generates REQ-000001 counter number', async () => {
      const reqId = randomUUID();
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ last_value: '1' }] }) // counter
        .mockResolvedValueOnce({
          rows: [
            {
              id: reqId,
              tenant_id: 'tenant-test',
              request_number: 'REQ-000001',
              title: 'AC unit blowing hot air',
              description: 'Room 302',
              priority: 'HIGH',
              status: 'PENDING',
              requester_subject: requesterSubject,
              requester_name: 'Alice',
              version: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        }) // insert
        .mockResolvedValueOnce({ rows: [] }) // mutation
        .mockResolvedValueOnce({ rows: [] }); // outbox

      const res = await service.submit(makeContext(requesterPrincipal), {
        title: 'AC unit blowing hot air',
        description: 'Room 302',
        priority: 'HIGH',
        requesterName: 'Alice',
      });

      expect(res.requestNumber).toBe('REQ-000001');
      expect(res.title).toBe('AC unit blowing hot air');
      expect(res.requesterSubject).toBe(requesterSubject);
      expect(res.status).toBe('PENDING');
    });

    it('enforces requester scope on get(): another user\'s request is not found (WI-OI-120be, D2a)', async () => {
      const reqId = randomUUID();
      // The query itself keeps a non-planner to their own requests, so another user's row never comes back.
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.get(requesterPrincipal, reqId)).rejects.toThrow(NotFoundException);
      const [sql, values] = mockClient.query.mock.calls.at(-1) as [string, unknown[]];
      expect(sql).toMatch(/r\.requester_subject = \$3/);
      expect(values).toEqual(['tenant-test', reqId, requesterSubject]);
    });

    it('allows requester to get() their own request and planner to get() any request', async () => {
      const reqId = randomUUID();
      const mockRow = {
        id: reqId,
        tenant_id: 'tenant-test',
        request_number: 'REQ-000002',
        title: 'Water leak',
        status: 'PENDING',
        priority: 'MEDIUM',
        requester_subject: requesterSubject,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Requester reads own request -> OK
      mockClient.query.mockResolvedValueOnce({ rows: [mockRow] });
      const ownRes = await service.get(requesterPrincipal, reqId);
      expect(ownRes.id).toBe(reqId);

      // Planner reads someone else's request -> OK
      mockClient.query.mockResolvedValueOnce({ rows: [{ ...mockRow, requester_subject: otherRequester }] });
      const plannerRes = await service.get(plannerPrincipal, reqId);
      expect(plannerRes.id).toBe(reqId);
    });

    it('triages by accepting request: generates work order and sets status ACCEPTED', async () => {
      const reqId = randomUUID();
      const woId = randomUUID();
      mockWorkOrders.createWithClient.mockResolvedValueOnce(woId);

      const existingRow = {
        id: reqId,
        tenant_id: 'tenant-test',
        request_number: 'REQ-000003',
        title: 'Conveyor belt slippage',
        status: 'PENDING',
        priority: 'HIGH',
        requester_subject: requesterSubject,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const acceptedRow = {
        ...existingRow,
        status: 'ACCEPTED',
        converted_wo_id: woId,
        converted_wo_number: 'WO-2026-000105',
        triaged_by: plannerSubject,
        triaged_at: new Date(),
        version: 2,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [existingRow] }) // select for update
        .mockResolvedValueOnce({ rows: [acceptedRow] }) // update request
        .mockResolvedValueOnce({ rows: [] }) // mutation
        .mockResolvedValueOnce({ rows: [] }) // outbox
        .mockResolvedValueOnce({ rows: [acceptedRow] }); // reload

      const result = await service.triage(makeContext(plannerPrincipal), reqId, {
        action: 'ACCEPT',
        workOrderType: 'REACTIVE',
        assignedTo: 'tech-alice',
      });

      expect(result.workOrderId).toBe(woId);
      expect(result.request.status).toBe('ACCEPTED');
      expect(result.request.convertedWoId).toBe(woId);
      expect(mockWorkOrders.createWithClient).toHaveBeenCalled();
    });

    it('triages by rejecting request: requires reason and sets status REJECTED', async () => {
      const reqId = randomUUID();
      const existingRow = {
        id: reqId,
        tenant_id: 'tenant-test',
        request_number: 'REQ-000004',
        title: 'Broken chair',
        status: 'PENDING',
        priority: 'LOW',
        requester_subject: requesterSubject,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Fails if reason is missing or empty (schema validation fails before DB query)
      await expect(
        service.triage(makeContext(plannerPrincipal), reqId, { action: 'REJECT', reason: '   ' }),
      ).rejects.toThrow(BadRequestException);

      const rejectedRow = {
        ...existingRow,
        status: 'REJECTED',
        rejection_reason: 'Non-maintenance equipment; routed to facilities admin.',
        triaged_by: plannerSubject,
        triaged_at: new Date(),
        version: 2,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [existingRow] }) // select for update
        .mockResolvedValueOnce({ rows: [rejectedRow] }) // update request
        .mockResolvedValueOnce({ rows: [] }) // mutation
        .mockResolvedValueOnce({ rows: [] }) // outbox
        .mockResolvedValueOnce({ rows: [rejectedRow] }); // reload

      const result = await service.triage(makeContext(plannerPrincipal), reqId, {
        action: 'REJECT',
        reason: 'Non-maintenance equipment; routed to facilities admin.',
      });

      expect(result.request.status).toBe('REJECTED');
      expect(result.request.rejectionReason).toContain('Non-maintenance equipment');
    });

    it('forbids triaging an already triaged request with 409 Conflict', async () => {
      const reqId = randomUUID();
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: reqId,
            tenant_id: 'tenant-test',
            status: 'ACCEPTED',
            version: 2,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      await expect(
        service.triage(makeContext(plannerPrincipal), reqId, { action: 'ACCEPT' }),
      ).rejects.toThrow(ConflictException);
    });

    it('cancels pending request: requester can cancel own, non-planner cannot cancel another\'s', async () => {
      const reqId = randomUUID();
      const existingRow = {
        id: reqId,
        tenant_id: 'tenant-test',
        request_number: 'REQ-000005',
        title: 'False alarm sensor',
        status: 'PENDING',
        priority: 'LOW',
        requester_subject: otherRequester,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Requester Alice tries to cancel Bob's request: the query keeps her to her own, so it is not found
      // (WI-OI-120be, D2a).
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.cancel(makeContext(requesterPrincipal), reqId, { reason: 'No longer needed' }),
      ).rejects.toThrow(NotFoundException);
      expect((mockClient.query.mock.calls.at(-1) as [string])[0]).toMatch(/r\.requester_subject = \$3[\s\S]*FOR UPDATE OF r/);
      expect(existingRow.requester_subject).toBe(otherRequester);

      // Requester cancels own request -> OK
      const ownRow = { ...existingRow, requester_subject: requesterSubject };
      const cancelledRow = { ...ownRow, status: 'CANCELLED', version: 2 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [ownRow] }) // select for update
        .mockResolvedValueOnce({ rows: [cancelledRow] }) // update
        .mockResolvedValueOnce({ rows: [] }) // mutation
        .mockResolvedValueOnce({ rows: [] }) // outbox
        .mockResolvedValueOnce({ rows: [cancelledRow] }); // reload

      const res = await service.cancel(makeContext(requesterPrincipal), reqId, {
        reason: 'Issue resolved on its own',
      });
      expect(res.status).toBe('CANCELLED');
    });
  });

  describe('Record Dispatcher & cmms.maintenance-requests Adapter', () => {
    it('executes accept and reject actions through the record adapter', async () => {
      const reqId = randomUUID();
      const woId = randomUUID();
      const mockRequestsService = {
        get: vi.fn(),
        search: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
        submit: vi.fn(),
        triage: vi.fn().mockImplementation(async (_ctx, id, body) => {
          if (body.action === 'ACCEPT') {
            return {
              workOrderId: woId,
              request: {
                id,
                requestNumber: 'REQ-000010',
                title: 'Motor vibration',
                status: 'ACCEPTED',
                priority: 'HIGH',
                version: 2,
                convertedWoId: woId,
                convertedWoNumber: 'WO-2026-000110',
                requesterSubject: 'alice',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            };
          }
          return {
            request: {
              id,
              requestNumber: 'REQ-000010',
              title: 'Motor vibration',
              status: 'REJECTED',
              priority: 'HIGH',
              rejectionReason: body.reason,
              version: 2,
              requesterSubject: 'alice',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          };
        }),
        cancel: vi.fn().mockResolvedValue({
          id: reqId,
          requestNumber: 'REQ-000010',
          title: 'Motor vibration',
          status: 'CANCELLED',
          priority: 'HIGH',
          version: 2,
          requesterSubject: 'alice',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      };

      const dispatcher = cmmsRecordDispatcher({
        workOrders: {} as any,
        assets: {} as any,
        parts: {} as any,
        requests: mockRequestsService as any,
      }, new MemoryIdempotencyStore());

      const plannerPrincipal = makePrincipal('planner', [
        'cmms:read',
        'cmms.requests.read',
        'cmms.requests.create',
        'cmms.requests.write',
      ]);

      // Accept action
      const acceptResult = await dispatcher.action(
        { principal: plannerPrincipal as any, correlationId: randomUUID() },
        'cmms.maintenance-requests',
        reqId,
        'accept',
        { 'work-order-type': 'REACTIVE', priority: 'HIGH' },
        randomUUID(),
      );
      expect(acceptResult.status).toBe('ACCEPTED');
      expect(acceptResult['converted-wo-id']).toBe(woId);

      // Reject action
      const rejectResult = await dispatcher.action(
        { principal: plannerPrincipal as any, correlationId: randomUUID() },
        'cmms.maintenance-requests',
        reqId,
        'reject',
        { reason: 'Not an equipment defect' },
        randomUUID(),
      );
      expect(rejectResult.status).toBe('REJECTED');
      expect(rejectResult['rejection-reason']).toBe('Not an equipment defect');

      // Cancel action
      const cancelResult = await dispatcher.action(
        { principal: plannerPrincipal as any, correlationId: randomUUID() },
        'cmms.maintenance-requests',
        reqId,
        'cancel',
        { reason: 'Operator error cleared' },
        randomUUID(),
      );
      expect(cancelResult.status).toBe('CANCELLED');
    });

    it('resolves cmms-requests lookup options', async () => {
      const mockRequestsService = {
        search: vi.fn().mockResolvedValue({
          items: [
            { id: '11111111-1111-4111-8111-111111111111', requestNumber: 'REQ-000001', title: 'HVAC Leak' },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
      };

      const dispatcher = cmmsRecordDispatcher({
        workOrders: {} as any,
        assets: {} as any,
        parts: {} as any,
        requests: mockRequestsService as any,
      }, new MemoryIdempotencyStore());

      const principal = makePrincipal('user1', ['cmms:read', 'cmms.requests.read']);
      const options = await dispatcher.lookup(principal as any, 'cmms-requests', { search: 'HVAC' });

      expect(options).toHaveLength(1);
      expect(options[0]).toEqual({
        value: '11111111-1111-4111-8111-111111111111',
        label: 'REQ-000001 - HVAC Leak',
      });
    });
  });
});
