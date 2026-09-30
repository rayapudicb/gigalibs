import { z } from 'zod';

// WI-OI-103e (ADR-0016 F11): Analytics owns reports. A report is a saved chart or a dashboard exported as CSV; each
// run re-asks the stored questions and keeps the file it produced. Scheduled delivery arrives with the scheduler
// (WI-OI-104); scheduled runs will use their owner's rights and check recipients at send time.

export const ReportSourceV1Schema = z.union([
  z.object({ chartViewId: z.string().uuid() }).strict(),
  z.object({ dashboardId: z.string().uuid() }).strict(),
]);
export type ReportSourceV1 = z.infer<typeof ReportSourceV1Schema>;

export const CreateReportV1Schema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1_000).nullable().default(null),
    source: ReportSourceV1Schema,
  })
  .strict();
export type CreateReportV1 = z.input<typeof CreateReportV1Schema>;

export const ReportRunStatusV1Schema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);

export const ReportRunV1Schema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
  status: ReportRunStatusV1Schema,
  rowCount: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
  triggeredBy: z.string(),
  queuedAt: z.string(),
  completedAt: z.string().nullable(),
  /** A short-lived token for the CSV; downloading needs analytics:export. */
  download: z.object({ token: z.string(), expiresAt: z.string(), filename: z.string() }).nullable(),
});
export type ReportRunV1 = z.infer<typeof ReportRunV1Schema>;

export const ReportV1Schema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  source: z.object({ kind: z.enum(['chart_view', 'dashboard', 'retired_chart']), id: z.string().uuid(), name: z.string() }),
  createdBy: z.string(),
  createdAt: z.string(),
  lastRun: ReportRunV1Schema.nullable(),
});
export type ReportV1 = z.infer<typeof ReportV1Schema>;
