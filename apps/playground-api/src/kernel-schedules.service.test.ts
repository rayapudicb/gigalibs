import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@gigalibs/db', () => ({
  prisma: { user: { findMany: vi.fn(async () => [{ id: 'owner-1', name: 'Asha' }]) } },
}));

import { KernelSchedulesService, assertInterval } from './kernel-schedules.service.js';

const REPORT = '00000000-0000-4000-8000-0000000000aa';
const record = (id: string, payload: unknown, overrides: Record<string, unknown> = {}) => ({
  id,
  tenantId: 'tenant-1',
  name: `Schedule ${id}`,
  jobType: 'module.call',
  jobVersion: 1,
  payload,
  cron: '0 6 * * *',
  timeZone: 'Asia/Kolkata',
  status: 'ACTIVE',
  pausedReason: null,
  ownerSubjectId: 'owner-1',
  nextRunAt: new Date('2026-10-01T00:30:00.000Z'),
  lastRunAt: null,
  lastJobId: null,
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
  updatedAt: new Date('2026-09-30T00:00:00.000Z'),
  ...overrides,
});
const reportSchedule = record('11111111-1111-4111-8111-111111111111', { operation: 'analytics.report-run', reportDefinitionId: REPORT });
const syncSchedule = record('22222222-2222-4222-8222-222222222222', { operation: 'connector-hub.sync', connectionId: 'farmos' });

function setup(permissions: string[], modules = ['analytics-studio', 'connections']) {
  const backend = {
    scheduler: {
      create: vi.fn(async (command: { payload: unknown; name: string }) => record('33333333-3333-4333-8333-333333333333', command.payload, { name: command.name })),
      pause: vi.fn(async (_tenant: string, id: string, reason: string) => ({ ...reportSchedule, id, status: 'PAUSED', pausedReason: reason })),
      resume: vi.fn(async (_tenant: string, id: string, owner: string) => ({ ...reportSchedule, id, ownerSubjectId: owner })),
      remove: vi.fn(async () => true),
    },
    schedules: {
      list: vi.fn(async () => [reportSchedule, syncSchedule, record('x', {}, { jobType: 'analytics.summary-build' })]),
      get: vi.fn(async (_tenant: string, id: string) => [reportSchedule, syncSchedule].find((schedule) => schedule.id === id) ?? null),
    },
    jobs: {
      listByCorrelationForTenant: vi.fn(async () => []),
      latestByCorrelationForTenant: vi.fn(async () => new Map([[
        `schedule:${reportSchedule.id}`,
        { id: 'job-1', status: 'SUCCEEDED', attempts: 1, maxAttempts: 5, createdAt: new Date(), completedAt: new Date(), lastErrorCode: null, lastErrorMessage: null, resultSummary: { resultId: 'run-9', resultStatus: 'SUCCEEDED' } },
      ]])),
    },
  };
  const auth = {
    getSubjectContext: vi.fn(async () => ({
      user: { id: 'caller', name: 'Ravi' },
      tenant: { id: 'tenant-1', entitlements: modules.map((moduleKey) => ({ moduleKey, status: 'ENABLED' })) },
      permissions,
    })),
  };
  return { service: new KernelSchedulesService(auth as never, backend as never), backend };
}

// WI-OI-104c: the schedules API decides with the caller's current rights, per scheduled operation.
describe('kernel schedules API', () => {
  it('shows only the schedules whose module the caller can read, with who owns them and the last run', async () => {
    const { service } = setup(['analytics:read']);
    const listed = await service.list('tenant-1', 'caller', {});
    expect(listed.schedules.map((schedule) => schedule.operation)).toEqual(['analytics.report-run']);
    expect(listed.schedules[0]).toMatchObject({ targetId: REPORT, owner: { id: 'owner-1', name: 'Asha' }, canManage: false, lastJob: { resultId: 'run-9' } });
    expect(listed.canCreate).toBe(false);
    const analyst = await setup(['analytics:read', 'analytics:reports:write', 'connections:*']).service.list('tenant-1', 'caller', { operation: 'connector-hub.sync', targetId: 'farmos' });
    expect(analyst).toMatchObject({ canCreate: true, schedules: [{ operation: 'connector-hub.sync', canManage: true }] });
  });

  it('hides a module the tenant has not enabled, whatever the permissions', async () => {
    const { service } = setup(['analytics:*', 'connections:*'], ['connections']);
    expect((await service.list('tenant-1', 'caller', {})).schedules.map((schedule) => schedule.operation)).toEqual(['connector-hub.sync']);
    await expect(service.create('tenant-1', 'caller', { name: 'Daily', operation: 'analytics.report-run', targetId: REPORT, cron: '0 6 * * *', timeZone: 'Asia/Kolkata' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a module call owned by the caller, and refuses missing rights, bad targets and polling', async () => {
    const { service, backend } = setup(['analytics:read', 'analytics:reports:write']);
    const dto = { name: 'Daily yield', operation: 'analytics.report-run' as const, targetId: REPORT, cron: '0 6 * * *', timeZone: 'Asia/Kolkata' };
    await expect(service.create('tenant-1', 'caller', dto)).resolves.toMatchObject({ name: 'Daily yield', targetId: REPORT, canManage: true });
    expect(backend.scheduler.create).toHaveBeenCalledWith(expect.objectContaining({
      jobType: 'module.call',
      jobVersion: 1,
      ownerSubjectId: 'caller',
      payload: { operation: 'analytics.report-run', reportDefinitionId: REPORT },
    }));
    await expect(service.create('tenant-1', 'caller', { ...dto, operation: 'connector-hub.sync', targetId: 'farmos' })).rejects.toThrow('connections:sync');
    await expect(service.create('tenant-1', 'caller', { ...dto, targetId: 'not-a-report' })).rejects.toThrow('not a valid report id');
    await expect(service.create('tenant-1', 'caller', { ...dto, cron: '*/5 * * * *' })).rejects.toThrow('every 15 minutes');
    await expect(service.create('tenant-1', 'caller', { ...dto, timeZone: 'Mars/Olympus' })).rejects.toThrow();
  });

  it('lets only members who may run the operation pause, resume or remove, and hands the schedule to whoever resumes it', async () => {
    const reader = setup(['analytics:read']);
    await expect(reader.service.pause('tenant-1', 'caller', reportSchedule.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(reader.service.pause('tenant-1', 'caller', syncSchedule.id)).rejects.toThrow('Schedule not found');
    const writer = setup(['analytics:read', 'analytics:reports:write']);
    await expect(writer.service.pause('tenant-1', 'caller', reportSchedule.id)).resolves.toMatchObject({ status: 'PAUSED', pausedReason: 'Paused by Ravi.' });
    await writer.service.resume('tenant-1', 'caller', reportSchedule.id);
    expect(writer.backend.scheduler.resume).toHaveBeenCalledWith('tenant-1', reportSchedule.id, 'caller');
    await expect(writer.service.remove('tenant-1', 'caller', reportSchedule.id)).resolves.toEqual({ removed: true });
  });

  it('allows a run every 15 minutes or less often', () => {
    expect(() => assertInterval('*/15 * * * *', 'UTC')).not.toThrow();
    expect(() => assertInterval('0 6 * * 1', 'Asia/Kolkata')).not.toThrow();
    expect(() => assertInterval('0,5 6 * * *', 'UTC')).toThrow('every 15 minutes');
    expect(() => assertInterval('61 * * * *', 'UTC')).toThrow();
  });
});
