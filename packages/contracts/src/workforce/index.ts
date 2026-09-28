import { z } from 'zod';

// ─── Canonical Workforce resource/capability vertical (WI-OI-061) ────────────

// ADR-0003 Decision 8: neutral lexicon only; industry terms belong in tenant configuration.
export const WorkforceResourceTypeV1Schema = z.enum(['HUMAN', 'TEAM', 'POOL']);
export type WorkforceResourceTypeV1 = z.infer<typeof WorkforceResourceTypeV1Schema>;

export const WorkforceRecordStatusV1Schema = z.enum(['ACTIVE', 'INACTIVE']);
export type WorkforceRecordStatusV1 = z.infer<typeof WorkforceRecordStatusV1Schema>;

export const WorkforceCapabilityProficiencyV1Schema = z.enum([
  'STANDARD',
  'ADVANCED',
  'EXPERT',
  'MASTER',
]);
export type WorkforceCapabilityProficiencyV1 = z.infer<
  typeof WorkforceCapabilityProficiencyV1Schema
>;

export const WorkforceQualificationStatusV1Schema = z.enum([
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'REVOKED',
]);
export type WorkforceQualificationStatusV1 = z.infer<
  typeof WorkforceQualificationStatusV1Schema
>;

const WorkforceReferenceCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const CreateWorkforceResourceV1Schema = z.object({
  referenceCode: WorkforceReferenceCodeSchema,
  displayName: z.string().trim().min(1).max(200),
  resourceType: WorkforceResourceTypeV1Schema,
  platformUserId: z.string().trim().min(1).max(128).nullable().optional(),
});
export type CreateWorkforceResourceV1 = z.infer<typeof CreateWorkforceResourceV1Schema>;

export const UpdateWorkforceResourceV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    displayName: z.string().trim().min(1).max(200).optional(),
    resourceType: WorkforceResourceTypeV1Schema.optional(),
    platformUserId: z.string().trim().min(1).max(128).nullable().optional(),
    status: WorkforceRecordStatusV1Schema.optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.resourceType !== undefined ||
      value.platformUserId !== undefined ||
      value.status !== undefined,
    { message: 'At least one mutable field is required.' },
  );
export type UpdateWorkforceResourceV1 = z.infer<typeof UpdateWorkforceResourceV1Schema>;

export const WorkforceResourceV1Schema = z.object({
  id: z.string().uuid(),
  referenceCode: z.string(),
  displayName: z.string(),
  resourceType: WorkforceResourceTypeV1Schema,
  platformUserId: z.string().nullable(),
  status: WorkforceRecordStatusV1Schema,
  version: z.number().int().positive(),
  qualificationCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkforceResourceV1 = z.infer<typeof WorkforceResourceV1Schema>;

export const CreateCapabilityDefinitionV1Schema = z.object({
  code: WorkforceReferenceCodeSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullable().optional(),
  evidenceRequired: z.boolean().default(false).optional(),
  defaultValidityDays: z.number().int().min(1).max(36500).nullable().optional(),
});
export type CreateCapabilityDefinitionV1 = z.infer<
  typeof CreateCapabilityDefinitionV1Schema
>;

export const CapabilityDefinitionV1Schema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  evidenceRequired: z.boolean(),
  defaultValidityDays: z.number().int().positive().nullable(),
  status: WorkforceRecordStatusV1Schema,
  version: z.number().int().positive(),
  assignedResourceCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CapabilityDefinitionV1 = z.infer<typeof CapabilityDefinitionV1Schema>;

export const AssignResourceCapabilityV1Schema = z
  .object({
    capabilityDefinitionId: z.string().uuid(),
    proficiency: WorkforceCapabilityProficiencyV1Schema.default('STANDARD').optional(),
    validFrom: z.string().datetime(),
    expiresAt: z.string().datetime().nullable().optional(),
    issuingAuthority: z.string().trim().max(200).nullable().optional(),
    evidenceReference: z.string().trim().max(300).nullable().optional(),
  })
  .refine(
    (value) => !value.expiresAt || Date.parse(value.validFrom) < Date.parse(value.expiresAt),
    { message: 'expiresAt must be later than validFrom.', path: ['expiresAt'] },
  );
export type AssignResourceCapabilityV1 = z.infer<typeof AssignResourceCapabilityV1Schema>;

export const ResourceQualificationV1Schema = z.object({
  id: z.string().uuid(),
  resourceId: z.string().uuid(),
  capabilityDefinitionId: z.string().uuid(),
  capabilityCode: z.string(),
  capabilityName: z.string(),
  proficiency: WorkforceCapabilityProficiencyV1Schema,
  status: WorkforceQualificationStatusV1Schema,
  validFrom: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  issuingAuthority: z.string().nullable(),
  evidenceReference: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ResourceQualificationV1 = z.infer<typeof ResourceQualificationV1Schema>;

export const WorkforceResourceDetailV1Schema = WorkforceResourceV1Schema.extend({
  qualifications: z.array(ResourceQualificationV1Schema),
});
export type WorkforceResourceDetailV1 = z.infer<typeof WorkforceResourceDetailV1Schema>;

export const ListWorkforceResourcesV1QuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  resourceType: WorkforceResourceTypeV1Schema.optional(),
  status: WorkforceRecordStatusV1Schema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListWorkforceResourcesV1Query = z.infer<
  typeof ListWorkforceResourcesV1QuerySchema
>;

export const WorkforceResourcePageV1Schema = z.object({
  items: z.array(WorkforceResourceV1Schema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  generatedAt: z.string().datetime(),
});
export type WorkforceResourcePageV1 = z.infer<typeof WorkforceResourcePageV1Schema>;

// ─── Universal Workforce Enums ────────────────────────────────────────────────

export const UniversalEmploymentTypeSchema = z.enum([
  'FULL_TIME_SALARIED',
  'CONTRACTOR_1099',
  'GIG_UNION',
  'DAILY_CASUAL',
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR',
  'TEMPORARY',
  'SEASONAL',
  'INTERN',
]);
export type UniversalEmploymentType = z.infer<typeof UniversalEmploymentTypeSchema>;

export const AllocationStatusSchema = z.enum([
  'DRAFT',
  'CONFIRMED',
  'DISPATCHED',
  'ON_SITE',
  'COMPLETED',
  'CANCELLED',
]);
export type AllocationStatus = z.infer<typeof AllocationStatusSchema>;

export const CapabilityCertLevelSchema = z.enum([
  'STANDARD',
  'ADVANCED',
  'MASTER',
  'EXPERT',
]);
export type CapabilityCertLevel = z.infer<typeof CapabilityCertLevelSchema>;

// ─── Resource Capability Schemas ──────────────────────────────────────────────

export const CreateResourceCapabilitySchema = z.object({
  capabilityCode: z.string().min(1, 'Capability code required').max(64),
  certLevel: CapabilityCertLevelSchema.default('STANDARD').optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional().nullable(),
  accreditationBody: z.string().max(255).optional().nullable(),
  isActive: z.boolean().default(true).optional(),
});
export type CreateResourceCapabilityDto = z.infer<typeof CreateResourceCapabilitySchema>;

export const ResourceCapabilityResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  resourceId: z.string().uuid(),
  capabilityCode: z.string(),
  certLevel: CapabilityCertLevelSchema,
  validFrom: z.string(),
  validUntil: z.string().nullable().optional(),
  accreditationBody: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResourceCapabilityResponse = z.infer<typeof ResourceCapabilityResponseSchema>;

// ─── Workforce Resource Schemas ───────────────────────────────────────────────

export const CreateWorkforceResourceSchema = z.object({
  name: z.string().min(1, 'Resource name is required').max(255),
  userId: z.string().max(64).optional().nullable(),
  employmentType: UniversalEmploymentTypeSchema.default('FULL_TIME_SALARIED').optional(),
  homeLat: z.number().min(-90).max(90).optional().nullable(),
  homeLng: z.number().min(-180).max(180).optional().nullable(),
  costRateUsd: z.number().min(0).default(0).optional(),
  isActive: z.boolean().default(true).optional(),
});
export type CreateWorkforceResourceDto = z.infer<typeof CreateWorkforceResourceSchema>;

export const UpdateWorkforceResourceSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  userId: z.string().max(64).optional().nullable(),
  employmentType: UniversalEmploymentTypeSchema.optional(),
  homeLat: z.number().min(-90).max(90).optional().nullable(),
  homeLng: z.number().min(-180).max(180).optional().nullable(),
  costRateUsd: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWorkforceResourceDto = z.infer<typeof UpdateWorkforceResourceSchema>;

export const WorkforceResourceResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().nullable().optional(),
  name: z.string(),
  employmentType: UniversalEmploymentTypeSchema,
  homeLat: z.number().nullable().optional(),
  homeLng: z.number().nullable().optional(),
  costRateUsd: z.number(),
  isActive: z.boolean(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  capabilities: z.array(ResourceCapabilityResponseSchema).optional(),
});
export type WorkforceResourceResponse = z.infer<typeof WorkforceResourceResponseSchema>;

// ─── Resource Allocation Schemas ──────────────────────────────────────────────

export const CreateResourceAllocationSchema = z
  .object({
    resourceId: z.string().uuid(),
    workOrderId: z.string().uuid().optional().nullable(),
    requiredCapabilityCode: z.string().min(1).max(64).optional().nullable(),
    scheduledStart: z.string().datetime(),
    scheduledFinish: z.string().datetime(),
    initialStatus: z.literal('DRAFT').default('DRAFT').optional(),
  })
  .refine(
    (data) => new Date(data.scheduledStart) < new Date(data.scheduledFinish),
    {
      message: 'scheduledStart must be before scheduledFinish',
      path: ['scheduledFinish'],
    },
  );
export type CreateResourceAllocationDto = z.infer<typeof CreateResourceAllocationSchema>;

export const TransitionAllocationStatusSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: AllocationStatusSchema,
  checkinLat: z.number().min(-90).max(90).optional().nullable(),
  checkinLng: z.number().min(-180).max(180).optional().nullable(),
  reason: z.string().max(1000).optional().nullable(),
});
export type TransitionAllocationStatusDto = z.infer<typeof TransitionAllocationStatusSchema>;

export const AllocationHistoryResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  allocationId: z.string().uuid(),
  previousStatus: z.string().nullable().optional(),
  newStatus: z.string(),
  changedBy: z.string(),
  reason: z.string().nullable().optional(),
  recordedAt: z.string(),
});
export type AllocationHistoryResponse = z.infer<typeof AllocationHistoryResponseSchema>;

