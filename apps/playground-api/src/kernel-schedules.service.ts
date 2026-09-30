/**
 * Kernel schedules API (WI-OI-104c): a member schedules an allow-listed module operation (a report run, a connector
 * sync) and the kernel worker runs it as its owner. Rights are the caller's current ones, resolved the way the worker
 * resolves the owner's: seeing needs the module's read permission; creating, pausing, resuming and removing need the
 * operation's own permission; the module must be enabled for the tenant. Whoever resumes a schedule becomes its owner.
 */

import { AuthService } from '@gigalibs/auth-nest';
import {
  type CreateKernelScheduleDto,
  type KernelScheduleListV1,
  type KernelScheduleRunV1,
  type KernelScheduleV1,
  SCHEDULED_OPERATIONS,
  type ScheduledOperation,
} from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import {
  CronExpressionError,
  JobDefinitionError,
  type JobRecord,
  JobRegistry,
  KernelJobs,
  KernelScheduler,
  NonRetryableJobError,
  PostgresJobStore,
  PostgresScheduleStore,
  type ScheduleRecord,
  nextCronRun,
  parseCron,
} from '@gigalibs/jobs';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { Pool } from 'pg';
import {
  type ModuleCallPayload,
  grants,
  moduleCallJob,
  moduleCallPayload,
  moduleCallTarget,
  parseModuleCallPayload,
} from './kernel-worker/module-call.job.js';

export const KERNEL_SCHEDULES_BACKEND = Symbol('KERNEL_SCHEDULES_BACKEND');

export interface KernelSchedulesBackend {
  readonly scheduler: Pick<KernelScheduler, 'create' | 'pause' | 'resume' | 'remove'>;
  readonly schedules: Pick<PostgresScheduleStore, 'list' | 'get'>;
  readonly jobs: Pick<PostgresJobStore, 'listByCorrelationForTenant' | 'latestByCorrelationForTenant'>;
  close?(): Promise<void>;
}

/** Runs closer together than this are refused: schedules are for reports and syncs, not polling. */
export const MIN_SCHEDULE_INTERVAL_MS = 15 * 60_000;
export const MAX_SCHEDULES_PER_TENANT = 200;

interface CallerRights {
  readonly name: string | null;
  canRead(operation: ScheduledOperation): boolean;
  canRun(operation: ScheduledOperation): boolean;
}

