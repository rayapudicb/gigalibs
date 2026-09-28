import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  tenant: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@gigalibs/db', () => ({
  prisma: database,
}));

import { TenantWorkloadAdmissionService } from './tenant-workload-admission.service.js';

describe('TenantWorkloadAdmissionService', () => {
  let service: TenantWorkloadAdmissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantWorkloadAdmissionService();
  });

  const activeTenant = {
    id: 'tenant_omega',
    status: 'ACTIVE',
    isolationBinding: {
      status: 'READY',
      requestedMode: 'ROW_LEVEL_SECURITY',
      effectiveMode: 'ROW_LEVEL_SECURITY',
    },
  };

  it('TP4-ADM-01: admits valid workload lease for active tenant and releases properly', async () => {
    database.tenant.findUnique.mockResolvedValueOnce(activeTenant);

    const lease = await service.admitWorkload('tenant_omega', 'INTERACTIVE');

    expect(lease.tenantId).toBe('tenant_omega');
    expect(lease.workloadClass).toBe('INTERACTIVE');
    expect(lease.id).toBeDefined();

    const metricsBefore = service.getWorkloadMetrics();
    expect(metricsBefore.INTERACTIVE.active).toBe(1);
    expect(metricsBefore.INTERACTIVE.available).toBe(49);

    service.releaseWorkload(lease);

    const metricsAfter = service.getWorkloadMetrics();
    expect(metricsAfter.INTERACTIVE.active).toBe(0);
    expect(metricsAfter.INTERACTIVE.available).toBe(50);
  });

  it('TP4-ADM-02: rejects admission when tenant is SUSPENDED', async () => {
    database.tenant.findUnique.mockResolvedValueOnce({
      id: 'tenant_suspended',
      status: 'SUSPENDED',
      isolationBinding: { status: 'READY' },
    });

    await expect(service.admitWorkload('tenant_suspended', 'BACKGROUND_WORKER')).rejects.toThrow(
      'TENANT_SUSPENDED',
    );

    const metrics = service.getWorkloadMetrics();
    expect(metrics.BACKGROUND_WORKER.active).toBe(0);
  });

  it('TP4-ADM-03: rejects admission when isolation binding is not READY', async () => {
    database.tenant.findUnique.mockResolvedValueOnce({
      id: 'tenant_provisioning',
      status: 'ACTIVE',
      isolationBinding: { status: 'PROVISIONING' },
    });

    await expect(service.admitWorkload('tenant_provisioning', 'OUTBOX_RELAY')).rejects.toThrow(
      'TENANT_BINDING_NOT_READY',
    );

    const metrics = service.getWorkloadMetrics();
    expect(metrics.OUTBOX_RELAY.active).toBe(0);
  });

  it('rejects admission when tenant is not found', async () => {
    database.tenant.findUnique.mockResolvedValueOnce(null);

    await expect(service.admitWorkload('tenant_unknown', 'INTERACTIVE')).rejects.toThrow(
      'TENANT_NOT_FOUND',
    );
  });

  it('TP4-ADM-04: rejects admission when workload capacity is saturated', async () => {
    service.setCapacity('EVENT_LISTENER', 2);
    database.tenant.findUnique.mockResolvedValue(activeTenant);

    const lease1 = await service.admitWorkload('tenant_omega', 'EVENT_LISTENER');
    const lease2 = await service.admitWorkload('tenant_omega', 'EVENT_LISTENER');

    await expect(service.admitWorkload('tenant_omega', 'EVENT_LISTENER')).rejects.toThrow(
      'WORKLOAD_CAPACITY_EXCEEDED',
    );

    service.releaseWorkload(lease1);
    service.releaseWorkload(lease2);
  });

  it('TP4-ADM-05: withAdmittedWorkload guarantees lease release on task completion and failure', async () => {
    database.tenant.findUnique.mockResolvedValue(activeTenant);

    // Successful execution
    const result = await service.withAdmittedWorkload('tenant_omega', 'INTERACTIVE', async () => {
      const metrics = service.getWorkloadMetrics();
      expect(metrics.INTERACTIVE.active).toBe(1);
      return 'completed';
    });

    expect(result).toBe('completed');
    expect(service.getWorkloadMetrics().INTERACTIVE.active).toBe(0);

    // Failed execution
    await expect(
      service.withAdmittedWorkload('tenant_omega', 'INTERACTIVE', async () => {
        throw new Error('Task crashed');
      }),
    ).rejects.toThrow('Task crashed');

    expect(service.getWorkloadMetrics().INTERACTIVE.active).toBe(0);
  });

  it('TP4-ADM-06: accurately calculates multi-class workload metrics', async () => {
    database.tenant.findUnique.mockResolvedValue(activeTenant);

    const interactiveLease = await service.admitWorkload('tenant_omega', 'INTERACTIVE');
    const workerLease = await service.admitWorkload('tenant_omega', 'BACKGROUND_WORKER');

    const metrics = service.getWorkloadMetrics();
    expect(metrics.INTERACTIVE.active).toBe(1);
    expect(metrics.BACKGROUND_WORKER.active).toBe(1);
    expect(metrics.OUTBOX_RELAY.active).toBe(0);
    expect(metrics.EVENT_LISTENER.active).toBe(0);

    service.releaseWorkload(interactiveLease);
    service.releaseWorkload(workerLease);

    const clearedMetrics = service.getWorkloadMetrics();
    expect(clearedMetrics.INTERACTIVE.active).toBe(0);
    expect(clearedMetrics.BACKGROUND_WORKER.active).toBe(0);
  });
});