export const ResourceAllocationResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  workOrderId: z.string().uuid().nullable().optional(),
  resourceId: z.string().uuid(),
  requiredCapabilityCode: z.string().nullable().optional(),
  scheduledStart: z.string(),
  scheduledFinish: z.string(),
  actualStart: z.string().nullable().optional(),
  actualFinish: z.string().nullable().optional(),
  status: AllocationStatusSchema,
  checkinLat: z.number().nullable().optional(),
  checkinLng: z.number().nullable().optional(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resource: WorkforceResourceResponseSchema.optional(),
  history: z.array(AllocationHistoryResponseSchema).optional(),
});
export type ResourceAllocationResponse = z.infer<typeof ResourceAllocationResponseSchema>;

export const ListWorkforceResourcesQuerySchema = z.object({
  employmentType: UniversalEmploymentTypeSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListWorkforceResourcesQuery = z.infer<typeof ListWorkforceResourcesQuerySchema>;

export const ListResourceAllocationsQuerySchema = z
  .object({
    resourceId: z.string().uuid().optional(),
    workOrderId: z.string().uuid().optional(),
    status: AllocationStatusSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
    message: 'from must be before or equal to to',
    path: ['to'],
  });
export type ListResourceAllocationsQuery = z.infer<typeof ListResourceAllocationsQuerySchema>;

// ─── Job profiles, positions and engagements (WI-OI-065, roadmap P5) ─────────────────────────────────────
// Calendar dates (YYYY-MM-DD); every window is [from, to) and an open end is null. ADR-0003 neutral lexicon:
// industry terms belong in tenant configuration.

const CodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'Use letters, digits, dot, underscore or dash.'));
export const WorkforceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value),
  'Use a real calendar date.',
);

export const WorkerCategoryV1Schema = z.enum(['EMPLOYEE', 'CONTRACTOR', 'AGENCY', 'VOLUNTEER']);
export type WorkerCategoryV1 = z.infer<typeof WorkerCategoryV1Schema>;
export const PositionStatusV1Schema = z.enum(['OPEN', 'FROZEN', 'CLOSED']);
export type PositionStatusV1 = z.infer<typeof PositionStatusV1Schema>;
export const EngagementStatusV1Schema = z.enum(['ACTIVE', 'ENDED', 'CANCELLED']);
export type EngagementStatusV1 = z.infer<typeof EngagementStatusV1Schema>;

