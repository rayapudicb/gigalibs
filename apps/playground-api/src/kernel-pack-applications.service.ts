/**
 * WI-OI-107 (ADR-0016 F10, owner decision D3): when a tenant activates an industry or country pack version in
 * Configuration Studio, each module that reads that kind of pack, and that the tenant is entitled to, is sent its
 * section by a kernel `pack.apply` job, run as the member who activated it (their permission and entitlement are
 * re-checked when the job runs; retries and audit come from the kernel jobs). Modules keep their own copy.
 */

import { AuthService } from '@gigalibs/auth-nest';
import { prisma } from '@gigalibs/db';
import { JobRegistry, KernelJobs, PostgresJobStore } from '@gigalibs/jobs';
import { Inject, Injectable, Logger, type OnModuleDestroy, Optional } from '@nestjs/common';
import { Pool } from 'pg';
import { PACK_APPLY_OPERATIONS, moduleCallJob } from './kernel-worker/module-call.job.js';
import { packApplication } from './kernel-worker/pack-sections.js';

export const KERNEL_PACK_JOBS = Symbol('KERNEL_PACK_JOBS');

export interface PackJobs {
  enqueue: KernelJobs['enqueue'];
  close?(): Promise<void>;
}

export interface ActivatedVersion {
  readonly tenantId: string;
  readonly actorId: string;
  readonly activationId: string;
  readonly publishedVersionId: string;
  readonly checksum: string;
  readonly manifest: unknown;
}

@Injectable()
export class KernelPackApplicationsService implements OnModuleDestroy {
  private readonly logger = new Logger(KernelPackApplicationsService.name);
  #jobs: PackJobs | undefined;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Optional() @Inject(KERNEL_PACK_JOBS) jobs?: PackJobs,
  ) {
    this.#jobs = jobs;
  }

  /** One job per module with a section; nothing for a version that is not a pack. Returns the queued jobs. */
  async enqueueForActivation(activated: ActivatedVersion): Promise<Array<{ moduleKey: string; jobId: string }>> {
    const modules = (Object.keys(PACK_APPLY_OPERATIONS) as Array<keyof typeof PACK_APPLY_OPERATIONS>).filter(
      (moduleKey) => packApplication(activated.manifest, activated.publishedVersionId, activated.checksum, moduleKey) !== null,
    );
    if (modules.length === 0) {
      // A pack always has at least one module section; nothing readable means the version could not be read.
      const kind = (activated.manifest as { kind?: unknown } | null)?.kind;
      if (kind === 'INDUSTRY_PACK' || kind === 'COUNTRY_PACK') {
        this.logger.warn(`[tenant:${activated.tenantId}] pack version ${activated.publishedVersionId} has no module section that could be read; nothing was sent`);
      }
      return [];
    }
    const now = new Date();
    const entitled = await prisma.tenantModuleEntitlement.findMany({
      where: {
        tenantId: activated.tenantId,
        moduleKey: { in: modules.map((moduleKey) => PACK_APPLY_OPERATIONS[moduleKey].entitlementKey) },
        status: 'ENABLED',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { moduleKey: true },
    });
    const targets = modules.filter((moduleKey) => entitled.some((row) => row.moduleKey === PACK_APPLY_OPERATIONS[moduleKey].entitlementKey));
    if (targets.length === 0) return [];
    const owner = await this.auth.getSubjectContext(activated.actorId, activated.tenantId, `pack-apply:${activated.activationId}`);
    const queued: Array<{ moduleKey: string; jobId: string }> = [];
    for (const moduleKey of targets) {
      const job = await this.jobs().enqueue({
        tenantId: activated.tenantId,
        type: 'module.call',
        version: 1,
        payload: { operation: PACK_APPLY_OPERATIONS[moduleKey].operation, publishedVersionId: activated.publishedVersionId },
        ownerSubjectId: activated.actorId,
        ownerAuthVersion: owner.authVersion,
        correlationId: `pack:${activated.activationId}`,
        idempotencyKey: `pack-apply:${activated.activationId}:${moduleKey}`,
      });
      queued.push({ moduleKey, jobId: job.id });
    }
    this.logger.log(`[tenant:${activated.tenantId}] pack version ${activated.publishedVersionId} queued for ${targets.join(', ')}`);
    return queued;
  }

  async onModuleDestroy(): Promise<void> {
    await this.#jobs?.close?.();
  }

  // Created on first use, so the API starts without a jobs database connection until a pack is activated.
  private jobs(): PackJobs {
    if (this.#jobs) return this.#jobs;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required to queue pack applications.');
    const pool = new Pool({ connectionString, max: 2 });
    const registry = new JobRegistry();
    registry.register(moduleCallJob(this.auth));
    const jobs = new KernelJobs({ store: new PostgresJobStore(pool), registry });
    this.#jobs = { enqueue: (command) => jobs.enqueue(command), close: () => pool.end() };
    return this.#jobs;
  }
}
