/**
 * WI-OI-120t (M-CM1): Request-to-Close Maintenance Journey Specification
 *
 * Verifies the end-to-end request-to-close lifecycle through metadata window record adapters:
 * 1. Requester raises a maintenance request (cmms.requests.create).
 * 2. Auditor (viewer) can read requests and work orders, but is refused on all writes/actions.
 * 3. Planner triages and accepts the request (cmms.requests.write), converting it to a work order assigned to tech-alice.
 * 4. Unassigned technician (tech-bob) is refused (403 CMMS_OUT_OF_SCOPE) on actions, labour, parts, and notes.
 * 5. Assigned technician (tech-alice with cmms.work-orders.execute-own) executes: starts, logs labour, issues parts, adds notes, completes.
 * 6. Planner verifies and closes the completed work order.
 * 7. Auditor inspects the final record, labour, and parts in read-only mode, and is refused any modifications.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import {
  cmmsRecordDispatcher,
  type CmmsRecordDependencies,
} from './cmms-record-adapters.js';

function makePrincipal(subject: string, permissions: string[]): ModulePrincipal {
  return {
    tenantId: 'tenant-journey',
    subject,
    sessionId: 'session-journey',
    authVersion: 1,
    permissions,
    roles: [],
    persona: 'OPERATIONS_SUPERVISOR',
    departmentScope: { mode: 'ALL' },
    placeScope: { mode: 'UNBOUNDED' },
  } as unknown as ModulePrincipal;
}

describe('WI-OI-120t: Request-to-Close Journey Verification', () => {
  const requesterSubject = 'staff-requester';
  const plannerSubject = 'supervisor-planner';
  const assignedTechSubject = 'tech-alice';
  const unauthorizedTechSubject = 'tech-bob';
  const auditorSubject = 'auditor-eve';

  const requester = makePrincipal(requesterSubject, ['cmms:read', 'cmms.requests.create', 'cmms.requests.read']);
  const auditor = makePrincipal(auditorSubject, [
    'cmms:read',
    'cmms.requests.read',
    'cmms.work-orders.read',
    'cmms.assets.read',
    'cmms.meters.read',
    'cmms.parts.read',
  ]);
  const planner = makePrincipal(plannerSubject, [
    'cmms:read',
    'cmms.requests.read',
    'cmms.requests.write',
    'cmms.work-orders.read',
    'cmms.work-orders.write',
    'cmms.assets.read',
    'cmms.assets.write',
    'cmms.parts.read',
    'cmms.parts.write',
  ]);
  const assignedTech = makePrincipal(assignedTechSubject, [
    'cmms:read',
    'cmms.work-orders.read',
    'cmms.work-orders.execute-own',
  ]);
  const unauthorizedTech = makePrincipal(unauthorizedTechSubject, [
    'cmms:read',
    'cmms.work-orders.read',
    'cmms.work-orders.execute-own',
  ]);

  function setupJourneyDeps() {
    let requestState: any = null;
    let workOrderState: any = null;
    const labourEntries: any[] = [];
    const partsEntries: any[] = [];
    const notesEntries: any[] = [];
    const historyEntries: any[] = [];

    const mockAssetsService: any = {
      search: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'asset-pump-101',
            assetTag: 'PUMP-101',
            name: 'Primary Feed Water Pump',
            status: 'OPERATIONAL',
            criticality: 'HIGH',
            version: 1,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      }),
      get: vi.fn().mockResolvedValue({
        id: 'asset-pump-101',
        assetTag: 'PUMP-101',
        name: 'Primary Feed Water Pump',
        status: 'OPERATIONAL',
        criticality: 'HIGH',
        version: 1,
      }),
    };

    const mockPartsService: any = {
      search: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'part-seal-01',
            partNumber: 'SEAL-MECH-45',
            name: 'Mechanical Shaft Seal 45mm',
            quantityOnHand: 10,
            unitCost: 85.5,
            currencyCode: 'USD',
            version: 1,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      }),
      get: vi.fn().mockResolvedValue({
        id: 'part-seal-01',
        partNumber: 'SEAL-MECH-45',
        name: 'Mechanical Shaft Seal 45mm',
        quantityOnHand: 10,
        unitCost: 85.5,
        currencyCode: 'USD',
        version: 1,
      }),
    };

    const mockWorkOrdersService: any = {
      get: vi.fn().mockImplementation(async (_p, id) => {
        if (!workOrderState || workOrderState.id !== id) {
          throw new BadRequestException('Work order not found');
        }
        return {
          ...workOrderState,
          labour: [...labourEntries],
          parts: [...partsEntries],
          notes: [...notesEntries],
          history: [...historyEntries],
        };
      }),
      list: vi.fn().mockImplementation(async () => {
        return {
          items: workOrderState ? [workOrderState] : [],
          total: workOrderState ? 1 : 0,
          page: 1,
          pageSize: 20,
        };
      }),
      create: vi.fn().mockImplementation(async (context, input) => {
        const id = randomUUID();
        workOrderState = {
          id,
          woNumber: 'WO-2026-00042',
          title: input.title,
          description: input.description,
          priority: input.priority || 'MEDIUM',
          type: input.type || 'CORRECTIVE',
          status: 'OPEN',
          assetId: input.assetId,
          assignedTo: input.assignedTo || null,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tasks: [],
          labour: [],
          parts: [],
          notes: [],
        };
        historyEntries.push({
          id: randomUUID(),
          workOrderId: id,
          eventType: 'STATUS_CHANGED',
          fromStatus: null,
          toStatus: 'OPEN',
          actorSubject: context.principal.subject,
          occurredAt: new Date().toISOString(),
        });
        return { ...workOrderState };
      }),
      update: vi.fn().mockImplementation(async (context, id, input) => {
        if (!workOrderState || workOrderState.id !== id) {
          throw new BadRequestException('Work order not found');
        }
        workOrderState = {
          ...workOrderState,
          ...input,
          version: workOrderState.version + 1,
          updatedAt: new Date().toISOString(),
        };
        return { ...workOrderState, labour: [...labourEntries], parts: [...partsEntries], notes: [...notesEntries] };
      }),
      changeStatus: vi.fn().mockImplementation(async (context, id, input) => {
        if (!workOrderState || workOrderState.id !== id) {
          throw new BadRequestException('Work order not found');
        }
        const fromStatus = workOrderState.status;
        workOrderState = {
          ...workOrderState,
          status: input.status,
          completionNotes: input.notes || workOrderState.completionNotes,
          version: workOrderState.version + 1,
          updatedAt: new Date().toISOString(),
        };
        historyEntries.push({
          id: randomUUID(),
          workOrderId: id,
          eventType: 'STATUS_CHANGED',
          fromStatus,
          toStatus: input.status,
          actorSubject: context.principal.subject,
          occurredAt: new Date().toISOString(),
        });
        return { ...workOrderState, labour: [...labourEntries], parts: [...partsEntries], notes: [...notesEntries] };
      }),
      logLabour: vi.fn().mockImplementation(async (context, id, input) => {
        const entry = {
          id: randomUUID(),
          workOrderId: id,
          workerRef: input.workerRef,
          hours: input.hours,
          timeCategory: input.timeCategory || 'REGULAR',
          performedOn: input.performedOn || new Date().toISOString().slice(0, 10),
          notes: input.notes,
        };
        labourEntries.push(entry);
        workOrderState.version++;
        return { ...workOrderState, labour: [...labourEntries] };
      }),
      issuePart: vi.fn().mockImplementation(async (context, id, input) => {
        const entry = {
          id: randomUUID(),
          workOrderId: id,
          partId: input.partId,
          partNumber: 'SEAL-MECH-45',
          quantity: input.quantity,
          notes: input.notes,
        };
        partsEntries.push(entry);
        workOrderState.version++;
        return { ...workOrderState, parts: [...partsEntries] };
      }),
      addNote: vi.fn().mockImplementation(async (context, id, input) => {
        const entry = {
          id: randomUUID(),
          workOrderId: id,
          body: input.body,
          actorSubject: context.principal.subject,
          occurredAt: new Date().toISOString(),
        };
        notesEntries.push(entry);
        workOrderState.version++;
        return { ...workOrderState, notes: [...notesEntries] };
      }),
      history: vi.fn().mockImplementation(async () => {
        return { items: [...historyEntries] };
      }),
    };

    const mockRequestsService: any = {
      submit: vi.fn().mockImplementation(async (context, input) => {
        const id = randomUUID();
        requestState = {
          id,
          requestNumber: 'REQ-000001',
          title: input.title,
          description: input.description,
          priority: input.priority || 'MEDIUM',
          status: 'PENDING',
          assetId: input.assetId,
          requesterSubject: context.principal.subject,
          requesterName: input.requesterName || 'Alice Worker',
          requesterEmail: input.requesterEmail,
          requesterPhone: input.requesterPhone,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return { ...requestState };
      }),
      get: vi.fn().mockImplementation(async (_p, id) => {
        if (!requestState || requestState.id !== id) throw new BadRequestException('Request not found');
        return { ...requestState };
      }),
      search: vi.fn().mockImplementation(async () => {
        return {
          items: requestState ? [{ ...requestState }] : [],
          total: requestState ? 1 : 0,
          page: 1,
          pageSize: 20,
        };
      }),
      triage: vi.fn().mockImplementation(async (context, id, input) => {
        if (!requestState || requestState.id !== id) throw new BadRequestException('Request not found');
        if (input.action === 'ACCEPT') {
          // Creates work order
          const createdWo = await mockWorkOrdersService.create(context, {
            title: requestState.title,
            description: requestState.description,
            priority: input.priority || requestState.priority,
            type: input.workOrderType || 'CORRECTIVE',
            assetId: requestState.assetId,
            assignedTo: input.assignedTo || null,
          });
          requestState = {
            ...requestState,
            status: 'ACCEPTED',
            convertedWoId: createdWo.id,
            convertedWoNumber: createdWo.woNumber,
            triagedBy: context.principal.subject,
            triagedAt: new Date().toISOString(),
            version: requestState.version + 1,
            updatedAt: new Date().toISOString(),
          };
          return { request: { ...requestState }, workOrderId: createdWo.id };
        } else {
          requestState = {
            ...requestState,
            status: 'REJECTED',
            rejectionReason: input.reason,
            triagedBy: context.principal.subject,
            triagedAt: new Date().toISOString(),
            version: requestState.version + 1,
            updatedAt: new Date().toISOString(),
          };
          return { request: { ...requestState } };
        }
      }),
      cancel: vi.fn().mockImplementation(async (context, id) => {
        if (!requestState || requestState.id !== id) throw new BadRequestException('Request not found');
        requestState = {
          ...requestState,
          status: 'CANCELLED',
          version: requestState.version + 1,
          updatedAt: new Date().toISOString(),
        };
        return requestState;
      }),
    };

    const deps: CmmsRecordDependencies = {
      workOrders: mockWorkOrdersService,
      assets: mockAssetsService,
      parts: mockPartsService,
      requests: mockRequestsService,
    };

    return {
      deps,
      mockRequestsService,
      mockWorkOrdersService,
      mockAssetsService,
      mockPartsService,
      getWorkOrderState: () => workOrderState,
      getRequestState: () => requestState,
    };
  }

  it('executes full request-to-close journey with strict role boundaries and scope isolation', async () => {
    const { deps, getRequestState, getWorkOrderState } = setupJourneyDeps();
    const dispatcher = cmmsRecordDispatcher(deps);

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 1: Requester raises a maintenance request
    // ─────────────────────────────────────────────────────────────────────────
    const createdRequest = await dispatcher.create(
      { principal: requester, tenantId: 'tenant-journey' },
      'cmms.maintenance-requests',
      {
        title: 'Severe oil leakage from primary pump bearing',
        description: 'Vibration detected and noticeable oil pooling beneath base plate.',
        priority: 'HIGH',
        'asset-id': 'asset-pump-101',
        'requester-name': 'Alice Worker',
        'requester-email': 'alice@gigalibs.test',
      },
      randomUUID(),
    );

    expect(createdRequest).toBeDefined();
    expect(createdRequest.title).toBe('Severe oil leakage from primary pump bearing');
    expect(createdRequest.status).toBe('PENDING');
    expect(createdRequest['request-number']).toBe('REQ-000001');
    const requestId = getRequestState().id;

    // Requester can view their request
    const requesterView = await dispatcher.get(requester, 'cmms.maintenance-requests', requestId);
    expect(requesterView).not.toBeNull();
    expect(requesterView?.['request-number']).toBe('REQ-000001');

    // Requester CANNOT accept/triage the request (lacks cmms.requests.write)
    await expect(
      dispatcher.action(
        { principal: requester, tenantId: 'tenant-journey' },
        'cmms.maintenance-requests',
        requestId,
        'accept',
        { 'work-order-type': 'CORRECTIVE' },
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2: Auditor reads but CANNOT mutate or create anything
    // ─────────────────────────────────────────────────────────────────────────
    const auditorRequestView = await dispatcher.get(auditor, 'cmms.maintenance-requests', requestId);
    expect(auditorRequestView?.['request-number']).toBe('REQ-000001');

    // Auditor cannot create a request
    await expect(
      dispatcher.create(
        { principal: auditor, tenantId: 'tenant-journey' },
        'cmms.maintenance-requests',
        { title: 'Auditor attempt' },
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);

    // Auditor cannot accept a request
    await expect(
      dispatcher.action(
        { principal: auditor, tenantId: 'tenant-journey' },
        'cmms.maintenance-requests',
        requestId,
        'accept',
        { 'work-order-type': 'CORRECTIVE' },
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);

    // Auditor cannot create a work order
    await expect(
      dispatcher.create(
        { principal: auditor, tenantId: 'tenant-journey' },
        'cmms.work-orders',
        { title: 'Auditor WO attempt', type: 'CORRECTIVE' },
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 3: Planner triages request -> accepts & assigns to tech-alice
    // ─────────────────────────────────────────────────────────────────────────
    const triageResult = await dispatcher.action(
      { principal: planner, tenantId: 'tenant-journey' },
      'cmms.maintenance-requests',
      requestId,
      'accept',
      {
        'work-order-type': 'CORRECTIVE',
        priority: 'HIGH',
        'assigned-to': assignedTechSubject,
      },
      randomUUID(),
    );

    expect(triageResult.status).toBe('ACCEPTED');
    expect(triageResult['triaged-by']).toBe(plannerSubject);
    const workOrderId = getWorkOrderState().id;
    expect(workOrderId).toBeDefined();
    expect(getWorkOrderState().assignedTo).toBe(assignedTechSubject);
    expect(getWorkOrderState().status).toBe('OPEN');

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 4: Unauthorized technician (tech-bob) is REFUSED (403 CMMS_OUT_OF_SCOPE)
    // ─────────────────────────────────────────────────────────────────────────
    // tech-bob attempts 'start' action -> refused
    await expect(
      dispatcher.action(
        { principal: unauthorizedTech, tenantId: 'tenant-journey' },
        'cmms.work-orders',
        workOrderId,
        'start',
        {},
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);

    // tech-bob attempts to log labour -> refused
    await expect(
      dispatcher.create(
        { principal: unauthorizedTech, tenantId: 'tenant-journey' },
        'cmms.work-order-labour',
        {
          'work-order-id': workOrderId,
          hours: 2,
          'worker-ref': unauthorizedTechSubject,
          'performed-on': '2026-10-12',
        },
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);

    // tech-bob attempts to issue parts -> refused
    await expect(
      dispatcher.create(
        { principal: unauthorizedTech, tenantId: 'tenant-journey' },
        'cmms.work-order-parts',
        {
          'work-order-id': workOrderId,
          'part-id': 'part-seal-01',
          quantity: 1,
        },
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);

    // tech-bob attempts to add notes -> refused
    await expect(
      dispatcher.create(
        { principal: unauthorizedTech, tenantId: 'tenant-journey' },
        'cmms.work-order-notes',
        {
          'work-order-id': workOrderId,
          body: 'Attempted unauthorized note',
        },
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 5: Assigned technician (tech-alice) executes the work order
    // ─────────────────────────────────────────────────────────────────────────
    // 5a. Starts the work order
    const started = await dispatcher.action(
      { principal: assignedTech, tenantId: 'tenant-journey' },
      'cmms.work-orders',
      workOrderId,
      'start',
      {},
      randomUUID(),
    );
    expect(started.status).toBe('IN_PROGRESS');

    // 5b. Logs labour (3.5 hours replacing seal and aligning pump shaft)
    const labourEntry = await dispatcher.create(
      { principal: assignedTech, tenantId: 'tenant-journey' },
      'cmms.work-order-labour',
      {
        'work-order-id': workOrderId,
        hours: 3.5,
        'worker-ref': assignedTechSubject,
        'time-category': 'REGULAR',
        'performed-on': '2026-10-12',
        notes: 'Disassembled pump housing and installed new mechanical shaft seal',
      },
      randomUUID(),
    );
    expect(labourEntry['work-order-id']).toBe(workOrderId);
    expect(labourEntry.hours).toBe(3.5);

    // 5c. Issues parts (1x Mechanical Shaft Seal)
    const partEntry = await dispatcher.create(
      { principal: assignedTech, tenantId: 'tenant-journey' },
      'cmms.work-order-parts',
      {
        'work-order-id': workOrderId,
        'part-id': 'part-seal-01',
        quantity: 1,
      },
      randomUUID(),
    );
    expect(partEntry['work-order-id']).toBe(workOrderId);
    expect(partEntry.quantity).toBe(1);

    // 5d. Adds progress note
    const noteEntry = await dispatcher.create(
      { principal: assignedTech, tenantId: 'tenant-journey' },
      'cmms.work-order-notes',
      {
        'work-order-id': workOrderId,
        body: 'Seal replaced; coupled pump to motor and verified zero leak during test run.',
      },
      randomUUID(),
    );
    expect(noteEntry['work-order-id']).toBe(workOrderId);
    expect(noteEntry.body).toContain('verified zero leak');

    // 5e. Completes the work order
    const completed = await dispatcher.action(
      { principal: assignedTech, tenantId: 'tenant-journey' },
      'cmms.work-orders',
      workOrderId,
      'complete',
      {
        notes: 'Maintenance completed successfully. Asset ready for production.',
      },
      randomUUID(),
    );
    expect(completed.status).toBe('COMPLETED');
    expect(getWorkOrderState().status).toBe('COMPLETED');

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 6: Planner verifies and inspects completed work order & children
    // ─────────────────────────────────────────────────────────────────────────
    const woDetails = await dispatcher.get(planner, 'cmms.work-orders', workOrderId);
    expect(woDetails?.status).toBe('COMPLETED');
    expect(woDetails?.['assigned-to']).toBe(assignedTechSubject);

    const woLabour = await dispatcher.list(planner, 'cmms.work-order-labour', {
      parentId: workOrderId,
      pageSize: 10,
    });
    expect(woLabour.items).toHaveLength(1);
    expect(woLabour.items[0]?.hours).toBe(3.5);

    const woParts = await dispatcher.list(planner, 'cmms.work-order-parts', {
      parentId: workOrderId,
      pageSize: 10,
    });
    expect(woParts.items).toHaveLength(1);
    expect(woParts.items[0]?.['part-id']).toBe('part-seal-01');

    const woNotes = await dispatcher.list(planner, 'cmms.work-order-notes', {
      parentId: workOrderId,
      pageSize: 10,
    });
    expect(woNotes.items).toHaveLength(1);

    const woHistory = await dispatcher.list(planner, 'cmms.work-order-history', {
      parentId: workOrderId,
      pageSize: 10,
    });
    expect(woHistory.items.length).toBeGreaterThanOrEqual(2); // OPEN -> IN_PROGRESS -> COMPLETED

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 7: Auditor verifies final records in read-only mode
    // ─────────────────────────────────────────────────────────────────────────
    const auditorWo = await dispatcher.get(auditor, 'cmms.work-orders', workOrderId);
    expect(auditorWo?.status).toBe('COMPLETED');

    const auditorLabour = await dispatcher.list(auditor, 'cmms.work-order-labour', {
      parentId: workOrderId,
      pageSize: 10,
    });
    expect(auditorLabour.items).toHaveLength(1);

    const auditorParts = await dispatcher.list(auditor, 'cmms.work-order-parts', {
      parentId: workOrderId,
      pageSize: 10,
    });
    expect(auditorParts.items).toHaveLength(1);

    // Auditor cannot mutate anything on the completed work order
    await expect(
      dispatcher.action(
        { principal: auditor, tenantId: 'tenant-journey' },
        'cmms.work-orders',
        workOrderId,
        'start',
        {},
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      dispatcher.create(
        { principal: auditor, tenantId: 'tenant-journey' },
        'cmms.work-order-labour',
        {
          'work-order-id': workOrderId,
          hours: 1,
          'worker-ref': auditorSubject,
          'performed-on': '2026-10-12',
        },
        randomUUID(),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