export const RequiredCapabilityV1Schema = z
  .object({
    capabilityDefinitionId: z.string().uuid(),
    minimumProficiency: WorkforceCapabilityProficiencyV1Schema.default('STANDARD'),
  })
  .strict();
export type RequiredCapabilityV1 = z.infer<typeof RequiredCapabilityV1Schema>;

const RevisionFieldsSchema = {
  effectiveFrom: WorkforceDateSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  workerCategory: WorkerCategoryV1Schema,
  requiredCapabilities: z
    .array(RequiredCapabilityV1Schema)
    .max(50)
    .default([])
    .refine((items) => new Set(items.map((item) => item.capabilityDefinitionId)).size === items.length, 'List each capability once.'),
};

export const CreateJobProfileV1Schema = z.object({ code: CodeSchema, ...RevisionFieldsSchema }).strict();
export type CreateJobProfileV1 = z.infer<typeof CreateJobProfileV1Schema>;

/** A new definition from a later date; the current open revision ends where this one begins. */
export const ReviseJobProfileV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), ...RevisionFieldsSchema })
  .strict();
export type ReviseJobProfileV1 = z.infer<typeof ReviseJobProfileV1Schema>;

export const UpdateJobProfileStatusV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), status: WorkforceRecordStatusV1Schema })
  .strict();

export const ListJobProfilesV1QuerySchema = z.object({
  asOf: WorkforceDateSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  status: WorkforceRecordStatusV1Schema.optional(),
});

export interface JobProfileRevisionV1 {
  readonly id: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly workerCategory: WorkerCategoryV1;
  readonly requiredCapabilities: readonly (RequiredCapabilityV1 & { readonly capabilityCode: string | null; readonly capabilityName: string | null })[];
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface JobProfileV1 {
  readonly id: string;
  readonly code: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly version: number;
  /** The revision in force on the requested date (today by default), or null outside the profile's life. */
  readonly current: JobProfileRevisionV1 | null;
  readonly positionCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JobProfileDetailV1 extends JobProfileV1 {
  readonly revisions: readonly JobProfileRevisionV1[];
}

export const CreatePositionV1Schema = z
  .object({
    code: CodeSchema,
    jobProfileId: z.string().uuid(),
    siteRef: z.string().uuid().nullable().optional(),
    departmentId: z.string().trim().min(1).max(64).nullable().optional(),
    fte: z.number().positive().max(1).default(1),
    effectiveFrom: WorkforceDateSchema,
    effectiveTo: WorkforceDateSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => !value.effectiveTo || value.effectiveTo > value.effectiveFrom, {
    message: 'The end must be after the start.',
    path: ['effectiveTo'],
  });
export type CreatePositionV1 = z.infer<typeof CreatePositionV1Schema>;

export const UpdatePositionV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    siteRef: z.string().uuid().nullable().optional(),
    departmentId: z.string().trim().min(1).max(64).nullable().optional(),
    fte: z.number().positive().max(1).optional(),
    effectiveTo: WorkforceDateSchema.nullable().optional(),
    status: PositionStatusV1Schema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'), { message: 'Change at least one field.' });
export type UpdatePositionV1 = z.infer<typeof UpdatePositionV1Schema>;

export const ListPositionsV1QuerySchema = z.object({
  asOf: WorkforceDateSchema.optional(),
  siteRef: z.string().uuid().optional(),
  jobProfileId: z.string().uuid().optional(),
  status: PositionStatusV1Schema.optional(),
  vacantOnly: z.enum(['true', 'false']).optional(),
});

export interface EngagementV1 {
  readonly id: string;
  readonly resourceId: string;
  readonly resourceName: string | null;
  readonly positionId: string;
  readonly positionCode: string | null;
  readonly engagementType: WorkerCategoryV1;
  readonly fte: number;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly status: EngagementStatusV1;
  readonly endReason: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PositionV1 {
  readonly id: string;
  readonly code: string;
  readonly jobProfileId: string;
  readonly jobProfileCode: string;
  readonly title: string | null;
  readonly siteRef: string | null;
  readonly departmentId: string | null;
  readonly fte: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: PositionStatusV1;
  /** Engagement holding the position on the requested date, if any. */
  readonly incumbent: EngagementV1 | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PositionDetailV1 extends PositionV1 {
  readonly engagements: readonly EngagementV1[];
}

export const CreateEngagementV1Schema = z
  .object({
    resourceId: z.string().uuid(),
    positionId: z.string().uuid(),
    engagementType: WorkerCategoryV1Schema,
    fte: z.number().positive().max(1).default(1),
    startDate: WorkforceDateSchema,
    endDate: WorkforceDateSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => !value.endDate || value.endDate > value.startDate, { message: 'The end must be after the start.', path: ['endDate'] });
export type CreateEngagementV1 = z.infer<typeof CreateEngagementV1Schema>;

export const EndEngagementV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), endDate: WorkforceDateSchema, reason: z.string().trim().min(1).max(500) })
  .strict();
export type EndEngagementV1 = z.infer<typeof EndEngagementV1Schema>;

export const CancelEngagementV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(500) })
  .strict();

export const ListEngagementsV1QuerySchema = z.object({
  resourceId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  asOf: WorkforceDateSchema.optional(),
  status: EngagementStatusV1Schema.optional(),
});

// ─── Availability, absence and working calendars (WI-OI-066, roadmap P5) ─────────────────────────────────
// Weekly slots are local wall-clock times in the pattern's IANA time zone; an end at or before the start runs
// past midnight. Absences are [startsAt, endsAt) instants. Availability is computed, never stored.

export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export const WeekdayV1Schema = z.enum(WEEKDAYS);
export type WeekdayV1 = z.infer<typeof WeekdayV1Schema>;
const TimeOfDaySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Use HH:MM (00:00–24:00).');
export const MAX_AVAILABILITY_WINDOW_DAYS = 93;

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const WeeklySlotV1Schema = z
  .object({ day: WeekdayV1Schema, start: TimeOfDaySchema, end: TimeOfDaySchema })
  .strict()
  .refine((slot) => slot.start !== slot.end && slot.start !== '24:00', { message: 'A slot needs a start before its end (an earlier end runs past midnight).' });
export type WeeklySlotV1 = z.infer<typeof WeeklySlotV1Schema>;

/** Slots as minute ranges of a 7-day week; an overnight slot wraps into the next day. */
function weekRanges(slots: readonly WeeklySlotV1[]): [number, number][] {
  const week = 7 * 1440;
  return slots.flatMap((slot) => {
    const dayStart = WEEKDAYS.indexOf(slot.day) * 1440;
    const start = dayStart + minutes(slot.start);
    const end = dayStart + minutes(slot.end) + (minutes(slot.end) <= minutes(slot.start) ? 1440 : 0);
    return end > week ? ([[start, week], [0, end - week]] as [number, number][]) : ([[start, end]] as [number, number][]);
  });
}

export const IanaTimeZoneSchema = z.string().min(1).max(64).refine((zone) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}, 'Use an IANA time zone.');

