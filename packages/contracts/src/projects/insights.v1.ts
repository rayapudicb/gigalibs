import { z } from 'zod';
import { MoneyMinorSchema } from '../catalogue/index.js';
import { ProjectBudgetBurnV1Schema } from './cost-accrual.js';

export const ProjectSummaryV1Schema = z
  .object({
    id: z.string().uuid(),
    projectCode: z.string(),
    name: z.string(),
    status: z.string(),
    currencyCode: z.string().length(3),
    budgetMinor: MoneyMinorSchema,
    plannedStart: z.string().nullable(),
    plannedEnd: z.string().nullable(),
  })
  .strict();

export const ProjectGanttTaskV1Schema = z
  .object({
    id: z.string().uuid(),
    taskNumber: z.number().int().positive(),
    name: z.string(),
    status: z.string(),
    plannedHours: z.string(),
    plannedStart: z.string().nullable(),
    plannedEnd: z.string().nullable(),
  })
  .strict();

export const ProjectGanttPhaseV1Schema = z
  .object({
    id: z.string().uuid(),
    phaseNumber: z.number().int().positive(),
    name: z.string(),
    status: z.string(),
    plannedStart: z.string().nullable(),
    plannedEnd: z.string().nullable(),
    tasks: z.array(ProjectGanttTaskV1Schema),
  })
  .strict();

export const ProjectGanttV1Schema = z
  .object({
    projectId: z.string().uuid(),
    projectCode: z.string(),
    name: z.string(),
    plannedStart: z.string().nullable(),
    plannedEnd: z.string().nullable(),
    phases: z.array(ProjectGanttPhaseV1Schema),
  })
  .strict();

export const ProjectBurnTaskRowV1Schema = z
  .object({
    taskId: z.string().uuid().nullable(),
    taskName: z.string(),
    plannedHours: z.string(),
    materialMinor: MoneyMinorSchema,
    laborMinor: MoneyMinorSchema,
    totalMinor: MoneyMinorSchema,
  })
  .strict();

export const ProjectBurnMatrixV1Schema = z
  .object({
    projectId: z.string().uuid(),
    projectCode: z.string(),
    currencyCode: z.string().length(3),
    summary: ProjectBudgetBurnV1Schema,
    rows: z.array(ProjectBurnTaskRowV1Schema),
  })
  .strict();

export type ProjectSummaryV1 = z.infer<typeof ProjectSummaryV1Schema>;
export type ProjectGanttTaskV1 = z.infer<typeof ProjectGanttTaskV1Schema>;
export type ProjectGanttPhaseV1 = z.infer<typeof ProjectGanttPhaseV1Schema>;
export type ProjectGanttV1 = z.infer<typeof ProjectGanttV1Schema>;
export type ProjectBurnTaskRowV1 = z.infer<typeof ProjectBurnTaskRowV1Schema>;
export type ProjectBurnMatrixV1 = z.infer<typeof ProjectBurnMatrixV1Schema>;
