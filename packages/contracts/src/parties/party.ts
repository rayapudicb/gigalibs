import { z } from 'zod';

// ─── Enums & Value Sets ────────────────────────────────────────────────────────

export const PARTY_TYPES = ['ORGANIZATION', 'INDIVIDUAL'] as const;
export const PartyTypeSchema = z.enum(PARTY_TYPES);
export type PartyType = z.infer<typeof PartyTypeSchema>;

export const PARTY_STATUSES = ['ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED', 'MERGED'] as const;
export const PartyStatusSchema = z.enum(PARTY_STATUSES);
export type PartyStatus = z.infer<typeof PartyStatusSchema>;

export const PARTY_ROLE_TYPES = [
  'CUSTOMER',
  'SUPPLIER',
  'CONTRACTOR',
  'AGENCY',
  'CARRIER',
  'PARTNER',
] as const;
export const PartyRoleTypeSchema = z.enum(PARTY_ROLE_TYPES);
export type PartyRoleType = z.infer<typeof PartyRoleTypeSchema>;

export const PARTY_IDENTIFIER_TYPES = [
  'TAX_ID',
  'VAT',
  'DUNS',
  'REGISTRATION_NO',
  'PASSPORT',
  'NATIONAL_ID',
  'CUSTOM',
] as const;
export const PartyIdentifierTypeSchema = z.enum(PARTY_IDENTIFIER_TYPES);
export type PartyIdentifierType = z.infer<typeof PartyIdentifierTypeSchema>;

export const PARTY_CONTACT_CHANNELS = [
  'EMAIL',
  'PHONE',
  'MOBILE',
  'WEBSITE',
  'WEBHOOK',
  'OTHER',
] as const;
export const PartyContactChannelSchema = z.enum(PARTY_CONTACT_CHANNELS);
export type PartyContactChannel = z.infer<typeof PartyContactChannelSchema>;

export const PARTY_ADDRESS_TYPES = [
  'LEGAL',
  'BILLING',
  'SHIPPING',
  'SERVICE',
  'HEADQUARTERS',
  'BRANCH',
] as const;
export const PartyAddressTypeSchema = z.enum(PARTY_ADDRESS_TYPES);
export type PartyAddressType = z.infer<typeof PartyAddressTypeSchema>;

export const PARTY_RELATIONSHIP_TYPES = [
  'PARENT_SUBSIDIARY',
  'AGENCY_CLIENT',
  'CARRIER_BROKER',
  'CONTRACTOR_SUBCONTRACTOR',
  'AFFILIATE',
  'CONTACT_FOR',
] as const;
export const PartyRelationshipTypeSchema = z.enum(PARTY_RELATIONSHIP_TYPES);
export type PartyRelationshipType = z.infer<typeof PartyRelationshipTypeSchema>;

// ─── Primitive Field Validators ────────────────────────────────────────────────

export const PartyCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, 'Use 1–64 letters, digits, dots, dashes or underscores.');

const NameSchema = z.string().trim().min(1).max(255);
const ClassificationSchema = z.string().trim().max(100);
const CountryCodeSchema = z.string().trim().length(2).regex(/^[A-Z]{2}$/, 'Use ISO 3166-1 alpha-2 format.');

// ─── Canonical Entities ────────────────────────────────────────────────────────

export const PartyV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: PartyCodeSchema,
    legalName: NameSchema,
    displayName: NameSchema,
    partyType: PartyTypeSchema,
    status: PartyStatusSchema,
    classification: ClassificationSchema.optional().nullable(),
    survivorPartyId: z.string().uuid().optional().nullable(),
    version: z.number().int().nonnegative().default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    archivedAt: z.string().datetime().optional().nullable(),
    createdById: z.string().optional().nullable(),
    updatedById: z.string().optional().nullable(),
  })
  .strict();
export type PartyV1 = z.infer<typeof PartyV1Schema>;

export const PartyRoleV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    partyId: z.string().uuid(),
    roleType: PartyRoleTypeSchema,
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveTo: z.string().datetime().optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    version: z.number().int().nonnegative().default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PartyRoleV1 = z.infer<typeof PartyRoleV1Schema>;

export const PartyIdentifierV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    partyId: z.string().uuid(),
    identifierType: PartyIdentifierTypeSchema,
    value: z.string().trim().min(1).max(128),
    issuerCountry: CountryCodeSchema.optional().nullable(),
    isPrimary: z.boolean().default(false),
    isRestricted: z.boolean().default(false),
    validFrom: z.string().datetime().optional().nullable(),
    validTo: z.string().datetime().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PartyIdentifierV1 = z.infer<typeof PartyIdentifierV1Schema>;

export const PartyContactPointV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    partyId: z.string().uuid(),
    channel: PartyContactChannelSchema,
    value: z.string().trim().min(1).max(255),
    label: z.string().trim().max(100).optional().nullable(),
    isPrimary: z.boolean().default(false),
    isVerified: z.boolean().default(false),
    validFrom: z.string().datetime().optional().nullable(),
    validTo: z.string().datetime().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PartyContactPointV1 = z.infer<typeof PartyContactPointV1Schema>;