export const CreateAvailabilityPatternV1Schema = z
  .object({
    resourceId: z.string().uuid(),
    effectiveFrom: WorkforceDateSchema,
    effectiveTo: WorkforceDateSchema.nullable().optional(),
    timeZone: IanaTimeZoneSchema,
    weeklySlots: z.array(WeeklySlotV1Schema).min(1).max(28),
  })
  .strict()
  .refine((value) => !value.effectiveTo || value.effectiveTo > value.effectiveFrom, { message: 'The end must be after the start.', path: ['effectiveTo'] })
  .refine(
    (value) => {
      const ranges = weekRanges(value.weeklySlots).sort((left, right) => left[0] - right[0]);
      return ranges.every((range, index) => index === 0 || range[0] >= ranges[index - 1]![1]);
    },
    { message: 'Slots in a week must not overlap.', path: ['weeklySlots'] },
  );
export type CreateAvailabilityPatternV1 = z.infer<typeof CreateAvailabilityPatternV1Schema>;

export const EndAvailabilityPatternV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), effectiveTo: WorkforceDateSchema })
  .strict();

export interface AvailabilityPatternV1 {
  readonly id: string;
  readonly resourceId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly timeZone: string;
  readonly weeklySlots: readonly WeeklySlotV1[];
  readonly weeklyMinutes: number;
  readonly version: number;
  readonly createdAt: string;
}

export const CreateAbsenceTypeV1Schema = z
  .object({
    code: CodeSchema,
    name: z.string().trim().min(1).max(160),
    paid: z.boolean().default(false),
    requiresApproval: z.boolean().default(true),
  })
  .strict();
export type CreateAbsenceTypeV1 = z.infer<typeof CreateAbsenceTypeV1Schema>;

export const UpdateAbsenceTypeV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    paid: z.boolean().optional(),
    requiresApproval: z.boolean().optional(),
    status: WorkforceRecordStatusV1Schema.optional(),
  })
  .strict();

export interface AbsenceTypeV1 {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly paid: boolean;
  readonly requiresApproval: boolean;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly version: number;
}

export const AbsenceStatusV1Schema = z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED']);
export type AbsenceStatusV1 = z.infer<typeof AbsenceStatusV1Schema>;

export const RequestAbsenceV1Schema = z
  .object({
    resourceId: z.string().uuid(),
    absenceTypeId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), { message: 'The end must be after the start.', path: ['endsAt'] })
  .refine((value) => Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 366 * 86_400_000, { message: 'An absence can span at most 366 days.', path: ['endsAt'] });
export type RequestAbsenceV1 = z.infer<typeof RequestAbsenceV1Schema>;

export const DecideAbsenceV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(500).optional() })
  .strict();
export type DecideAbsenceV1 = z.infer<typeof DecideAbsenceV1Schema>;

export const ListAbsencesV1QuerySchema = z.object({
  resourceId: z.string().uuid().optional(),
  status: AbsenceStatusV1Schema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export interface AbsenceV1 {
  readonly id: string;
  readonly resourceId: string;
  readonly resourceName: string | null;
  readonly absenceTypeId: string;
  readonly absenceTypeName: string | null;
  readonly paid: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: AbsenceStatusV1;
  readonly note: string | null;
  readonly requestedBy: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly decisionReason: string | null;
  readonly version: number;
  readonly createdAt: string;
}

export const CreateWorkingCalendarV1Schema = z
  .object({ code: CodeSchema, name: z.string().trim().min(1).max(160), siteRef: z.string().uuid().nullable().optional() })
  .strict();
export type CreateWorkingCalendarV1 = z.infer<typeof CreateWorkingCalendarV1Schema>;

export const AddCalendarClosureV1Schema = z
  .object({ closureDate: WorkforceDateSchema, label: z.string().trim().min(1).max(160) })
  .strict();
export type AddCalendarClosureV1 = z.infer<typeof AddCalendarClosureV1Schema>;

export interface CalendarClosureV1 {
  readonly id: string;
  readonly closureDate: string;
  readonly label: string;
  readonly status: 'ACTIVE' | 'WITHDRAWN';
}

export interface WorkingCalendarV1 {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  /** Null for the tenant-wide calendar. */
  readonly siteRef: string | null;
  readonly closures: readonly CalendarClosureV1[];
  readonly version: number;
}

export const AvailabilityQueryV1Schema = z
  .object({ resourceId: z.string().uuid(), from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) })
  .strict()
  .refine((value) => Date.parse(value.to) > Date.parse(value.from), { message: 'The end must be after the start.', path: ['to'] })
  .refine((value) => Date.parse(value.to) - Date.parse(value.from) <= MAX_AVAILABILITY_WINDOW_DAYS * 86_400_000, {
    message: `Ask for at most ${MAX_AVAILABILITY_WINDOW_DAYS} days.`,
    path: ['to'],
  });
export type AvailabilityQueryV1 = z.infer<typeof AvailabilityQueryV1Schema>;

export interface AvailabilityIntervalV1 {
  readonly start: string;
  readonly end: string;
}

export interface AvailabilityV1 {
  readonly resourceId: string;
  readonly from: string;
  readonly to: string;
  /** Scheduled working time left after approved absences and calendar closures. */
  readonly available: readonly AvailabilityIntervalV1[];
  /** Scheduled time removed, with the reason. */
  readonly blocked: readonly (AvailabilityIntervalV1 & { readonly reason: 'ABSENCE' | 'CLOSURE'; readonly label: string })[];
  /** Requested, not yet decided, absences in the window (they do not block yet). */
  readonly pendingAbsences: readonly AvailabilityIntervalV1[];
  readonly scheduledMinutes: number;
  readonly availableMinutes: number;
}

// ─── Demand requirements and bookings (WI-OI-067, roadmap P6) ────────────────────────────────────────────
// Requirements come from any source; bookings assign one person to part or all of a requirement. Sources and
// sites are plain references (logical ids only, roadmap rule 2).

export const WorkSourceTypeV1Schema = z.enum(['MANUAL', 'CMMS_WORK_ORDER', 'PROJECT']);
export type WorkSourceTypeV1 = z.infer<typeof WorkSourceTypeV1Schema>;
export const WorkRequirementStatusV1Schema = z.enum(['OPEN', 'FILLED', 'CANCELLED']);
export const BookingStatusV1Schema = z.enum(['DRAFT', 'CONFIRMED', 'DISPATCHED', 'ON_SITE', 'COMPLETED', 'CANCELLED']);
export type BookingStatusV1 = z.infer<typeof BookingStatusV1Schema>;

/** Allowed booking moves; COMPLETED and CANCELLED are terminal. */
export const BOOKING_TRANSITIONS: Readonly<Record<BookingStatusV1, readonly BookingStatusV1[]>> = Object.freeze({
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['ON_SITE', 'CANCELLED'],
  ON_SITE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
});

/** Proficiency order used by the capability guard. */
export const PROFICIENCY_RANK: Readonly<Record<string, number>> = Object.freeze({ STANDARD: 1, ADVANCED: 2, EXPERT: 3, MASTER: 4 });

const InstantSchema = z.string().datetime({ offset: true });

export const CreateWorkRequirementV1Schema = z
  .object({
    requestKey: z.string().uuid(),
    title: z.string().trim().min(1).max(240),
    sourceType: WorkSourceTypeV1Schema.default('MANUAL'),
    sourceRef: z.string().trim().min(1).max(128).optional(),
    siteRef: z.string().uuid().nullable().optional(),
    startsAt: InstantSchema,
    endsAt: InstantSchema,
    headcount: z.number().int().min(1).max(500).default(1),
    requiredCapabilities: z
      .array(RequiredCapabilityV1Schema)
      .max(20)
      .default([])
      .refine((items) => new Set(items.map((item) => item.capabilityDefinitionId)).size === items.length, 'List each capability once.'),
  })
  .strict()
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), { message: 'The end must be after the start.', path: ['endsAt'] })
  .refine((value) => Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 31 * 86_400_000, { message: 'A requirement spans at most 31 days.', path: ['endsAt'] })
  .refine((value) => (value.sourceType === 'MANUAL') === (value.sourceRef === undefined), {
    message: 'A manual requirement has no source reference; other sources need one.',
    path: ['sourceRef'],
  });
