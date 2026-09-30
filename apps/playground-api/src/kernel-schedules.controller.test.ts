import type { AddressInfo } from 'node:net';
import { AuthService } from '@gigalibs/auth-nest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@gigalibs/db', () => ({ prisma: { user: { findMany: vi.fn(async () => []) } } }));

import { KernelSchedulesController } from './kernel-schedules.controller.js';
import { KERNEL_SCHEDULES_BACKEND, KernelSchedulesService } from './kernel-schedules.service.js';

const REPORT = '00000000-0000-4000-8000-0000000000aa';
const SCHEDULE = '11111111-1111-4111-8111-111111111111';
const stored = {
  id: SCHEDULE,
  tenantId: 'tenant-1',
  name: 'Daily yield',
  jobType: 'module.call',
  jobVersion: 1,
  payload: { operation: 'analytics.report-run', reportDefinitionId: REPORT },
  cron: '0 6 * * *',
  timeZone: 'Asia/Kolkata',
  status: 'ACTIVE',
  pausedReason: null,
  ownerSubjectId: 'caller',
  nextRunAt: new Date('2026-10-01T00:30:00.000Z'),
  lastRunAt: null,
  lastJobId: null,
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
  updatedAt: new Date('2026-09-30T00:00:00.000Z'),
};

// WI-OI-104c: the routes, validation and status codes as the web's control proxy reaches them.
describe('kernel schedules routes', () => {
  let app: INestApplication;
  let base: string;
  const backend = {
    scheduler: {
      create: vi.fn(async () => stored),
      pause: vi.fn(async () => ({ ...stored, status: 'PAUSED', pausedReason: 'Paused by Ravi.' })),
      resume: vi.fn(async () => stored),
      remove: vi.fn(async () => true),
    },
    schedules: { list: vi.fn(async () => [stored]), get: vi.fn(async () => stored) },
    jobs: { listByCorrelationForTenant: vi.fn(async () => []), latestByCorrelationForTenant: vi.fn(async () => new Map()) },
  };

  beforeAll(async () => {
    class KernelSchedulesTestModule {}
    app = await NestFactory.create(
      {
        module: KernelSchedulesTestModule,
        controllers: [KernelSchedulesController],
        providers: [
          KernelSchedulesService,
          { provide: KERNEL_SCHEDULES_BACKEND, useValue: backend },
          {
            provide: AuthService,
            useValue: {
              getSubjectContext: async () => ({
                user: { id: 'caller', name: 'Ravi' },
                tenant: { id: 'tenant-1', entitlements: [{ moduleKey: 'analytics-studio', status: 'ENABLED' }] },
                permissions: ['analytics:read', 'analytics:reports:write'],
              }),
            },
          },
        ],
      },
      { logger: false },
    );
    // Stands in for the global JWT and tenant guards, which set these from the verified session.
    app.use((request: { user?: unknown; tenant?: unknown }, _response: unknown, next: () => void) => {
      request.user = { sub: 'caller' };
      request.tenant = { tenantId: 'tenant-1' };
      next();
    });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/tenants/current/schedules`;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, body?: unknown) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : null });

  it('lists with a filter and creates with a validated body', async () => {
    const listed = await fetch(`${base}?operation=analytics.report-run&targetId=${REPORT}`);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ canCreate: true, schedules: [{ id: SCHEDULE, canManage: true }] });
    expect((await fetch(`${base}?operation=cmms.delete`)).status).toBe(400);
    const dto = { name: 'Daily yield', operation: 'analytics.report-run', targetId: REPORT, cron: '0 6 * * *', timeZone: 'Asia/Kolkata' };
    expect((await post('', dto)).status).toBe(201);
    expect((await post('', { ...dto, ownerSubjectId: 'someone-else' })).status).toBe(400);
    expect((await post('', { ...dto, cron: '*/5 * * * *' })).status).toBe(400);
  });

  it('pauses, resumes, removes and lists runs by schedule id, refusing malformed ids', async () => {
    expect((await post(`/${SCHEDULE}/pause`)).status).toBe(200);
    expect((await post(`/${SCHEDULE}/resume`)).status).toBe(200);
    expect(backend.scheduler.resume).toHaveBeenCalledWith('tenant-1', SCHEDULE, 'caller');
    expect(await (await post(`/${SCHEDULE}/remove`)).json()).toEqual({ removed: true });
    expect((await fetch(`${base}/${SCHEDULE}/runs`)).status).toBe(200);
    expect((await post('/not-a-uuid/pause')).status).toBe(400);
  });
});
