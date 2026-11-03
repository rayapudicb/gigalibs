import { z } from 'zod';

// WI-OI-163 (ADR-0040, the action half): which actions a person may take on a record now, and if not, why — computed
// from the same rules the command checks, so the web screen and the phone show the same buttons. An offer is never
// authority: every command still re-checks everything.

/** One action of a record, offered or not, with the reason code the command would refuse with. */
export const RecordActionOfferV1Schema = z.object({
  action: z.string().min(1).max(64),
  offered: z.boolean(),
  /** The refusal code when not offered (for example `CMMS_SIGN_OFF_FOUR_EYES`); null when offered. */
  reason: z.string().min(1).max(64).nullable(),
  /** The plain-words reason shown on the record; null when offered. */
  message: z.string().min(1).max(300).nullable(),
});
export type RecordActionOfferV1 = z.infer<typeof RecordActionOfferV1Schema>;

/** `GET v1/records/{entity}/{id}/actions`: every action of the record type, in its declared order. */
export const RecordActionOffersV1Schema = z.object({
  entity: z.string().min(1).max(120),
  id: z.string().min(1).max(64),
  actions: z.array(RecordActionOfferV1Schema).max(50),
});
export type RecordActionOffersV1 = z.infer<typeof RecordActionOffersV1Schema>;

/** The reason code when the person lacks the action's permission. */
export const RECORD_ACTION_NOT_PERMITTED = 'RECORD_PERMISSION_DENIED';