export const PartyAddressV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    partyId: z.string().uuid(),
    addressType: PartyAddressTypeSchema,
    street1: z.string().trim().min(1).max(255),
    street2: z.string().trim().max(255).optional().nullable(),
    city: z.string().trim().min(1).max(100),
    stateOrProvince: z.string().trim().max(100).optional().nullable(),
    postalCode: z.string().trim().max(32).optional().nullable(),
    countryCode: CountryCodeSchema,
    isPrimary: z.boolean().default(false),
    isVerified: z.boolean().default(false),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PartyAddressV1 = z.infer<typeof PartyAddressV1Schema>;

export const PartyRelationshipV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    fromPartyId: z.string().uuid(),
    toPartyId: z.string().uuid(),
    relationshipType: PartyRelationshipTypeSchema,
    status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).default('ACTIVE'),
    validFrom: z.string().datetime().optional().nullable(),
    validTo: z.string().datetime().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PartyRelationshipV1 = z.infer<typeof PartyRelationshipV1Schema>;

export const PartyOrgAssignmentV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    partyId: z.string().uuid(),
    orgUnitId: z.string().min(1).max(64),
    assignmentPurpose: z.string().trim().max(100).default('OPERATIONAL'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PartyOrgAssignmentV1 = z.infer<typeof PartyOrgAssignmentV1Schema>;

export const PartyExtensionSnapshotV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    partyId: z.string().uuid(),
    manifestChecksum: z.string().length(64),
    snapshotPayload: z.record(z.string(), z.unknown()),
    capturedAt: z.string().datetime(),
  })
  .strict();
export type PartyExtensionSnapshotV1 = z.infer<typeof PartyExtensionSnapshotV1Schema>;

// ─── Input DTOs & Command Schemas ──────────────────────────────────────────────

