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

  describe('WI-OI-120t (M-CM1 Slice 3): Plans, Meters and Stock Adapters', () => {
    const pmId = '44444444-4444-4444-8444-444444444444';
    const meterId = '55555555-5555-4555-8555-555555555555';
    const partId = '66666666-6666-4666-8666-666666666666';
    const assetId = '77777777-7777-4777-8777-777777777777';
    const pumpAssetId = '88888888-8888-4888-8888-888888888888';

    function createSlice3Deps() {
      const pmScheduleStore = new Map<string, any>([
        [
          pmId,
          {
            id: pmId,
            name: 'Monthly Chiller Service',
            description: 'Inspect refrigerant and coils',
            assetId,
            isActive: true,
            intervalCount: 1,
            intervalUnit: 'MONTH',
            timeZone: 'UTC',
            nextDueAt: '2026-11-01T08:00:00Z',
            lastGeneratedAt: null,
            overdue: false,
            woTitle: 'Monthly Chiller PM',
            woDescription: 'Check refrigerant pressure and evaporator',
            woPriority: 'MEDIUM',
            estimatedHours: 4,
            requiresSignature: true,
            version: 1,
          },
        ],
      ]);

      const meterStore = new Map<string, any>([
        [
          meterId,
          {
            id: meterId,
            name: 'Turbine Vibration Sensor',
            description: 'Radial shaft vibration',
            assetId,
            unit: 'mm/s',
            readingType: 'GAUGE',
            lastReadingValue: 2.4,
            lastReadingAt: '2026-10-10T12:00:00Z',
            minThreshold: 0,
            maxThreshold: 5.0,
            version: 1,
          },
        ],
      ]);

      const meterReadingsStore = new Map<string, any[]>([
        [
          meterId,
          [
            {
              id: randomUUID(),
              meterId,
              value: 2.4,
              readAt: '2026-10-10T12:00:00Z',
              notes: 'Normal operational limits',
              recordedBy: 'tech-alice',
              recordedAt: '2026-10-10T12:05:00Z',
            },
          ],
        ],
      ]);

      const partStore = new Map<string, any>([
        [
          partId,
          {
            id: partId,
            partNumber: 'SK-2001',
            name: 'Mechanical Seal Kit',
            description: 'Viton elastomer seal assembly',
            category: 'SEALS',
            unitOfMeasure: 'EA',
            unitCost: 145.5,
            currencyCode: 'USD',
            quantityOnHand: 12,
            minQuantity: 4,
            reorderPoint: 6,
            nonStock: false,
            binLocation: 'A-12-04',
            barcode: '012345678905',
            version: 1,
          },
        ],
      ]);

      const partMovementsStore = new Map<string, any[]>([
        [
          partId,
          [
            {
              id: randomUUID(),
              partId,
              movementType: 'RECEIPT',
              quantityDelta: 12,
              balanceAfter: 12,
              unitCost: 145.5,
              currencyCode: 'USD',
              storeroomId: 'store-main',
              binLocation: 'A-12-04',
              reason: 'Initial PO receipt',
              createdBy: 'clerk-bob',
              createdAt: '2026-10-01T09:00:00Z',
            },
          ],
        ],
      ]);

      const mockPmSchedulesService = {
        list: vi.fn(async (_p: any, filterAssetId?: string) => {
          let items = Array.from(pmScheduleStore.values());
          if (filterAssetId) items = items.filter((s) => s.assetId === filterAssetId);
          return { items, total: items.length };
        }),
        get: vi.fn(async (_p: any, id: string) => {
          const item = pmScheduleStore.get(id);
          if (!item) throw new BadRequestException('Schedule not found');
          return item;
        }),
        create: vi.fn(async (_c: any, input: any) => {
          const created = {
            id: randomUUID(),
            ...input,
            lastGeneratedAt: null,
            overdue: false,
            version: 1,
          };
          pmScheduleStore.set(created.id, created);
          return created;
        }),
        update: vi.fn(async (_c: any, id: string, input: any) => {
          const item = pmScheduleStore.get(id);
          if (!item) throw new BadRequestException('Schedule not found');
          const updated = { ...item, ...input, version: item.version + 1 };
          pmScheduleStore.set(id, updated);
          return updated;
        }),
        generate: vi.fn(async (_c: any, id: string, _opts: any) => {
          const item = pmScheduleStore.get(id);
          if (!item) throw new BadRequestException('Schedule not found');
          item.lastGeneratedAt = '2026-10-11T10:00:00Z';
          item.version += 1;
          return {
            schedule: item,
            workOrder: { id: randomUUID(), woNumber: 'WO-2026-00999', title: item.woTitle },
          };
        }),
      };

      const mockMetersService = {
        list: vi.fn(async (_p: any, filterAssetId?: string) => {
          let items = Array.from(meterStore.values());
          if (filterAssetId) items = items.filter((m) => m.assetId === filterAssetId);
          return { items, total: items.length };
        }),
        get: vi.fn(async (_p: any, id: string) => {
          const item = meterStore.get(id);
          if (!item) throw new BadRequestException('Meter not found');
          return item;
        }),
        create: vi.fn(async (_c: any, input: any) => {
          const created = {
            id: randomUUID(),
            ...input,
            lastReadingValue: null,
            lastReadingAt: null,
            version: 1,
          };
          meterStore.set(created.id, created);
          return created;
        }),
        readings: vi.fn(async (_p: any, id: string) => {
          const items = meterReadingsStore.get(id) ?? [];
          return { items, total: items.length };
        }),
        recordReading: vi.fn(async (_c: any, id: string, input: any) => {
          const meter = meterStore.get(id);
          if (!meter) throw new BadRequestException('Meter not found');
          meter.lastReadingValue = input.value;
          meter.lastReadingAt = input.readAt;
          const reading = {
            id: randomUUID(),
            meterId: id,
            value: input.value,
            readAt: input.readAt,
            notes: input.notes,
            recordedBy: 'tech-alice',
            recordedAt: new Date().toISOString(),
          };
          const list = meterReadingsStore.get(id) ?? [];
          list.push(reading);
          meterReadingsStore.set(id, list);
          return { reading, meter };
        }),
      };

      const mockPartsService = {
        search: vi.fn(async (_p: any, query: any) => {
          let items = Array.from(partStore.values());
          if (query?.q) items = items.filter((p) => p.name.includes(query.q) || p.partNumber.includes(query.q));
          return { items, total: items.length, page: 1, pageSize: 20 };
        }),
        get: vi.fn(async (_p: any, id: string) => {
          const item = partStore.get(id);
          if (!item) throw new BadRequestException('Part not found');
          return item;
        }),
        create: vi.fn(async (_c: any, input: any) => {
          const created = {
            id: randomUUID(),
            ...input,
            quantityOnHand: 0,
            version: 1,
          };
          partStore.set(created.id, created);
          return created;
        }),
        movements: vi.fn(async (_p: any, id: string) => {
          const items = partMovementsStore.get(id) ?? [];
          return { items, total: items.length };
        }),
        recordMovement: vi.fn(async (_c: any, id: string, payload: any) => {
          const part = partStore.get(id);
          if (!part) throw new BadRequestException('Part not found');
          const delta = payload.movementType === 'ADJUSTMENT' ? payload.quantityDelta : payload.quantity;
          part.quantityOnHand = (part.quantityOnHand ?? 0) + delta;
          const movement = {
            id: randomUUID(),
            partId: id,
            movementType: payload.movementType,
            quantityDelta: delta,
            balanceAfter: part.quantityOnHand,
            unitCost: payload.unitCost ?? part.unitCost,
            currencyCode: part.currencyCode,
            storeroomId: payload.storeroomId,
            binLocation: payload.binLocation,
            reason: payload.reason,
            createdBy: 'clerk-bob',
            createdAt: new Date().toISOString(),
          };
          const list = partMovementsStore.get(id) ?? [];
          list.push(movement);
          partMovementsStore.set(id, list);
          return { movement, part };
        }),
      };

      const mockWorkOrdersService = {
        get: vi.fn(async () => ({ id: randomUUID(), assignedTo: 'tech-alice' })),
        search: vi.fn(async () => ({ items: [], total: 0 })),
      };
      const mockAssetsService = {
        search: vi.fn(async () => ({ items: [] })),
      };

      const deps: CmmsRecordDependencies = {
        workOrders: mockWorkOrdersService as any,
        assets: mockAssetsService as any,
        parts: mockPartsService as any,
        pmSchedules: mockPmSchedulesService as any,
        meters: mockMetersService as any,
      };

      return {
        deps,
        pmScheduleStore,
        meterStore,
        partStore,
        mockPmSchedulesService,
        mockMetersService,
        mockPartsService,
      };
    }

    it('manages PM schedules: lists, creates, updates and generates work orders', async () => {
      const { deps, mockPmSchedulesService } = createSlice3Deps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const planner = makePrincipal('planner-carol', [
        'cmms:read',
        'cmms.pm.read',
        'cmms.pm.write',
      ]);

      // 1. List
      const listRes = await dispatcher.list(planner, 'cmms.pm-schedules', {
        page: 1,
        pageSize: 10,
        filters: { assetId },
      });
      expect(listRes.items).toHaveLength(1);
      expect(listRes.items[0]?.['name']).toBe('Monthly Chiller Service');

      // 2. Get
      const getRes = await dispatcher.get(planner, 'cmms.pm-schedules', pmId);
      expect(getRes?.['wo-title']).toBe('Monthly Chiller PM');

      // 3. Create
      const created = await dispatcher.create(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.pm-schedules',
        {
          name: 'Quarterly Pump Overhaul',
          'asset-id': pumpAssetId,
          'interval-count': 3,
          'interval-unit': 'MONTH',
          'next-due-at': '2026-12-01T00:00:00Z',
          'wo-title': 'Quarterly Pump Overhaul',
          'wo-priority': 'HIGH',
        },
        randomUUID(),
      );
      expect(created['name']).toBe('Quarterly Pump Overhaul');
      expect(mockPmSchedulesService.create).toHaveBeenCalled();

      // 4. Update
      const updated = await dispatcher.update(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.pm-schedules',
        pmId,
        {
          name: 'Bi-Monthly Chiller Service',
          'interval-count': 2,
        },
        '"1"',
        randomUUID(),
      );
      expect(updated['name']).toBe('Bi-Monthly Chiller Service');

      // 5. Generate action
      const actionRes = await dispatcher.action(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.pm-schedules',
        pmId,
        'generate',
        { expectedVersion: 2 },
        randomUUID(),
      );
      expect(actionRes['last-generated-at']).toBe('2026-10-11T10:00:00Z');
      expect(mockPmSchedulesService.generate).toHaveBeenCalledWith(
        expect.anything(),
        pmId,
        { expectedVersion: 2 },
      );
    });

    it('manages Meters & Readings: lists, creates, logs reading child records', async () => {
      const { deps, mockMetersService } = createSlice3Deps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const tech = makePrincipal('tech-alice', [
        'cmms:read',
        'cmms.meters.read',
        'cmms.meters.write',
      ]);

      // 1. List meters
      const listRes = await dispatcher.list(tech, 'cmms.meters', {
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(listRes.items).toHaveLength(1);
      expect(listRes.items[0]?.['name']).toBe('Turbine Vibration Sensor');

      // 2. Get meter
      const getRes = await dispatcher.get(tech, 'cmms.meters', meterId);
      expect(getRes?.['unit']).toBe('mm/s');

      // 3. Create meter
      const createdMeter = await dispatcher.create(
        { principal: tech, tenantId: 'tenant-test' },
        'cmms.meters',
        {
          name: 'Cooling Water Pressure',
          'asset-id': assetId,
          unit: 'bar',
          'reading-type': 'GAUGE',
          'min-threshold': 1.5,
          'max-threshold': 6.0,
        },
        randomUUID(),
      );
      expect(createdMeter['name']).toBe('Cooling Water Pressure');
      expect(mockMetersService.create).toHaveBeenCalled();

      // 4. List readings for meter
      const readingsList = await dispatcher.list(tech, 'cmms.meter-readings', {
        parentId: meterId,
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(readingsList.items).toHaveLength(1);
      expect(readingsList.items[0]?.['value']).toBe(2.4);

      // 5. Record reading
      const newReading = await dispatcher.create(
        { principal: tech, tenantId: 'tenant-test' },
        'cmms.meter-readings',
        {
          'meter-id': meterId,
          value: 3.1,
          'read-at': '2026-10-11T14:30:00Z',
          notes: 'Routine walkdown measurement',
        },
        randomUUID(),
      );
      expect(newReading['value']).toBe(3.1);
      expect(mockMetersService.recordReading).toHaveBeenCalledWith(
        expect.anything(),
        meterId,
        expect.objectContaining({ value: 3.1, notes: 'Routine walkdown measurement' }),
      );
    });

    it('manages MRO Parts & Movements: lists, creates, logs movement child records', async () => {
      const { deps, mockPartsService } = createSlice3Deps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const planner = makePrincipal('planner-carol', [
        'cmms:read',
        'cmms.parts.read',
        'cmms.parts.write',
      ]);

      // 1. Search/list parts
      const listRes = await dispatcher.list(planner, 'cmms.parts', {
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(listRes.items).toHaveLength(1);
      expect(listRes.items[0]?.['part-number']).toBe('SK-2001');

      // 2. Get part
      const getRes = await dispatcher.get(planner, 'cmms.parts', partId);
      expect(getRes?.['name']).toBe('Mechanical Seal Kit');
      expect(getRes?.['quantity-on-hand']).toBe(12);

      // 3. Create part
      const createdPart = await dispatcher.create(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.parts',
        {
          'part-number': 'FLT-004',
          name: 'Oil Filter Cartridge',
          category: 'FILTERS',
          'unit-of-measure': 'EA',
          'unit-cost': 32.0,
          'currency-code': 'USD',
          'min-quantity': 10,
        },
        randomUUID(),
      );
      expect(createdPart['part-number']).toBe('FLT-004');
      expect(mockPartsService.create).toHaveBeenCalled();

      // 4. List movements for part
      const movementsList = await dispatcher.list(planner, 'cmms.part-movements', {
        parentId: partId,
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(movementsList.items).toHaveLength(1);
      expect(movementsList.items[0]?.['movement-type']).toBe('RECEIPT');

      // 5. Record movement (e.g. ADJUSTMENT)
      const newMovement = await dispatcher.create(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.part-movements',
        {
          'part-id': partId,
          'movement-type': 'ADJUSTMENT',
          'quantity-delta': -2,
          'storeroom-id': 'store-main',
          'bin-location': 'A-12-04',
          reason: 'Emergency replacement for Unit 2',
        },
        randomUUID(),
      );
      expect(newMovement['movement-type']).toBe('ADJUSTMENT');
      expect(newMovement['quantity-delta']).toBe(-2);
      expect(newMovement['balance-after']).toBe(10);
      expect(mockPartsService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        partId,
        expect.objectContaining({
          movementType: 'ADJUSTMENT',
          quantityDelta: -2,
          reason: 'Emergency replacement for Unit 2',
        }),
      );
    });
  });

  describe('WI-OI-120t (M-CM1 Slice 4): Assets, CAFM Spaces & Classifications Record Adapters', () => {
    function createSlice4Deps() {
      const assetId = '11111111-1111-4111-8111-111111111111';
      const spaceId = '22222222-2222-4222-8222-222222222222';
      const classId = '33333333-3333-4333-8333-333333333333';
      const specDefId = '44444444-4444-4444-8444-444444444444';

      const mockAsset = {
        id: assetId,
        assetTag: 'AST-PUMP-001',
        name: 'Primary Centrifugal Pump',
        description: 'Main feedwater circulation pump',
        category: 'PUMPS',
        status: 'OPERATIONAL',
        criticality: 'HIGH',
        manufacturer: 'Sulzer',
        model: 'CP-200',
        serialNumber: 'SN-987654',
        parentAssetId: null,
        siteRef: 'site-alpha',
        spaceId,
        classificationId: classId,
        acquisitionCost: 15000,
        currencyCode: 'USD',
        purchaseDate: '2024-01-15',
        warrantyExpiry: '2027-01-15',
        specs: {},
        archivedAt: null,
        openWorkOrderCount: 0,
        version: 1,
        createdBy: 'admin',
        createdAt: '2024-01-15T08:00:00.000Z',
        updatedAt: '2024-01-15T08:00:00.000Z',
      };

      const mockAssetsService = {
        search: vi.fn().mockResolvedValue({
          items: [mockAsset],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
        get: vi.fn().mockResolvedValue(mockAsset),
        create: vi.fn().mockImplementation((_ctx, input) =>
          Promise.resolve({
            ...mockAsset,
            ...input,
            id: randomUUID(),
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        ),
        update: vi.fn().mockImplementation((_ctx, id, input) =>
          Promise.resolve({
            ...mockAsset,
            ...input,
            id,
            version: 2,
            updatedAt: new Date().toISOString(),
          }),
        ),
        archive: vi.fn().mockImplementation((_ctx, id, input) =>
          Promise.resolve({
            ...mockAsset,
            id,
            status: 'DECOMMISSIONED',
            archivedAt: new Date().toISOString(),
            version: 2,
          }),
        ),
      };

      const mockSpace = {
        id: spaceId,
        code: 'B01-F02-R101',
        name: 'Pump Room A',
        description: 'North utility wing pump gallery',
        spaceType: 'ROOM',
        parentSpaceId: null,
        siteRef: 'site-alpha',
        floorNumber: 2,
        grossAreaSqm: 120.5,
        netAreaSqm: 110.0,
        cadLayer: {},
        bimGuid: 'GUID-12345',
        metadata: {},
        assetCount: 1,
        version: 1,
        createdBy: 'admin',
        createdAt: '2024-01-15T08:00:00.000Z',
        updatedAt: '2024-01-15T08:00:00.000Z',
      };

      const mockSpacesService = {
        tree: vi.fn().mockResolvedValue([mockSpace]),
        get: vi.fn().mockResolvedValue(mockSpace),
        create: vi.fn().mockImplementation((_ctx, input) =>
          Promise.resolve({
            ...mockSpace,
            ...input,
            id: randomUUID(),
            version: 1,
          }),
        ),
        update: vi.fn().mockImplementation((_ctx, id, input) =>
          Promise.resolve({
            ...mockSpace,
            ...input,
            id,
            version: 2,
          }),
        ),
        delete: vi.fn().mockResolvedValue({ deleted: true }),
        getAssetsInSpace: vi.fn().mockResolvedValue([mockAsset]),
      };

      const mockClassification = {
        id: classId,
        code: 'ROT-PUMP',
        name: 'Rotating Equipment - Pumps',
        description: 'Mechanical fluid pumps',
        parentClassId: null,
        specCount: 1,
        assetCount: 1,
        version: 1,
        createdBy: 'admin',
        createdAt: '2024-01-15T08:00:00.000Z',
        updatedAt: '2024-01-15T08:00:00.000Z',
      };

      const mockSpecDef = {
        id: specDefId,
        classificationId: classId,
        attributeKey: 'flow_rate_gpm',
        label: 'Flow Rate (GPM)',
        dataType: 'NUMBER',
        uom: 'GPM',
        required: true,
        minValue: 10,
        maxValue: 500,
        defaultValue: '100',
        version: 1,
      };

      const mockSpecValue = {
        specDefinitionId: specDefId,
        attributeKey: 'flow_rate_gpm',
        label: 'Flow Rate (GPM)',
        dataType: 'NUMBER',
        uom: 'GPM',
        valueText: null,
        valueNumber: 250,
        valueBoolean: null,
      };

      const mockClassificationsService = {
        listTree: vi.fn().mockResolvedValue([mockClassification]),
        get: vi.fn().mockResolvedValue(mockClassification),
        create: vi.fn().mockImplementation((_ctx, input) =>
          Promise.resolve({
            ...mockClassification,
            ...input,
            id: randomUUID(),
            version: 1,
          }),
        ),
        update: vi.fn().mockImplementation((_ctx, id, input) =>
          Promise.resolve({
            ...mockClassification,
            ...input,
            id,
            version: 2,
          }),
        ),
        delete: vi.fn().mockResolvedValue({ success: true }),
        listSpecDefinitions: vi.fn().mockResolvedValue([mockSpecDef]),
        createSpecDefinition: vi.fn().mockImplementation((_ctx, input) =>
          Promise.resolve({
            ...mockSpecDef,
            ...input,
            id: randomUUID(),
            version: 1,
          }),
        ),
        getAssetSpecs: vi.fn().mockResolvedValue([mockSpecValue]),
        setAssetSpecs: vi.fn().mockResolvedValue([mockSpecValue]),
      };

      const deps: CmmsRecordDependencies = {
        workOrders: {} as any,
        assets: mockAssetsService as any,
        parts: {} as any,
        spaces: mockSpacesService as any,
        classifications: mockClassificationsService as any,
      };

      return {
        deps,
        assetId,
        spaceId,
        classId,
        specDefId,
        mockAssetsService,
        mockSpacesService,
        mockClassificationsService,
      };
    }

    it('manages Assets & Specifications: lists, gets, creates, updates, and archives via action', async () => {
      const { deps, assetId, mockAssetsService, mockClassificationsService } = createSlice4Deps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const planner = makePrincipal('planner-carol', [
        'cmms:read',
        'cmms.assets.read',
        'cmms.assets.write',
      ]);

      // 1. Search/list assets
      const listRes = await dispatcher.list(planner, 'cmms.assets', {
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(listRes.items).toHaveLength(1);
      expect(listRes.items[0]?.['asset-tag']).toBe('AST-PUMP-001');
      expect(listRes.items[0]?.['criticality']).toBe('HIGH');

      // 2. Get asset
      const getRes = await dispatcher.get(planner, 'cmms.assets', assetId);
      expect(getRes?.['name']).toBe('Primary Centrifugal Pump');
      expect(getRes?.['manufacturer']).toBe('Sulzer');

      // 3. Create asset
      const created = await dispatcher.create(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.assets',
        {
          'asset-tag': 'AST-MOT-002',
          name: '400kW Drive Motor',
          category: 'MOTORS',
          criticality: 'CRITICAL',
          status: 'OPERATIONAL',
          manufacturer: 'Siemens',
        },
        randomUUID(),
      );
      expect(created['asset-tag']).toBe('AST-MOT-002');
      expect(mockAssetsService.create).toHaveBeenCalled();

      // 4. Update asset
      const updated = await dispatcher.update(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.assets',
        assetId,
        { description: 'Overhauled motor and shaft alignment' },
        '"1"',
        randomUUID(),
      );
      expect(mockAssetsService.update).toHaveBeenCalledWith(
        expect.anything(),
        assetId,
        expect.objectContaining({ description: 'Overhauled motor and shaft alignment', expectedVersion: 1 }),
      );

      // 5. Archive action
      const archived = await dispatcher.action(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.assets',
        assetId,
        'archive',
        { reason: 'End of useful plant service life' },
        randomUUID(),
      );
      expect(archived['status']).toBe('DECOMMISSIONED');
      expect(mockAssetsService.archive).toHaveBeenCalledWith(
        expect.anything(),
        assetId,
        expect.objectContaining({ reason: 'End of useful plant service life' }),
      );

      // 6. Child tab: asset specifications
      const specsList = await dispatcher.list(planner, 'cmms.asset-specs', {
        parentId: assetId,
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(specsList.items).toHaveLength(1);
      expect(specsList.items[0]?.['attribute-key']).toBe('flow_rate_gpm');
      expect(specsList.items[0]?.['value-number']).toBe(250);

      // 7. Child tab: set / update specification
      const specUpdated = await dispatcher.create(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.asset-specs',
        {
          'asset-id': assetId,
          'spec-definition-id': '44444444-4444-4444-8444-444444444444',
          'value-number': 300,
        },
        randomUUID(),
      );
      expect(mockClassificationsService.setAssetSpecs).toHaveBeenCalled();
    });

    it('manages CAFM Spaces & Located Assets: lists, gets, creates, updates, and deletes via action', async () => {
      const { deps, spaceId, mockSpacesService } = createSlice4Deps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const planner = makePrincipal('planner-carol', [
        'cmms:read',
        'cmms.assets.read',
        'cmms.assets.write',
      ]);

      // 1. List spaces (flattens tree)
      const listRes = await dispatcher.list(planner, 'cmms.spaces', {
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(listRes.items).toHaveLength(1);
      expect(listRes.items[0]?.['code']).toBe('B01-F02-R101');
      expect(listRes.items[0]?.['space-type']).toBe('ROOM');

      // 2. Get space
      const getRes = await dispatcher.get(planner, 'cmms.spaces', spaceId);
      expect(getRes?.['name']).toBe('Pump Room A');
      expect(getRes?.['floor-number']).toBe(2);

      // 3. Create space
      const created = await dispatcher.create(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.spaces',
        {
          code: 'B01-F02-R102',
          name: 'Control Room B',
          'space-type': 'ROOM',
          'floor-number': 2,
        },
        randomUUID(),
      );
      expect(created['code']).toBe('B01-F02-R102');
      expect(mockSpacesService.create).toHaveBeenCalled();

      // 4. Update space
      await dispatcher.update(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.spaces',
        spaceId,
        { description: 'Expanded control room' },
        '"1"',
        randomUUID(),
      );
      expect(mockSpacesService.update).toHaveBeenCalledWith(
        expect.anything(),
        spaceId,
        expect.objectContaining({ description: 'Expanded control room', expectedVersion: 1 }),
      );

      // 5. Delete space action
      const deleted = await dispatcher.action(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.spaces',
        spaceId,
        'delete',
        {},
        randomUUID(),
      );
      expect(deleted['code']).toBe('B01-F02-R101');
      expect(mockSpacesService.delete).toHaveBeenCalledWith(expect.anything(), spaceId);

      // 6. Child tab: space assets
      const spaceAssetsList = await dispatcher.list(planner, 'cmms.space-assets', {
        parentId: spaceId,
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(spaceAssetsList.items).toHaveLength(1);
      expect(spaceAssetsList.items[0]?.['asset-tag']).toBe('AST-PUMP-001');
      expect(mockSpacesService.getAssetsInSpace).toHaveBeenCalledWith(expect.anything(), spaceId);
    });

    it('manages Classifications & Spec Definitions: lists, gets, creates, updates, and deletes via action', async () => {
      const { deps, classId, mockClassificationsService } = createSlice4Deps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const planner = makePrincipal('planner-carol', [
        'cmms:read',
        'cmms.assets.read',
        'cmms.assets.write',
      ]);

      // 1. List classifications (flattens tree)
      const listRes = await dispatcher.list(planner, 'cmms.classifications', {
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(listRes.items).toHaveLength(1);
      expect(listRes.items[0]?.['code']).toBe('ROT-PUMP');
      expect(listRes.items[0]?.['name']).toBe('Rotating Equipment - Pumps');

      // 2. Get classification
      const getRes = await dispatcher.get(planner, 'cmms.classifications', classId);
      expect(getRes?.['code']).toBe('ROT-PUMP');

      // 3. Create classification
      const created = await dispatcher.create(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.classifications',
        {
          code: 'ROT-COMP',
          name: 'Rotating Equipment - Compressors',
        },
        randomUUID(),
      );
      expect(created['code']).toBe('ROT-COMP');
      expect(mockClassificationsService.create).toHaveBeenCalled();

      // 4. Update classification
      await dispatcher.update(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.classifications',
        classId,
        { description: 'Updated pump classification description' },
        '"1"',
        randomUUID(),
      );
      expect(mockClassificationsService.update).toHaveBeenCalledWith(
        expect.anything(),
        classId,
        expect.objectContaining({ description: 'Updated pump classification description', expectedVersion: 1 }),
      );

      // 5. Delete classification action
      const deleted = await dispatcher.action(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.classifications',
        classId,
        'delete',
        {},
        randomUUID(),
      );
      expect(deleted['code']).toBe('ROT-PUMP');
      expect(mockClassificationsService.delete).toHaveBeenCalledWith(expect.anything(), classId);

      // 6. Child tab: specification definitions
      const specDefs = await dispatcher.list(planner, 'cmms.spec-definitions', {
        parentId: classId,
        page: 1,
        pageSize: 10,
        filters: {},
      });
      expect(specDefs.items).toHaveLength(1);
      expect(specDefs.items[0]?.['attribute-key']).toBe('flow_rate_gpm');
      expect(mockClassificationsService.listSpecDefinitions).toHaveBeenCalledWith(expect.anything(), classId);

      // 7. Child tab: create spec definition
      const newDef = await dispatcher.create(
        { principal: planner, tenantId: 'tenant-test' },
        'cmms.spec-definitions',
        {
          'classification-id': classId,
          'attribute-key': 'impeller_diameter_in',
          label: 'Impeller Diameter (in)',
          'data-type': 'NUMBER',
          uom: 'in',
          required: false,
        },
        randomUUID(),
      );
      expect(mockClassificationsService.createSpecDefinition).toHaveBeenCalled();
    });

    it('resolves cmms-spaces and cmms-classifications lookups', async () => {
      const { deps, spaceId, classId } = createSlice4Deps();
      const dispatcher = cmmsRecordDispatcher(deps);
      const viewer = makePrincipal('viewer-dave', ['cmms:read', 'cmms.assets.read']);

      const spaceLookup = await dispatcher.lookup(viewer, 'cmms-spaces', { limit: 10 });
      expect(spaceLookup).toHaveLength(1);
      expect(spaceLookup[0]).toEqual({
        value: spaceId,
        label: 'B01-F02-R101 - Pump Room A (ROOM)',
      });

      const classLookup = await dispatcher.lookup(viewer, 'cmms-classifications', { limit: 10 });
      expect(classLookup).toHaveLength(1);
      expect(classLookup[0]).toEqual({
        value: classId,
        label: 'ROT-PUMP - Rotating Equipment - Pumps',
      });
    });
  });
});

