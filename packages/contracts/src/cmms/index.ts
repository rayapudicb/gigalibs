import { z } from 'zod';
import type { CmmsStaffingV1, CmmsWorkOrderBookingV1 } from '../handshake/index.js';

// ─── Canonical CMMS core contracts (WI-OI-038, roadmap P4) ───────────────────────────────────────────────
// Shared by the CMMS API and the web BFF/UI. Additive V1: new optional fields only; a breaking change is a V2.
// Tenant, user and department references are control-plane ids (cuids); site references are Geospatial place
// ids held as plain references (roadmap rule 2).

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code.');
/** A control-plane principal (user) id as carried in the signed context `sub`. */
export const CmmsPrincipalRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/);
const DepartmentIdSchema = z.string().trim().min(1).max(64);
const IdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Use letters, digits, dot, underscore, slash or dash.'));
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const PageSchema = {
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
};

export const CmmsAssetStatusV1Schema = z.enum(['OPERATIONAL', 'UNDER_MAINTENANCE', 'OFFLINE', 'DECOMMISSIONED']);
export const CmmsCriticalityV1Schema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const CmmsWorkOrderTypeV1Schema = z.enum(['REACTIVE', 'PREVENTIVE', 'INSPECTION', 'EMERGENCY']);
export const CmmsPriorityV1Schema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']);
export const CmmsWorkOrderStatusV1Schema = z.enum(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);
export const CmmsTaskStatusV1Schema = z.enum(['PENDING', 'DONE', 'FAILED', 'NOT_APPLICABLE']);
export const CmmsIntervalUnitV1Schema = z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']);
export const CmmsMeterReadingTypeV1Schema = z.enum(['GAUGE', 'COUNTER']);
export const CmmsStockMovementTypeV1Schema = z.enum(['RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT']);
export const CmmsTimeCategoryV1Schema = z.enum(['REGULAR', 'OVERTIME', 'TRAVEL']);

export type CmmsAssetStatusV1 = z.infer<typeof CmmsAssetStatusV1Schema>;
export type CmmsCriticalityV1 = z.infer<typeof CmmsCriticalityV1Schema>;
export type CmmsWorkOrderTypeV1 = z.infer<typeof CmmsWorkOrderTypeV1Schema>;
export type CmmsPriorityV1 = z.infer<typeof CmmsPriorityV1Schema>;
export type CmmsWorkOrderStatusV1 = z.infer<typeof CmmsWorkOrderStatusV1Schema>;
export type CmmsTaskStatusV1 = z.infer<typeof CmmsTaskStatusV1Schema>;
export type CmmsIntervalUnitV1 = z.infer<typeof CmmsIntervalUnitV1Schema>;
export type CmmsStockMovementTypeV1 = z.infer<typeof CmmsStockMovementTypeV1Schema>;

/** Allowed lifecycle moves; COMPLETED and CANCELLED are terminal. */
export const CMMS_WORK_ORDER_TRANSITIONS: Readonly<Record<CmmsWorkOrderStatusV1, readonly CmmsWorkOrderStatusV1[]>> =
  Object.freeze({
    OPEN: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
    ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  });

// ─── Assets ──────────────────────────────────────────────────────────────────────────────────────────────
const AssetFieldsSchema = {
  name: TextSchema(200),
  description: z.string().trim().max(4_000).nullable().optional(),
  category: TextSchema(80).nullable().optional(),
  status: CmmsAssetStatusV1Schema.exclude(['DECOMMISSIONED']).optional(),
  criticality: CmmsCriticalityV1Schema.optional(),
  manufacturer: TextSchema(200).nullable().optional(),
  model: TextSchema(200).nullable().optional(),
  serialNumber: TextSchema(200).nullable().optional(),
  parentAssetId: UuidSchema.nullable().optional(),
  siteRef: UuidSchema.nullable().optional(),
  spaceId: UuidSchema.nullable().optional(),
  classificationId: UuidSchema.nullable().optional(),
  departmentId: DepartmentIdSchema.nullable().optional(),
  acquisitionCost: z.number().nonnegative().max(1e10).nullable().optional(),
  currencyCode: CurrencyCodeSchema.nullable().optional(),
  purchaseDate: DateSchema.nullable().optional(),
  warrantyExpiry: DateSchema.nullable().optional(),
  specs: z.record(z.string().max(80), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
};

export const CreateCmmsAssetV1Schema = z
  .object({ assetTag: IdentifierSchema, ...AssetFieldsSchema, name: TextSchema(200) })
  .strict()
  .refine((value) => value.acquisitionCost == null || value.currencyCode != null, {
    message: 'A currency is required with an acquisition cost.',
    path: ['currencyCode'],
  });
export type CreateCmmsAssetV1 = z.infer<typeof CreateCmmsAssetV1Schema>;

export const UpdateCmmsAssetV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), ...AssetFieldsSchema, name: TextSchema(200).optional() })
  .strict();
export type UpdateCmmsAssetV1 = z.infer<typeof UpdateCmmsAssetV1Schema>;

export const ArchiveCmmsAssetV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), reason: TextSchema(500) })
  .strict();

