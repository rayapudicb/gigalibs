import { z } from 'zod';

// ─── Universal organization hierarchy (WI-OI-109, ADR-0018) ──────────────────────────────────────────────────
// A tenant configures its own unit types, units and trees; nothing fixes the levels in code. Only the primary tree
// carries authority (D1); a grant covers the unit and everything below it (D2); each module entity declares who may
// own its records (D3); legal entities hold identity only (D4); place links never grant place access (D6).
// The tree changes only through immutable versions: draft → validated → submitted → approved (a second person) →
// published, and a published version is activated from an effective time. Runtime scope comes from the active version.

/** Deepest tree a version may hold (ADR-0018 threat model: bounded traversal). */
export const MAX_ORG_DEPTH = 16;
/** Most units one tenant may hold. */
export const MAX_ORG_UNITS = 50_000;
/** Most grant roots one member may hold; the signed context carries roots, never the expanded tree. */
export const MAX_ORG_GRANTS_PER_MEMBER = 200;

export const ORG_UNIT_CAPABILITIES = [
  'LEGAL_ENTITY',
  'OPERATIONAL',
  'REPORTING',
  'WORKFORCE',
  'COST_ACCOUNTING',
  'PLACE_OPERATING',
] as const;
export const OrgUnitCapabilitySchema = z.enum(ORG_UNIT_CAPABILITIES);
export type OrgUnitCapability = z.infer<typeof OrgUnitCapabilitySchema>;

const LabelSchema = z.string().trim().min(1).max(120);
export const OrgTypeCodeSchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,39}$/, 'Use capitals, digits and underscores.');
export const OrgUnitCodeSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, 'Use 1–64 letters, digits, dots, dashes or underscores.');
export const OrgTreeCodeSchema = z.string().trim().regex(/^[a-z][a-z0-9-]{0,39}$/, 'Use lower-case letters, digits or hyphens.');
const IdSchema = z.string().min(1).max(64);
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 2026-10-01.');
const TimeZoneSchema = z.string().max(64).regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/);

// ─── Unit types ──────────────────────────────────────────────────────────────