export type CreateWorkRequirementV1 = z.infer<typeof CreateWorkRequirementV1Schema>;

export const CancelWorkRequirementV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(500) })
  .strict();

export const ListWorkRequirementsV1QuerySchema = z.object({
  status: WorkRequirementStatusV1Schema.optional(),
  siteRef: z.string().uuid().optional(),
  from: InstantSchema.optional(),
  to: InstantSchema.optional(),
});

export const CreateBookingV1Schema = z
  .object({
    requestKey: z.string().uuid(),
    requirementId: z.string().uuid(),
    resourceId: z.string().uuid(),
    /** Defaults to the whole requirement window. */
    startsAt: InstantSchema.optional(),
    endsAt: InstantSchema.optional(),
    /** Books despite an availability gap; needs `workforce.bookings.override` and is audited. */
    overrideReason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((value) => (value.startsAt === undefined) === (value.endsAt === undefined), { message: 'Give both a start and an end, or neither.', path: ['endsAt'] })
  .refine((value) => !value.startsAt || !value.endsAt || Date.parse(value.endsAt) > Date.parse(value.startsAt), { message: 'The end must be after the start.', path: ['endsAt'] });
export type CreateBookingV1 = z.infer<typeof CreateBookingV1Schema>;

export const ChangeBookingStatusV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: BookingStatusV1Schema.exclude(['DRAFT']),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((value) => value.status !== 'CANCELLED' || value.reason !== undefined, { message: 'A cancellation needs a reason.', path: ['reason'] });
export type ChangeBookingStatusV1 = z.infer<typeof ChangeBookingStatusV1Schema>;

export const ListBookingsV1QuerySchema = z.object({
  resourceId: z.string().uuid().optional(),
  requirementId: z.string().uuid().optional(),
  from: InstantSchema.optional(),
  to: InstantSchema.optional(),
});

export interface BookingV1 {
  readonly id: string;
  readonly requirementId: string;
  readonly requirementTitle: string | null;
  readonly resourceId: string;
  readonly resourceName: string | null;
  readonly siteRef: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: BookingStatusV1;
  readonly overrideReason: string | null;
  readonly cancelReason: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkRequirementV1 {
  readonly id: string;
  readonly title: string;
  readonly sourceType: WorkSourceTypeV1;
  readonly sourceRef: string | null;
  readonly siteRef: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly headcount: number;
  readonly bookedCount: number;
  readonly requiredCapabilities: readonly RequiredCapabilityV1[];
  readonly status: 'OPEN' | 'FILLED' | 'CANCELLED';
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkRequirementDetailV1 extends WorkRequirementV1 {
  readonly bookings: readonly BookingV1[];
}

export interface BookingCandidateV1 {
  readonly resourceId: string;
  readonly resourceName: string;
  readonly qualified: boolean;
  readonly missingCapabilities: readonly string[];
  readonly available: boolean;
  readonly conflictingBooking: boolean;
  /** Minutes of the requirement window the person is available for. */
  readonly availableMinutes: number;
}

// ─── Time and attendance (WI-OI-069, roadmap P7) ──────────────────────────────────────────────────────────
export const PunchKindV1Schema = z.enum(['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT']);
export type PunchKindV1 = z.infer<typeof PunchKindV1Schema>;

/** How the punch location related to the site boundary; the BFF supplies it from Geospatial. */
export const GeofenceResultV1Schema = z.enum(['INSIDE', 'OUTSIDE', 'UNKNOWN', 'NOT_CHECKED', 'NO_LOCATION']);
export type GeofenceResultV1 = z.infer<typeof GeofenceResultV1Schema>;

export const GeofenceEvidenceV1Schema = z
  .object({
    result: GeofenceResultV1Schema,
    placeRef: z.string().uuid().nullable(),
    distanceToEdgeMeters: z.number().nonnegative().max(40_075_000).nullable(),
    reason: z.string().max(64).nullable(),
  })
  .strict();
export type GeofenceEvidenceV1 = z.infer<typeof GeofenceEvidenceV1Schema>;

const DeviceIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/, 'Use letters, digits, dot, dash, colon or underscore.');

/**
 * A punch from the worker's device. `deviceEventId` is generated once per tap and reused on every resend, so a
 * resend returns the original punch. `geofence` is set by the BFF only; client values are discarded.
 */
export const RecordPunchV1Schema = z
  .object({
    deviceId: DeviceIdSchema,
    deviceEventId: z.string().uuid(),
    kind: PunchKindV1Schema,
    occurredAt: InstantSchema,
    timeZone: IanaTimeZoneSchema,
    siteRef: z.string().uuid().nullable().optional(),
    bookingId: z.string().uuid().nullable().optional(),
    location: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracyMeters: z.number().nonnegative().max(100_000).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    geofence: GeofenceEvidenceV1Schema.optional(),
  })
  .strict();
export type RecordPunchV1 = z.infer<typeof RecordPunchV1Schema>;

export const TimeExceptionKindV1Schema = z.enum([
  'OUT_OF_FENCE',
  'GEOFENCE_UNVERIFIED',
  'LOCATION_MISSING',
  'LATE_PUNCH',
  'AFTER_SUBMISSION',
]);
export type TimeExceptionKindV1 = z.infer<typeof TimeExceptionKindV1Schema>;

export interface PunchV1 {
  readonly id: string;
  readonly resourceId: string;
  readonly resourceName: string | null;
  readonly kind: PunchKindV1;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly workDate: string;
  readonly timeZone: string;
  readonly source: 'DEVICE' | 'CORRECTION';
  readonly siteRef: string | null;
  readonly bookingId: string | null;
  readonly geofence: GeofenceResultV1;
  readonly distanceToEdgeMeters: number | null;
  readonly late: boolean;
  readonly voided: boolean;
  readonly exceptions: readonly TimeExceptionKindV1[];
}

export const TIMESHEET_ISSUE_CODES = [
  'CLOCK_IN_WHILE_OPEN',
  'CLOCK_OUT_WITHOUT_IN',
  'BREAK_WITHOUT_SHIFT',
  'BREAK_ALREADY_STARTED',
  'BREAK_END_WITHOUT_START',
  'BREAK_NOT_ENDED',
  'SHIFT_TOO_LONG',
  'MISSING_CLOCK_OUT',
] as const;
export type TimesheetIssueCodeV1 = (typeof TIMESHEET_ISSUE_CODES)[number];

export interface TimesheetIssueV1 {
  readonly code: TimesheetIssueCodeV1;
  readonly punchId: string;
  readonly workDate: string;
}

export interface TimesheetLineV1 {
  readonly workDate: string;
  readonly clockInPunchId: string;
  readonly clockOutPunchId: string;
  readonly clockInAt: string;
  readonly clockOutAt: string;
  readonly breakMinutes: number;
  readonly workedMinutes: number;
  readonly siteRef: string | null;
  readonly bookingId: string | null;
}

export const TimesheetStatusV1Schema = z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']);
export type TimesheetStatusV1 = z.infer<typeof TimesheetStatusV1Schema>;

export interface TimesheetV1 {
  readonly id: string;
  readonly resourceId: string;
  readonly resourceName: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: TimesheetStatusV1;
  readonly workedMinutes: number;
  readonly breakMinutes: number;
  readonly submittedBy: string;
  readonly submittedAt: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly rejectionReason: string | null;
  readonly version: number;
}

export interface TimesheetDetailV1 extends TimesheetV1 {
  readonly lines: readonly TimesheetLineV1[];
}

/** The computed week: what would be submitted, what blocks it, and the stored timesheet if any. */
export interface TimesheetPreviewV1 {
  readonly resourceId: string;
  readonly resourceName: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly lines: readonly TimesheetLineV1[];
  readonly issues: readonly TimesheetIssueV1[];
  readonly openExceptions: number;
  readonly workedMinutes: number;
  readonly breakMinutes: number;
  readonly timesheet: TimesheetV1 | null;
}

/** A Monday: timesheet weeks run Monday to Sunday in the punches' local dates. */
export const TimesheetPeriodStartSchema = WorkforceDateSchema.refine((value) => new Date(`${value}T00:00:00Z`).getUTCDay() === 1, 'The week starts on a Monday.');

export const SubmitTimesheetV1Schema = z
  .object({ resourceId: z.string().uuid(), periodStart: TimesheetPeriodStartSchema })
  .strict();
export type SubmitTimesheetV1 = z.infer<typeof SubmitTimesheetV1Schema>;

export const ApproveTimesheetV1Schema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const RejectTimesheetV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(500) })
  .strict();

export const TimeCorrectionReasonV1Schema = z.enum([
  'MISSED_PUNCH',
  'DEVICE_FAULT',
  'WRONG_KIND',
  'WRONG_TIME',
  'WRONG_SITE',
  'SUPERVISOR_ADJUSTMENT',
]);
export type TimeCorrectionReasonV1 = z.infer<typeof TimeCorrectionReasonV1Schema>;

const CorrectedPunchSchema = z
  .object({
    kind: PunchKindV1Schema,
    occurredAt: InstantSchema,
    timeZone: IanaTimeZoneSchema,
    siteRef: z.string().uuid().nullable().optional(),
  })
  .strict();

/** ADD a missed punch, VOID a wrong one, or REPLACE it; always with a reason code and a note. */
export const RecordTimeCorrectionV1Schema = z
  .object({
    resourceId: z.string().uuid(),
    action: z.enum(['ADD', 'VOID', 'REPLACE']),
    punchId: z.string().uuid().optional(),
    punch: CorrectedPunchSchema.optional(),
    reasonCode: TimeCorrectionReasonV1Schema,
    note: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((value) => (value.action === 'ADD') === (value.punchId === undefined), { message: 'VOID and REPLACE name the punch; ADD does not.', path: ['punchId'] })
  .refine((value) => (value.action === 'VOID') === (value.punch === undefined), { message: 'ADD and REPLACE carry the corrected punch; VOID does not.', path: ['punch'] });
export type RecordTimeCorrectionV1 = z.infer<typeof RecordTimeCorrectionV1Schema>;

export interface TimeCorrectionV1 {
  readonly id: string;
  readonly resourceId: string;
  readonly action: 'ADD' | 'VOID' | 'REPLACE';
  readonly voidedPunchId: string | null;
  readonly newPunchId: string | null;
  readonly reasonCode: TimeCorrectionReasonV1;
  readonly note: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface TimeExceptionV1 {
  readonly id: string;
  readonly resourceId: string;
  readonly resourceName: string | null;
  readonly punchId: string | null;
  readonly workDate: string;
  readonly kind: TimeExceptionKindV1;
  readonly details: Readonly<Record<string, unknown>>;
  readonly status: 'OPEN' | 'RESOLVED';
  readonly resolution: 'ACCEPTED' | 'CORRECTED' | 'DISMISSED' | null;
  readonly resolutionNote: string | null;
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
  readonly siteRef: string | null;
  readonly version: number;
  readonly createdAt: string;
}

export const ResolveTimeExceptionV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    resolution: z.enum(['ACCEPTED', 'CORRECTED', 'DISMISSED']),
    note: z.string().trim().min(3).max(500),
  })
  .strict();
export type ResolveTimeExceptionV1 = z.infer<typeof ResolveTimeExceptionV1Schema>;

export const ListPunchesV1QuerySchema = z
  .object({ resourceId: z.string().uuid().optional(), from: WorkforceDateSchema, to: WorkforceDateSchema })
  .strict()
  .refine((value) => value.to >= value.from, { message: 'The range ends before it starts.', path: ['to'] })
  .refine((value) => Date.parse(value.to) - Date.parse(value.from) <= 62 * 86_400_000, { message: 'List at most 62 days of punches.', path: ['to'] });

export const TimesheetPreviewV1QuerySchema = z
  .object({ resourceId: z.string().uuid().optional(), periodStart: TimesheetPeriodStartSchema })
  .strict();

export const ListTimesheetsV1QuerySchema = z
  .object({
    status: TimesheetStatusV1Schema.optional(),
    periodStart: TimesheetPeriodStartSchema.optional(),
    resourceId: z.string().uuid().optional(),
  })
  .strict();

export const SearchTimeExceptionsV1Schema = z
  .object({
    status: z.enum(['OPEN', 'RESOLVED']).optional(),
    resourceId: z.string().uuid().optional(),
    from: WorkforceDateSchema.optional(),
    to: WorkforceDateSchema.optional(),
  })
  .strict();

// ─── Pay policy packs and earning lines (WI-OI-070, roadmap P8, ADR-0008) ─────────────────────────────────
/** Rules of one pack version; minutes and basis points (15000 = 1.5×) keep the arithmetic exact. */
export interface PayPolicyRulesV1 {
  /** Regular minutes per day before daily overtime; null means no daily limit. */
  readonly dailyRegularMinutes: number | null;
  /** Worked minutes per day after which double time applies; null means none. */
  readonly dailyDoubleTimeAfterMinutes: number | null;
  /** Regular minutes per week before weekly overtime (daily overtime never counts twice). */
  readonly weeklyRegularMinutes: number;
  readonly overtimeMultiplierBp: number;
  readonly doubleTimeMultiplierBp: number | null;
  /** On the seventh consecutive worked day of the week the first daily limit is overtime and the rest double time. */
  readonly seventhConsecutiveDay: boolean;
}

export interface PayPolicyPackV1 {
  readonly code: string;
  readonly version: number;
  readonly jurisdiction: string;
  readonly name: string;
  /** Reference packs are not statutory advice until validated for a named client. */
  readonly reference: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly rules: PayPolicyRulesV1;
}

const PayPackCodeSchema = z.string().regex(/^[A-Z0-9][A-Z0-9-]{1,31}$/, 'Use an upper-case pack code.');
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 currency code.');

export const SetPayRateV1Schema = z
  .object({
    resourceId: z.string().uuid(),
    packCode: PayPackCodeSchema,
    effectiveFrom: WorkforceDateSchema,
    /** Hourly rate in minor units of the currency (for example cents). */
    hourlyRateMinor: z.number().int().positive().max(100_000_000),
    currency: CurrencyCodeSchema,
  })
  .strict();
export type SetPayRateV1 = z.infer<typeof SetPayRateV1Schema>;

export interface PayRateV1 {
  readonly id: string;
  readonly resourceId: string;
  readonly resourceName: string | null;
  readonly packCode: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly hourlyRateMinor: number;
  readonly currency: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export const EARNING_CATEGORIES = [
  'REGULAR',
  'DAILY_OVERTIME',
  'DAILY_DOUBLE_TIME',
  'WEEKLY_OVERTIME',
  'SEVENTH_DAY_OVERTIME',
  'SEVENTH_DAY_DOUBLE_TIME',
] as const;
export type EarningCategoryV1 = (typeof EARNING_CATEGORIES)[number];

export interface EarningLineV1 {
  readonly lineNo: number;
  readonly resourceId: string;
  readonly resourceName: string | null;
  readonly timesheetId: string;
  readonly workDate: string;
  readonly category: EarningCategoryV1;
  readonly minutes: number;
  readonly multiplierBp: number;
  readonly hourlyRateMinor: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly packCode: string;
  readonly packVersion: number;
  /** Which rule produced the line, e.g. `US-CA-OT@1 daily>480`. */
  readonly ruleTrace: string;
}

export const PayRunStatusV1Schema = z.enum(['CALCULATED', 'APPROVED', 'VOIDED']);
export type PayRunStatusV1 = z.infer<typeof PayRunStatusV1Schema>;

export interface PayRunV1 {
  readonly id: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: PayRunStatusV1;
  readonly people: number;
  readonly lineCount: number;
  readonly totals: readonly { readonly currency: string; readonly amountMinor: number }[];
  /** SHA-256 of the canonical lines and frozen inputs. */
  readonly digest: string;
  readonly calculatedBy: string;
  readonly calculatedAt: string;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly voidReason: string | null;
  readonly version: number;
}

export interface PayRunDetailV1 extends PayRunV1 {
  readonly lines: readonly EarningLineV1[];
}

export const CalculatePayRunV1Schema = z
  .object({ requestKey: z.string().uuid(), periodStart: TimesheetPeriodStartSchema })
  .strict();
export type CalculatePayRunV1 = z.infer<typeof CalculatePayRunV1Schema>;

export const ApprovePayRunV1Schema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const VoidPayRunV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(500) })
  .strict();

export const ListPayRatesV1QuerySchema = z.object({ resourceId: z.string().uuid().optional() }).strict();
export const ListPayRunsV1QuerySchema = z
  .object({ periodStart: TimesheetPeriodStartSchema.optional(), status: PayRunStatusV1Schema.optional() })
  .strict();

/** The result of recomputing a run from its frozen inputs. */
export interface PayRunVerificationV1 {
  readonly runId: string;
  readonly storedDigest: string;
  readonly recomputedDigest: string;
  readonly identical: boolean;
}

// ─── Pay export and reconciliation (WI-OI-071, roadmap P8) ────────────────────────────────────────────────
export const PayExportFormatV1Schema = z.enum(['PAYROLL_CSV_V1']);
export type PayExportFormatV1 = z.infer<typeof PayExportFormatV1Schema>;

export const CreatePayExportV1Schema = z.object({ format: PayExportFormatV1Schema.default('PAYROLL_CSV_V1') }).strict();

const ControlTotalSchema = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().nonnegative() }).strict();

