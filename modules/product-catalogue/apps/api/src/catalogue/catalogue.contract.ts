import { z } from 'zod';

export const ListProductsQueryV1 = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'DISCONTINUED', 'ARCHIVED']).optional(),
  productType: z.enum(['GOOD', 'SERVICE', 'DIGITAL', 'RESOURCE', 'BUNDLE']).optional(),
  cursor: z.string().max(600).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const IdempotencyKeyV1 = z.string().uuid();

export const ProductImportPreviewV1 = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
}).strict();

export const ProductImportCommitV1 = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
}).strict();

export const ProductReferenceInputV1 = z.object({
  sourceSystem: z.string().trim().min(1).max(100),
  sourceKey: z.string().trim().min(1).max(255),
  sourceMetadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const UomResolveInputV1 = z.object({
  fromUomId: z.string().uuid(),
  toUomId: z.string().uuid(),
  quantity: z.string().regex(/^-?\d+(\.\d{1,12})?$/),
  productId: z.string().uuid().optional(),
  effectiveAt: z.string().datetime().optional(),
}).strict();

export const VersionTransitionInputV1 = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const AddCatalogueEntryV1 = z.object({
  productId: z.string().uuid(),
  sortOrder: z.number().int().min(0).default(0),
  isHighlighted: z.boolean().default(false),
  displayOverrides: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const ProductArchiveInputV1 = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
}).strict();
