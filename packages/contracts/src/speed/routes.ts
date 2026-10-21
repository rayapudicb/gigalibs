import { z } from 'zod';
import {
  SpeedNameSchema,
  SpeedNotesSchema,
  SpeedPageQueryV1Schema,
  SpeedReasonSchema,
  SpeedRowVersionSchema,
} from './common.js';

// WI-OI-120bx (SPEED S4; plan v1.4 §4.4; screen spec §2.3, §2.4): routes, their steps, the materials of each step and its
// process conditions, and the screening results the server stores after every change. Every change to a route's
// content carries the row version it read and a reason (FR-AUD-01); only a draft route changes.

export const SPEED_ROUTE_STATUSES = ['DRAFT', 'ARCHIVED'] as const;
export const SpeedRouteStatusSchema = z.enum(SPEED_ROUTE_STATUSES);
export type SpeedRouteStatus = z.infer<typeof SpeedRouteStatusSchema>;

/** The roles of the BRD (FR-INP-02); the equation's roles carry a coefficient. */
export const SPEED_MATERIAL_ROLES = [
  'Reactant',
  'Additive',
  'Solvent',
  'Work-up',
  'Product',
  'By-product',
] as const;
export const SpeedMaterialRoleSchema = z.enum(SPEED_MATERIAL_ROLES);
export type SpeedMaterialRole = z.infer<typeof SpeedMaterialRoleSchema>;
export const SPEED_EQUATION_ROLES: readonly SpeedMaterialRole[] = [
  'Reactant',
  'Product',
  'By-product',
];

const Positive = z.number().finite().positive();
const Measured = z.number().finite();

export const CreateSpeedRouteInputV1Schema = z
  .object({ requestKey: z.uuid(), projectId: z.uuid(), name: SpeedNameSchema })
  .strict();
export type CreateSpeedRouteInputV1 = z.infer<typeof CreateSpeedRouteInputV1Schema>;

export const UpdateSpeedRouteInputV1Schema = z
  .object({ version: SpeedRowVersionSchema, reason: SpeedReasonSchema, name: SpeedNameSchema })
  .strict();
export type UpdateSpeedRouteInputV1 = z.infer<typeof UpdateSpeedRouteInputV1Schema>;

export const ListSpeedRoutesQueryV1Schema = SpeedPageQueryV1Schema.extend({
  projectId: z.uuid().optional(),
  status: SpeedRouteStatusSchema.optional(),
}).strict();
export type ListSpeedRoutesQueryV1 = z.infer<typeof ListSpeedRoutesQueryV1Schema>;

export const AddSpeedStepInputV1Schema = z
  .object({
    requestKey: z.uuid(),
    reason: SpeedReasonSchema,
    name: SpeedNameSchema,
    notes: SpeedNotesSchema.optional(),
  })
  .strict();
export type AddSpeedStepInputV1 = z.infer<typeof AddSpeedStepInputV1Schema>;