/** The target system's report after importing the file; it must match the export exactly. */
export const AcknowledgePayExportV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    targetReference: z.string().trim().min(1).max(128),
    reportedLineCount: z.number().int().nonnegative(),
    reportedTotals: z.array(ControlTotalSchema).max(20),
  })
  .strict();
export type AcknowledgePayExportV1 = z.infer<typeof AcknowledgePayExportV1Schema>;

export interface PayExportV1 {
  readonly id: string;
  readonly runId: string;
  readonly periodStart: string;
  readonly format: PayExportFormatV1;
  readonly status: 'READY' | 'ACKNOWLEDGED';
  readonly lineCount: number;
  readonly totals: readonly { readonly currency: string; readonly amountMinor: number }[];
  /** SHA-256 of the file exactly as served. */
  readonly fileSha256: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly targetReference: string | null;
  readonly acknowledgedBy: string | null;
  readonly acknowledgedAt: string | null;
  readonly version: number;
}

/** The stored file re-parsed and compared with the run, line by line and in total. */
export interface PayExportReconciliationV1 {
  readonly exportId: string;
  readonly runId: string;
  readonly fileSha256Matches: boolean;
  readonly lineCountMatches: boolean;
  readonly linesMatch: boolean;
  readonly totalsMatch: boolean;
  readonly reconciled: boolean;
  readonly lineCount: number;
  readonly totals: readonly { readonly currency: string; readonly amountMinor: number }[];
}