export const SearchCmmsAssetsV1Schema = z
  .object({
    ...PageSchema,
    q: TextSchema(200).optional(),
    status: CmmsAssetStatusV1Schema.optional(),
    criticality: CmmsCriticalityV1Schema.optional(),
    siteRef: UuidSchema.optional(),
    parentAssetId: UuidSchema.optional(),
    spaceId: UuidSchema.optional(),
    classificationId: UuidSchema.optional(),
    includeArchived: z.boolean().default(false),
  })
  .strict();
export type SearchCmmsAssetsV1 = z.infer<typeof SearchCmmsAssetsV1Schema>;

export interface CmmsAssetV1 {
  readonly id: string;
  readonly assetTag: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly status: CmmsAssetStatusV1;
  readonly criticality: CmmsCriticalityV1;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly parentAssetId: string | null;
  readonly siteRef: string | null;
  readonly spaceId: string | null;
  readonly classificationId: string | null;
  readonly departmentId: string | null;
  readonly acquisitionCost: number | null;
  readonly currencyCode: string | null;
  readonly purchaseDate: string | null;
  readonly warrantyExpiry: string | null;
  readonly specs: Readonly<Record<string, string | number | boolean>>;
  readonly archivedAt: string | null;
  readonly openWorkOrderCount: number;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Spaces & CAFM Hierarchy (WI-EAM-001) ─────────────────────────────────────────────────
export const CmmsSpaceTypeV1Schema = z.enum(['SITE', 'BUILDING', 'FLOOR', 'ROOM', 'ZONE']);
export type CmmsSpaceTypeV1 = z.infer<typeof CmmsSpaceTypeV1Schema>;

export const CreateCmmsSpaceV1Schema = z
  .object({
    code: IdentifierSchema,
    name: TextSchema(200),
    description: z.string().trim().max(4_000).nullable().optional(),
    spaceType: CmmsSpaceTypeV1Schema,
    parentSpaceId: UuidSchema.nullable().optional(),
    siteRef: UuidSchema.nullable().optional(),
    floorNumber: z.number().int().min(-20).max(200).nullable().optional(),
    grossAreaSqm: z.number().nonnegative().max(10_000_000).nullable().optional(),
    netAreaSqm: z.number().nonnegative().max(10_000_000).nullable().optional(),
    cadLayer: z.record(z.string(), z.unknown()).optional(),
    bimGuid: z.string().trim().max(128).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateCmmsSpaceV1 = z.infer<typeof CreateCmmsSpaceV1Schema>;

export const UpdateCmmsSpaceV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: TextSchema(200).optional(),
    description: z.string().trim().max(4_000).nullable().optional(),
    parentSpaceId: UuidSchema.nullable().optional(),
    siteRef: UuidSchema.nullable().optional(),
    floorNumber: z.number().int().min(-20).max(200).nullable().optional(),
    grossAreaSqm: z.number().nonnegative().max(10_000_000).nullable().optional(),
    netAreaSqm: z.number().nonnegative().max(10_000_000).nullable().optional(),
    cadLayer: z.record(z.string(), z.unknown()).optional(),
    bimGuid: z.string().trim().max(128).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type UpdateCmmsSpaceV1 = z.infer<typeof UpdateCmmsSpaceV1Schema>;

export const UploadCadLayerV1Schema = z
  .object({
    cadLayer: z.record(z.string(), z.unknown()),
  })
  .strict();
export type UploadCadLayerV1 = z.infer<typeof UploadCadLayerV1Schema>;

export interface CmmsSpaceV1 {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly spaceType: CmmsSpaceTypeV1;
  readonly parentSpaceId: string | null;
  readonly siteRef: string | null;
  readonly floorNumber: number | null;
  readonly grossAreaSqm: number | null;
  readonly netAreaSqm: number | null;
  readonly cadLayer: Readonly<Record<string, unknown>>;
  readonly bimGuid: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly assetCount: number;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CmmsSpaceTreeV1 extends CmmsSpaceV1 {
  readonly children: readonly CmmsSpaceTreeV1[];
}

// ─── Classifications & Engineering Specifications (WI-EAM-002) ───────────────────────────
export const CmmsSpecDataTypeV1Schema = z.enum(['NUMBER', 'TEXT', 'BOOLEAN', 'DATE']);
export type CmmsSpecDataTypeV1 = z.infer<typeof CmmsSpecDataTypeV1Schema>;

export const CreateCmmsClassificationV1Schema = z
  .object({
    code: IdentifierSchema,
    name: TextSchema(200),
    description: z.string().trim().max(4_000).nullable().optional(),
    parentClassId: UuidSchema.nullable().optional(),
  })
  .strict();
export type CreateCmmsClassificationV1 = z.infer<typeof CreateCmmsClassificationV1Schema>;

export const UpdateCmmsClassificationV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: TextSchema(200).optional(),
    description: z.string().trim().max(4_000).nullable().optional(),
    parentClassId: UuidSchema.nullable().optional(),
  })
  .strict();
export type UpdateCmmsClassificationV1 = z.infer<typeof UpdateCmmsClassificationV1Schema>;

export interface CmmsAssetClassificationV1 {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentClassId: string | null;
  readonly specCount: number;
  readonly assetCount: number;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CmmsClassificationTreeV1 extends CmmsAssetClassificationV1 {
  readonly children: readonly CmmsClassificationTreeV1[];
}

export const CreateCmmsSpecDefinitionV1Schema = z
  .object({
    classificationId: UuidSchema,
    attributeKey: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: TextSchema(120),
    dataType: CmmsSpecDataTypeV1Schema,
    uom: z.string().trim().max(32).nullable().optional(),
    required: z.boolean().default(false),
    minValue: z.number().nullable().optional(),
    maxValue: z.number().nullable().optional(),
    defaultValue: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export type CreateCmmsSpecDefinitionV1 = z.infer<typeof CreateCmmsSpecDefinitionV1Schema>;

export interface CmmsSpecDefinitionV1 {
  readonly id: string;
  readonly classificationId: string;
  readonly attributeKey: string;
  readonly label: string;
  readonly dataType: CmmsSpecDataTypeV1;
  readonly uom: string | null;
  readonly required: boolean;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly defaultValue: string | null;
  readonly version: number;
}

export const SetCmmsAssetSpecsV1Schema = z
  .object({
    specs: z.array(
      z.object({
        specDefinitionId: UuidSchema,
        valueText: z.string().trim().max(2000).nullable().optional(),
        valueNumber: z.number().nullable().optional(),
        valueBoolean: z.boolean().nullable().optional(),
      }).strict()
    ),
  })
  .strict();
export type SetCmmsAssetSpecsV1 = z.infer<typeof SetCmmsAssetSpecsV1Schema>;

export interface CmmsAssetSpecValueV1 {
  readonly specDefinitionId: string;
  readonly attributeKey: string;
  readonly label: string;
  readonly dataType: CmmsSpecDataTypeV1;
  readonly uom: string | null;
  readonly valueText: string | null;
  readonly valueNumber: number | null;
  readonly valueBoolean: boolean | null;
}

export interface CmmsEquipmentNodeV1 {
  readonly id: string;
  readonly assetTag: string;
  readonly name: string;
  readonly category: string | null;
  readonly status: CmmsAssetStatusV1;
  readonly criticality: CmmsCriticalityV1;
  readonly classificationId: string | null;
  readonly classificationName: string | null;
  readonly spaceId: string | null;
  readonly children: readonly CmmsEquipmentNodeV1[];
}

// ─── Failure Hierarchy & Job Plans (WI-EAM-003) ──────────────────────────────────────────
export const CmmsFailureCodeTypeV1Schema = z.enum(['PROBLEM', 'CAUSE', 'REMEDY']);
export type CmmsFailureCodeTypeV1 = z.infer<typeof CmmsFailureCodeTypeV1Schema>;

export const CreateCmmsFailureCodeV1Schema = z
  .object({
    type: CmmsFailureCodeTypeV1Schema,
    code: IdentifierSchema,
    description: TextSchema(500),
    parentCodeId: UuidSchema.nullable().optional(),
    classificationId: UuidSchema.nullable().optional(),
  })
  .strict();
export type CreateCmmsFailureCodeV1 = z.infer<typeof CreateCmmsFailureCodeV1Schema>;

export const UpdateCmmsFailureCodeV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    description: TextSchema(500).optional(),
    parentCodeId: UuidSchema.nullable().optional(),
    classificationId: UuidSchema.nullable().optional(),
  })
  .strict();
export type UpdateCmmsFailureCodeV1 = z.infer<typeof UpdateCmmsFailureCodeV1Schema>;

export interface CmmsFailureCodeV1 {
  readonly id: string;
  readonly type: CmmsFailureCodeTypeV1;
  readonly code: string;
  readonly description: string;
  readonly parentCodeId: string | null;
  readonly classificationId: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CmmsFailureHierarchyNodeV1 extends CmmsFailureCodeV1 {
  readonly children: readonly CmmsFailureHierarchyNodeV1[];
}

export const CmmsJobPlanTaskTypeV1Schema = z.enum([
  'INSPECTION',
  'LUBRICATION',
  'REPLACEMENT',
  'CALIBRATION',
  'SAFETY_CHECK',
]);
export type CmmsJobPlanTaskTypeV1 = z.infer<typeof CmmsJobPlanTaskTypeV1Schema>;

export const CreateCmmsJobPlanTaskV1Schema = z
  .object({
    sequence: z.number().int().nonnegative(),
    label: TextSchema(240),
    taskType: CmmsJobPlanTaskTypeV1Schema.default('INSPECTION'),
    required: z.boolean().default(true),
    estimatedMinutes: z.number().int().positive().max(10_000).default(15),
  })
  .strict();
export type CreateCmmsJobPlanTaskV1 = z.infer<typeof CreateCmmsJobPlanTaskV1Schema>;

export interface CmmsJobPlanTaskV1 {
  readonly id: string;
  readonly jobPlanId: string;
  readonly sequence: number;
  readonly label: string;
  readonly taskType: CmmsJobPlanTaskTypeV1;
  readonly required: boolean;
  readonly estimatedMinutes: number;
  readonly createdAt: string;
}

export const CreateCmmsJobPlanV1Schema = z
  .object({
    code: IdentifierSchema,
    title: TextSchema(200),
    description: z.string().trim().max(4_000).nullable().optional(),
    classificationId: UuidSchema.nullable().optional(),
    estimatedDurationMinutes: z.number().int().positive().max(10_000).default(60),
    safetyGuidelines: z.string().trim().max(10_000).nullable().optional(),
    tasks: z.array(CreateCmmsJobPlanTaskV1Schema).max(50).default([]),
  })
  .strict();
export type CreateCmmsJobPlanV1 = z.infer<typeof CreateCmmsJobPlanV1Schema>;

export const UpdateCmmsJobPlanV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: TextSchema(200).optional(),
    description: z.string().trim().max(4_000).nullable().optional(),
    classificationId: UuidSchema.nullable().optional(),
    estimatedDurationMinutes: z.number().int().positive().max(10_000).optional(),
    safetyGuidelines: z.string().trim().max(10_000).nullable().optional(),
    tasks: z.array(CreateCmmsJobPlanTaskV1Schema).max(50).optional(),
  })
  .strict();
export type UpdateCmmsJobPlanV1 = z.infer<typeof UpdateCmmsJobPlanV1Schema>;

export interface CmmsJobPlanV1 {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly classificationId: string | null;
  readonly estimatedDurationMinutes: number;
  readonly safetyGuidelines: string | null;
  readonly version: number;
  readonly tasks: readonly CmmsJobPlanTaskV1[];
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const ApplyCmmsJobPlanV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export type ApplyCmmsJobPlanV1 = z.infer<typeof ApplyCmmsJobPlanV1Schema>;

export const RecordCmmsFailureAttributionV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    failureProblemId: UuidSchema.nullable().optional(),
    failureCauseId: UuidSchema.nullable().optional(),
    failureRemedyId: UuidSchema.nullable().optional(),
  })
  .strict();
export type RecordCmmsFailureAttributionV1 = z.infer<typeof RecordCmmsFailureAttributionV1Schema>;

// ─── Work orders ─────────────────────────────────────────────────────────────────────────────────────────

export const CMMS_MAX_WORK_ORDER_TASKS = 50;
const TaskLabelSchema = TextSchema(240);

export const CreateCmmsWorkOrderV1Schema = z
  .object({
    /** Client-generated; a repeated create with the same key returns the original work order. */
    requestKey: UuidSchema,
    type: CmmsWorkOrderTypeV1Schema,
    priority: CmmsPriorityV1Schema.default('MEDIUM'),
    title: TextSchema(240),
    description: z.string().trim().max(10_000).optional(),
    assetId: UuidSchema.optional(),
    siteRef: UuidSchema.optional(),
    departmentId: DepartmentIdSchema.optional(),
    assignedTo: CmmsPrincipalRefSchema.optional(),
    dueAt: DateTimeSchema.optional(),
    requiresSignature: z.boolean().default(false),
    estimatedHours: z.number().positive().max(10_000).optional(),
    jobPlanId: UuidSchema.nullable().optional(),
    failureProblemId: UuidSchema.nullable().optional(),
    failureCauseId: UuidSchema.nullable().optional(),
    failureRemedyId: UuidSchema.nullable().optional(),
    meterTriggerId: UuidSchema.nullable().optional(),
    tasks: z
      .array(z.object({ label: TaskLabelSchema, required: z.boolean().default(true) }).strict())
      .max(CMMS_MAX_WORK_ORDER_TASKS)
      .default([]),
  })
  .strict();
export type CreateCmmsWorkOrderV1 = z.infer<typeof CreateCmmsWorkOrderV1Schema>;

export const UpdateCmmsWorkOrderV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: TextSchema(240).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    priority: CmmsPriorityV1Schema.optional(),
    assignedTo: CmmsPrincipalRefSchema.nullable().optional(),
    dueAt: DateTimeSchema.nullable().optional(),
    estimatedHours: z.number().positive().max(10_000).nullable().optional(),
    jobPlanId: UuidSchema.nullable().optional(),
    failureProblemId: UuidSchema.nullable().optional(),
    failureCauseId: UuidSchema.nullable().optional(),
    failureRemedyId: UuidSchema.nullable().optional(),
    meterTriggerId: UuidSchema.nullable().optional(),
  })
  .strict();