export const CreateOrgUnitTypeV1Schema = z
  .object({
    code: OrgTypeCodeSchema,
    labels: z.object({ one: LabelSchema, other: LabelSchema }).strict(),
    /** False for grouping-only types (a Region): their units hold no records and expand to their children. */
    holdsRecords: z.boolean(),
    capabilities: z.array(OrgUnitCapabilitySchema).max(ORG_UNIT_CAPABILITIES.length).default([]),
    /** Types a unit of this type may sit under; empty with allowAsRoot means top level only. */
    allowedParentTypeCodes: z.array(OrgTypeCodeSchema).max(50).default([]),
    allowAsRoot: z.boolean().default(false),
    description: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((type) => new Set(type.capabilities).size === type.capabilities.length, { message: 'List each capability once.', path: ['capabilities'] })
  .refine((type) => type.allowAsRoot || type.allowedParentTypeCodes.length > 0, {
    message: 'A type must be allowed at the top or under at least one parent type.',
    path: ['allowedParentTypeCodes'],
  });
export type CreateOrgUnitTypeV1 = z.input<typeof CreateOrgUnitTypeV1Schema>;

export const OrgUnitTypeV1Schema = z.object({
  id: IdSchema,
  code: OrgTypeCodeSchema,
  labels: z.object({ one: LabelSchema, other: LabelSchema }),
  holdsRecords: z.boolean(),
  capabilities: z.array(OrgUnitCapabilitySchema),
  allowedParentTypeCodes: z.array(OrgTypeCodeSchema),
  allowAsRoot: z.boolean(),
  description: z.string().nullable(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  version: z.number().int().positive(),
});
export type OrgUnitTypeV1 = z.infer<typeof OrgUnitTypeV1Schema>;

// ─── Units ───────────────────────────────────────────────────────────────────

const IdentifierSchema = z.object({ scheme: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(80) }).strict();

/** Legal identity only (D4): no consolidation, intercompany or tax computation here. */
export const OrgUnitLegalV1Schema = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    registrationIds: z.array(IdentifierSchema).max(10).default([]),
    taxIds: z.array(IdentifierSchema).max(10).default([]),
    country: z.string().regex(/^[A-Z]{2}$/, 'Use an ISO 3166-1 alpha-2 code.'),
    functionalCurrency: z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code.'),
  })
  .strict();

export const OrgUnitAddressV1Schema = z
  .object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(120),
    region: z.string().trim().max(120).optional(),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();

const OrgUnitFieldsSchema = z
  .object({
    typeCode: OrgTypeCodeSchema,
    code: OrgUnitCodeSchema,
    name: z.string().trim().min(1).max(200),
    effectiveFrom: DateSchema,
    effectiveTo: DateSchema.nullable().default(null),
    timeZone: TimeZoneSchema.nullable().default(null),
    contact: z.object({ email: z.string().email().max(200).optional(), phone: z.string().trim().max(40).optional() }).strict().nullable().default(null),
    managerUserId: IdSchema.nullable().default(null),
    address: OrgUnitAddressV1Schema.nullable().default(null),
    legal: OrgUnitLegalV1Schema.nullable().default(null),
  })
  .strict();

export const CreateOrgUnitV1Schema = OrgUnitFieldsSchema.refine(
  (unit) => unit.effectiveTo === null || unit.effectiveTo > unit.effectiveFrom,
  { message: 'The end date must be after the start date.', path: ['effectiveTo'] },
);
export type CreateOrgUnitV1 = z.input<typeof CreateOrgUnitV1Schema>;

export const OrgUnitV1Schema = z.object({
  id: IdSchema,
  typeId: IdSchema,
  typeCode: OrgTypeCodeSchema,
  code: OrgUnitCodeSchema,
  name: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
  effectiveFrom: DateSchema,
  effectiveTo: DateSchema.nullable(),
  timeZone: z.string().nullable(),
  contact: z.object({ email: z.string().optional(), phone: z.string().optional() }).nullable(),
  managerUserId: z.string().nullable(),
  address: OrgUnitAddressV1Schema.nullable(),
  legal: OrgUnitLegalV1Schema.nullable(),
  version: z.number().int().positive(),
});
export type OrgUnitV1 = z.infer<typeof OrgUnitV1Schema>;

// ─── Trees, versions and edges ───────────────────────────────────────────────

/** Only the PRIMARY tree carries authority (D1); ALTERNATE trees roll up for reporting, cost or legal views. */
export const OrgTreeKindSchema = z.enum(['PRIMARY', 'ALTERNATE']);
export const OrgTreePurposeSchema = z.enum(['AUTHORITY', 'REPORTING', 'COST', 'LEGAL', 'OTHER']);
export const CreateOrgTreeV1Schema = z
  .object({ code: OrgTreeCodeSchema, name: LabelSchema, kind: OrgTreeKindSchema, purpose: OrgTreePurposeSchema })
  .strict()
  .refine((tree) => (tree.kind === 'PRIMARY') === (tree.purpose === 'AUTHORITY'), {
    message: 'The primary tree is the authority tree; alternate trees report, cost or show legal structure.',
    path: ['purpose'],
  });
export type CreateOrgTreeV1 = z.infer<typeof CreateOrgTreeV1Schema>;

export const OrgHierarchyVersionStatusSchema = z.enum(['DRAFT', 'VALIDATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PUBLISHED']);
export type OrgHierarchyVersionStatus = z.infer<typeof OrgHierarchyVersionStatusSchema>;

export const OrgHierarchyEdgeV1Schema = z
  .object({ unitId: IdSchema, parentUnitId: IdSchema.nullable(), sortOrder: z.number().int().min(0).max(1_000_000).default(0) })
  .strict();
export type OrgHierarchyEdgeV1 = z.infer<typeof OrgHierarchyEdgeV1Schema>;


export const OrgHierarchyVersionV1Schema = z.object({
  id: IdSchema,
  treeId: IdSchema,
  versionNumber: z.number().int().positive(),
  status: OrgHierarchyVersionStatusSchema,
  basedOnVersionId: IdSchema.nullable(),
  checksum: z.string().nullable(),
  reason: z.string().nullable(),
  createdBy: z.string(),
  submittedBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  publishedBy: z.string().nullable(),
  lockVersion: z.number().int().positive(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
});
export type OrgHierarchyVersionV1 = z.infer<typeof OrgHierarchyVersionV1Schema>;

export const OrgVersionTransitionV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(500) })
  .strict();
export type OrgVersionTransitionV1 = z.infer<typeof OrgVersionTransitionV1Schema>;

/** Validation needs only the version the caller looked at. */
export const OrgVersionCheckV1Schema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export type OrgVersionCheckV1 = z.infer<typeof OrgVersionCheckV1Schema>;

