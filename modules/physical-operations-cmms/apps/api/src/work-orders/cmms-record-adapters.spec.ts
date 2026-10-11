import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import {
  assertCanExecute,
  cmmsRecordDispatcher,
  type CmmsRecordDependencies,
} from './cmms-record-adapters.js';

function makePrincipal(subject: string, permissions: string[]): ModulePrincipal {
  return {
    tenantId: 'tenant-test',
    subject,
    sessionId: 'session-1',
    authVersion: 1,
    permissions,
    roles: [],
    persona: 'OPERATIONS_SUPERVISOR',
    departmentScope: { mode: 'ALL' },
    placeScope: { mode: 'UNBOUNDED' },
  } as unknown as ModulePrincipal;
}

describe('WI-OI-120t (M-CM1 Slice 1): Technician Scope Isolation & CMMS Record Adapters', () => {
  const techLogin = 'tech-alice';
  const otherLogin = 'tech-bob';

  const ownWorkOrder = {
    id: '11111111-1111-4111-8111-111111111111',
    woNumber: 'WO-2026-00101',
    title: 'Pump Seal Inspection',
    status: 'OPEN' as const,
    priority: 'HIGH' as const,
    type: 'PREVENTIVE' as const,
    assignedTo: techLogin,
    version: 1,
  };

  const otherWorkOrder = {
    id: '22222222-2222-4222-8222-222222222222',
    woNumber: 'WO-2026-00102',
    title: 'Boiler Valve Overhaul',
    status: 'OPEN' as const,
    priority: 'MEDIUM' as const,
    type: 'REACTIVE' as const,
    assignedTo: otherLogin,
    version: 1,
  };

  const unassignedWorkOrder = {
    id: '33333333-3333-4333-8333-333333333333',
    woNumber: 'WO-2026-00103',
    title: 'HVAC Filter Replacement',
    status: 'OPEN' as const,
    priority: 'LOW' as const,
    type: 'PREVENTIVE' as const,
    assignedTo: null,
    version: 1,
  };

  describe('assertCanExecute unit assertions', () => {
    it('allows a planner holding cmms.work-orders.write on any work order (own, other, unassigned)', () => {
      const planner = makePrincipal('planner-carol', ['cmms.work-orders.write']);

      expect(() => assertCanExecute(planner, ownWorkOrder as any)).not.toThrow();
      expect(() => assertCanExecute(planner, otherWorkOrder as any)).not.toThrow();
      expect(() => assertCanExecute(planner, unassignedWorkOrder as any)).not.toThrow();
    });

    it('allows a technician holding execute-own on their own assigned work order', () => {
      const tech = makePrincipal(techLogin, ['cmms.work-orders.execute-own']);
      expect(() => assertCanExecute(tech, ownWorkOrder as any)).not.toThrow();
    });

    it('refuses a technician on someone else\'s work order with HTTP 403 CMMS_OUT_OF_SCOPE', () => {
      const tech = makePrincipal(techLogin, ['cmms.work-orders.execute-own']);

      expect(() => assertCanExecute(tech, otherWorkOrder as any)).toThrowError(ForbiddenException);
      try {
        assertCanExecute(tech, otherWorkOrder as any);
      } catch (err: any) {
        expect(err.getResponse()).toEqual({
          code: 'CMMS_OUT_OF_SCOPE',
          message: 'You can only execute work orders assigned to you.',
        });
      }
    });

    it('refuses a technician on unassigned work order with HTTP 403 CMMS_OUT_OF_SCOPE', () => {
      const tech = makePrincipal(techLogin, ['cmms.work-orders.execute-own']);

      expect(() => assertCanExecute(tech, unassignedWorkOrder as any)).toThrowError(ForbiddenException);
      try {
        assertCanExecute(tech, unassignedWorkOrder as any);
      } catch (err: any) {
        expect(err.getResponse()).toEqual({
          code: 'CMMS_OUT_OF_SCOPE',
          message: 'You can only execute work orders assigned to you.',
        });
      }
    });

    it('refuses a user without execute-own or write with HTTP 403 CMMS_PERMISSION_DENIED', () => {
      const viewer = makePrincipal('viewer-dave', ['cmms.work-orders.read']);

      expect(() => assertCanExecute(viewer, ownWorkOrder as any)).toThrowError(ForbiddenException);
      try {
        assertCanExecute(viewer, ownWorkOrder as any);
      } catch (err: any) {
        expect(err.getResponse()).toEqual({
          code: 'CMMS_PERMISSION_DENIED',
          message: 'Permission cmms.work-orders.write or cmms.work-orders.execute-own is required.',
        });
      }
    });
  });

  describe('cmmsRecordDispatcher actions and child adapters', () => {
    function createMockDeps() {
      const store = new Map<string, any>([
        [ownWorkOrder.id, { ...ownWorkOrder, tasks: [], labour: [], parts: [], notes: [] }],
        [otherWorkOrder.id, { ...otherWorkOrder, tasks: [], labour: [], parts: [], notes: [] }],
        [unassignedWorkOrder.id, { ...unassignedWorkOrder, tasks: [], labour: [], parts: [], notes: [] }],
      ]);

      const mockWorkOrdersService = {
        get: vi.fn(async (_p: any, id: string) => {
          const item = store.get(id);
          if (!item) throw new BadRequestException('Not found');
          return item;
        }),
        search: vi.fn(async () => ({
          items: Array.from(store.values()),
          total: store.size,
          page: 1,
          pageSize: 20,
        })),
        changeStatus: vi.fn(async (_p: any, id: string, payload: any) => {
          const item = store.get(id);
          item.status = payload.status;
          item.version = (item.version ?? 1) + 1;
          return item;
        }),
        addTask: vi.fn(async (_p: any, id: string, payload: any) => {
          const item = store.get(id);
          const task = { id: 'task-1', position: 1, label: payload.label, status: 'PENDING', required: true };
          item.tasks.push(task);
          return item;
        }),
        recordTask: vi.fn(async (_p: any, id: string, taskId: string, payload: any) => {
          const item = store.get(id);
          const task = item.tasks.find((t: any) => t.id === taskId);
          task.status = payload.status;
          task.resultValue = payload.resultValue;
          return item;
        }),
        logLabour: vi.fn(async (_p: any, id: string, payload: any) => {
          const item = store.get(id);
          const entry = { id: 'labour-1', hours: payload.hours, timeCategory: payload.timeCategory, performedOn: '2026-10-11' };
          item.labour.push(entry);
          return item;
        }),
        issuePart: vi.fn(async (_p: any, id: string, payload: any) => {
          const item = store.get(id);
          const entry = {
            movementId: 'mov-1',
            partId: payload.partId,
            partNumber: 'P-100',
            partName: 'Seal Kit',
            quantity: payload.quantity,
            unitCost: 25,
            currencyCode: 'USD',
          };
          item.parts.push(entry);
          return item;
        }),
        addNote: vi.fn(async (_p: any, id: string, payload: any) => {
          const item = store.get(id);
          const entry = { id: 'note-1', body: payload.body, actorSubject: 'tech-alice', occurredAt: '2026-10-11T12:00:00Z' };
          item.notes.push(entry);
          return item;
        }),
        history: vi.fn(async () => ({ items: [] })),
      };

      const mockAssetsService = {
        search: vi.fn(async () => ({ items: [{ id: 'asset-1', name: 'Pump #101', category: 'PUMPS' }] })),
      };

      const mockPartsService = {
        search: vi.fn(async () => ({ items: [{ id: 'part-1', name: 'Gasket', partNumber: 'G-101' }] })),
      };

      const deps: CmmsRecordDependencies = {
        workOrders: mockWorkOrdersService as any,
        assets: mockAssetsService as any,
        parts: mockPartsService as any,
      };

      return { deps, store, mockWorkOrdersService };
    }

    it('technician successfully executes "start" action on own work order', async () => {
      const { deps, mockWorkOrdersService } = createMockDeps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const tech = makePrincipal(techLogin, ['cmms:read', 'cmms.work-orders.read', 'cmms.work-orders.execute-own']);

      const result = await dispatcher.action(
        { principal: tech, tenantId: 'tenant-test' },
        'cmms.work-orders',
        ownWorkOrder.id,
        'start',
        { expectedVersion: 1 },
        randomUUID(),
      );

      expect(result['status']).toBe('IN_PROGRESS');
      expect(mockWorkOrdersService.changeStatus).toHaveBeenCalledWith(
        expect.anything(),
        ownWorkOrder.id,
        expect.objectContaining({ status: 'IN_PROGRESS' }),
      );
    });

    it('technician is refused with 403 CMMS_OUT_OF_SCOPE when executing "start" on another tech\'s work order', async () => {
      const { deps, mockWorkOrdersService } = createMockDeps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const tech = makePrincipal(techLogin, ['cmms:read', 'cmms.work-orders.read', 'cmms.work-orders.execute-own']);

      await expect(
        dispatcher.action(
          { principal: tech, tenantId: 'tenant-test' },
          'cmms.work-orders',
          otherWorkOrder.id,
          'start',
          { expectedVersion: 1 },
          randomUUID(),
        ),
      ).rejects.toThrowError(ForbiddenException);

      expect(mockWorkOrdersService.changeStatus).not.toHaveBeenCalled();
    });

    it('planner holding cmms.work-orders.write can execute status action on anyone\'s work order', async () => {
      const { deps, mockWorkOrdersService } = createMockDeps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const planner = makePrincipal('planner-carol', [
        'cmms:read',
        'cmms.work-orders.read',
        'cmms.work-orders.write',
        'cmms.work-orders.execute-own',
      ]);

      const result = await dispatcher.action(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.work-orders',
        otherWorkOrder.id,
        'start',
        { expectedVersion: 1 },
        randomUUID(),
      );

      expect(result['status']).toBe('IN_PROGRESS');
    });

    it('technician can log labour on own work order and is refused on other work order', async () => {
      const { deps } = createMockDeps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const tech = makePrincipal(techLogin, ['cmms:read', 'cmms.work-orders.read', 'cmms.work-orders.execute-own']);

      // Allowed on own
      const labour = await dispatcher.create(
        { principal: tech, tenantId: 'tenant-test' },
        'cmms.work-order-labour',
        {
          'work-order-id': ownWorkOrder.id,
          'worker-ref': techLogin,
          hours: 2.5,
          'time-category': 'REGULAR',
          'performed-on': '2026-10-11',
        },
        randomUUID(),
      );
      expect(labour['hours']).toBe(2.5);

      // Refused on other
      await expect(
        dispatcher.create(
          { principal: tech, tenantId: 'tenant-test' },
          'cmms.work-order-labour',
          {
            'work-order-id': otherWorkOrder.id,
            'worker-ref': techLogin,
            hours: 1.0,
            'time-category': 'REGULAR',
            'performed-on': '2026-10-11',
          },
          randomUUID(),
        ),
      ).rejects.toThrowError(ForbiddenException);
    });

    it('technician can issue parts on own work order and is refused on other work order', async () => {
      const { deps } = createMockDeps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const tech = makePrincipal(techLogin, ['cmms:read', 'cmms.work-orders.read', 'cmms.work-orders.execute-own']);

      // Allowed on own
      const part = await dispatcher.create(
        { principal: tech, tenantId: 'tenant-test' },
        'cmms.work-order-parts',
        {
          'work-order-id': ownWorkOrder.id,
          'part-id': '44444444-4444-4444-8444-444444444444',
          quantity: 2,
        },
        randomUUID(),
      );
      expect(part['quantity']).toBe(2);

      // Refused on other
      await expect(
        dispatcher.create(
          { principal: tech, tenantId: 'tenant-test' },
          'cmms.work-order-parts',
          {
            'work-order-id': otherWorkOrder.id,
            'part-id': '44444444-4444-4444-8444-444444444444',
            quantity: 1,
          },
          randomUUID(),
        ),
      ).rejects.toThrowError(ForbiddenException);
    });

    it('technician can add notes on own work order and is refused on other work order', async () => {
      const { deps } = createMockDeps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const tech = makePrincipal(techLogin, ['cmms:read', 'cmms.work-orders.read', 'cmms.work-orders.execute-own']);

      const note = await dispatcher.create(
        { principal: tech, tenantId: 'tenant-test' },
        'cmms.work-order-notes',
        {
          'work-order-id': ownWorkOrder.id,
          body: 'Replaced mechanical seal and checked alignment.',
        },
        randomUUID(),
      );
      expect(note['body']).toBe('Replaced mechanical seal and checked alignment.');

      await expect(
        dispatcher.create(
          { principal: tech, tenantId: 'tenant-test' },
          'cmms.work-order-notes',
          {
            'work-order-id': otherWorkOrder.id,
            body: 'Unassigned attempt.',
          },
          randomUUID(),
        ),
      ).rejects.toThrowError(ForbiddenException);
    });

    it('resolves lookups for cmms-assets, cmms-parts, cmms-work-orders', async () => {
      const { deps } = createMockDeps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const viewer = makePrincipal('viewer-1', [
        'cmms:read',
        'cmms.assets.read',
        'cmms.parts.read',
        'cmms.work-orders.read',
      ]);

      const assets = await dispatcher.lookup(viewer, 'cmms-assets', { search: 'pump', limit: 5 });
      expect(assets).toHaveLength(1);
      expect(assets[0]?.label).toContain('Pump #101');

      const parts = await dispatcher.lookup(viewer, 'cmms-parts', { search: 'gasket', limit: 5 });
      expect(parts).toHaveLength(1);
      expect(parts[0]?.label).toContain('Gasket');

      const wos = await dispatcher.lookup(viewer, 'cmms-work-orders', { search: 'WO', limit: 5 });
      expect(wos.length).toBeGreaterThan(0);
    });
  });
});
