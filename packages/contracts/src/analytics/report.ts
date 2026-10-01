import { z } from 'zod';

// WI-OI-103e (ADR-0016 F11): Analytics owns reports. A report is a saved chart or a dashboard exported as CSV; each
// run re-asks the stored questions and keeps the file it produced. Scheduled delivery arrives with the scheduler
// (WI-OI-104); scheduled runs will use their owner's rights and check recipients at send time.

export const ReportSourceV1Schema = z.union([
  z.object({ chartViewId: z.string().uuid() }).strict(),
  z.object({ dashboardId: z.string().uuid() }).strict(),
]);
export type ReportSourceV1 = z.infer<typeof ReportSourceV1Schema>;

// WI-OI-106 (ADR-0016 F17): a report produces one file per chosen format. CSV stays the default; Excel has one sheet
// per chart and never a formula; PDF draws each chart on the server with its data table.
export const ReportFormatV1Schema = z.enum(['CSV', 'XLSX', 'PDF']);
export type ReportFormatV1 = z.infer<typeof ReportFormatV1Schema>;
const ReportFormatsSchema = z
  .array(ReportFormatV1Schema)
  .min(1)
  .max(3)
  .refine((formats) => new Set(formats).size === formats.length, 'Choose each format once.');

export const CreateReportV1Schema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1_000).nullable().default(null),
    source: ReportSourceV1Schema,
    formats: ReportFormatsSchema.default(['CSV']),
  })
  .strict();
export type CreateReportV1 = z.input<typeof CreateReportV1Schema>;

export const UpdateReportFormatsV1Schema = z.object({ formats: ReportFormatsSchema }).strict();
export type UpdateReportFormatsV1 = z.infer<typeof UpdateReportFormatsV1Schema>;

/** One file of a run: a short-lived token per file; downloading needs analytics:export. */
export const ReportFileV1Schema = z.object({
  format: ReportFormatV1Schema,
  token: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  filename: z.string(),
  byteSize: z.number().int().nonnegative(),
});
export type ReportFileV1 = z.infer<typeof ReportFileV1Schema>;

export const ReportDownloadTokenV1Schema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  format: ReportFormatV1Schema,
  filename: z.string(),
});
export type ReportDownloadTokenV1 = z.infer<typeof ReportDownloadTokenV1Schema>;

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
  /** The CSV's (or the first file's) short-lived token, kept for older callers; `files` lists every format. */
  download: z.object({ token: z.string(), expiresAt: z.string(), filename: z.string() }).nullable(),
  files: z.array(ReportFileV1Schema),
});
export type ReportRunV1 = z.infer<typeof ReportRunV1Schema>;

export const ReportV1Schema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  source: z.object({ kind: z.enum(['chart_view', 'dashboard', 'retired_chart']), id: z.string().uuid(), name: z.string() }),
  createdBy: z.string(),
  createdAt: z.string(),
  formats: z.array(ReportFormatV1Schema),
  lastRun: ReportRunV1Schema.nullable(),
});
export type ReportV1 = z.infer<typeof ReportV1Schema>;