export const ActivateOrgHierarchyV1Schema = z
  .object({
    versionId: IdSchema,
    /** When the version takes effect; now if omitted. Future times schedule it; past times are refused. */
    effectiveFrom: z.string().datetime({ offset: true }).optional(),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();
export type ActivateOrgHierarchyV1 = z.infer<typeof ActivateOrgHierarchyV1Schema>;

// ─── Place links and grants ──────────────────────────────────────────────────

/** A unit operates or owns a place (Geospatial). A link never grants place access (D6). */
export const OrgUnitPlaceLinkV1Schema = z.object({
  id: IdSchema,
  unitId: IdSchema,
  placeId: z.string().uuid(),
  relation: z.enum(['OPERATES', 'OWNS']),
  effectiveFrom: DateSchema,
  effectiveTo: DateSchema.nullable(),
});
export type OrgUnitPlaceLinkV1 = z.infer<typeof OrgUnitPlaceLinkV1Schema>;

/** A member's access to a unit and everything below it in the active primary tree (D2). */
export const OrgScopeGrantV1Schema = z.object({
  id: IdSchema,
  userId: IdSchema,
  unitId: IdSchema,
  access: z.enum(['READ', 'READ_WRITE']),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  grantedBy: z.string(),
  reason: z.string(),
  revokedAt: z.string().nullable(),
});
export type OrgScopeGrantV1 = z.infer<typeof OrgScopeGrantV1Schema>;

// ─── Ownership policy and runtime scope ──────────────────────────────────────

/** Who may own an entity's records (D3): a unit, the tenant as shared data, or either. Breaking it is refused. */
export const OrgOwnershipPolicySchema = z.enum(['UNIT', 'SHARED', 'EITHER']);
export type OrgOwnershipPolicy = z.infer<typeof OrgOwnershipPolicySchema>;

/**
 * The organization scope in a signed module context (ADR-0018 §3). It carries the member's grant roots and the active
 * primary tree version, never the expanded tree: each module expands roots from its own copy of that version and
 * refuses a version it does not hold yet. `TENANT` is tenant-wide authority; `DENIED` is an unresolvable scope.
 */
export const OrganizationScopeV2Schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('TENANT') }).strict(),
  z
    .object({
      mode: z.literal('UNITS'),
      tree_version: IdSchema,
      read_roots: z.array(IdSchema).max(MAX_ORG_GRANTS_PER_MEMBER),
      write_roots: z.array(IdSchema).max(MAX_ORG_GRANTS_PER_MEMBER),
    })
    .strict()
    .refine((scope) => new Set(scope.read_roots).size === scope.read_roots.length && new Set(scope.write_roots).size === scope.write_roots.length, {
      message: 'List each root once.',
    })
    // Writing implies reading: a write root is always a read root.
    .refine((scope) => scope.write_roots.every((root) => scope.read_roots.includes(root)), {
      message: 'Every write root is also a read root.',
      path: ['write_roots'],
    }),
  z.object({ mode: z.literal('DENIED') }).strict(),
]);
export type OrganizationScopeV2 = z.infer<typeof OrganizationScopeV2Schema>;

// ─── 109c: administration requests, queries, results and events ──────────────────────────────────────────────

const ReasonSchema = z.string().trim().min(3).max(500);
const IdempotencyKeySchema = z.string().trim().min(8).max(200);
const CursorSchema = z.string().min(1).max(128);
const LimitSchema = (max: number, fallback: number) => z.coerce.number().int().min(1).max(max).default(fallback);

export const UpdateOrgUnitTypeV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    labels: z.object({ one: LabelSchema, other: LabelSchema }).strict().optional(),
    holdsRecords: z.boolean().optional(),
    capabilities: z.array(OrgUnitCapabilitySchema).max(ORG_UNIT_CAPABILITIES.length).optional(),
    allowedParentTypeCodes: z.array(OrgTypeCodeSchema).max(50).optional(),
    allowAsRoot: z.boolean().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    reason: ReasonSchema,
  })
  .strict()
  .refine((type) => !type.capabilities || new Set(type.capabilities).size === type.capabilities.length, {
    message: 'List each capability once.',
    path: ['capabilities'],
  });
export type UpdateOrgUnitTypeV1 = z.infer<typeof UpdateOrgUnitTypeV1Schema>;

export const UpdateOrgUnitV1Schema = OrgUnitFieldsSchema.omit({ typeCode: true })
  .partial()
  .extend({
    expectedVersion: z.number().int().positive(),
    /** INACTIVE keeps the unit in its trees but grants skip it; ARCHIVED goes through archive. */
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    reason: ReasonSchema,
  })
  .strict()
  .refine((unit) => !unit.effectiveFrom || !unit.effectiveTo || unit.effectiveTo > unit.effectiveFrom, {
    message: 'The end date must be after the start date.',
    path: ['effectiveTo'],
  });
