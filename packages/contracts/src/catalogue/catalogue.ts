import { z } from 'zod';

// ─── Enums & Value Sets ────────────────────────────────────────────────────────

export const PRODUCT_TYPES = ['GOOD', 'SERVICE', 'DIGITAL', 'RESOURCE', 'BUNDLE'] as const;
export const ProductTypeSchema = z.enum(PRODUCT_TYPES);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'DISCONTINUED', 'ARCHIVED'] as const;
export const ProductStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const UOM_DIMENSIONS = ['LENGTH', 'WEIGHT', 'VOLUME', 'AREA', 'TIME', 'TEMPERATURE', 'COUNT', 'DATA', 'CURRENCY'] as const;
export const UomDimensionSchema = z.enum(UOM_DIMENSIONS);
export type UomDimension = z.infer<typeof UomDimensionSchema>;

export const PRODUCT_IDENTIFIER_TYPES = ['SKU', 'GTIN', 'UPC', 'EAN', 'BARCODE', 'MANUFACTURER', 'EXTERNAL', 'CUSTOM'] as const;
export const ProductIdentifierTypeSchema = z.enum(PRODUCT_IDENTIFIER_TYPES);
export type ProductIdentifierType = z.infer<typeof ProductIdentifierTypeSchema>;

export const PRODUCT_PARTY_ROLE_TYPES = ['MANUFACTURER', 'BRAND_OWNER', 'PREFERRED_SUPPLIER', 'DISTRIBUTOR'] as const;
export const ProductPartyRoleTypeSchema = z.enum(PRODUCT_PARTY_ROLE_TYPES);
export type ProductPartyRoleType = z.infer<typeof ProductPartyRoleTypeSchema>;

export const PRODUCT_RELATION_TYPES = ['SUBSTITUTE', 'ACCESSORY', 'COMPONENT_REF', 'RELATED', 'UPSELL', 'CROSS_SELL'] as const;
export const ProductRelationTypeSchema = z.enum(PRODUCT_RELATION_TYPES);
export type ProductRelationType = z.infer<typeof ProductRelationTypeSchema>;

export const ATTRIBUTE_VALUE_TYPES = ['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'ENUM'] as const;
export const AttributeValueTypeSchema = z.enum(ATTRIBUTE_VALUE_TYPES);
export type AttributeValueType = z.infer<typeof AttributeValueTypeSchema>;

import { DataClassificationSchema } from '../operational-intelligence/index.js';
export type DataClassification = z.infer<typeof DataClassificationSchema>;

export const CATALOGUE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'] as const;
export const CatalogueStatusSchema = z.enum(CATALOGUE_STATUSES);
export type CatalogueStatus = z.infer<typeof CatalogueStatusSchema>;

export const PRICE_LIST_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'ACTIVATED', 'SUPERSEDED', 'ARCHIVED'] as const;
export const PriceListStatusSchema = z.enum(PRICE_LIST_STATUSES);
export type PriceListStatus = z.infer<typeof PriceListStatusSchema>;

// ─── Primitive Field Validators ────────────────────────────────────────────────

export const ProductCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);

export const NameSchema = z.string().trim().min(1).max(200);

export const DescriptionSchema = z.string().trim().max(2000).optional().nullable();

export const MoneyMinorSchema = z.string().regex(/^-?\d+$/);

export const DecimalQuantitySchema = z.string().regex(/^-?\d+(\.\d{1,6})?$/);

export const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export const UomCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

// ─── Canonical Entities ────────────────────────────────────────────────────────

export const UomDefinitionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: UomCodeSchema,
    name: NameSchema,
    symbol: z.string().max(10),
    dimension: UomDimensionSchema,
    stdPrecision: z.number().int().min(0).max(12),
    costingPrecision: z.number().int().min(0).max(12),
    uomType: z.enum(['PLATFORM_REFERENCE', 'TENANT_CUSTOM']),
    isoCode: z.string().max(20).optional(),
    ucumCode: z.string().max(20).optional(),
    isActive: z.boolean(),
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })
  .strict();
export type UomDefinitionV1 = z.infer<typeof UomDefinitionV1Schema>;

export const UomConversionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    fromUomId: z.string().uuid(),
    toUomId: z.string().uuid(),
    productId: z.string().uuid().optional().nullable(),
    conversionRate: DecimalQuantitySchema,
    isActive: z.boolean(),
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveTo: z.string().datetime().optional().nullable(),
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type UomConversionV1 = z.infer<typeof UomConversionV1Schema>;