export type UpdateCmmsWorkOrderV1 = z.infer<typeof UpdateCmmsWorkOrderV1Schema>;

export const ChangeCmmsWorkOrderStatusV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: CmmsWorkOrderStatusV1Schema,
    notes: z.string().trim().max(4_000).optional(),
    /** Required to complete a work order that requires a signature. */
    signatureData: z.string().min(1).max(256_000).optional(),
  })
  .strict();
export type ChangeCmmsWorkOrderStatusV1 = z.infer<typeof ChangeCmmsWorkOrderStatusV1Schema>;

export const AddCmmsWorkOrderTaskV1Schema = z
  .object({ label: TaskLabelSchema, required: z.boolean().default(true) })
  .strict();

export const RecordCmmsWorkOrderTaskV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: CmmsTaskStatusV1Schema,
    resultValue: z.number().finite().nullable().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();
export type RecordCmmsWorkOrderTaskV1 = z.infer<typeof RecordCmmsWorkOrderTaskV1Schema>;

export const LogCmmsLabourV1Schema = z
  .object({
    workerRef: CmmsPrincipalRefSchema,
    hours: z.number().positive().max(24),
    hourlyRate: z.number().nonnegative().max(100_000).optional(),
    currencyCode: CurrencyCodeSchema.optional(),
    timeCategory: CmmsTimeCategoryV1Schema.default('REGULAR'),
    performedOn: DateSchema,
    notes: z.string().trim().max(2_000).optional(),
    bookingId: UuidSchema.optional(),
  })
  .strict()
  .refine((value) => value.hourlyRate === undefined || value.currencyCode !== undefined, {
    message: 'A currency is required with an hourly rate.',
    path: ['currencyCode'],
  });
