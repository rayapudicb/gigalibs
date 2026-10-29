import { z } from 'zod';
import { MoneyMinorSchema } from '../catalogue/index.js';

export const PROJECT_WIP_ACCRUAL_REQUESTED_V1 = 'projects.wip_accrual_requested.v1' as const;

export const FINANCE_PROJECTS_INBOX_AUDIENCE = 'gigalibs-finance-projects-inbox' as const;

export const ProjectWipAccrualRequestedPayloadV1Schema = z
  .object({
    postingId: z.string().uuid(),
    requestKey: z.string().uuid(),
    projectId: z.string().uuid(),
    orgUnitId: z.string().min(1).max(64),
    currencyCode: z.string().length(3),
    materialMinor: MoneyMinorSchema,
    laborMinor: MoneyMinorSchema,
    totalMinor: MoneyMinorSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const total = BigInt(value.totalMinor);
    const sum = BigInt(value.materialMinor) + BigInt(value.laborMinor);
    if (total !== sum) {
      ctx.addIssue({ code: 'custom', message: 'totalMinor must equal materialMinor + laborMinor' });
    }
    if (total <= 0n) {
      ctx.addIssue({ code: 'custom', message: 'totalMinor must be positive' });
    }
  });
export type ProjectWipAccrualRequestedPayloadV1 = z.infer<typeof ProjectWipAccrualRequestedPayloadV1Schema>;