export const ProductV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: ProductCodeSchema,
    name: NameSchema,
    displayName: NameSchema.optional(),
    description: DescriptionSchema,
    productType: ProductTypeSchema,
    status: ProductStatusSchema,
    baseUomId: z.string().uuid(),
    categoryId: z.string().uuid().optional().nullable(),
    isSold: z.boolean().default(false),
    isPurchased: z.boolean().default(false),
    isStocked: z.boolean().default(false),
    dataClassification: DataClassificationSchema.default('INTERNAL'),
    version: z.number().int(),
    owningUnitId: z.string().max(64).optional().nullable(),
    orgUnitIds: z.array(z.string()).optional(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().optional(),
    updatedBy: z.string().optional(),
  })
  .strict();
export type ProductV1 = z.infer<typeof ProductV1Schema>;

export const ProductCategoryV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: ProductCodeSchema,
    name: NameSchema,
    description: DescriptionSchema,
    parentCategoryId: z.string().uuid().optional().nullable(),
    isDefault: z.boolean().default(false),
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveTo: z.string().datetime().optional().nullable(),
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProductCategoryV1 = z.infer<typeof ProductCategoryV1Schema>;

export const ProductIdentifierV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    identifierType: ProductIdentifierTypeSchema,
    value: z.string().max(128),
    issuer: z.string().max(100).optional().nullable(),
    isPrimary: z.boolean().default(false),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProductIdentifierV1 = z.infer<typeof ProductIdentifierV1Schema>;

export const ProductPartyRoleV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    partyId: z.string().uuid(),
    roleType: ProductPartyRoleTypeSchema,
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveTo: z.string().datetime().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProductPartyRoleV1 = z.infer<typeof ProductPartyRoleV1Schema>;

export const ProductUomV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    purpose: z.enum(['ORDER', 'SELL', 'PURCHASE', 'CONSUMPTION']),
    conversionRate: DecimalQuantitySchema.optional().nullable(),
    isDefault: z.boolean().default(false),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProductUomV1 = z.infer<typeof ProductUomV1Schema>;

export const AttributeDefinitionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: ProductCodeSchema,
    name: NameSchema,
    description: DescriptionSchema,
    valueType: AttributeValueTypeSchema,
    isRequired: z.boolean().default(false),
    dataClassification: DataClassificationSchema.default('INTERNAL'),
    unit: z.string().max(20).optional().nullable(),
    allowedValues: z.array(z.string()).optional(),
    minValue: DecimalQuantitySchema.optional().nullable(),
    maxValue: DecimalQuantitySchema.optional().nullable(),
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AttributeDefinitionV1 = z.infer<typeof AttributeDefinitionV1Schema>;

export const ProductAttributeValueV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    attributeDefinitionId: z.string().uuid(),
    stringValue: z.string().optional().nullable(),
    integerValue: z.number().int().optional().nullable(),
    decimalValue: DecimalQuantitySchema.optional().nullable(),
    booleanValue: z.boolean().optional().nullable(),
    dateValue: z.string().datetime().optional().nullable(),
    enumValue: z.string().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProductAttributeValueV1 = z.infer<typeof ProductAttributeValueV1Schema>;

export const ProductRelationV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    sourceProductId: z.string().uuid(),
    targetProductId: z.string().uuid(),
    relationType: ProductRelationTypeSchema,
    sortOrder: z.number().int().default(0),
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveTo: z.string().datetime().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProductRelationV1 = z.infer<typeof ProductRelationV1Schema>;

export const CatalogueV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: ProductCodeSchema,
    name: NameSchema,
    description: DescriptionSchema,
    purpose: z.string().max(100).optional().nullable(),
    audience: z.string().max(100).optional().nullable(),
    orgUnitId: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CatalogueV1 = z.infer<typeof CatalogueV1Schema>;

export const CatalogueVersionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    catalogueId: z.string().uuid(),
    versionNumber: z.number().int(),
    status: CatalogueStatusSchema,
    checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional().nullable(),
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveTo: z.string().datetime().optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    submittedAt: z.string().datetime().optional().nullable(),
    submittedBy: z.string().optional().nullable(),
    approvedAt: z.string().datetime().optional().nullable(),
    approvedBy: z.string().optional().nullable(),
    publishedAt: z.string().datetime().optional().nullable(),
    publishedBy: z.string().optional().nullable(),
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CatalogueVersionV1 = z.infer<typeof CatalogueVersionV1Schema>;