@Injectable()
export class KernelSchedulesService implements OnModuleDestroy {
  readonly #backend: KernelSchedulesBackend;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Optional() @Inject(KERNEL_SCHEDULES_BACKEND) backend?: KernelSchedulesBackend,
  ) {
    this.#backend = backend ?? postgresBackend(auth);
  }

  async onModuleDestroy(): Promise<void> {
    await this.#backend.close?.();
  }

  async list(
    tenantId: string,
    userId: string,
    filter: { operation?: ScheduledOperation; targetId?: string },
  ): Promise<KernelScheduleListV1> {
    const rights = await this.rights(tenantId, userId);
    const visible = (await this.#backend.schedules.list(tenantId))
      .map((record) => ({ record, payload: moduleCall(record) }))
      .filter((entry): entry is { record: ScheduleRecord; payload: ScheduledPayload } => entry.payload !== null)
      .filter(({ payload }) => !filter.operation || payload.operation === filter.operation)
      .filter(({ payload }) => !filter.targetId || moduleCallTarget(payload) === filter.targetId)
      .filter(({ payload }) => rights.canRead(payload.operation));
    const [latest, owners] = await Promise.all([
      this.#backend.jobs.latestByCorrelationForTenant(tenantId, visible.map(({ record }) => correlation(record.id))),
      ownerNames(visible.map(({ record }) => record.ownerSubjectId)),
    ]);
    return {
      schedules: visible.map(({ record, payload }) =>
        toSchedule(record, payload, owners, latest.get(correlation(record.id)) ?? null, rights.canRun(payload.operation)),
      ),
      canCreate: filter.operation
        ? rights.canRun(filter.operation)
        : (Object.keys(SCHEDULED_OPERATIONS) as ScheduledOperation[]).some((operation) => rights.canRun(operation)),
    };
  }

  async create(tenantId: string, userId: string, dto: CreateKernelScheduleDto): Promise<KernelScheduleV1> {
    const rights = await this.rights(tenantId, userId);
    this.requireRun(rights, dto.operation);
    let payload: ScheduledPayload;
    try {
      payload = moduleCallPayload(dto.operation, dto.targetId) as ScheduledPayload;
    } catch {
      throw new BadRequestException(`'${dto.targetId}' is not a valid ${SCHEDULED_OPERATIONS[dto.operation].target} id.`);
    }
    assertInterval(dto.cron, dto.timeZone);
    if ((await this.#backend.schedules.list(tenantId)).length >= MAX_SCHEDULES_PER_TENANT) {
      throw new BadRequestException(`A workspace can have at most ${MAX_SCHEDULES_PER_TENANT} schedules.`);
    }
    const record = await this.#backend.scheduler
      .create({
        tenantId,
        name: dto.name,
        jobType: 'module.call',
        jobVersion: 1,
        payload,
        cron: dto.cron,
        timeZone: dto.timeZone,
        ownerSubjectId: userId,
      })
      .catch(badRequest);
    return toSchedule(record, payload, new Map([[userId, rights.name]]), null, true);
  }

  async pause(tenantId: string, userId: string, id: string): Promise<KernelScheduleV1> {
    const { rights, payload } = await this.manageable(tenantId, userId, id);
    const record = await this.#backend.scheduler.pause(tenantId, id, `Paused by ${rights.name ?? 'a member'}.`);
    return this.present(tenantId, record, payload);
  }

  /** Resumes from now, with the resuming member as the new owner. */
  async resume(tenantId: string, userId: string, id: string): Promise<KernelScheduleV1> {
    const { payload } = await this.manageable(tenantId, userId, id);
    const record = await this.#backend.scheduler.resume(tenantId, id, userId);
    return this.present(tenantId, record, payload);
  }

  async remove(tenantId: string, userId: string, id: string): Promise<{ removed: true }> {
    await this.manageable(tenantId, userId, id);
    if (!(await this.#backend.scheduler.remove(tenantId, id))) throw new NotFoundException('Schedule not found.');
    return { removed: true };
  }

  async runs(tenantId: string, userId: string, id: string): Promise<KernelScheduleRunV1[]> {
    const rights = await this.rights(tenantId, userId);
    const payload = await this.visible(tenantId, id, rights);
    if (!payload) throw new NotFoundException('Schedule not found.');
    return (await this.#backend.jobs.listByCorrelationForTenant(tenantId, correlation(id), 20)).map(toRun);
  }

  private async rights(tenantId: string, userId: string): Promise<CallerRights> {
    const context = await this.auth.getSubjectContext(userId, tenantId, `schedules-api:${userId}`);
    const enabled = new Set(
      (context.tenant?.entitlements ?? []).filter((entry) => entry.status === 'ENABLED').map((entry) => entry.moduleKey),
    );
    const allowed = (operation: ScheduledOperation, permission: string) =>
      enabled.has(SCHEDULED_OPERATIONS[operation].moduleKey) && grants(context.permissions, permission);
    return {
      name: context.user?.name ?? null,
      canRun: (operation) => allowed(operation, SCHEDULED_OPERATIONS[operation].runPermission),
      canRead: (operation) =>
        allowed(operation, SCHEDULED_OPERATIONS[operation].readPermission) ||
        allowed(operation, SCHEDULED_OPERATIONS[operation].runPermission),
    };
  }

  private requireRun(rights: CallerRights, operation: ScheduledOperation): void {
    if (!rights.canRun(operation)) {
      const meta = SCHEDULED_OPERATIONS[operation];
      throw new ForbiddenException(`Scheduling this needs ${meta.runPermission} and the ${meta.moduleKey} module.`);
    }
  }

  /** The schedule's payload when the caller may see it; unknown and hidden schedules look the same. */
  private async visible(tenantId: string, id: string, rights: CallerRights): Promise<ScheduledPayload | null> {
    const record = await this.#backend.schedules.get(tenantId, id);
    const payload = record ? moduleCall(record) : null;
    return payload && rights.canRead(payload.operation) ? payload : null;
  }

  private async manageable(tenantId: string, userId: string, id: string) {
    const rights = await this.rights(tenantId, userId);
    const payload = await this.visible(tenantId, id, rights);
    if (!payload) throw new NotFoundException('Schedule not found.');
    this.requireRun(rights, payload.operation);
    return { rights, payload };
  }

  private async present(tenantId: string, record: ScheduleRecord | null, payload: ScheduledPayload): Promise<KernelScheduleV1> {
    if (!record) throw new NotFoundException('Schedule not found.');
    const [latest, owners] = await Promise.all([
      this.#backend.jobs.latestByCorrelationForTenant(tenantId, [correlation(record.id)]),
      ownerNames([record.ownerSubjectId]),
    ]);
    return toSchedule(record, payload, owners, latest.get(correlation(record.id)) ?? null, true);
  }
}

function postgresBackend(auth: AuthService): KernelSchedulesBackend {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for kernel schedules.');
  const pool = new Pool({ connectionString, max: 3 });
  const registry = new JobRegistry();
  registry.register(moduleCallJob(auth));
  const schedules = new PostgresScheduleStore(pool);
  const jobs = new PostgresJobStore(pool);
  // The API only creates and changes schedules; the kernel worker is the one that ticks, so no owner resolver runs here.
  const scheduler = new KernelScheduler({ store: schedules, jobs: new KernelJobs({ store: jobs, registry }), registry, resolveOwner: async () => null });
  return { scheduler, schedules, jobs, close: () => pool.end() };
}

/** Refuses a cron whose next few runs come closer together than the minimum interval. */
export function assertInterval(cron: string, timeZone: string, now = new Date()): void {
  try {
    const schedule = parseCron(cron);
    let previous = nextCronRun(schedule, now, timeZone);
    for (let index = 0; index < 6; index += 1) {
      const next = nextCronRun(schedule, previous, timeZone);
      if (next.getTime() - previous.getTime() < MIN_SCHEDULE_INTERVAL_MS) {
        throw new BadRequestException('A schedule may run at most every 15 minutes.');
      }
      previous = next;
    }
  } catch (error) {
    badRequest(error);
  }
}

function badRequest(error: unknown): never {
  if (error instanceof CronExpressionError || error instanceof JobDefinitionError || error instanceof NonRetryableJobError) {
    throw new BadRequestException(error.message);
  }
  throw error;
}

/** A module call whose operation members can schedule (chained operations such as summary builds are not). */
type ScheduledPayload = Extract<ModuleCallPayload, { operation: ScheduledOperation }>;

function moduleCall(record: ScheduleRecord): ScheduledPayload | null {
  if (record.jobType !== 'module.call') return null;
  try {
    const payload = parseModuleCallPayload(record.payload);
    return Object.hasOwn(SCHEDULED_OPERATIONS, payload.operation) ? (payload as ScheduledPayload) : null;
  } catch {
    return null;
  }
}

const correlation = (scheduleId: string) => `schedule:${scheduleId}`;

async function ownerNames(ids: readonly string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((user) => [user.id, user.name]));
}

function toSchedule(
  record: ScheduleRecord,
  payload: ScheduledPayload,
  owners: ReadonlyMap<string, string | null>,
  lastJob: JobRecord | null,
  canManage: boolean,
): KernelScheduleV1 {
  return {
    id: record.id,
    name: record.name,
    operation: payload.operation,
    targetId: moduleCallTarget(payload),
    cron: record.cron,
    timeZone: record.timeZone,
    status: record.status,
    pausedReason: record.pausedReason,
    nextRunAt: record.nextRunAt.toISOString(),
    lastRunAt: record.lastRunAt?.toISOString() ?? null,
    owner: { id: record.ownerSubjectId, name: owners.get(record.ownerSubjectId) ?? null },
    createdAt: record.createdAt.toISOString(),
    lastJob: lastJob ? toRun(lastJob) : null,
    canManage,
  };
}

function toRun(job: JobRecord): KernelScheduleRunV1 {
  const result = job.resultSummary && typeof job.resultSummary === 'object' && !Array.isArray(job.resultSummary) ? job.resultSummary : {};
  return {
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    errorCode: job.lastErrorCode,
    errorMessage: job.lastErrorMessage,
    resultId: typeof result.resultId === 'string' ? result.resultId : null,
    resultStatus: typeof result.resultStatus === 'string' ? result.resultStatus : null,
  };
}