// ─── Phase 4: ePTW & Two-Party Shift Handover Contracts ────────────────────────

export const PermitTypeV1Schema = z.enum([
  'HOT_WORK',
  'CONFINED_SPACE',
  'LOCKOUT_TAGOUT',
  'WORKING_AT_HEIGHT',
  'ELECTRICAL_ISOLATION',
  'HAZARDOUS_CHEMICAL',
]);
export type PermitTypeV1 = z.infer<typeof PermitTypeV1Schema>;

export const PermitStatusV1Schema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
  'REJECTED',
]);
export type PermitStatusV1 = z.infer<typeof PermitStatusV1Schema>;

export const CreatePermitToWorkV1Schema = z.object({
  permitType: PermitTypeV1Schema,
  workOrderId: z.string().uuid().optional(),
  siteRef: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  hazardsIdentified: z.array(z.string()).default([]),
  ppeRequired: z.array(z.string()).default([]),
  isolationConfirmed: z.boolean().default(false),
  gasTestingRequired: z.boolean().default(false),
  gasTestResults: z.record(z.string(), z.any()).optional(),
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
  applicantName: z.string().min(1).max(200),
  applicantSignature: z.string().min(1),
  checklistSubmissionId: z.string().optional(),
});
export type CreatePermitToWorkV1 = z.infer<typeof CreatePermitToWorkV1Schema>;

