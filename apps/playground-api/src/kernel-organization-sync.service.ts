/**
 * WI-OI-109e2 (ADR-0018 §3, owner decision 2026-10-01): when a tree version is activated, or an administrator asks for
 * it to be sent again, each module that keeps a copy of the organization, and that the tenant is entitled to, is sent
 * the version by a kernel `module.call` job, run as the member who activated or asked. The platform outbox relay calls
 * this, so an event written with the activation is delivered even if the API stops in between.
 */

import { AuthService } from '@gigalibs/auth-nest';
import { OrgHierarchyActivatedEventV1Schema, OrgHierarchySyncRequestedEventV1Schema } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { JobRegistry, KernelJobs, PostgresJobStore } from '@gigalibs/jobs';
import { Inject, Injectable, Logger, type OnModuleDestroy, Optional } from '@nestjs/common';
import { Pool } from 'pg';
import { moduleCallJob, ORGANIZATION_SYNC_OPERATIONS } from './kernel-worker/module-call.job.js';
import type { PackJobs } from './kernel-pack-applications.service.js';

export const KERNEL_ORGANIZATION_JOBS = Symbol('KERNEL_ORGANIZATION_JOBS');

export const ORGANIZATION_SYNC_EVENT_TYPES = ['organization.hierarchy.activated.v1', 'organization.hierarchy.sync-requested.v1'] as const;

@Injectable()
export class KernelOrganizationSyncService implements OnModuleDestroy {
  private readonly logger = new Logger(KernelOrganizationSyncService.name);
  #jobs: PackJobs | undefined;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Optional() @Inject(KERNEL_ORGANIZATION_JOBS) jobs?: PackJobs,
  ) {
    this.#jobs = jobs;
  }

  /** Handles one outbox event; returns the queued jobs. Throws to let the relay retry. */
  async dispatch(event: { tenantId: string; eventType: string; payload: unknown }): Promise<Array<{ moduleKey: string; jobId: string }>> {
    if (event.eventType === 'organization.hierarchy.activated.v1') {
      const payload = OrgHierarchyActivatedEventV1Schema.parse(event.payload);
      const activation = await prisma.orgHierarchyActivation.findFirst({
        where: { tenantId: event.tenantId, id: payload.activationId },
        select: { activatedById: true },
      });
      if (!activation) throw new Error(`Activation ${payload.activationId} is not in this workspace.`);
      return this.enqueue(event.tenantId, payload.versionId, activation.activatedById, `activation:${payload.activationId}`);
    }
    if (event.eventType === 'organization.hierarchy.sync-requested.v1') {
      const payload = OrgHierarchySyncRequestedEventV1Schema.parse(event.payload);
      return this.enqueue(event.tenantId, payload.versionId, payload.requestedBy, `sync:${payload.requestId}:${payload.activationId}`);
    }
    return [];
  }

  private async enqueue(tenantId: string, versionId: string, ownerId: string, reason: string) {
    const now = new Date();
    const entitled = await prisma.tenantModuleEntitlement.findMany({
      where: {
        tenantId,
        moduleKey: { in: Object.keys(ORGANIZATION_SYNC_OPERATIONS) },
        status: 'ENABLED',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { moduleKey: true },
    });
    if (entitled.length === 0) return [];
    const owner = await this.auth.getSubjectContext(ownerId, tenantId, `organization-sync:${reason}`);
    const queued: Array<{ moduleKey: string; jobId: string }> = [];
    for (const { moduleKey } of entitled) {
      const job = await this.jobs().enqueue({
        tenantId,
        type: 'module.call',
        version: 1,
        payload: { operation: ORGANIZATION_SYNC_OPERATIONS[moduleKey as keyof typeof ORGANIZATION_SYNC_OPERATIONS].operation, versionId },
        ownerSubjectId: owner.user.id,
        ownerAuthVersion: owner.authVersion,
        correlationId: `organization:${reason}`,
        idempotencyKey: `organization-sync:${reason}:${moduleKey}`,
      });
      queued.push({ moduleKey, jobId: job.id });
    }
    this.logger.log(`[tenant:${tenantId}] organization version ${versionId} queued for ${queued.map((item) => item.moduleKey).join(', ')}`);
    return queued;
  }

  async onModuleDestroy(): Promise<void> {
    await this.#jobs?.close?.();
  }

  // Created on first use, as for pack applications.
  private jobs(): PackJobs {
    if (this.#jobs) return this.#jobs;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required to queue organization syncs.');
    const pool = new Pool({ connectionString, max: 2 });
    const registry = new JobRegistry();
    registry.register(moduleCallJob(this.auth));
    const jobs = new KernelJobs({ store: new PostgresJobStore(pool), registry });
    this.#jobs = { enqueue: (command) => jobs.enqueue(command), close: () => pool.end() };
    return this.#jobs;
  }
}