export const CatalogueEntryV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    catalogueVersionId: z.string().uuid(),
    productId: z.string().uuid(),
    sortOrder: z.number().int().default(0),
    isHighlighted: z.boolean().default(false),
    displayOverrides: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CatalogueEntryV1 = z.infer<typeof CatalogueEntryV1Schema>;

export const PriceListV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: ProductCodeSchema,
    name: NameSchema,
    description: DescriptionSchema,
    currencyCode: CurrencyCodeSchema,
    isTaxIncluded: z.boolean().default(false),
    enforcePriceLimit: z.boolean().default(true),
    pricePrecision: z.number().int().min(0).max(6).default(2),
    orgUnitId: z.string().optional().nullable(),
    audience: z.string().max(100).optional().nullable(),
    isActive: z.boolean().default(true),
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PriceListV1 = z.infer<typeof PriceListV1Schema>;

export const PriceListVersionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    priceListId: z.string().uuid(),
    versionNumber: z.number().int(),
    status: PriceListStatusSchema,
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime().optional().nullable(),
    checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    submittedAt: z.string().datetime().optional().nullable(),
    submittedBy: z.string().optional().nullable(),
    approvedAt: z.string().datetime().optional().nullable(),
    approvedBy: z.string().optional().nullable(),
    activatedAt: z.string().datetime().optional().nullable(),
    activatedBy: z.string().optional().nullable(),
    version: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PriceListVersionV1 = z.infer<typeof PriceListVersionV1Schema>;

export const ProductPriceV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    priceListVersionId: z.string().uuid(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    minQuantity: DecimalQuantitySchema.default('1'),
    listPriceMinor: MoneyMinorSchema,
    standardPriceMinor: MoneyMinorSchema,
    limitPriceMinor: MoneyMinorSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProductPriceV1 = z.infer<typeof ProductPriceV1Schema>;

export const ProductExtensionSnapshotV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    manifestChecksum: z.string().length(64),
    snapshotPayload: z.record(z.string(), z.unknown()),
    capturedAt: z.string().datetime(),
  })
  .strict();
export type ProductExtensionSnapshotV1 = z.infer<typeof ProductExtensionSnapshotV1Schema>;

export const ProductReferenceMappingV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    sourceSystem: z.string().max(100),
    sourceKey: z.string().max(255),
    sourceMetadata: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProductReferenceMappingV1 = z.infer<typeof ProductReferenceMappingV1Schema>;

export const PriceResolutionResultV1Schema = z
  .object({
    productId: z.string().uuid(),
    priceListId: z.string().uuid(),
    priceListVersionId: z.string().uuid(),
    currencyCode: CurrencyCodeSchema,
    uomId: z.string().uuid(),
    listPriceMinor: MoneyMinorSchema,
    standardPriceMinor: MoneyMinorSchema,
    limitPriceMinor: MoneyMinorSchema,
    isTaxIncluded: z.boolean(),
    effectiveFrom: z.string().datetime(),
    resolvedAt: z.string().datetime(),
    resolutionTrace: z.object({
      versionSelected: z.string(),
      precedenceRule: z.string(),
      orgScope: z.string().optional().nullable(),
      quantityBreak: z.string().optional().nullable(),
    }).strict(),
  })
  .strict();
export type PriceResolutionResultV1 = z.infer<typeof PriceResolutionResultV1Schema>;

// ─── Input DTOs ────────────────────────────────────────────────────────