export type LogCmmsLabourV1 = z.infer<typeof LogCmmsLabourV1Schema>;

export const IssueCmmsPartV1Schema = z
  .object({
    partId: UuidSchema,
    quantity: z.number().positive().max(1_000_000),
    idempotencyKey: UuidSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type IssueCmmsPartV1 = z.infer<typeof IssueCmmsPartV1Schema>;

export const AddCmmsWorkOrderNoteV1Schema = z.object({ body: TextSchema(4_000) }).strict();

export const SearchCmmsWorkOrdersV1Schema = z
  .object({
    ...PageSchema,
    q: TextSchema(200).optional(),
    status: CmmsWorkOrderStatusV1Schema.optional(),
    openOnly: z.boolean().default(false),
    priority: CmmsPriorityV1Schema.optional(),
    assetId: UuidSchema.optional(),
    siteRef: UuidSchema.optional(),
    assignedTo: CmmsPrincipalRefSchema.optional(),
    dueBefore: DateTimeSchema.optional(),
  })
  .strict();
export type SearchCmmsWorkOrdersV1 = z.infer<typeof SearchCmmsWorkOrdersV1Schema>;

export interface CmmsWorkOrderTaskV1 {
  readonly id: string;
  readonly position: number;
  readonly label: string;
  readonly required: boolean;
  readonly status: CmmsTaskStatusV1;
  readonly resultValue: number | null;
  readonly notes: string | null;
  readonly completedBy: string | null;
  readonly completedAt: string | null;
  readonly version: number;
}

export interface CmmsLabourEntryV1 {
  readonly id: string;
  readonly workerRef: string;
  readonly hours: number;
  readonly hourlyRate: number | null;
  readonly currencyCode: string | null;
  readonly timeCategory: string;
  readonly performedOn: string;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CmmsPartIssueV1 {
  readonly movementId: string;
  readonly partId: string;
  readonly partNumber: string;
  readonly partName: string;
  readonly quantity: number;
  readonly unitCost: number | null;
  readonly currencyCode: string;
  readonly createdAt: string;
}

export interface CmmsWorkOrderEventV1 {
  readonly id: string;
  readonly eventType: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly actorSubject: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

/** Costs are totalled per currency; mixed currencies are never summed together. */
export interface CmmsCostTotalV1 {
  readonly currencyCode: string;
  readonly amount: number;
}

export interface CmmsWorkOrderV1 {
  readonly id: string;
  readonly woNumber: string;
  readonly type: CmmsWorkOrderTypeV1;
  readonly priority: CmmsPriorityV1;
  readonly status: CmmsWorkOrderStatusV1;
  readonly title: string;
  readonly description: string | null;
  readonly assetId: string | null;
  readonly assetName: string | null;
  readonly siteRef: string | null;
  readonly departmentId: string | null;
  readonly assignedTo: string | null;
  readonly dueAt: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly requiresSignature: boolean;
  readonly signed: boolean;
  readonly completionNotes: string | null;
  readonly estimatedHours: number | null;
  readonly triggerSource: 'MANUAL' | 'PM_SCHEDULE' | 'METER_TRIGGER';
  readonly pmScheduleId: string | null;
  readonly jobPlanId: string | null;
  readonly failureProblemId: string | null;
  readonly failureCauseId: string | null;
  readonly failureRemedyId: string | null;
  readonly meterTriggerId: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CmmsWorkOrderDetailV1 extends CmmsWorkOrderV1 {
  readonly tasks: readonly CmmsWorkOrderTaskV1[];
  readonly labour: readonly CmmsLabourEntryV1[];
  readonly parts: readonly CmmsPartIssueV1[];
  readonly notes: readonly CmmsWorkOrderEventV1[];
  readonly labourHours: number;
  readonly costs: readonly CmmsCostTotalV1[];
  /** Latest Workforce staffing request and the bookings Workforce made for it (WI-OI-068). */
  readonly staffing: CmmsStaffingV1 | null;
  readonly bookings: readonly CmmsWorkOrderBookingV1[];
  readonly jobPlanTitle?: string | null;
  readonly failureProblemCode?: string | null;
  readonly failureCauseCode?: string | null;
  readonly failureRemedyCode?: string | null;
  readonly meterTriggerTitle?: string | null;
}

// ─── Preventive maintenance ──────────────────────────────────────────────────────────────────────────────
const TimeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Use an IANA time zone.');

export const CreateCmmsPmScheduleV1Schema = z
  .object({
    name: TextSchema(200),
    description: z.string().trim().max(4_000).optional(),
    assetId: UuidSchema,
    siteRef: UuidSchema.optional(),
    departmentId: DepartmentIdSchema.optional(),
    intervalCount: z.number().int().min(1).max(3_650),
    intervalUnit: CmmsIntervalUnitV1Schema,
    timeZone: TimeZoneSchema.default('UTC'),
    firstDueAt: DateTimeSchema,
    woTitle: TextSchema(240),
    woDescription: z.string().trim().max(10_000).optional(),
    woPriority: CmmsPriorityV1Schema.default('MEDIUM'),
    estimatedHours: z.number().positive().max(10_000).optional(),
    requiresSignature: z.boolean().default(false),
    taskLabels: z.array(TaskLabelSchema).max(CMMS_MAX_WORK_ORDER_TASKS).default([]),
  })
  .strict();
export type CreateCmmsPmScheduleV1 = z.infer<typeof CreateCmmsPmScheduleV1Schema>;

export const UpdateCmmsPmScheduleV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: TextSchema(200).optional(),
    description: z.string().trim().max(4_000).nullable().optional(),
    intervalCount: z.number().int().min(1).max(3_650).optional(),
    intervalUnit: CmmsIntervalUnitV1Schema.optional(),
    timeZone: TimeZoneSchema.optional(),
    nextDueAt: DateTimeSchema.optional(),
    woTitle: TextSchema(240).optional(),
    woDescription: z.string().trim().max(10_000).nullable().optional(),
    woPriority: CmmsPriorityV1Schema.optional(),
    estimatedHours: z.number().positive().max(10_000).nullable().optional(),
    requiresSignature: z.boolean().optional(),
    taskLabels: z.array(TaskLabelSchema).max(CMMS_MAX_WORK_ORDER_TASKS).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateCmmsPmScheduleV1 = z.infer<typeof UpdateCmmsPmScheduleV1Schema>;

export const GenerateCmmsPmWorkOrderV1Schema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export interface CmmsPmScheduleV1 {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly assetId: string;
  readonly assetName: string | null;
  readonly siteRef: string | null;
  readonly departmentId: string | null;
  readonly intervalCount: number;
  readonly intervalUnit: CmmsIntervalUnitV1;
  readonly timeZone: string;
  readonly nextDueAt: string;
  readonly lastGeneratedAt: string | null;
  readonly overdue: boolean;
  readonly woTitle: string;
  readonly woDescription: string | null;
  readonly woPriority: CmmsPriorityV1;
  readonly estimatedHours: number | null;
  readonly requiresSignature: boolean;
  readonly taskLabels: readonly string[];
  readonly isActive: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Meters ──────────────────────────────────────────────────────────────────────────────────────────────
export const CreateCmmsMeterV1Schema = z
  .object({
    assetId: UuidSchema,
    name: TextSchema(120),
    unit: TextSchema(32),
    readingType: CmmsMeterReadingTypeV1Schema.default('GAUGE'),
    minThreshold: z.number().finite().optional(),
    maxThreshold: z.number().finite().optional(),
  })
  .strict()
  .refine(
    (value) => value.minThreshold === undefined || value.maxThreshold === undefined || value.minThreshold <= value.maxThreshold,
    { message: 'The minimum threshold cannot exceed the maximum.', path: ['minThreshold'] },
  );
export type CreateCmmsMeterV1 = z.infer<typeof CreateCmmsMeterV1Schema>;

export const CmmsMeterReadingSourceV1Schema = z.enum(['MANUAL', 'IOT_TELEMETRY', 'CONNECTOR_HUB', 'SCADA']);
export type CmmsMeterReadingSourceV1 = z.infer<typeof CmmsMeterReadingSourceV1Schema>;

export const RecordCmmsMeterReadingV1Schema = z
  .object({
    requestKey: UuidSchema,
    value: z.number().finite(),
    /** Defaults to now; readings may arrive out of order and only a newer reading replaces the latest value. */
    readAt: DateTimeSchema.optional(),
    source: CmmsMeterReadingSourceV1Schema.optional().default('MANUAL'),
    notes: z.string().trim().max(2_000).optional(),
    deviceId: z.string().trim().max(128).optional(),
    payloadRef: z.string().trim().max(256).optional(),
  })
  .strict();
export type RecordCmmsMeterReadingV1 = z.infer<typeof RecordCmmsMeterReadingV1Schema>;

export const IngestCmmsTelemetryBatchV1Schema = z
  .object({
    source: CmmsMeterReadingSourceV1Schema.default('IOT_TELEMETRY'),
    readings: z
      .array(
        z
          .object({
            meterId: UuidSchema,
            requestKey: UuidSchema,
            value: z.number().finite(),
            readAt: DateTimeSchema.optional(),
            notes: z.string().trim().max(2_000).optional(),
            deviceId: z.string().trim().max(128).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export type IngestCmmsTelemetryBatchV1 = z.infer<typeof IngestCmmsTelemetryBatchV1Schema>;

export interface CmmsMeterV1 {
  readonly id: string;
  readonly assetId: string;
  readonly assetName: string | null;
  readonly name: string;
  readonly unit: string;
  readonly readingType: 'GAUGE' | 'COUNTER';
  readonly minThreshold: number | null;
  readonly maxThreshold: number | null;
  readonly lastValue: number | null;
  readonly lastReadAt: string | null;
  /** Derived from the latest value and thresholds; UNKNOWN when there is no reading. */
  readonly condition: 'NORMAL' | 'BELOW_MINIMUM' | 'ABOVE_MAXIMUM' | 'UNKNOWN';
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CmmsMeterReadingV1 {
  readonly id: string;
  readonly meterId: string;
  readonly value: number;
  readonly readAt: string;
  readonly source: CmmsMeterReadingSourceV1;
  readonly notes: string | null;
  readonly deviceId?: string | null;
  readonly payloadRef?: string | null;
  readonly recordedBy: string;
  readonly recordedAt: string;
}

// ─── Meter Triggers (Condition & Interval PM Automation) ───────────────────
export const CmmsMeterTriggerTypeV1Schema = z.enum(['THRESHOLD_BREACH', 'USAGE_INTERVAL']);
export type CmmsMeterTriggerTypeV1 = z.infer<typeof CmmsMeterTriggerTypeV1Schema>;

export const CmmsMeterThresholdTypeV1Schema = z.enum(['UPPER', 'LOWER', 'OUT_OF_BOUNDS']);
export type CmmsMeterThresholdTypeV1 = z.infer<typeof CmmsMeterThresholdTypeV1Schema>;

export const CreateCmmsMeterTriggerV1Schema = z
  .object({
    meterId: UuidSchema,
    triggerType: CmmsMeterTriggerTypeV1Schema,
    thresholdType: CmmsMeterThresholdTypeV1Schema.optional(),
    thresholdValue: z.number().finite().optional(),
    intervalValue: z.number().positive().finite().optional(),
    jobPlanId: UuidSchema.nullable().optional(),
    workOrderTitle: TextSchema(200),
    workOrderPriority: CmmsPriorityV1Schema.default('HIGH'),
    isActive: z.boolean().default(true),
  })
  .strict();
export type CreateCmmsMeterTriggerV1 = z.infer<typeof CreateCmmsMeterTriggerV1Schema>;

export const UpdateCmmsMeterTriggerV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    thresholdType: CmmsMeterThresholdTypeV1Schema.optional(),
    thresholdValue: z.number().finite().nullable().optional(),
    intervalValue: z.number().positive().finite().nullable().optional(),
    jobPlanId: UuidSchema.nullable().optional(),
    workOrderTitle: TextSchema(200).optional(),
    workOrderPriority: CmmsPriorityV1Schema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateCmmsMeterTriggerV1 = z.infer<typeof UpdateCmmsMeterTriggerV1Schema>;

export interface CmmsMeterTriggerV1 {
  readonly id: string;
  readonly meterId: string;
  readonly triggerType: CmmsMeterTriggerTypeV1;
  readonly thresholdType: CmmsMeterThresholdTypeV1 | null;
  readonly thresholdValue: number | null;
  readonly intervalValue: number | null;
  readonly lastTriggeredValue: number | null;
  readonly lastTriggeredAt: string | null;
  readonly jobPlanId: string | null;
  readonly jobPlanTitle?: string | null;
  readonly workOrderTitle: string;
  readonly workOrderPriority: CmmsPriorityV1;
  readonly isActive: boolean;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}


// ─── Parts and stock ─────────────────────────────────────────────────────────────────────────────────────
const PartFieldsSchema = {
  name: TextSchema(200),
  description: z.string().trim().max(4_000).nullable().optional(),
  category: TextSchema(80).nullable().optional(),
  unitOfMeasure: TextSchema(32).optional(),
  unitCost: z.number().nonnegative().max(1e9).nullable().optional(),
  minQuantity: z.number().nonnegative().max(1e9).optional(),
  reorderPoint: z.number().nonnegative().max(1e9).nullable().optional(),
  barcode: TextSchema(128).nullable().optional(),
  siteRef: UuidSchema.nullable().optional(),
  binLocation: TextSchema(120).nullable().optional(),
  departmentId: DepartmentIdSchema.nullable().optional(),
};

export const CreateCmmsPartV1Schema = z
  .object({
    partNumber: IdentifierSchema,
    currencyCode: CurrencyCodeSchema,
    nonStock: z.boolean().default(false),
    /** Recorded as an opening RECEIPT in the stock ledger, never as a bare balance. */
    openingQuantity: z.number().positive().max(1e9).optional(),
    ...PartFieldsSchema,
  })
  .strict()
  .refine((value) => !(value.nonStock && value.openingQuantity !== undefined), {
    message: 'A non-stock part has no stock balance.',
    path: ['openingQuantity'],
  });
export type CreateCmmsPartV1 = z.infer<typeof CreateCmmsPartV1Schema>;

export const UpdateCmmsPartV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), ...PartFieldsSchema, name: TextSchema(200).optional() })
  .strict();
export type UpdateCmmsPartV1 = z.infer<typeof UpdateCmmsPartV1Schema>;

export const RecordCmmsStockMovementV1Schema = z
  .discriminatedUnion('movementType', [
    z
      .object({
        movementType: z.literal('RECEIPT'),
        idempotencyKey: UuidSchema,
        quantity: z.number().positive().max(1e9),
        unitCost: z.number().nonnegative().max(1e9).optional(),
        reason: z.string().trim().max(500).optional(),
      })
      .strict(),
    z
      .object({
        movementType: z.literal('RETURN'),
        idempotencyKey: UuidSchema,
        quantity: z.number().positive().max(1e9),
        workOrderId: UuidSchema,
        reason: z.string().trim().max(500).optional(),
      })
      .strict(),
    z
      .object({
        movementType: z.literal('ADJUSTMENT'),
        idempotencyKey: UuidSchema,
        /** Signed: positive adds stock, negative removes it (a count correction). */
        quantityDelta: z.number().finite().refine((value) => value !== 0, 'An adjustment cannot be zero.'),
        reason: TextSchema(500),
      })
      .strict(),
  ]);
export type RecordCmmsStockMovementV1 = z.infer<typeof RecordCmmsStockMovementV1Schema>;

export const SearchCmmsPartsV1Schema = z
  .object({
    ...PageSchema,
    q: TextSchema(200).optional(),
    lowStockOnly: z.boolean().default(false),
    siteRef: UuidSchema.optional(),
    includeArchived: z.boolean().default(false),
  })
  .strict();
export type SearchCmmsPartsV1 = z.infer<typeof SearchCmmsPartsV1Schema>;

export interface CmmsPartV1 {
  readonly id: string;
  readonly partNumber: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly unitOfMeasure: string;
  readonly unitCost: number | null;
  readonly currencyCode: string;
  readonly quantityOnHand: number;
  readonly minQuantity: number;
  readonly reorderPoint: number | null;
  readonly lowStock: boolean;
  readonly nonStock: boolean;
  readonly barcode: string | null;
  readonly siteRef: string | null;
  readonly binLocation: string | null;
  readonly departmentId: string | null;
  readonly archivedAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CmmsStockMovementV1 {
  readonly id: string;
  readonly partId: string;
  readonly movementType: CmmsStockMovementTypeV1;
  readonly quantityDelta: number;
  readonly balanceAfter: number | null;
  readonly workOrderId: string | null;
  readonly unitCost: number | null;
  readonly currencyCode: string;
  readonly reason: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
}

// ─── Overview ────────────────────────────────────────────────────────────────────────────────────────────
export interface CmmsWorkOrderOverviewV1 {
  readonly openCount: number;
  readonly inProgressCount: number;
  readonly onHoldCount: number;
  readonly completedLast30Days: number;
  readonly activeEmergencies: number;
  readonly overdueCount: number;
  /** Mean hours from start to completion over the last 90 days; null when nothing was completed. */
  readonly averageCycleHours: number | null;
  readonly generatedAt: string;
}

export interface CmmsInventorySummaryV1 {
  readonly totalParts: number;
  readonly lowStockCount: number;
  /** Valuation per currency; parts without a unit cost are counted in `unvaluedParts`. */
  readonly valuation: readonly CmmsCostTotalV1[];
  readonly unvaluedParts: number;
  readonly generatedAt: string;
}

export interface CmmsPageV1<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// ─── Financial Settlement & Cost Tracking (Phase 5) ───────────────────────────────────────────
export const SettleCmmsWorkOrderV1Schema = z
  .object({
    settleLabour: z.boolean().default(true),
    settleParts: z.boolean().default(true),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type SettleCmmsWorkOrderV1 = z.infer<typeof SettleCmmsWorkOrderV1Schema>;

export const CmmsWorkOrderFinancialsV1Schema = z.object({
  workOrderId: UuidSchema,
  woNumber: z.string(),
  settlementStatus: z.enum(['UNSETTLED', 'PARTIALLY_SETTLED', 'FULLY_SETTLED']),
  currencyCode: z.string(),
  labour: z.object({
    totalHours: z.number(),
    totalCostCents: z.number(),
    entryCount: z.number(),
    settled: z.boolean(),
    journalEntryId: z.string().nullable(),
  }),
  parts: z.object({
    totalQuantity: z.number(),
    totalCostCents: z.number(),
    movementCount: z.number(),
    settled: z.boolean(),
    journalEntryId: z.string().nullable(),
  }),
  totalCostCents: z.number(),
  settledAt: z.string().nullable(),
  journalEntries: z.array(
    z.object({
      id: z.string(),
      entryNumber: z.string(),
      memo: z.string(),
      postedAt: z.string(),
      isBalanced: z.boolean(),
      lines: z.array(
        z.object({
          accountCode: z.string(),
          accountName: z.string(),
          description: z.string().nullable(),
          debitCents: z.number(),
          creditCents: z.number(),
        })
      ),
    })
  ),
});
export type CmmsWorkOrderFinancialsV1 = z.infer<typeof CmmsWorkOrderFinancialsV1Schema>;

export const LinkCmmsLabourToBookingV1Schema = z
  .object({
    labourId: UuidSchema,
    bookingId: UuidSchema,
  })
  .strict();
export type LinkCmmsLabourToBookingV1 = z.infer<typeof LinkCmmsLabourToBookingV1Schema>;
