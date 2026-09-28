import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const identifier = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const jurisdictionInputSchema = z.object({
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  jurisdictionCode: identifier,
  jurisdictionName: z.string().trim().min(2).max(128),
  taxType: z.enum(['SALES_TAX', 'VAT', 'GST', 'USE_TAX']),
  standardRateBasisPoints: z.number().int().min(0).max(10_000),
  reducedRateBasisPoints: z.number().int().min(0).max(10_000),
  hasPhysicalNexus: z.boolean(),
  hasEconomicNexus: z.boolean(),
  economicThresholdRevenueMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  economicThresholdTransactions: z.number().int().nonnegative().max(10_000_000),
}).strict();

export const rateInputSchema = z.object({
  jurisdictionId: identifier,
  productCategory: identifier,
  rateBasisPoints: z.number().int().min(0).max(10_000),
  isExempt: z.boolean(),
  effectiveFrom: date,
  effectiveUntil: date.nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) {
    context.addIssue({ code: 'custom', message: 'effectiveUntil must be on or after effectiveFrom.' });
  }
});

export const exemptionInputSchema = z.object({
  customerId: identifier,
  customerName: z.string().trim().min(2).max(128),
  certificateNumber: z.string().trim().min(2).max(128),
  jurisdictionCode: identifier,
  exemptionReason: identifier,
  documentUrl: z.string().url().max(255),
  validFrom: date,
  validUntil: date,
}).strict().superRefine((value, context) => {
  if (value.validUntil < value.validFrom) {
    context.addIssue({ code: 'custom', message: 'validUntil must be on or after validFrom.' });
  }
});

export const exemptionVerificationSchema = z.object({
  verificationReference: z.string().trim().min(3).max(255),
}).strict();

export const calculationInputSchema = z.object({
  sourceModule: identifier,
  documentId: identifier,
  documentReference: z.string().trim().min(1).max(128).optional(),
  jurisdictionCode: identifier,
  productCategory: identifier,
  taxableAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  customerId: identifier.optional(),
  transactionDate: date,
}).strict();

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Request validation failed.',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

export function requireIdempotencyKey(value: string | undefined): string {
  const parsed = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9_.:-]+$/).safeParse(value);
  if (!parsed.success) throw new BadRequestException('A valid Idempotency-Key header is required.');
  return parsed.data;
}