export const CreateProductInputV1Schema = z
  .object({
    code: ProductCodeSchema,
    name: NameSchema,
    displayName: NameSchema.optional(),
    description: DescriptionSchema.optional(),
    productType: ProductTypeSchema,
    baseUomId: z.string().uuid(),
    categoryId: z.string().uuid().optional(),
    isSold: z.boolean(),
    isPurchased: z.boolean(),
    isStocked: z.boolean(),
    dataClassification: DataClassificationSchema.optional(),
    owningUnitId: z.string().max(64).optional().nullable(),
    orgUnitIds: z.array(z.string()).optional(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateProductInputV1 = z.infer<typeof CreateProductInputV1Schema>;

export const UpdateProductInputV1Schema = z
  .object({
    expectedVersion: z.number().int(),
    name: NameSchema.optional(),
    displayName: NameSchema.optional().nullable(),
    description: DescriptionSchema.optional().nullable(),
    status: ProductStatusSchema.optional(),
    categoryId: z.string().uuid().optional().nullable(),
    isSold: z.boolean().optional(),
    isPurchased: z.boolean().optional(),
    isStocked: z.boolean().optional(),
    dataClassification: DataClassificationSchema.optional(),
    owningUnitId: z.string().max(64).optional().nullable(),
    orgUnitIds: z.array(z.string()).optional(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type UpdateProductInputV1 = z.infer<typeof UpdateProductInputV1Schema>;

export const CreateUomInputV1Schema = z
  .object({
    code: UomCodeSchema,
    name: NameSchema,
    symbol: z.string().max(10),
    dimension: UomDimensionSchema,
    stdPrecision: z.number().int().min(0).max(12).optional().default(2),
    costingPrecision: z.number().int().min(0).max(12).optional().default(4),
    isoCode: z.string().max(20).optional(),
    ucumCode: z.string().max(20).optional(),
  })
  .strict();
export type CreateUomInputV1 = z.infer<typeof CreateUomInputV1Schema>;

export const CreateUomConversionInputV1Schema = z
  .object({
    fromUomId: z.string().uuid(),
    toUomId: z.string().uuid(),
    conversionRate: DecimalQuantitySchema,
    productId: z.string().uuid().optional().nullable(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
  })
  .strict();
export type CreateUomConversionInputV1 = z.infer<typeof CreateUomConversionInputV1Schema>;

export const CreateProductCategoryInputV1Schema = z
  .object({
    code: ProductCodeSchema,
    name: NameSchema,
    description: DescriptionSchema.optional(),
    parentCategoryId: z.string().uuid().optional().nullable(),
    isDefault: z.boolean().optional(),
  })
  .strict();
export type CreateProductCategoryInputV1 = z.infer<typeof CreateProductCategoryInputV1Schema>;

export const UpdateProductCategoryInputV1Schema = z
  .object({
    expectedVersion: z.number().int(),
    name: NameSchema.optional(),
    description: DescriptionSchema.optional().nullable(),
    parentCategoryId: z.string().uuid().optional().nullable(),
    isDefault: z.boolean().optional(),
    effectiveFrom: z.string().datetime().optional().nullable(),
    effectiveTo: z.string().datetime().optional().nullable(),
  })
  .strict();
export type UpdateProductCategoryInputV1 = z.infer<typeof UpdateProductCategoryInputV1Schema>;

export const CreateAttributeDefinitionInputV1Schema = z
  .object({
    code: ProductCodeSchema,
    name: NameSchema,
    description: DescriptionSchema.optional(),
    valueType: AttributeValueTypeSchema,
    isRequired: z.boolean().optional(),
    dataClassification: DataClassificationSchema.optional(),
    unit: z.string().max(20).optional(),
    allowedValues: z.array(z.string()).optional(),
    minValue: DecimalQuantitySchema.optional(),
    maxValue: DecimalQuantitySchema.optional(),
  })
  .strict();
export type CreateAttributeDefinitionInputV1 = z.infer<typeof CreateAttributeDefinitionInputV1Schema>;

export const CreateCatalogueInputV1Schema = z
  .object({
    code: ProductCodeSchema,
    name: NameSchema,
    description: DescriptionSchema.optional(),
    purpose: z.string().max(100).optional(),
    audience: z.string().max(100).optional(),
    orgUnitId: z.string().optional(),
  })
  .strict();
export type CreateCatalogueInputV1 = z.infer<typeof CreateCatalogueInputV1Schema>;

export const CreateCatalogueVersionInputV1Schema = z
  .object({
    notes: z.string().max(1000).optional(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
  })
  .strict();
export type CreateCatalogueVersionInputV1 = z.infer<typeof CreateCatalogueVersionInputV1Schema>;

export const AddCatalogueEntryInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    sortOrder: z.number().int().optional(),
    isHighlighted: z.boolean().optional(),
    displayOverrides: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type AddCatalogueEntryInputV1 = z.infer<typeof AddCatalogueEntryInputV1Schema>;

export const CreatePriceListInputV1Schema = z
  .object({
    code: ProductCodeSchema,
    name: NameSchema,
    description: DescriptionSchema.optional(),
    currencyCode: CurrencyCodeSchema,
    isTaxIncluded: z.boolean().optional(),
    enforcePriceLimit: z.boolean().optional(),
    pricePrecision: z.number().int().min(0).max(6).optional(),
    orgUnitId: z.string().optional(),
    audience: z.string().max(100).optional(),
  })
  .strict();
export type CreatePriceListInputV1 = z.infer<typeof CreatePriceListInputV1Schema>;

export const CreatePriceListVersionInputV1Schema = z
  .object({
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime().optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict()
  .refine((value) => !value.effectiveTo || value.effectiveTo > value.effectiveFrom, {
    message: 'effectiveTo must be after effectiveFrom',
    path: ['effectiveTo'],
  });
export type CreatePriceListVersionInputV1 = z.infer<typeof CreatePriceListVersionInputV1Schema>;

export const SetProductPriceInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    minQuantity: DecimalQuantitySchema.optional().default('1'),
    listPriceMinor: MoneyMinorSchema,
    standardPriceMinor: MoneyMinorSchema,
    limitPriceMinor: MoneyMinorSchema,
  })
  .strict();
export type SetProductPriceInputV1 = z.infer<typeof SetProductPriceInputV1Schema>;

export const ResolvePriceInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    uomId: z.string().uuid().optional(),
    quantity: DecimalQuantitySchema.optional().default('1'),
    currencyCode: CurrencyCodeSchema.optional(),
    orgUnitId: z.string().optional().nullable(),
    effectiveAt: z.string().datetime().optional(),
    audience: z.string().optional(),
  })
  .strict();
export type ResolvePriceInputV1 = z.infer<typeof ResolvePriceInputV1Schema>;

// ─── Outbox Event Schemas ──────────────────────────────────────────────────────

const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  occurredAt: z.string().datetime(),
  actorId: z.string().optional().nullable(),
  correlationId: z.string().optional().nullable(),
});

export const ProductCreatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('product.created.v1'),
  data: z.object({
    productId: z.string().uuid(),
    code: ProductCodeSchema,
    name: NameSchema,
    productType: ProductTypeSchema,
    status: ProductStatusSchema,
    baseUomId: z.string().uuid(),
    version: z.number().int(),
  }),
}).strict();
export type ProductCreatedEventV1 = z.infer<typeof ProductCreatedEventV1Schema>;

export const ProductUpdatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('product.updated.v1'),
  data: z.object({
    productId: z.string().uuid(),
    code: ProductCodeSchema,
    name: NameSchema,
    status: ProductStatusSchema,
    version: z.number().int(),
    previousVersion: z.number().int(),
  }),
}).strict();
export type ProductUpdatedEventV1 = z.infer<typeof ProductUpdatedEventV1Schema>;