export type UpdateOrgUnitV1 = z.infer<typeof UpdateOrgUnitV1Schema>;

/** Archive or restore a unit type or unit. */
export const OrgRecordStatusChangeV1Schema = z.object({ expectedVersion: z.number().int().positive(), reason: ReasonSchema }).strict();
export type OrgRecordStatusChangeV1 = z.infer<typeof OrgRecordStatusChangeV1Schema>;

/** Opens the tree's one draft, copied from the given version or, when omitted, the tree's active version. */
export const CreateOrgDraftVersionV1Schema = z
  .object({ basedOnVersionId: IdSchema.nullable().optional(), reason: ReasonSchema.optional() })
  .strict();
export type CreateOrgDraftVersionV1 = z.infer<typeof CreateOrgDraftVersionV1Schema>;

/** Places or moves units (`upsert`) and takes units out (`remove`) of a draft in one change. */
export const UpdateOrgDraftEdgesV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    // Sized to the API's 100 kB request limit; larger trees are built in several changes.
    upsert: z.array(OrgHierarchyEdgeV1Schema).max(1_000).default([]),
    remove: z.array(IdSchema).max(1_000).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    const seen = new Set<string>();
    for (const [index, edge] of input.upsert.entries()) {
      if (seen.has(edge.unitId)) context.addIssue({ code: 'custom', path: ['upsert', index, 'unitId'], message: 'Each unit appears once in a change.' });
      seen.add(edge.unitId);
      if (edge.parentUnitId === edge.unitId) context.addIssue({ code: 'custom', path: ['upsert', index, 'parentUnitId'], message: 'A unit cannot be its own parent.' });
    }
    for (const [index, unitId] of input.remove.entries()) {
      if (seen.has(unitId)) context.addIssue({ code: 'custom', path: ['remove', index], message: 'A unit cannot be placed and removed in one change.' });
      seen.add(unitId);
    }
    if (input.upsert.length + input.remove.length === 0) context.addIssue({ code: 'custom', path: ['upsert'], message: 'Change at least one unit.' });
  });
export type UpdateOrgDraftEdgesV1 = z.infer<typeof UpdateOrgDraftEdgesV1Schema>;

export const CreateOrgScopeGrantV1Schema = z
  .object({
    userId: IdSchema,
    unitId: IdSchema,
    access: z.enum(['READ', 'READ_WRITE']),
    effectiveFrom: z.string().datetime({ offset: true }).optional(),
    effectiveTo: z.string().datetime({ offset: true }).nullable().optional(),
    reason: ReasonSchema,
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict()
  .refine((grant) => !grant.effectiveTo || !grant.effectiveFrom || Date.parse(grant.effectiveTo) > Date.parse(grant.effectiveFrom), {
    message: 'The end must be after the start.',
    path: ['effectiveTo'],
  });
export type CreateOrgScopeGrantV1 = z.infer<typeof CreateOrgScopeGrantV1Schema>;

export const RevokeOrgScopeGrantV1Schema = z.object({ reason: ReasonSchema }).strict();
export type RevokeOrgScopeGrantV1 = z.infer<typeof RevokeOrgScopeGrantV1Schema>;

export const OrgUnitListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    typeCode: OrgTypeCodeSchema.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    cursor: CursorSchema.optional(),
    limit: LimitSchema(200, 50),
  })
  .strict();
export type OrgUnitListQuery = z.infer<typeof OrgUnitListQuerySchema>;

/** One level of a version: the roots (`parentUnitId` omitted) or the children of one unit. */
export const OrgEdgeListQuerySchema = z
  .object({ parentUnitId: IdSchema.optional(), cursor: CursorSchema.optional(), limit: LimitSchema(1_000, 200) })
  .strict();
export type OrgEdgeListQuery = z.infer<typeof OrgEdgeListQuerySchema>;

export const OrgAsOfQuerySchema = z.object({ asOf: z.string().datetime({ offset: true }).optional() }).strict();
export type OrgAsOfQuery = z.infer<typeof OrgAsOfQuerySchema>;

export const OrgGrantListQuerySchema = z
  .object({
    userId: IdSchema.optional(),
    unitId: IdSchema.optional(),
    includeRevoked: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    cursor: CursorSchema.optional(),
    limit: LimitSchema(200, 100),
  })
  .strict();
export type OrgGrantListQuery = z.infer<typeof OrgGrantListQuerySchema>;