export const UpdateSpeedStepInputV1Schema = z
  .object({
    version: SpeedRowVersionSchema,
    reason: SpeedReasonSchema,
    name: SpeedNameSchema.optional(),
    notes: SpeedNotesSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.notes !== undefined, {
    message: 'Change at least one field.',
  });
export type UpdateSpeedStepInputV1 = z.infer<typeof UpdateSpeedStepInputV1Schema>;

export const MoveSpeedStepInputV1Schema = z
  .object({
    version: SpeedRowVersionSchema,
    reason: SpeedReasonSchema,
    position: z.number().int().positive(),
  })
  .strict();
export type MoveSpeedStepInputV1 = z.infer<typeof MoveSpeedStepInputV1Schema>;

export const RemoveSpeedRecordInputV1Schema = z
  .object({ version: SpeedRowVersionSchema, reason: SpeedReasonSchema })
  .strict();
export type RemoveSpeedRecordInputV1 = z.infer<typeof RemoveSpeedRecordInputV1Schema>;

const materialRules = <
  T extends {
    role?: SpeedMaterialRole | undefined;
    coefficient?: number | null | undefined;
    massG?: number | null | undefined;
  },
>(
  value: T,
  context: z.RefinementCtx,
) => {
  if (
    value.role &&
    typeof value.coefficient === 'number' &&
    !SPEED_EQUATION_ROLES.includes(value.role)
  )
    context.addIssue({
      code: 'custom',
      path: ['coefficient'],
      message: 'Only reactants, the product and by-products have a coefficient.',
    });
  if (value.role === 'By-product' && typeof value.massG === 'number')
    context.addIssue({ code: 'custom', path: ['massG'], message: 'A by-product has no charge.' });
};

export const AddSpeedMaterialInputV1Schema = z
  .object({
    requestKey: z.uuid(),
    reason: SpeedReasonSchema,
    substanceId: z.uuid(),
    role: SpeedMaterialRoleSchema,
    coefficient: Positive.optional(),
    massG: Positive.optional(),
  })
  .strict()
  .superRefine(materialRules);
export type AddSpeedMaterialInputV1 = z.infer<typeof AddSpeedMaterialInputV1Schema>;

export const UpdateSpeedMaterialInputV1Schema = z
  .object({
    version: SpeedRowVersionSchema,
    reason: SpeedReasonSchema,
    substanceId: z.uuid().optional(),
    role: SpeedMaterialRoleSchema.optional(),
    coefficient: Positive.nullable().optional(),
    massG: Positive.nullable().optional(),
  })
  .strict()
  .superRefine(materialRules)
  .refine(
    (value) =>
      ['substanceId', 'role', 'coefficient', 'massG'].some(
        (key) => value[key as keyof typeof value] !== undefined,
      ),
    {
      message: 'Change at least one field.',
    },
  );
export type UpdateSpeedMaterialInputV1 = z.infer<typeof UpdateSpeedMaterialInputV1Schema>;

export const SPEED_ENTHALPY_SOURCES = ['MANUAL', 'REACTION_CLASS', 'HESS'] as const;
export const SpeedEnthalpySourceSchema = z.enum(SPEED_ENTHALPY_SOURCES);
export type SpeedEnthalpySource = z.infer<typeof SpeedEnthalpySourceSchema>;

/** The step's process values; null clears one. `version` 0 means the step has none yet. */
export const ReplaceSpeedConditionsInputV1Schema = z
  .object({
    version: z.number().int().min(0),
    reason: SpeedReasonSchema,
    processTemperatureC: Measured.nullable(),
    maximumTechnicalTemperatureC: Measured.nullable(),
    heatCapacityJPerGK: Measured.nullable(),
    accumulationPercent: Measured.nullable(),
    /** Where ΔHr comes from (FR-THM-01 to 03); a reaction class names its id in the library in force. */
    reactionEnthalpySource: SpeedEnthalpySourceSchema.nullable().default(null),
    reactionClassId: z.string().trim().min(1).max(64).nullable().default(null),
  })
  .strict()
  .refine(
    (value) =>
      (value.reactionEnthalpySource === 'REACTION_CLASS') === (value.reactionClassId !== null),
    {
      path: ['reactionClassId'],
      message: 'A reaction class source names the class, and only it does.',
    },
  );
export type ReplaceSpeedConditionsInputV1 = z.infer<typeof ReplaceSpeedConditionsInputV1Schema>;

export interface SpeedRouteV1 {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly routeVersion: number;
  readonly status: SpeedRouteStatus;
  readonly authorSubject: string;
  readonly stepCount: number;
  /** Steps whose latest result passes the gate. */
  readonly stepsPassingGate: number;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedBy: string | null;
  readonly archivedAt: string | null;
}

export interface SpeedStepMaterialV1 {
  readonly id: string;
  readonly stepId: string;
  readonly position: number;
  readonly substanceId: string;
  readonly substanceName: string;
  readonly formula: string;
  readonly molarMassGPerMol: number;
  readonly role: SpeedMaterialRole;
  readonly coefficient: number | null;
  readonly massG: number | null;
  /** Energetic groups tagged on the material (FR-OB-04), ids from the library. */
  readonly energeticGroups: readonly string[];
  readonly version: number;
}

export interface SpeedStepConditionsV1 {
  readonly processTemperatureC: number | null;
  readonly maximumTechnicalTemperatureC: number | null;
  readonly heatCapacityJPerGK: number | null;
  readonly accumulationPercent: number | null;
  readonly reactionEnthalpySource: SpeedEnthalpySource | null;
  readonly reactionClassId: string | null;
  readonly version: number;
  readonly updatedBy: string;
  readonly updatedAt: string;
}

/** A coded engine message; the screens translate `code` (screen spec §4). */
export interface SpeedMessageV1 {
  readonly code: string;
  readonly requirement: string;
  readonly params?: Readonly<Record<string, string | number | readonly string[]>>;
}

export interface SpeedResultV1 {
  readonly id: string;
  readonly routeId: string;
  readonly stepId: string;
  readonly status: 'OK' | 'DATA_GAP';
  readonly gatePass: boolean | null;
  readonly engineVersion: string;
  readonly elementsVersion: string;
  readonly criteriaSetId: string | null;
  readonly criteriaVersion: string | null;
  readonly criteriaReviewed: boolean | null;
  readonly librarySetId: string | null;
  readonly libraryVersion: string | null;
  readonly libraryReviewed: boolean | null;
  readonly inputsHash: string;
  /** The engines' outputs: `gate`, and for a step that passes it `oxygenBalance`, `thermal` and `green`. */
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly computedBy: string;
  readonly computedAt: string;
}

export interface SpeedStepV1 {
  readonly id: string;
  readonly routeId: string;
  readonly position: number;
  readonly name: string;
  readonly notes: string | null;
  readonly version: number;
  readonly materials: readonly SpeedStepMaterialV1[];
  readonly conditions: SpeedStepConditionsV1 | null;
  /** The active thermal data of the step's mixture, one per kind. */
  readonly thermalData: readonly SpeedThermalDataV1[];
  readonly mitigation: SpeedMitigationV1 | null;
  /** Controls documented for the step's interaction findings (BRL-04). */
  readonly controls: readonly SpeedControlV1[];
  readonly latestResult: SpeedResultV1 | null;
}

export interface SpeedRouteDetailV1 extends SpeedRouteV1 {
  readonly steps: readonly SpeedStepV1[];
  /** The route roll-up of the steps' latest green results (FR-GRN-04), or null before any step has one. */
  readonly rollup: Readonly<Record<string, unknown>> | null;
}

export const SPEED_THERMAL_KINDS = [
  'REACTION_ENTHALPY',
  'DSC_ONSET',
  'TD24',
  'DECOMPOSITION_KINETICS',
] as const;
export type SpeedThermalKind = (typeof SPEED_THERMAL_KINDS)[number];
/** A thermal value is measured or taken from literature, and always cited; estimates come only from the library. */
export const SpeedThermalBasisSchema = z.enum(['MEASURED', 'LITERATURE']);

const ThermalCommon = {
  requestKey: z.uuid(),
  reason: SpeedReasonSchema,
  basis: SpeedThermalBasisSchema,
  citation: z.string().trim().min(1).max(1000),
  notes: SpeedNotesSchema.optional(),
};

/** Adds a thermal value to a step's mixture; it replaces the active value of its kind (FR-THM-01 to 07, BRL-06). */
export const AddSpeedThermalDataInputV1Schema = z.discriminatedUnion('kind', [
  z.object({ ...ThermalCommon, kind: z.literal('REACTION_ENTHALPY'), kJPerMol: Measured }).strict(),
  z.object({ ...ThermalCommon, kind: z.literal('DSC_ONSET'), onsetC: Measured }).strict(),
  z.object({ ...ThermalCommon, kind: z.literal('TD24'), td24C: Measured }).strict(),
  z
    .object({
      ...ThermalCommon,
      kind: z.literal('DECOMPOSITION_KINETICS'),
      activationEnergyKJPerMol: Measured,
      heatReleaseRateWPerKg: Positive,
      referenceTemperatureC: Measured,
    })
    .strict(),
]);
export type AddSpeedThermalDataInputV1 = z.infer<typeof AddSpeedThermalDataInputV1Schema>;

export interface SpeedThermalDataV1 {
  readonly id: string;
  readonly stepId: string;
  readonly kind: SpeedThermalKind;
  readonly kJPerMol: number | null;
  readonly onsetC: number | null;
  readonly td24C: number | null;
  readonly activationEnergyKJPerMol: number | null;
  readonly heatReleaseRateWPerKg: number | null;
  readonly referenceTemperatureC: number | null;
  readonly basis: 'MEASURED' | 'LITERATURE';
  readonly citation: string;
  readonly notes: string | null;
  readonly status: 'ACTIVE' | 'SUPERSEDED';
  readonly createdBy: string;
  readonly createdAt: string;
  readonly supersededAt: string | null;
}

/** Tags a material's energetic groups (FR-OB-04), ids from the library in force. */
export const SetSpeedEnergeticGroupsInputV1Schema = z
  .object({
    version: SpeedRowVersionSchema,
    reason: SpeedReasonSchema,
    groups: z.array(z.string().trim().min(1).max(64)).max(20),
  })
  .strict();
export type SetSpeedEnergeticGroupsInputV1 = z.infer<typeof SetSpeedEnergeticGroupsInputV1Schema>;

/** Records the mitigation of a class 4 or 5 step (BRL-03); `version` 0 means none is recorded yet. */
export const ReplaceSpeedMitigationInputV1Schema = z
  .object({
    version: z.number().int().min(0),
    reason: SpeedReasonSchema,
    text: z.string().trim().min(1).max(4000),
  })
  .strict();
export type ReplaceSpeedMitigationInputV1 = z.infer<typeof ReplaceSpeedMitigationInputV1Schema>;

/**
 * Documents the control of an interaction finding between two of the step's materials (BRL-04; mandatory for High).
 * `version` 0 means none is documented yet; the pair must have a finding in the step's latest result.
 */
export const DocumentSpeedControlInputV1Schema = z
  .object({
    version: z.number().int().min(0),
    reason: SpeedReasonSchema,
    materialAId: z.uuid(),
    materialBId: z.uuid(),
    text: z.string().trim().min(1).max(4000),
  })
  .strict()
  .refine((value) => value.materialAId !== value.materialBId, {
    path: ['materialBId'],
    message: 'A control is for two different materials.',
  });
export type DocumentSpeedControlInputV1 = z.infer<typeof DocumentSpeedControlInputV1Schema>;

export interface SpeedControlV1 {
  readonly materialAId: string;
  readonly materialBId: string;
  readonly ruleId: string;
  readonly text: string;
  readonly version: number;
  readonly documentedBy: string;
  readonly documentedAt: string;
}

export interface SpeedMitigationV1 {
  readonly text: string;
  readonly version: number;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly acceptedBy: string | null;
  readonly acceptedAt: string | null;
}

/** What a change to a step's content answers: the step as stored, with the result the server computed. */
export interface SpeedStepChangeV1 {
  readonly step: SpeedStepV1;
  readonly warnings: readonly SpeedMessageV1[];
}
