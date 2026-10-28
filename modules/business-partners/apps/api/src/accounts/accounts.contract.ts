import { z } from 'zod';

const MoneyMinor = z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(
  (value) => BigInt(value) <= 9_223_372_036_854_775_807n,
  'Amount is outside the supported minor-unit range.',
);

const BaseAccountCreate = z.object({
  requestKey: z.uuid(),
  orgUnitId: z.string().min(1).max(64),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  accountId: z.uuid(),
  termsVersion: z.string().min(1).max(128),
});

export const CreateCustomerAccountV1 = BaseAccountCreate.extend({ creditLimitMinor: MoneyMinor }).strict();
export const CreateVendorAccountV1 = BaseAccountCreate.strict();

export const UpdateCustomerAccountV1 = z
  .object({
    requestKey: z.uuid(),
    orgUnitId: z.string().min(1).max(64),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    expectedVersion: z.number().int().positive(),
    creditLimitMinor: MoneyMinor.optional(),
    termsVersion: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine((value) => value.creditLimitMinor !== undefined || value.termsVersion !== undefined, {
    message: 'At least one of creditLimitMinor or termsVersion is required.',
  });

export type CreateCustomerAccount = z.infer<typeof CreateCustomerAccountV1>;
export type CreateVendorAccount = z.infer<typeof CreateVendorAccountV1>;
export type UpdateCustomerAccount = z.infer<typeof UpdateCustomerAccountV1>;

export interface PartnerAccountV1 {
  readonly kind: 'CUSTOMER' | 'VENDOR';
  readonly partyId: string;
  readonly orgUnitId: string;
  readonly currencyCode: string;
  readonly accountId: string;
  readonly accountVersion: number;
  readonly accountingBookId: string;
  readonly termsVersion: string;
  readonly creditLimitMinor?: string;
  readonly status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  readonly version: number;
}
