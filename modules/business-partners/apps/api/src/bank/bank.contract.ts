import { z } from 'zod';

export const CreatePartnerBankV1 = z
  .object({
    requestKey: z.uuid(),
    orgUnitId: z.string().min(1).max(64),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    vaultReference: z.string().min(1).max(256),
    displayLastFour: z.string().regex(/^[0-9]{4}$/),
  })
  .strict();

export type CreatePartnerBank = z.infer<typeof CreatePartnerBankV1>;

export interface PartnerBankV1 {
  readonly id: string;
  readonly partyId: string;
  readonly orgUnitId: string;
  readonly currencyCode: string;
  readonly vaultReference: string;
  readonly displayLastFour: string;
  readonly status: 'ACTIVE' | 'REVOKED';
}
