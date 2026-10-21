import { z } from 'zod';
import { SpeedReasonSchema, SpeedRowVersionSchema } from './common.js';
import type { SpeedReviewStatus } from './criteria.js';

// WI-OI-120by (SPEED S5; plan v1.4 §4.2, §4.5; screen spec §3.1): screening library sets, the cited reference data the
// engines read. An administrator imports a pack: every entry carries its citation, and every entry is stored unreviewed
// until the process safety specialist approves it (R2). The display texts are the library's own (findings, controls,
// notes), so the engines never hold text.

const Id = z.string().trim().min(1).max(64);
const Citation = z.string().trim().min(1).max(1000);
const Text = z.string().trim().min(1).max(1000);
/** A Hill formula, as the engines key formation enthalpies and gases. */
const Hill = z
  .string()
  .regex(/^(?:[A-Z][a-z]?\d*)+$/)
  .max(200);
const ReactivityClass = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(64);

export const SpeedLibraryPackV1Schema = z
  .object({
    materials: z
      .array(
        z
          .object({
            id: Id,
            classes: z.array(ReactivityClass).max(20),
            name: Text.optional(),
            casNumber: z
              .string()
              .regex(/^[0-9]{2,7}-[0-9]{2}-[0-9]$/)
              .optional(),
            formula: z.string().trim().max(200).optional(),
            note: Text.optional(),
            citation: Citation,
          })
          .strict(),
      )
      .max(5000),
    rules: z
      .array(
        z
          .object({
            id: Id,
            classA: ReactivityClass,
            classB: ReactivityClass,
            severity: z.enum(['High', 'Medium', 'Low']),
            finding: Text.optional(),
            control: Text.optional(),
            recommendedTest: z
              .string()
              .regex(/^[A-Z][A-Z0-9_]*$/)
              .max(64)
              .optional(),
            citation: Citation,
          })
          .strict(),
      )
      .max(5000),
    reactionClasses: z
      .array(
        z
          .object({
            id: Id,
            name: Text.optional(),
            typicalReactionEnthalpyKJPerMol: z.number().finite(),
            citation: Citation,
          })
          .strict(),
      )
      .max(500),
    formationEnthalpies: z.record(
      Hill,
      z
        .object({
          kJPerMol: z.number().finite(),
          phase: z.string().trim().min(1).max(32),
          citation: Citation,
        })
        .strict(),
    ),
    gases: z.record(Hill, z.object({ id: Id, name: Text.optional(), citation: Citation }).strict()),
    energeticGroups: z
      .array(z.object({ id: Id, name: Text.optional(), citation: Citation }).strict())
      .max(500),
  })
  .strict()
  .superRefine((pack, context) => {
    const duplicates = (label: string, ids: readonly string[]) => {
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id))
          context.addIssue({
            code: 'custom',
            path: [label],
            message: `${label} ${id} appears twice.`,
          });
        seen.add(id);
      }
    };
    duplicates(
      'materials',
      pack.materials.map((entry) => entry.id),
    );
    duplicates(
      'rules',
      pack.rules.map((entry) => entry.id),
    );
    duplicates(
      'reactionClasses',
      pack.reactionClasses.map((entry) => entry.id),
    );
    duplicates(
      'energeticGroups',
      pack.energeticGroups.map((entry) => entry.id),
    );
  });
export type SpeedLibraryPackV1 = z.infer<typeof SpeedLibraryPackV1Schema>;

export const ImportSpeedLibrarySetInputV1Schema = z
  .object({
    requestKey: z.uuid(),
    versionLabel: z.string().trim().min(1).max(64),
    /** The pack: work, edition, author or issuing body. */
    source: z.string().trim().min(1).max(1000),
    library: SpeedLibraryPackV1Schema,
  })
  .strict();
export type ImportSpeedLibrarySetInputV1 = z.infer<typeof ImportSpeedLibrarySetInputV1Schema>;

export const PutSpeedLibrarySetInForceInputV1Schema = z
  .object({ version: SpeedRowVersionSchema, reason: SpeedReasonSchema })
  .strict();
export type PutSpeedLibrarySetInForceInputV1 = z.infer<
  typeof PutSpeedLibrarySetInForceInputV1Schema
>;

type Reviewed<T> = T & { readonly reviewed: boolean };
type Pack = SpeedLibraryPackV1;

/** A stored pack: the imported entries, each with `reviewed`. */
export interface SpeedStoredLibraryV1 {
  readonly materials: readonly Reviewed<Pack['materials'][number]>[];
  readonly rules: readonly Reviewed<Pack['rules'][number]>[];
  readonly reactionClasses: readonly Reviewed<Pack['reactionClasses'][number]>[];
  readonly formationEnthalpies: Readonly<
    Record<string, Reviewed<Pack['formationEnthalpies'][string]>>
  >;
  readonly gases: Readonly<Record<string, Reviewed<Pack['gases'][string]>>>;
  readonly energeticGroups: readonly Reviewed<Pack['energeticGroups'][number]>[];
}

export interface SpeedLibrarySetV1 {
  readonly id: string;
  readonly versionLabel: string;
  readonly source: string;
  readonly library: SpeedStoredLibraryV1;
  readonly reviewStatus: SpeedReviewStatus;
  readonly inForce: boolean;
  readonly version: number;
  readonly importedBy: string;
  readonly importedAt: string;
  readonly inForceBy: string | null;
  readonly inForceSince: string | null;
}
