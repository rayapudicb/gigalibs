import { z } from 'zod';
import { SpeedReasonSchema, SpeedRowVersionSchema } from './common.js';

// WI-OI-120bx (SPEED S4; plan v1.4 §4.2, §4.5): screening criteria sets. Every threshold and range the engines apply is
// data with a citation; an administrator imports a cited set, which stays unreviewed until the process safety
// specialist approves it (R2), and puts one set in force per workspace. Values never change after import.

const Finite = z.number().finite();
const RangeSchema = z
  .object({ min: Finite, max: Finite })
  .strict()
  .refine((range) => range.min <= range.max, { message: 'min must not exceed max' });

/** The values of a criteria set, as the engine package reads them (`ScreeningCriteria` without its version). */
export const SpeedCriteriaValuesV1Schema = z
  .object({
    elementBalanceTolerance: Finite.nonnegative(),
    oxygenBalanceAlertBandPercent: z
      .object({ lowerExclusive: Finite, upperExclusive: Finite })
      .strict(),
    severityByAdiabaticRiseK: z.object({ mediumFromK: Finite, highAboveK: Finite }).strict(),
    probabilityByTmrHours: z.object({ lowAboveHours: Finite, highBelowHours: Finite }).strict(),
    td24SearchRangeC: RangeSchema,
    td24ConservativeOnsetOffsetK: Finite,
    inputRanges: z
      .object({
        temperatureC: RangeSchema,
        heatCapacityJPerGK: z.object({ block: RangeSchema, warn: RangeSchema }).strict(),
        accumulationPercent: RangeSchema,
        reactionEnthalpyKJPerMol: z.object({ block: RangeSchema, warnBelow: Finite }).strict(),
        activationEnergyKJPerMol: RangeSchema,
      })
      .strict(),
  })
  .strict();
export type SpeedCriteriaValuesV1 = z.infer<typeof SpeedCriteriaValuesV1Schema>;

/** One citation per value, keyed by its dotted path (`inputRanges.temperatureC.min`). */
export const SpeedCriteriaCitationsV1Schema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/),
  z.string().trim().min(1).max(500),
);

export const ImportSpeedCriteriaSetInputV1Schema = z
  .object({
    requestKey: z.uuid(),
    versionLabel: z.string().trim().min(1).max(64),
    /** The pack: work, edition, author or issuing body. */
    source: z.string().trim().min(1).max(1000),
    criteria: SpeedCriteriaValuesV1Schema,
    citations: SpeedCriteriaCitationsV1Schema,
  })
  .strict();
export type ImportSpeedCriteriaSetInputV1 = z.infer<typeof ImportSpeedCriteriaSetInputV1Schema>;

export const PutSpeedCriteriaSetInForceInputV1Schema = z
  .object({ version: SpeedRowVersionSchema, reason: SpeedReasonSchema })
  .strict();
export type PutSpeedCriteriaSetInForceInputV1 = z.infer<
  typeof PutSpeedCriteriaSetInForceInputV1Schema
>;

export const SPEED_REVIEW_STATUSES = ['UNREVIEWED', 'APPROVED'] as const;
export type SpeedReviewStatus = (typeof SPEED_REVIEW_STATUSES)[number];

export interface SpeedCriteriaSetV1 {
  readonly id: string;
  readonly versionLabel: string;
  readonly source: string;
  readonly criteria: SpeedCriteriaValuesV1;
  readonly citations: Readonly<Record<string, string>>;
  readonly reviewStatus: SpeedReviewStatus;
  readonly inForce: boolean;
  readonly version: number;
  readonly importedBy: string;
  readonly importedAt: string;
  readonly inForceBy: string | null;
  readonly inForceSince: string | null;
}
