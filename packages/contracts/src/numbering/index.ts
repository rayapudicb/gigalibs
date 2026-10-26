import { z } from 'zod';

// WI-OI-120 (Phase 4, S13 numbering): the shared document-numbering engine every module needs. A numbering SERIES has
// a pattern (`PO-{YYYY}-{SEQ:5}`) and a reset policy; rendering turns a sequence value + a date into the printed number
// (`PO-2026-00042`). This module is the PURE core — pattern parsing, the period key a counter resets on, and
// rendering — so the control plane and every module compute identical numbers. Allocating the next sequence value
// atomically (a per-series, per-period counter) is a thin service on top; it is not here.

/** When a series' sequence restarts. The period key (below) is what a counter is bucketed under. */
export const SequenceResetPolicySchema = z.enum(['NEVER', 'YEARLY', 'MONTHLY', 'DAILY']);
export type SequenceResetPolicy = z.infer<typeof SequenceResetPolicySchema>;

// A pattern is literal text plus date tokens and exactly one sequence token. `{SEQ}` or `{SEQ:n}` (zero-padded to n,
// 1–12). Date tokens: {YYYY} {YY} {MM} {DD}. Braces are reserved; no other `{...}` token is allowed.
const SEQ_TOKEN = /\{SEQ(?::(\d{1,2}))?\}/;
const DATE_TOKEN = /\{(YYYY|YY|MM|DD)\}/g;
const ANY_TOKEN = /\{[^}]*\}/g;
const KNOWN_TOKEN = /^\{(SEQ(?::\d{1,2})?|YYYY|YY|MM|DD)\}$/;

export const NumberingPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (pattern) => (pattern.match(/\{SEQ(?::\d{1,2})?\}/g) ?? []).length === 1,
    'A pattern needs exactly one {SEQ} token.',
  )
  .refine((pattern) => {
    const padding = SEQ_TOKEN.exec(pattern)?.[1];
    return padding === undefined || (Number(padding) >= 1 && Number(padding) <= 12);
  }, 'Sequence padding must be 1–12 digits.')
  .refine(
    (pattern) => (pattern.match(ANY_TOKEN) ?? []).every((token) => KNOWN_TOKEN.test(token)),
    'A pattern may only use {SEQ}, {SEQ:n}, {YYYY}, {YY}, {MM}, {DD}.',
  );

export const NumberingSeriesSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,62}$/, 'A series key is lower-case letters, digits and hyphens.'),
    pattern: NumberingPatternSchema,
    resetPolicy: SequenceResetPolicySchema.default('NEVER'),
    /** The first sequence value in any period. */
    start: z.number().int().min(0).max(1_000_000_000).default(1),
  })
  .strict();
export type NumberingSeries = z.infer<typeof NumberingSeriesSchema>;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** The period a date falls in for a reset policy — the key a sequence counter is kept under. */
export function sequencePeriodKey(resetPolicy: SequenceResetPolicy, at: Date = new Date()): string {
  const yyyy = at.getUTCFullYear();
  const mm = pad(at.getUTCMonth() + 1, 2);
  const dd = pad(at.getUTCDate(), 2);
  switch (resetPolicy) {
    case 'NEVER':
      return 'all';
    case 'YEARLY':
      return `${yyyy}`;
    case 'MONTHLY':
      return `${yyyy}-${mm}`;
    case 'DAILY':
      return `${yyyy}-${mm}-${dd}`;
  }
}

/** Render the printed number for a sequence value and date. Date tokens come from `at` in UTC. */
export function renderDocumentNumber(
  pattern: string,
  sequence: number,
  at: Date = new Date(),
): string {
  const yyyy = at.getUTCFullYear();
  const withDates = pattern.replace(DATE_TOKEN, (_match, token: string) => {
    switch (token) {
      case 'YYYY':
        return `${yyyy}`;
      case 'YY':
        return pad(yyyy % 100, 2);
      case 'MM':
        return pad(at.getUTCMonth() + 1, 2);
      case 'DD':
        return pad(at.getUTCDate(), 2);
      default:
        return _match;
    }
  });
  return withDates.replace(SEQ_TOKEN, (_match, padding?: string) =>
    padding ? pad(sequence, Number(padding)) : `${sequence}`,
  );
}