export const ApprovePermitToWorkV1Schema = z.object({
  supervisorName: z.string().min(1).max(200),
  supervisorSignature: z.string().min(1),
  comments: z.string().max(1000).optional(),
});
export type ApprovePermitToWorkV1 = z.infer<typeof ApprovePermitToWorkV1Schema>;

export const PermitToWorkResponseV1Schema = z.object({
  id: z.string().uuid(),
  permitNumber: z.string(),
  permitType: PermitTypeV1Schema,
  workOrderId: z.string().uuid().nullable().optional(),
  siteRef: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
  status: PermitStatusV1Schema,
  hazardsIdentified: z.array(z.string()),
  ppeRequired: z.array(z.string()),
  isolationConfirmed: z.boolean(),
  gasTestingRequired: z.boolean(),
  validFrom: z.string(),
  validUntil: z.string(),
  applicantId: z.string(),
  applicantName: z.string(),
  supervisorId: z.string().nullable().optional(),
  supervisorName: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type PermitToWorkResponseV1 = z.infer<typeof PermitToWorkResponseV1Schema>;

export const ShiftHandoverStatusV1Schema = z.enum([
  'PENDING_COUNTERSIGN',
  'COMPLETED',
  'DISPUTED',
]);
export type ShiftHandoverStatusV1 = z.infer<typeof ShiftHandoverStatusV1Schema>;

export const CreateShiftHandoverV1Schema = z.object({
  shiftName: z.string().min(1).max(120),
  siteRef: z.string().uuid(),
  outgoingLeadName: z.string().min(1).max(200),
  outgoingSignature: z.string().min(1),
  completedWorkOrders: z.array(z.string()).default([]),
  pendingWorkOrders: z.array(z.string()).default([]),
  offlineEquipment: z.array(z.string()).default([]),
  activePermits: z.array(z.string()).default([]),
  safetyIncidentsReported: z.number().int().min(0).default(0),
  notes: z.string().max(4000).optional(),
});
export type CreateShiftHandoverV1 = z.infer<typeof CreateShiftHandoverV1Schema>;

export const CountersignShiftHandoverV1Schema = z.object({
  oncomingLeadName: z.string().min(1).max(200),
  oncomingSignature: z.string().min(1),
  remarks: z.string().max(1000).optional(),
});
export type CountersignShiftHandoverV1 = z.infer<typeof CountersignShiftHandoverV1Schema>;

export const ShiftHandoverResponseV1Schema = z.object({
  id: z.string().uuid(),
  handoverNumber: z.string(),
  shiftName: z.string(),
  siteRef: z.string().uuid(),
  status: ShiftHandoverStatusV1Schema,
  outgoingLeadId: z.string(),
  outgoingLeadName: z.string(),
  outgoingSignedAt: z.string(),
  oncomingLeadId: z.string().nullable().optional(),
  oncomingLeadName: z.string().nullable().optional(),
  oncomingSignedAt: z.string().nullable().optional(),
  completedWorkOrders: z.array(z.string()),
  pendingWorkOrders: z.array(z.string()),
  offlineEquipment: z.array(z.string()),
  activePermits: z.array(z.string()),
  safetyIncidentsReported: z.number().int(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type ShiftHandoverResponseV1 = z.infer<typeof ShiftHandoverResponseV1Schema>;

