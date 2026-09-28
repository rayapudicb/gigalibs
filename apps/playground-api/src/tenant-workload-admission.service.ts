import { prisma } from '@gigalibs/db';
import { Injectable, Logger } from '@nestjs/common';

export type WorkloadClass = 'INTERACTIVE' | 'BACKGROUND_WORKER' | 'OUTBOX_RELAY' | 'EVENT_LISTENER';

export interface WorkloadLease {
  id: string;
  tenantId: string;
  workloadClass: WorkloadClass;
  acquiredAt: Date;
  timeoutMs: number;
}

export interface WorkloadMetrics {
  active: number;
  capacity: number;
  available: number;
}

const DEFAULT_WORKLOAD_CAPACITIES: Record<WorkloadClass, number> = {
  INTERACTIVE: 50,
  BACKGROUND_WORKER: 10,
  OUTBOX_RELAY: 5,
  EVENT_LISTENER: 5,
};

const DEFAULT_WORKLOAD_TIMEOUTS_MS: Record<WorkloadClass, number> = {
  INTERACTIVE: 5_000,
  BACKGROUND_WORKER: 60_000,
  OUTBOX_RELAY: 15_000,
  EVENT_LISTENER: 10_000,
};

@Injectable()
export class TenantWorkloadAdmissionService {
  private readonly logger = new Logger(TenantWorkloadAdmissionService.name);
  private readonly db = prisma;
  private readonly capacities: Record<WorkloadClass, number> = { ...DEFAULT_WORKLOAD_CAPACITIES };
  private readonly activeLeases = new Map<string, WorkloadLease>();
  private readonly classActiveCounts: Record<WorkloadClass, number> = {
    INTERACTIVE: 0,
    BACKGROUND_WORKER: 0,
    OUTBOX_RELAY: 0,
    EVENT_LISTENER: 0,
  };
  private leaseSequence = 0;

  /**
   * Sets or overrides concurrency capacity for a workload class.
   */
  setCapacity(workloadClass: WorkloadClass, capacity: number): void {
    if (capacity < 1) throw new Error('CAPACITY_MUST_BE_POSITIVE');
    this.capacities[workloadClass] = capacity;
  }

  /**
   * Validates tenant binding and acquires an admission lease.
   * Throws TENANT_NOT_FOUND, TENANT_SUSPENDED, TENANT_BINDING_NOT_READY, or WORKLOAD_CAPACITY_EXCEEDED.
   */
  async admitWorkload(tenantId: string, workloadClass: WorkloadClass): Promise<WorkloadLease> {
    // 1. Capacity check
    const currentActive = this.classActiveCounts[workloadClass];
    const capacity = this.capacities[workloadClass];
    if (currentActive >= capacity) {
      this.logger.warn(
        `Workload admission rejected for tenant ${tenantId}: ${workloadClass} capacity saturated (${currentActive}/${capacity}).`,
      );
      throw new Error(`WORKLOAD_CAPACITY_EXCEEDED: ${workloadClass} is saturated.`);
    }

    // 2. Validate tenant & isolation binding
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
      include: { isolationBinding: true },
    });

    if (!tenant) {
      throw new Error(`TENANT_NOT_FOUND: Tenant ${tenantId} does not exist.`);
    }

    if (tenant.status === 'SUSPENDED') {
      throw new Error(`TENANT_SUSPENDED: Tenant ${tenantId} is suspended.`);
    }

    if (tenant.isolationBinding) {
      const bindingStatus = tenant.isolationBinding.status;
      if (bindingStatus !== 'READY') {
        throw new Error(
          `TENANT_BINDING_NOT_READY: Tenant ${tenantId} isolation binding is ${bindingStatus}.`,
        );
      }
    }

    // 3. Grant lease
    const leaseId = `lease_${workloadClass.toLowerCase()}_${++this.leaseSequence}_${Date.now()}`;
    const lease: WorkloadLease = {
      id: leaseId,
      tenantId,
      workloadClass,
      acquiredAt: new Date(),
      timeoutMs: DEFAULT_WORKLOAD_TIMEOUTS_MS[workloadClass],
    };

    this.activeLeases.set(lease.id, lease);
    this.classActiveCounts[workloadClass] += 1;

    return lease;
  }

  /**
   * Releases an acquired lease.
   */
  releaseWorkload(lease: WorkloadLease): void {
    if (this.activeLeases.has(lease.id)) {
      this.activeLeases.delete(lease.id);
      this.classActiveCounts[lease.workloadClass] = Math.max(
        0,
        this.classActiveCounts[lease.workloadClass] - 1,
      );
    }
  }

  /**
   * Executes a task under an admitted workload lease with guaranteed RAII release.
   */
  async withAdmittedWorkload<T>(
    tenantId: string,
    workloadClass: WorkloadClass,
    task: () => Promise<T>,
  ): Promise<T> {
    const lease = await this.admitWorkload(tenantId, workloadClass);
    try {
      return await task();
    } finally {
      this.releaseWorkload(lease);
    }
  }

  /**
   * Returns current admission telemetry per workload class.
   */
  getWorkloadMetrics(): Record<WorkloadClass, WorkloadMetrics> {
    return {
      INTERACTIVE: {
        active: this.classActiveCounts.INTERACTIVE,
        capacity: this.capacities.INTERACTIVE,
        available: Math.max(0, this.capacities.INTERACTIVE - this.classActiveCounts.INTERACTIVE),
      },
      BACKGROUND_WORKER: {
        active: this.classActiveCounts.BACKGROUND_WORKER,
        capacity: this.capacities.BACKGROUND_WORKER,
        available: Math.max(
          0,
          this.capacities.BACKGROUND_WORKER - this.classActiveCounts.BACKGROUND_WORKER,
        ),
      },
      OUTBOX_RELAY: {
        active: this.classActiveCounts.OUTBOX_RELAY,
        capacity: this.capacities.OUTBOX_RELAY,
        available: Math.max(0, this.capacities.OUTBOX_RELAY - this.classActiveCounts.OUTBOX_RELAY),
      },
      EVENT_LISTENER: {
        active: this.classActiveCounts.EVENT_LISTENER,
        capacity: this.capacities.EVENT_LISTENER,
        available: Math.max(
          0,
          this.capacities.EVENT_LISTENER - this.classActiveCounts.EVENT_LISTENER,
        ),
      },
    };
  }
}
