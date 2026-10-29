import { z } from 'zod';
import {
  SpeedNameSchema,
  SpeedNotesSchema,
  SpeedPageQueryV1Schema,
  SpeedReasonSchema,
  type SpeedRecordStatus,
  SpeedRecordStatusSchema,
  SpeedRowVersionSchema,
} from './common.js';

// WI-OI-120bx (SPEED S4; screen spec §2.2): substances, shared across a workspace's sites. The molar mass is computed on
// the server from the formula; a substance a route uses keeps its formula (a changed formula is a new substance).

/** CAS Registry Number format; the check digit is verified by the server. */
const CasNumber = z
  .string()
  .trim()
  .regex(/^[0-9]{2,7}-[0-9]{2}-[0-9]$/, 'Use the CAS format 1234-56-7.');
const Formula = z.string().trim().min(1).max(200);
const Density = z.number().finite().positive();
const LibraryMaterialId = z.string().trim().min(1).max(64);

export const CreateSpeedSubstanceInputV1Schema = z
  .object({
    requestKey: z.uuid(),
    name: SpeedNameSchema,
    casNumber: CasNumber.optional(),
    formula: Formula,
    densityGPerMl: Density.optional(),
    notes: SpeedNotesSchema.optional(),
    /** The library material its reactivity classes come from (FR-HAZ-01), an id in the library pack. */
    libraryMaterialId: LibraryMaterialId.optional(),
  })
  .strict();
export type CreateSpeedSubstanceInputV1 = z.infer<typeof CreateSpeedSubstanceInputV1Schema>;

export const UpdateSpeedSubstanceInputV1Schema = z
  .object({
    version: SpeedRowVersionSchema,
    reason: SpeedReasonSchema,
    name: SpeedNameSchema.optional(),
    casNumber: CasNumber.nullable().optional(),
    formula: Formula.optional(),
    densityGPerMl: Density.nullable().optional(),
    notes: SpeedNotesSchema.nullable().optional(),
    libraryMaterialId: LibraryMaterialId.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      ['name', 'casNumber', 'formula', 'densityGPerMl', 'notes', 'libraryMaterialId'].some(
        (key) => value[key as keyof typeof value] !== undefined,
      ),
    { message: 'Change at least one field.' },
  );
export type UpdateSpeedSubstanceInputV1 = z.infer<typeof UpdateSpeedSubstanceInputV1Schema>;

export const ListSpeedSubstancesQueryV1Schema = SpeedPageQueryV1Schema.extend({
  status: SpeedRecordStatusSchema.optional(),
}).strict();
export type ListSpeedSubstancesQueryV1 = z.infer<typeof ListSpeedSubstancesQueryV1Schema>;

export interface SpeedSubstanceV1 {
  readonly id: string;
  readonly name: string;
  readonly casNumber: string | null;
  readonly formula: string;
  readonly hillFormula: string;
  readonly molarMassGPerMol: number;
  readonly elementsVersion: string;
  readonly densityGPerMl: number | null;
  readonly notes: string | null;
  readonly libraryMaterialId: string | null;
  readonly status: SpeedRecordStatus;
  /** A route uses it, so its formula is fixed. */
  readonly inUse: boolean;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedBy: string | null;
  readonly archivedAt: string | null;
}
