import { z } from 'zod';
import { MoneyMinorSchema } from '../catalogue/index.js';

export const PROJECT_STATUSES = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETE', 'CANCELLED'] as const;
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);

export const TIMESHEET_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'BILLED'] as const;
export const TimesheetStatusSchema = z.enum(TIMESHEET_STATUSES);

export const ProjectV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    projectCode: z.string().min(1).max(64),
    name: z.string().min(1).max(200),
    status: ProjectStatusSchema,
    orgUnitId: z.string().min(1).max(64),
    customerPartyId: z.string().uuid().nullable(),
    currencyCode: z.string().length(3),
    budgetAmountMinor: MoneyMinorSchema,
    version: z.number().int().positive(),
    plannedStart: z.string().date().nullable(),
    plannedEnd: z.string().date().nullable(),
    createdBy: z.string().min(1).max(128),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProjectV1 = z.infer<typeof ProjectV1Schema>;