export const OrgValidationProblemCodeSchema = z.enum(['CYCLE', 'TOO_DEEP', 'ROOT_NOT_ALLOWED', 'PARENT_NOT_ALLOWED', 'UNIT_NOT_ACTIVE']);
export const OrgValidationResultV1Schema = z.object({
  valid: z.boolean(),
  status: OrgHierarchyVersionStatusSchema,
  lockVersion: z.number().int().positive(),
  problems: z.array(z.object({ code: OrgValidationProblemCodeSchema, unitId: z.string(), detail: z.string() })),
});
export type OrgValidationResultV1 = z.infer<typeof OrgValidationResultV1Schema>;

/** What activating a draft would change against the tree's active version. Lists are capped; totals are exact. */
export const OrgImpactV1Schema = z.object({
  versionId: IdSchema,
  comparedWithVersionId: IdSchema.nullable(),
  totals: z.object({ added: z.number().int(), removed: z.number().int(), moved: z.number().int(), affectedGrants: z.number().int() }),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  moved: z.array(z.object({ unitId: z.string(), fromParentUnitId: z.string().nullable(), toParentUnitId: z.string().nullable() })),
  affectedGrants: z.array(z.object({ grantId: z.string(), userId: z.string(), unitId: z.string(), access: z.enum(['READ', 'READ_WRITE']) })),
});
export type OrgImpactV1 = z.infer<typeof OrgImpactV1Schema>;

export const OrgHierarchyActivationV1Schema = z.object({
  id: IdSchema,
  treeId: IdSchema,
  versionId: IdSchema,
  effectiveFrom: z.string(),
  reason: z.string(),
  activatedBy: z.string(),
  createdAt: z.string(),
});
export type OrgHierarchyActivationV1 = z.infer<typeof OrgHierarchyActivationV1Schema>;

// Events written to the platform outbox in the same transaction as the change (AsyncAPI: docs/contracts/organization).
export const ORGANIZATION_EVENT_TYPES = [
  'organization.unit-type.changed.v1',
  'organization.unit.changed.v1',
  'organization.hierarchy.activated.v1',
  'organization.scope-grant.changed.v1',
] as const;

export const OrgUnitTypeChangedEventV1Schema = z.object({
  unitTypeId: IdSchema,
  code: OrgTypeCodeSchema,
  holdsRecords: z.boolean(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  version: z.number().int().positive(),
});
export const OrgUnitChangedEventV1Schema = z.object({
  unitId: IdSchema,
  typeCode: OrgTypeCodeSchema,
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
  version: z.number().int().positive(),
});
/** Modules fetch the version's structure and refuse contexts naming a version they do not hold yet (ADR-0018 §3). */
export const OrgHierarchyActivatedEventV1Schema = z.object({
  activationId: IdSchema,
  treeId: IdSchema,
  treeKind: OrgTreeKindSchema,
  versionId: IdSchema,
  versionNumber: z.number().int().positive(),
  checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  effectiveFrom: z.string(),
});
export const OrgScopeGrantChangedEventV1Schema = z.object({
  grantId: IdSchema,
  userId: IdSchema,
  unitId: IdSchema,
  access: z.enum(['READ', 'READ_WRITE']),
  change: z.enum(['GRANTED', 'REVOKED']),
});

// Read models returned by the administration API.
export const OrgTreeV1Schema = z.object({
  id: IdSchema,
  code: OrgTreeCodeSchema,
  name: z.string(),
  kind: OrgTreeKindSchema,
  purpose: OrgTreePurposeSchema,
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  createdAt: z.string(),
});
export type OrgTreeV1 = z.infer<typeof OrgTreeV1Schema>;

export const OrgHierarchyVersionDetailV1Schema = OrgHierarchyVersionV1Schema.extend({ unitCount: z.number().int().min(0) });
export type OrgHierarchyVersionDetailV1 = z.infer<typeof OrgHierarchyVersionDetailV1Schema>;

/** One placed unit as a tree view shows it. */
export const OrgEdgeViewV1Schema = z.object({
  unitId: IdSchema,
  parentUnitId: IdSchema.nullable(),
  sortOrder: z.number().int(),
  code: z.string(),
  name: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
  typeCode: z.string(),
  holdsRecords: z.boolean(),
  childCount: z.number().int().min(0),
});
export type OrgEdgeViewV1 = z.infer<typeof OrgEdgeViewV1Schema>;

export const OrgActiveVersionV1Schema = z.object({
  asOf: z.string(),
  activation: OrgHierarchyActivationV1Schema,
  version: OrgHierarchyVersionV1Schema,
});
export type OrgActiveVersionV1 = z.infer<typeof OrgActiveVersionV1Schema>;

export const orgPageSchema = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export type OrgPage<T> = { items: T[]; nextCursor: string | null };
