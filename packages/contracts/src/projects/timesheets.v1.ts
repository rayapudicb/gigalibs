import { z } from 'zod';
import { DecimalQuantitySchema } from '../catalogue/index.js';

export const ProjectTimesheetStatusV1Schema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'BILLED']);
export type ProjectTimesheetStatusV1 = z.infer<typeof ProjectTimesheetStatusV1Schema>;

export const TimesheetApprovalQueueItemV1Schema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    projectCode: z.string(),
    projectName: z.string(),
    taskId: z.string().uuid(),
    taskName: z.string(),
    workerSubject: z.string(),
    workDate: z.string(),
    hours: DecimalQuantitySchema,
    status: ProjectTimesheetStatusV1Schema,
    version: z.number().int().positive(),
    notes: z.string().nullable(),
  })
  .strict();

export const TimesheetApprovalQueueV1Schema = z
  .object({
    items: z.array(TimesheetApprovalQueueItemV1Schema),
  })
  .strict();

export const TimesheetActionInputV1Schema = z
  .object({
    requestKey: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    rejectionReason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type TimesheetApprovalQueueItemV1 = z.infer<typeof TimesheetApprovalQueueItemV1Schema>;
export type TimesheetActionInputV1 = z.infer<typeof TimesheetActionInputV1Schema>;
