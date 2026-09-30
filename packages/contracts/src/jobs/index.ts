import { z } from 'zod';

// ─── Kernel schedules (WI-OI-104c) ───────────────────────────────────────────
// A schedule runs one allow-listed module operation on a cron, as its owner. Seeing a schedule needs the module's read
// permission; creating, pausing, resuming or removing one needs the permission the operation itself needs, and the
// tenant must have the module enabled.

export const SCHEDULED_OPERATIONS = {
  'analytics.report-run': {
    moduleKey: 'analytics-studio',
    readPermission: 'analytics:read',
    runPermission: 'analytics:reports:write',
    target: 'report',
  },
  'connector-hub.sync': {
    moduleKey: 'connections',
    readPermission: 'connections:read',
    runPermission: 'connections:sync',
    target: 'connection',
  },
} as const;

export type ScheduledOperation = keyof typeof SCHEDULED_OPERATIONS;
export const ScheduledOperationSchema = z.enum(['analytics.report-run', 'connector-hub.sync']);

export const CreateKernelScheduleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    operation: ScheduledOperationSchema,
    targetId: z.string().trim().min(1).max(128),
    cron: z.string().trim().min(9).max(120),
    timeZone: z.string().trim().min(1).max(64),
  })
  .strict();
export type CreateKernelScheduleDto = z.infer<typeof CreateKernelScheduleSchema>;

export const KernelScheduleFilterSchema = z
  .object({ operation: ScheduledOperationSchema.optional(), targetId: z.string().trim().min(1).max(128).optional() })
  .strict();

export type KernelJobStatusV1 = 'QUEUED' | 'RUNNING' | 'RETRY_WAIT' | 'SUCCEEDED' | 'DEAD_LETTER' | 'CANCELLED';

export interface KernelScheduleRunV1 {
  id: string;
  status: KernelJobStatusV1;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** The module's own id and status for what it ran, such as a report run. */
  resultId: string | null;
  resultStatus: string | null;
}

export interface KernelScheduleV1 {
  id: string;
  name: string;
  operation: ScheduledOperation;
  targetId: string;
  cron: string;
  timeZone: string;
  status: 'ACTIVE' | 'PAUSED';
  pausedReason: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  owner: { id: string; name: string | null };
  createdAt: string;
  lastJob: KernelScheduleRunV1 | null;
  /** Whether the caller may pause, resume or remove it. */
  canManage: boolean;
}

export interface KernelScheduleListV1 {
  schedules: KernelScheduleV1[];
  /** Whether the caller may create schedules for the requested operation. */
  canCreate: boolean;
}
