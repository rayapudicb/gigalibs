import { describe, it, expect } from 'vitest';
import {
  PRODUCT_TYPES,
  ProductTypeSchema,
  ProductV1Schema,
  CreateProductInputV1Schema,
  UomDefinitionV1Schema,
  CreateUomInputV1Schema,
  PriceListV1Schema,
  ProductPriceV1Schema,
  ProductCreatedEventV1Schema,
  CatalogueVersionPublishedEventV1Schema,
  PriceListVersionActivatedEventV1Schema,
} from './catalogue.js';

describe('Catalogue Contracts (Phase 4 / WI-OI-112)', () => {
  it('validates product types correctly', () => {
    expect(PRODUCT_TYPES).toContain('GOOD');
    expect(PRODUCT_TYPES).toContain('SERVICE');
    expect(PRODUCT_TYPES).toContain('DIGITAL');
    expect(PRODUCT_TYPES).toContain('RESOURCE');
    expect(PRODUCT_TYPES).toContain('BUNDLE');
    expect(ProductTypeSchema.safeParse('GOOD').success).toBe(true);
    expect(ProductTypeSchema.safeParse('INVALID').success).toBe(false);
  });

  it('validates CreateProductInputV1 with strict schema', () => {
    const valid = {
      code: 'PROD-001',
      name: 'Industrial Widget',
      productType: 'GOOD',
      baseUomId: '123e4567-e89b-12d3-a456-426614174000',
      isSold: true,
      isPurchased: true,
      isStocked: true,
    };
    const parsed = CreateProductInputV1Schema.safeParse(valid);
    expect(parsed.success).toBe(true);

    const withExtra = { ...valid, unknownField: 'illegal' };
    expect(CreateProductInputV1Schema.safeParse(withExtra).success).toBe(false);
  });

  it('validates ProductV1 entity schema', () => {
    const now = new Date().toISOString();
    const product = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-alpha',
      code: 'WIDGET-X',
      name: 'Widget X',
      productType: 'GOOD',
      status: 'ACTIVE',
      baseUomId: '223e4567-e89b-12d3-a456-426614174000',
      isSold: true,
      isPurchased: false,
      isStocked: true,
      dataClassification: 'INTERNAL',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const parsed = ProductV1Schema.safeParse(product);
    expect(parsed.success).toBe(true);
  });

  it('validates UomDefinition and CreateUomInput', () => {
    const input = {
      code: 'KG',
      name: 'Kilogram',
      symbol: 'kg',
      dimension: 'WEIGHT',
    };
    const parsed = CreateUomInputV1Schema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.stdPrecision).toBe(2);
      expect(parsed.data.costingPrecision).toBe(4);
    }
  });

  it('validates ProductPrice with exact decimal quantity break and integer minor units', () => {
    const price = {
      id: '323e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-alpha',
      priceListVersionId: '423e4567-e89b-12d3-a456-426614174000',
      productId: '123e4567-e89b-12d3-a456-426614174000',
      uomId: '223e4567-e89b-12d3-a456-426614174000',
      minQuantity: '10.000000',
      listPriceMinor: '1999',
      standardPriceMinor: '1799',
      limitPriceMinor: '1500',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed = ProductPriceV1Schema.safeParse(price);
    expect(parsed.success).toBe(true);
  });

  it('validates outbox events structure', () => {
    const event = {
      eventId: '523e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-alpha',
      occurredAt: new Date().toISOString(),
      type: 'product.created.v1',
      data: {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        code: 'PROD-A',
        name: 'Product A',
        productType: 'SERVICE',
        status: 'ACTIVE',
        baseUomId: '223e4567-e89b-12d3-a456-426614174000',
        version: 1,
      },
    };
    const parsed = ProductCreatedEventV1Schema.safeParse(event);
    expect(parsed.success).toBe(true);

    const catPub = {
      eventId: '623e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-alpha',
      occurredAt: new Date().toISOString(),
      type: 'catalogue.version.published.v1',
      data: {
        catalogueId: '723e4567-e89b-12d3-a456-426614174000',
        catalogueVersionId: '823e4567-e89b-12d3-a456-426614174000',
        versionNumber: 1,
        checksum: `sha256:${'a'.repeat(64)}`,
        effectiveFrom: new Date().toISOString(),
        publishedBy: 'user-admin',
      },
    };
    expect(CatalogueVersionPublishedEventV1Schema.safeParse(catPub).success).toBe(true);

    const plAct = {
      eventId: '923e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-alpha',
      occurredAt: new Date().toISOString(),
      type: 'price-list.version.activated.v1',
      data: {
        priceListId: 'a23e4567-e89b-12d3-a456-426614174000',
        priceListVersionId: 'b23e4567-e89b-12d3-a456-426614174000',
        versionNumber: 1,
        effectiveFrom: new Date().toISOString(),
        activatedBy: 'user-approver',
      },
    };
    expect(PriceListVersionActivatedEventV1Schema.safeParse(plAct).success).toBe(true);
  });

  it('validates UomDefinitionV1Schema and PriceListV1Schema', () => {
    const now = new Date().toISOString();
    const uom = {
      id: 'c23e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-alpha',
      code: 'MTR',
      name: 'Meter',
      symbol: 'm',
      dimension: 'LENGTH',
      stdPrecision: 2,
      costingPrecision: 4,
      uomType: 'PLATFORM_REFERENCE',
      isActive: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    expect(UomDefinitionV1Schema.safeParse(uom).success).toBe(true);

    const pl = {
      id: 'd23e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-alpha',
      code: 'RETAIL_USD',
      name: 'Retail Price List USD',
      currencyCode: 'USD',
      isTaxIncluded: false,
      enforcePriceLimit: true,
      pricePrecision: 2,
      isActive: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    expect(PriceListV1Schema.safeParse(pl).success).toBe(true);
  });
});
