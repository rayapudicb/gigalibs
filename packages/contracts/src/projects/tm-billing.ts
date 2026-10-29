import { z } from 'zod';
import { DecimalQuantitySchema, MoneyMinorSchema } from '../catalogue/index.js';
import { projectLineExtensionMinor } from './cost-accrual.js';

export const ProjectTmTimesheetBillInputV1Schema = z
  .object({
    timesheetId: z.string().uuid(),
    taskId: z.string().uuid(),
    taskName: z.string().min(1).max(200),
    workerSubject: z.string().min(1).max(128),
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hours: DecimalQuantitySchema,
    hourlyRateMinor: MoneyMinorSchema,
  })
  .strict();
export type ProjectTmTimesheetBillInputV1 = z.infer<typeof ProjectTmTimesheetBillInputV1Schema>;

export const ProjectTmInvoiceDraftLineV1Schema = z
  .object({
    timesheetId: z.string().uuid(),
    description: z.string().min(1).max(500),
    hours: DecimalQuantitySchema,
    hourlyRateMinor: MoneyMinorSchema,
    lineTotalMinor: MoneyMinorSchema,
  })
  .strict();
export type ProjectTmInvoiceDraftLineV1 = z.infer<typeof ProjectTmInvoiceDraftLineV1Schema>;

export const ProjectMilestoneBillInputV1Schema = z
  .object({
    projectLineId: z.string().uuid(),
    description: z.string().min(1).max(500),
    amountMinor: MoneyMinorSchema,
  })
  .strict();
export type ProjectMilestoneBillInputV1 = z.infer<typeof ProjectMilestoneBillInputV1Schema>;

export const ProjectMilestoneInvoiceDraftLineV1Schema = z
  .object({
    projectLineId: z.string().uuid(),
    description: z.string().min(1).max(500),
    amountMinor: MoneyMinorSchema,
  })
  .strict();
export type ProjectMilestoneInvoiceDraftLineV1 = z.infer<typeof ProjectMilestoneInvoiceDraftLineV1Schema>;

function minorToString(value: bigint): string {
  return value.toString();
}

/** Unbilled approved timesheets × labor rate → AR invoice draft lines (WI-OI-129 S4, pure). */
export function buildTmInvoiceDraftLines(
  timesheets: readonly ProjectTmTimesheetBillInputV1[],
): ProjectTmInvoiceDraftLineV1[] {
  const parsed = timesheets.map((row) => ProjectTmTimesheetBillInputV1Schema.parse(row));
  return parsed
    .slice()
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.timesheetId.localeCompare(b.timesheetId))
    .map((row) => {
      const lineTotalMinor = projectLineExtensionMinor(row.hours, row.hourlyRateMinor);
      const description = `Labor ${row.workDate} · ${row.taskName} (${row.workerSubject})`;
      return ProjectTmInvoiceDraftLineV1Schema.parse({
        timesheetId: row.timesheetId,
        description,
        hours: row.hours,
        hourlyRateMinor: row.hourlyRateMinor,
        lineTotalMinor: minorToString(lineTotalMinor),
      });
    });
}

/** Milestone project line → single invoice draft line (pure). */
export function buildMilestoneInvoiceDraftLine(
  input: ProjectMilestoneBillInputV1,
): ProjectMilestoneInvoiceDraftLineV1 {
  const parsed = ProjectMilestoneBillInputV1Schema.parse(input);
  if (BigInt(parsed.amountMinor) <= 0n) {
    throw new Error('Milestone amountMinor must be positive');
  }
  return ProjectMilestoneInvoiceDraftLineV1Schema.parse(parsed);
}
