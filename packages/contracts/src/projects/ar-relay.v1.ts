import { z } from 'zod';
import { DecimalQuantitySchema, MoneyMinorSchema } from '../catalogue/index.js';
import { projectLineExtensionMinor } from './cost-accrual.js';

export const PROJECT_INVOICE_DRAFT_REQUESTED_V1 = 'projects.invoice_draft_requested.v1' as const;

export const AR_PROJECTS_INBOX_AUDIENCE = 'gigalibs-ar-projects-inbox' as const;

export const ProjectBillingKindV1Schema = z.enum(['TIME_MATERIALS', 'MILESTONE']);
export type ProjectBillingKindV1 = z.infer<typeof ProjectBillingKindV1Schema>;

export const ProjectInvoiceDraftRelayLineV1Schema = z
  .object({
    sourceLineId: z.string().uuid(),
    description: z.string().min(1).max(500),
    quantity: DecimalQuantitySchema,
    unitPriceMinor: MoneyMinorSchema,
    lineTotalMinor: MoneyMinorSchema,
  })
  .strict()
  .superRefine((line, ctx) => {
    const expected = projectLineTotalFromQuantityAndUnit(line.quantity, line.unitPriceMinor);
    if (expected !== line.lineTotalMinor) {
      ctx.addIssue({ code: 'custom', message: 'lineTotalMinor must match quantity × unitPriceMinor' });
    }
  });
export type ProjectInvoiceDraftRelayLineV1 = z.infer<typeof ProjectInvoiceDraftRelayLineV1Schema>;

export const ProjectInvoiceDraftRequestedPayloadV1Schema = z
  .object({
    billingRequestId: z.string().uuid(),
    requestKey: z.string().uuid(),
    projectId: z.string().uuid(),
    projectCode: z.string().min(1).max(64),
    orgUnitId: z.string().min(1).max(64),
    customerPartyId: z.string().uuid(),
    currencyCode: z.string().length(3),
    billingKind: ProjectBillingKindV1Schema,
    lines: z.array(ProjectInvoiceDraftRelayLineV1Schema).min(1),
    requestedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((payload, ctx) => {
    let sum = 0n;
    for (const line of payload.lines) {
      sum += BigInt(line.lineTotalMinor);
    }
    if (sum <= 0n) {
      ctx.addIssue({ code: 'custom', message: 'Invoice total must be positive' });
    }
  });
export type ProjectInvoiceDraftRequestedPayloadV1 = z.infer<typeof ProjectInvoiceDraftRequestedPayloadV1Schema>;

function projectLineTotalFromQuantityAndUnit(quantity: string, unitPriceMinor: string): string {
  return projectLineExtensionMinor(quantity, unitPriceMinor).toString();
}