export const CreatePartyInputV1Schema = z
  .object({
    code: PartyCodeSchema,
    legalName: NameSchema,
    displayName: NameSchema.optional(),
    partyType: PartyTypeSchema,
    classification: ClassificationSchema.optional(),
    initialRoles: z.array(PartyRoleTypeSchema).optional(),
    orgUnitIds: z.array(z.string().min(1).max(64)).optional(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreatePartyInputV1 = z.infer<typeof CreatePartyInputV1Schema>;

export const UpdatePartyInputV1Schema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    legalName: NameSchema.optional(),
    displayName: NameSchema.optional(),
    status: PartyStatusSchema.optional(),
    classification: ClassificationSchema.optional(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type UpdatePartyInputV1 = z.infer<typeof UpdatePartyInputV1Schema>;

export const ArchivePartyInputV1Schema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type ArchivePartyInputV1 = z.infer<typeof ArchivePartyInputV1Schema>;

export const MergePreviewInputV1Schema = z
  .object({
    sourcePartyId: z.string().uuid(),
    targetPartyId: z.string().uuid(),
  })
  .strict();
export type MergePreviewInputV1 = z.infer<typeof MergePreviewInputV1Schema>;

export const MergePartiesInputV1Schema = z
  .object({
    sourcePartyId: z.string().uuid(),
    targetPartyId: z.string().uuid(),
    sourceExpectedVersion: z.number().int().nonnegative(),
    targetExpectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export type MergePartiesInputV1 = z.infer<typeof MergePartiesInputV1Schema>;

export const AddPartyRoleInputV1Schema = z
  .object({
    roleType: PartyRoleTypeSchema,
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type AddPartyRoleInputV1 = z.infer<typeof AddPartyRoleInputV1Schema>;

export const UpdatePartyRoleInputV1Schema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveTo: z.string().datetime().optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type UpdatePartyRoleInputV1 = z.infer<typeof UpdatePartyRoleInputV1Schema>;

export const AddPartyAddressInputV1Schema = z
  .object({
    addressType: PartyAddressTypeSchema,
    street1: z.string().trim().min(1).max(255),
    street2: z.string().trim().max(255).optional(),
    city: z.string().trim().min(1).max(100),
    stateOrProvince: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(32).optional(),
    countryCode: CountryCodeSchema,
    isPrimary: z.boolean().optional(),
  })
  .strict();
export type AddPartyAddressInputV1 = z.infer<typeof AddPartyAddressInputV1Schema>;

export const UpdatePartyAddressInputV1Schema = z
  .object({
    addressType: PartyAddressTypeSchema.optional(),
    street1: z.string().trim().min(1).max(255).optional(),
    street2: z.string().trim().max(255).optional().nullable(),
    city: z.string().trim().min(1).max(100).optional(),
    stateOrProvince: z.string().trim().max(100).optional().nullable(),
    postalCode: z.string().trim().max(32).optional().nullable(),
    countryCode: CountryCodeSchema.optional(),
    isPrimary: z.boolean().optional(),
    isVerified: z.boolean().optional(),
  })
  .strict();
export type UpdatePartyAddressInputV1 = z.infer<typeof UpdatePartyAddressInputV1Schema>;

export const AddPartyContactInputV1Schema = z
  .object({
    channel: PartyContactChannelSchema,
    value: z.string().trim().min(1).max(255),
    label: z.string().trim().max(100).optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();
export type AddPartyContactInputV1 = z.infer<typeof AddPartyContactInputV1Schema>;

export const UpdatePartyContactInputV1Schema = z
  .object({
    channel: PartyContactChannelSchema.optional(),
    value: z.string().trim().min(1).max(255).optional(),
    label: z.string().trim().max(100).optional().nullable(),
    isPrimary: z.boolean().optional(),
    isVerified: z.boolean().optional(),
  })
  .strict();
export type UpdatePartyContactInputV1 = z.infer<typeof UpdatePartyContactInputV1Schema>;

export const AddPartyIdentifierInputV1Schema = z
  .object({
    identifierType: PartyIdentifierTypeSchema,
    value: z.string().trim().min(1).max(128),
    issuerCountry: CountryCodeSchema.optional(),
    isPrimary: z.boolean().optional(),
    isRestricted: z.boolean().optional(),
    validFrom: z.string().datetime().optional(),
    validTo: z.string().datetime().optional(),
  })
  .strict();
export type AddPartyIdentifierInputV1 = z.infer<typeof AddPartyIdentifierInputV1Schema>;

export const AssignPartyOrgInputV1Schema = z
  .object({
    orgUnitId: z.string().min(1).max(64),
    assignmentPurpose: z.string().trim().max(100).optional(),
  })
  .strict();
export type AssignPartyOrgInputV1 = z.infer<typeof AssignPartyOrgInputV1Schema>;

export const PartyListQueryV1Schema = z
  .object({
    search: z.string().trim().max(100).optional(),
    partyType: PartyTypeSchema.optional(),
    roleType: PartyRoleTypeSchema.optional(),
    status: PartyStatusSchema.optional(),
    orgUnitId: z.string().min(1).max(64).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type PartyListQueryV1 = z.infer<typeof PartyListQueryV1Schema>;

export const PartyDetailResponseV1Schema = z
  .object({
    party: PartyV1Schema,
    roles: z.array(PartyRoleV1Schema),
    identifiers: z.array(PartyIdentifierV1Schema),
    contacts: z.array(PartyContactPointV1Schema),
    addresses: z.array(PartyAddressV1Schema),
    orgAssignments: z.array(PartyOrgAssignmentV1Schema),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type PartyDetailResponseV1 = z.infer<typeof PartyDetailResponseV1Schema>;

// ─── Outbox Event Schemas ──────────────────────────────────────────────────────

const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  occurredAt: z.string().datetime(),
  actorId: z.string().optional().nullable(),
  correlationId: z.string().optional().nullable(),
});

export const PartyCreatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('party.created.v1'),
  data: z.object({
    partyId: z.string().uuid(),
    code: PartyCodeSchema,
    legalName: NameSchema,
    displayName: NameSchema,
    partyType: PartyTypeSchema,
    status: PartyStatusSchema,
    classification: ClassificationSchema.optional().nullable(),
    version: z.number().int(),
  }),
}).strict();
export type PartyCreatedEventV1 = z.infer<typeof PartyCreatedEventV1Schema>;

export const PartyUpdatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('party.updated.v1'),
  data: z.object({
    partyId: z.string().uuid(),
    code: PartyCodeSchema,
    legalName: NameSchema,
    displayName: NameSchema,
    status: PartyStatusSchema,
    classification: ClassificationSchema.optional().nullable(),
    version: z.number().int(),
    previousVersion: z.number().int(),
  }),
}).strict();
export type PartyUpdatedEventV1 = z.infer<typeof PartyUpdatedEventV1Schema>;

export const PartyRoleChangedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('party.role.changed.v1'),
  data: z.object({
    partyId: z.string().uuid(),
    roleId: z.string().uuid(),
    roleType: PartyRoleTypeSchema,
    action: z.enum(['ADDED', 'UPDATED', 'REMOVED']),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  }),
}).strict();
export type PartyRoleChangedEventV1 = z.infer<typeof PartyRoleChangedEventV1Schema>;

export const PartyArchivedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('party.archived.v1'),
  data: z.object({
    partyId: z.string().uuid(),
    reason: z.string(),
    archivedAt: z.string().datetime(),
  }),
}).strict();
export type PartyArchivedEventV1 = z.infer<typeof PartyArchivedEventV1Schema>;

export const PartyMergedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('party.merged.v1'),
  data: z.object({
    sourcePartyId: z.string().uuid(),
    targetPartyId: z.string().uuid(),
    reason: z.string(),
    mergedAt: z.string().datetime(),
  }),
}).strict();
export type PartyMergedEventV1 = z.infer<typeof PartyMergedEventV1Schema>;

export type PartyEventV1 =
  | PartyCreatedEventV1
  | PartyUpdatedEventV1
  | PartyRoleChangedEventV1
  | PartyArchivedEventV1
  | PartyMergedEventV1;