export const ProductArchivedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('product.archived.v1'),
  data: z.object({
    productId: z.string().uuid(),
    reason: z.string(),
    archivedAt: z.string().datetime(),
  }),
}).strict();
export type ProductArchivedEventV1 = z.infer<typeof ProductArchivedEventV1Schema>;

export const ProductCategoryChangedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('product.category.changed.v1'),
  data: z.object({
    productId: z.string().uuid(),
    previousCategoryId: z.string().uuid().optional().nullable(),
    newCategoryId: z.string().uuid(),
  }),
}).strict();
export type ProductCategoryChangedEventV1 = z.infer<typeof ProductCategoryChangedEventV1Schema>;

export const CatalogueVersionPublishedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('catalogue.version.published.v1'),
  data: z.object({
    catalogueId: z.string().uuid(),
    catalogueVersionId: z.string().uuid(),
    versionNumber: z.number().int(),
    checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    effectiveFrom: z.string().datetime(),
    publishedBy: z.string(),
  }),
}).strict();
export type CatalogueVersionPublishedEventV1 = z.infer<typeof CatalogueVersionPublishedEventV1Schema>;

export const PriceListVersionActivatedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('price-list.version.activated.v1'),
  data: z.object({
    priceListId: z.string().uuid(),
    priceListVersionId: z.string().uuid(),
    versionNumber: z.number().int(),
    effectiveFrom: z.string().datetime(),
    activatedBy: z.string(),
  }),
}).strict();
export type PriceListVersionActivatedEventV1 = z.infer<typeof PriceListVersionActivatedEventV1Schema>;

export const UomConversionChangedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('uom.conversion.changed.v1'),
  data: z.object({
    conversionId: z.string().uuid(),
    fromUomId: z.string().uuid(),
    toUomId: z.string().uuid(),
    conversionRate: DecimalQuantitySchema,
    action: z.enum(['CREATED', 'UPDATED', 'DEACTIVATED']),
  }),
}).strict();
export type UomConversionChangedEventV1 = z.infer<typeof UomConversionChangedEventV1Schema>;

export type CatalogueEventV1 =
  | ProductCreatedEventV1
  | ProductUpdatedEventV1
  | ProductArchivedEventV1
  | ProductCategoryChangedEventV1
  | CatalogueVersionPublishedEventV1
  | PriceListVersionActivatedEventV1
  | UomConversionChangedEventV1;
