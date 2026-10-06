import { createHash, randomUUID } from 'node:crypto';
import {
  type CreateAttributeDefinitionInputV1,
  type CreateCatalogueInputV1,
  type CreateCatalogueVersionInputV1,
  type CreatePriceListInputV1,
  type CreatePriceListVersionInputV1,
  CreateProductInputV1Schema,
  type CreateProductCategoryInputV1,
  type CreateProductInputV1,
  type CreateUomConversionInputV1,
  type CreateUomInputV1,
  type ResolvePriceInputV1,
  type SetProductPriceInputV1,
  type UpdateProductCategoryInputV1,
  type UpdateProductInputV1,
} from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  type ModulePrincipal,
  OrganizationReplica,
  OrganizationScopeRefusal,
  OrganizationVersionPendingError,
  assertOrganizationWrite,
  assertOwningUnit,
  moduleErrors,
  organizationAccess,
  recordMutation,
} from '@gigalibs/module-sdk';
import {
  evaluateDictionaryCondition,
  validateDictionaryRules,
} from '@gigalibs/configuration-core';
import type { DictionaryValidationRuleV1 } from '@gigalibs/contracts';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type pg from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';

export const errors = moduleErrors('PRODUCT_CATALOGUE', 'Product Catalogue');

/**
 * Validates custom extension fields against Application Dictionary constraints and Safe AST rules.
 */
export function validateCustomExtensions(
  extensions: Record<string, unknown> | undefined,
  rules: readonly DictionaryValidationRuleV1[] = [],
): void {
  if (!extensions) return;
  if (typeof extensions !== 'object' || Array.isArray(extensions)) {
    throw new BadRequestException('Custom extensions must be a JSON object.');
  }
  if (
    Object.prototype.hasOwnProperty.call(extensions, '__proto__') ||
    (Object.getPrototypeOf(extensions) !== Object.prototype && Object.getPrototypeOf(extensions) !== null)
  ) {
    throw new BadRequestException('Extension key "__proto__" is prohibited.');
  }
  const propNames = Object.getOwnPropertyNames(extensions);
  if (propNames.length > 100) {
    throw new BadRequestException('Custom extensions exceed maximum limit of 100 fields.');
  }
  for (const key of propNames) {
    if (key.length > 100) {
      throw new BadRequestException(`Extension key "${key}" exceeds maximum length of 100 characters.`);
    }
    if (key.startsWith('__') || key === 'constructor' || key === 'prototype') {
      throw new BadRequestException(`Extension key "${key}" is prohibited.`);
    }
    const val = extensions[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      validateCustomExtensions(val as Record<string, unknown>, rules);
    }
  }
  if (rules.length > 0) {
    const errorMap = validateDictionaryRules(rules, extensions);
    const errKeys = Object.keys(errorMap);
    if (errKeys.length > 0) {
      throw new BadRequestException(
        `Application Dictionary validation failed: ${errKeys.map((k) => `${k}: ${errorMap[k]}`).join(', ')}`,
      );
    }
  }
}

export const productColumns = `p.id, p.tenant_id, p.owning_unit_id, p.code, p.name, p.display_name, p.description,
  p.product_type, p.status, p.base_uom_id, p.category_id, p.sold, p.purchased, p.stocked,
  p.data_classification, p.extensions, p.version, p.created_by, p.updated_by, p.created_at, p.updated_at,
  COALESCE((SELECT array_agg(a.unit_id ORDER BY a.unit_id) FROM ${SCHEMA}.product_org_availability a
    WHERE a.tenant_id = p.tenant_id AND a.product_id = p.id), ARRAY[]::varchar[]) AS org_unit_ids`;

type Client = pg.PoolClient;
/** The caller's organization access: which units they may read and write (null: all of them). */
export type CatalogueAccess = Awaited<ReturnType<typeof organizationAccess>>;
type Access = CatalogueAccess;
type ListQuery = { search?: string; status?: string; productType?: string; cursor?: string; limit: number };

interface ProductRow extends pg.QueryResultRow {
  id: string; tenant_id: string; owning_unit_id: string | null; code: string; name: string;
  display_name: string | null; description: string | null; product_type: string; status: string;
  base_uom_id: string; category_id: string | null; sold: boolean; purchased: boolean; stocked: boolean;
  data_classification: string; extensions: Record<string, unknown>; version: number;
  created_by: string; updated_by: string; created_at: Date; updated_at: Date; org_unit_ids: string[];
}

interface VersionRow extends pg.QueryResultRow {
  id: string; status: string; version: number; created_by: string; submitted_by: string | null;
  approved_by: string | null; catalogue_id?: string; price_list_id?: string;
}

@Injectable()
export class CatalogueService {
  private readonly organization = new OrganizationReplica(SCHEMA);

  constructor(private readonly database: DatabaseService) {}

  /**
   * WI-OI-120g (U7): runs a read for the metadata windows in the caller's tenant transaction with their organization
   * access, the same access every list route here applies.
   */
  readWithAccess<T>(principal: ModulePrincipal, read: (client: Client, access: CatalogueAccess) => Promise<T>): Promise<T> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => read(client, await this.resolveAccess(client, principal)));
  }

  async listProducts(principal: ModulePrincipal, query: ListQuery) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.resolveAccess(client, principal);
      const values: unknown[] = [principal.tenantId];
      const conditions = ['p.tenant_id = $1'];
      if (access.denied) conditions.push('FALSE');
      else if (access.readUnits !== null) {
        values.push([...access.readUnits]);
        const slot = `$${values.length}`;
        conditions.push(`(p.owning_unit_id IS NULL OR p.owning_unit_id = ANY(${slot}::varchar[]))`);
        conditions.push(`(NOT EXISTS (SELECT 1 FROM ${SCHEMA}.product_org_availability aa WHERE aa.tenant_id = p.tenant_id AND aa.product_id = p.id)
          OR EXISTS (SELECT 1 FROM ${SCHEMA}.product_org_availability aa WHERE aa.tenant_id = p.tenant_id AND aa.product_id = p.id AND aa.unit_id = ANY(${slot}::varchar[])))`);
      }
      if (query.search) {
        values.push(`%${query.search.toLocaleLowerCase('en-US')}%`);
        conditions.push(`(lower(p.name) LIKE $${values.length} OR lower(p.code) LIKE $${values.length})`);
      }
      if (query.status) { values.push(query.status); conditions.push(`p.status = $${values.length}`); }
      if (query.productType) { values.push(query.productType); conditions.push(`p.product_type = $${values.length}`); }
      if (query.cursor) {
        const [name, id] = this.decodeCursor(query.cursor);
        values.push(name, id);
        conditions.push(`(lower(p.name), p.id) > ($${values.length - 1}, $${values.length}::uuid)`);
      }
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM ${SCHEMA}.products p WHERE ${conditions.join(' AND ')}`,
        values,
      );
      values.push(query.limit + 1);
      const found = await client.query<ProductRow>(
        `SELECT ${productColumns} FROM ${SCHEMA}.products p WHERE ${conditions.join(' AND ')}
          ORDER BY lower(p.name), p.id LIMIT $${values.length}`,
        values,
      );
      const hasMore = found.rows.length > query.limit;
      const rows = found.rows.slice(0, query.limit);
      const last = rows.at(-1);
      return {
        items: rows.map(mapProduct),
        totalCount: count.rows[0]?.total ?? 0,
        nextCursor: hasMore && last ? this.encodeCursor(last.name.toLocaleLowerCase('en-US'), last.id) : null,
      };
    });
  }

  async getProduct(principal: ModulePrincipal, id: string) {
    errors.assertUuid(id, 'productId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.resolveAccess(client, principal);
      const row = await this.visibleProduct(client, principal.tenantId, access, id);
      return row ? mapProduct(row) : errors.notFound('Product');
    });
  }

  async createProduct(context: ModuleCommandContext, input: CreateProductInputV1, key: string) {
    if (input.customExtensions) {
      validateCustomExtensions(input.customExtensions);
    }
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'CREATE_PRODUCT', key, input);
      if (replay) return { result: replay, replayed: true };
      const access = await this.resolveAccess(client, context.principal);
      await this.assertOwnership(client, context.principal, access, input.owningUnitId ?? null, input.orgUnitIds ?? []);
      const id = randomUUID();
      try {
        const inserted = await client.query<ProductRow>(
          `INSERT INTO ${SCHEMA}.products
            (id, tenant_id, owning_unit_id, code, name, display_name, description, product_type, status,
             base_uom_id, category_id, sold, purchased, stocked, data_classification, extensions, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$16)
           RETURNING id, tenant_id, owning_unit_id, code, name, display_name, description, product_type, status,
             base_uom_id, category_id, sold, purchased, stocked, data_classification, extensions, version,
             created_by, updated_by, created_at, updated_at, ARRAY[]::varchar[] AS org_unit_ids`,
          [id, context.principal.tenantId, input.owningUnitId ?? null, input.code, input.name, input.displayName ?? null,
            input.description ?? null, input.productType, input.baseUomId, input.categoryId ?? null, input.isSold,
            input.isPurchased, input.isStocked, input.dataClassification ?? 'INTERNAL',
            JSON.stringify(input.customExtensions ?? {}), context.principal.subject],
        );
        await this.replaceAvailability(client, context, id, input.orgUnitIds ?? []);
        const product = { ...mapProduct(inserted.rows[0]!), orgUnitIds: [...(input.orgUnitIds ?? [])] };
        await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
          action: 'PRODUCT_CREATED', aggregateType: 'product', aggregateId: id, aggregateVersion: 1,
          payload: safeProductFact(product),
        });
        await this.saveReplay(client, context, 'CREATE_PRODUCT', key, input, product, 201);
        return { result: product, replayed: false };
      } catch (error) {
        return errors.translateConstraint(error, { unique: 'A product with this code already exists.', reference: 'The category or base UOM is not available in this tenant.' });
      }
    });
  }

  async updateProduct(context: ModuleCommandContext, id: string, input: UpdateProductInputV1) {
    errors.assertUuid(id, 'productId');
    if (input.customExtensions !== undefined) {
      validateCustomExtensions(input.customExtensions);
    }
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const access = await this.resolveAccess(client, context.principal);
      const current = await this.visibleProduct(client, context.principal.tenantId, access, id, true);
      if (!current) return errors.notFound('Product');
      await this.assertOwnership(
        client, context.principal, access,
        input.owningUnitId === undefined ? current.owning_unit_id : input.owningUnitId,
        input.orgUnitIds ?? current.org_unit_ids,
      );
      const updated = await client.query<ProductRow>(
        `UPDATE ${SCHEMA}.products p SET
           owning_unit_id = CASE WHEN $4::boolean THEN $5 ELSE owning_unit_id END, name = COALESCE($6, name),
           display_name = CASE WHEN $7::boolean THEN $8 ELSE display_name END,
           description = CASE WHEN $9::boolean THEN $10 ELSE description END,
           status = COALESCE($11, status), category_id = CASE WHEN $12::boolean THEN $13::uuid ELSE category_id END,
           sold = COALESCE($14, sold), purchased = COALESCE($15, purchased), stocked = COALESCE($16, stocked),
           data_classification = COALESCE($17, data_classification), extensions = COALESCE($18::jsonb, extensions),
           version = version + 1, updated_by = $19, updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND version = $3
         RETURNING id, tenant_id, owning_unit_id, code, name, display_name, description, product_type, status,
           base_uom_id, category_id, sold, purchased, stocked, data_classification, extensions, version,
           created_by, updated_by, created_at, updated_at, ARRAY[]::varchar[] AS org_unit_ids`,
        [context.principal.tenantId, id, input.expectedVersion, 'owningUnitId' in input, input.owningUnitId ?? null, input.name ?? null,
          'displayName' in input, input.displayName ?? null, 'description' in input, input.description ?? null,
          input.status ?? null, 'categoryId' in input, input.categoryId ?? null, input.isSold ?? null,
          input.isPurchased ?? null, input.isStocked ?? null, input.dataClassification ?? null,
          input.customExtensions === undefined ? null : JSON.stringify(input.customExtensions), context.principal.subject],
      );
      const row = updated.rows[0];
      if (!row) return errors.versionConflict('Product');
      if (input.orgUnitIds !== undefined) await this.replaceAvailability(client, context, id, input.orgUnitIds);
      const product = { ...mapProduct(row), orgUnitIds: input.orgUnitIds ?? current.org_unit_ids };
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'PRODUCT_UPDATED', aggregateType: 'product', aggregateId: id, aggregateVersion: product.version,
        payload: safeProductFact(product),
      });
      return product;
    });
  }

  async setProductArchive(context: ModuleCommandContext, id: string, expectedVersion: number, reason: string, restore: boolean) {
    errors.assertUuid(id, 'productId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const access = await this.resolveAccess(client, context.principal);
      const current = await this.visibleProduct(client, context.principal.tenantId, access, id, true);
      if (!current) return errors.notFound('Product');
      this.assertWrite(access, current.owning_unit_id);
      const status = restore ? 'DRAFT' : 'ARCHIVED';
      const updated = await client.query<ProductRow>(
        `UPDATE ${SCHEMA}.products p SET status = $4, archived_at = $5, version = version + 1,
           updated_by = $6, updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND version = $3
         RETURNING ${productColumns}`,
        [context.principal.tenantId, id, expectedVersion, status, restore ? null : new Date(), context.principal.subject],
      );
      if (!updated.rows[0]) return errors.versionConflict('Product');
      const product = mapProduct(updated.rows[0]);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: restore ? 'PRODUCT_RESTORED' : 'PRODUCT_ARCHIVED', aggregateType: 'product', aggregateId: id,
        aggregateVersion: product.version, payload: { reason, status },
      });
      return product;
    });
  }

  async listUoms(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(`SELECT * FROM ${SCHEMA}.uom_definitions WHERE tenant_id = $1 ORDER BY code`, [principal.tenantId]);
      return { items: result.rows.map(mapUom) };
    });
  }

  async createUom(context: ModuleCommandContext, input: CreateUomInputV1, key: string) {
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'CREATE_UOM', key, input);
      if (replay) return { result: replay, replayed: true };
      const access = await this.resolveAccess(client, context.principal);
      this.assertWrite(access, null);
      const id = randomUUID();
      try {
        const inserted = await client.query(
          `INSERT INTO ${SCHEMA}.uom_definitions
            (id, tenant_id, code, name, symbol, dimension, standard_precision, costing_precision, iso_code, ucum_code, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,
          [id, context.principal.tenantId, input.code, input.name, input.symbol, input.dimension,
            input.stdPrecision, input.costingPrecision, input.isoCode ?? null, input.ucumCode ?? null, context.principal.subject],
        );
        const uom = mapUom(inserted.rows[0]);
        await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
          action: 'UOM_CREATED', aggregateType: 'uom', aggregateId: id, aggregateVersion: 1,
          payload: { code: input.code, dimension: input.dimension },
        });
        await this.saveReplay(client, context, 'CREATE_UOM', key, input, uom, 201);
        return { result: uom, replayed: false };
      } catch (error) {
        return errors.translateConstraint(error, { unique: 'A UOM with this code already exists.' });
      }
    });
  }

  async createConversion(context: ModuleCommandContext, input: CreateUomConversionInputV1, key: string) {
    if (input.fromUomId === input.toUomId) throw new BadRequestException('A UOM cannot convert to itself.');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'CREATE_UOM_CONVERSION', key, input);
      if (replay) return { result: replay, replayed: true };
      const access = await this.resolveAccess(client, context.principal);
      this.assertWrite(access, null);
      const uoms = await client.query<{ id: string; dimension: string }>(
        `SELECT id, dimension FROM ${SCHEMA}.uom_definitions WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND active`,
        [context.principal.tenantId, [input.fromUomId, input.toUomId]],
      );
      if (uoms.rowCount !== 2) return errors.notFound('Unit of measure');
      if (!input.productId && uoms.rows[0]?.dimension !== uoms.rows[1]?.dimension)
        throw new BadRequestException('Universal conversions require matching UOM dimensions.');
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.uom_conversions
          (id, tenant_id, from_uom_id, to_uom_id, product_id, conversion_rate, effective_from, effective_to, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [id, context.principal.tenantId, input.fromUomId, input.toUomId, input.productId ?? null,
          input.conversionRate, input.effectiveFrom ?? null, input.effectiveTo ?? null, context.principal.subject],
      );
      const conversion = mapConversion(inserted.rows[0]);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'UOM_CONVERSION_CREATED', aggregateType: 'uom_conversion', aggregateId: id, aggregateVersion: 1,
        payload: { fromUomId: input.fromUomId, toUomId: input.toUomId, productId: input.productId ?? null },
      });
      await this.saveReplay(client, context, 'CREATE_UOM_CONVERSION', key, input, conversion, 201);
      return { result: conversion, replayed: false };
    });
  }

  async resolveConversion(principal: ModulePrincipal, input: { fromUomId: string; toUomId: string; quantity: string; productId?: string; effectiveAt?: string }) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const instant = input.effectiveAt ?? new Date().toISOString();
      const found = await client.query<{ id: string; conversion_rate: string }>(
        `SELECT id, conversion_rate::text FROM ${SCHEMA}.uom_conversions
          WHERE tenant_id = $1 AND from_uom_id = $2 AND to_uom_id = $3 AND active
            AND (product_id = $4 OR product_id IS NULL)
            AND (effective_from IS NULL OR effective_from <= $5::timestamptz)
            AND (effective_to IS NULL OR effective_to > $5::timestamptz)
          ORDER BY (product_id IS NOT NULL) DESC, effective_from DESC NULLS LAST, id LIMIT 1`,
        [principal.tenantId, input.fromUomId, input.toUomId, input.productId ?? null, instant],
      );
      const row = found.rows[0];
      if (!row) return errors.notFound('UOM conversion');
      const resultQuantity = multiplyDecimals(input.quantity, row.conversion_rate, 12);
      return { conversionId: row.id, fromUomId: input.fromUomId, toUomId: input.toUomId, inputQuantity: input.quantity, conversionRate: row.conversion_rate, resultQuantity, effectiveAt: instant };
    });
  }

  async listCategories(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(`SELECT * FROM ${SCHEMA}.product_categories WHERE tenant_id = $1 ORDER BY name, id`, [principal.tenantId]);
      return { items: result.rows.map(mapCategory) };
    });
  }

  async createCategory(context: ModuleCommandContext, input: CreateProductCategoryInputV1, key: string) {
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'CREATE_CATEGORY', key, input);
      if (replay) return { result: replay, replayed: true };
      const access = await this.resolveAccess(client, context.principal);
      this.assertWrite(access, null);
      const id = randomUUID();
      try {
        const inserted = await client.query(
          `INSERT INTO ${SCHEMA}.product_categories
            (id, tenant_id, code, name, description, parent_category_id, default_category, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
          [id, context.principal.tenantId, input.code, input.name, input.description ?? null,
            input.parentCategoryId ?? null, input.isDefault ?? false, context.principal.subject],
        );
        const category = mapCategory(inserted.rows[0]);
        await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
          action: 'CATEGORY_CREATED', aggregateType: 'product_category', aggregateId: id, aggregateVersion: 1,
          payload: { code: input.code, parentCategoryId: input.parentCategoryId ?? null },
        });
        await this.saveReplay(client, context, 'CREATE_CATEGORY', key, input, category, 201);
        return { result: category, replayed: false };
      } catch (error) {
        return errors.translateConstraint(error, { unique: 'A category with this code already exists.', reference: 'The parent category is not available.' });
      }
    });
  }

  async updateCategory(context: ModuleCommandContext, id: string, input: UpdateProductCategoryInputV1) {
    errors.assertUuid(id, 'categoryId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const access = await this.resolveAccess(client, context.principal);
      this.assertWrite(access, null);
      if (input.parentCategoryId) {
        const cycle = await client.query(
          `WITH RECURSIVE descendants AS (
             SELECT id FROM ${SCHEMA}.product_categories WHERE tenant_id = $1 AND parent_category_id = $2
             UNION ALL SELECT c.id FROM ${SCHEMA}.product_categories c JOIN descendants d ON c.parent_category_id = d.id WHERE c.tenant_id = $1
           ) SELECT 1 FROM descendants WHERE id = $3 LIMIT 1`,
          [context.principal.tenantId, id, input.parentCategoryId],
        );
        if (input.parentCategoryId === id || cycle.rowCount) throw new BadRequestException('Category hierarchy cannot contain a cycle.');
      }
      const updated = await client.query(
        `UPDATE ${SCHEMA}.product_categories SET
          name = COALESCE($4,name), description = CASE WHEN $5::boolean THEN $6 ELSE description END,
          parent_category_id = CASE WHEN $7::boolean THEN $8::uuid ELSE parent_category_id END,
          default_category = COALESCE($9,default_category), effective_from = CASE WHEN $10::boolean THEN $11::timestamptz ELSE effective_from END,
          effective_to = CASE WHEN $12::boolean THEN $13::timestamptz ELSE effective_to END,
          version = version + 1, updated_by = $14, updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND version = $3 RETURNING *`,
        [context.principal.tenantId, id, input.expectedVersion, input.name ?? null, 'description' in input,
          input.description ?? null, 'parentCategoryId' in input, input.parentCategoryId ?? null, input.isDefault ?? null,
          'effectiveFrom' in input, input.effectiveFrom ?? null, 'effectiveTo' in input, input.effectiveTo ?? null,
          context.principal.subject],
      );
      if (!updated.rows[0]) return errors.versionConflict('Category');
      const category = mapCategory(updated.rows[0]);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'CATEGORY_UPDATED', aggregateType: 'product_category', aggregateId: id,
        aggregateVersion: category.version, payload: { parentCategoryId: category.parentCategoryId },
      });
      return category;
    });
  }

  async listAttributes(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(`SELECT * FROM ${SCHEMA}.attribute_definitions WHERE tenant_id = $1 ORDER BY code`, [principal.tenantId]);
      return { items: result.rows.map(mapAttribute) };
    });
  }

  async createAttribute(context: ModuleCommandContext, input: CreateAttributeDefinitionInputV1, key: string) {
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'CREATE_ATTRIBUTE', key, input);
      if (replay) return { result: replay, replayed: true };
      const access = await this.resolveAccess(client, context.principal);
      this.assertWrite(access, null);
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.attribute_definitions
          (id,tenant_id,code,name,description,value_type,required,data_classification,unit,allowed_values,minimum,maximum,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11,$12,$13,$13) RETURNING *`,
        [id, context.principal.tenantId, input.code, input.name, input.description ?? null, input.valueType,
          input.isRequired ?? false, input.dataClassification ?? 'INTERNAL', input.unit ?? null,
          input.allowedValues ?? [], input.minValue ?? null, input.maxValue ?? null, context.principal.subject],
      );
      const attribute = mapAttribute(inserted.rows[0]);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'ATTRIBUTE_CREATED', aggregateType: 'attribute_definition', aggregateId: id,
        aggregateVersion: 1, payload: { code: input.code, valueType: input.valueType },
      });
      await this.saveReplay(client, context, 'CREATE_ATTRIBUTE', key, input, attribute, 201);
      return { result: attribute, replayed: false };
    });
  }

  async listCatalogues(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.resolveAccess(client, principal);
      const result = await client.query(
        `SELECT * FROM ${SCHEMA}.catalogues WHERE tenant_id = $1
          AND ($2::boolean OR owning_unit_id IS NULL OR owning_unit_id = ANY($3::varchar[])) ORDER BY name, id`,
        [principal.tenantId, access.readUnits === null, access.readUnits ?? []],
      );
      return { items: result.rows.map(mapCatalogue) };
    });
  }

  async createCatalogue(context: ModuleCommandContext, input: CreateCatalogueInputV1, key: string) {
    return this.createScopedMaster(context, 'CREATE_CATALOGUE', key, input, input.orgUnitId ?? null, async (client, id) => {
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.catalogues
          (id,tenant_id,owning_unit_id,code,name,description,purpose,audience,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
        [id, context.principal.tenantId, input.orgUnitId ?? null, input.code, input.name, input.description ?? null,
          input.purpose ?? null, input.audience ?? null, context.principal.subject],
      );
      return mapCatalogue(inserted.rows[0]);
    }, 'CATALOGUE_CREATED', 'catalogue');
  }

  async createCatalogueVersion(context: ModuleCommandContext, catalogueId: string, input: CreateCatalogueVersionInputV1, key: string) {
    errors.assertUuid(catalogueId, 'catalogueId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'CREATE_CATALOGUE_VERSION', key, { catalogueId, ...input });
      if (replay) return { result: replay, replayed: true };
      const access = await this.resolveAccess(client, context.principal);
      const catalogue = await client.query<{ owning_unit_id: string | null }>(
        `SELECT owning_unit_id FROM ${SCHEMA}.catalogues WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [context.principal.tenantId, catalogueId],
      );
      if (!catalogue.rows[0]) return errors.notFound('Catalogue');
      this.assertWrite(access, catalogue.rows[0].owning_unit_id);
      const next = await client.query<{ n: number }>(
        `SELECT COALESCE(max(version_number),0)::int + 1 AS n FROM ${SCHEMA}.catalogue_versions WHERE tenant_id = $1 AND catalogue_id = $2`,
        [context.principal.tenantId, catalogueId],
      );
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.catalogue_versions
          (id,tenant_id,catalogue_id,version_number,effective_from,effective_to,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, context.principal.tenantId, catalogueId, next.rows[0]!.n, input.effectiveFrom ?? null,
          input.effectiveTo ?? null, input.notes ?? null, context.principal.subject],
      );
      const version = mapCatalogueVersion(inserted.rows[0]);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'CATALOGUE_VERSION_CREATED', aggregateType: 'catalogue_version', aggregateId: id,
        aggregateVersion: 1, payload: { catalogueId, versionNumber: version.versionNumber },
      });
      await this.saveReplay(client, context, 'CREATE_CATALOGUE_VERSION', key, { catalogueId, ...input }, version, 201);
      return { result: version, replayed: false };
    });
  }

  async addCatalogueEntry(context: ModuleCommandContext, catalogueId: string, versionId: string, input: { productId: string; sortOrder: number; isHighlighted: boolean; displayOverrides: Record<string, unknown> }, key: string) {
    errors.assertUuid(catalogueId, 'catalogueId'); errors.assertUuid(versionId, 'versionId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'ADD_CATALOGUE_ENTRY', key, { catalogueId, versionId, ...input });
      if (replay) return { result: replay, replayed: true };
      await this.assertCatalogueVersionWritable(client, context, catalogueId, versionId);
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.catalogue_entries
          (id,tenant_id,catalogue_version_id,product_id,sort_order,highlighted,display_overrides,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,
        [id, context.principal.tenantId, versionId, input.productId, input.sortOrder, input.isHighlighted,
          JSON.stringify(input.displayOverrides), context.principal.subject],
      );
      const entry = mapCatalogueEntry(inserted.rows[0]);
      // WI-OI-120g: an entry changes the version's content, so the version moves on and the event carries the new
      // number (every entry after the first collided on "version 1" in the outbox).
      const version = await this.advanceVersion(client, context, 'catalogue_versions', versionId);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'CATALOGUE_ENTRY_ADDED', aggregateType: 'catalogue_version', aggregateId: versionId,
        aggregateVersion: version, payload: { catalogueId, productId: input.productId },
      });
      await this.saveReplay(client, context, 'ADD_CATALOGUE_ENTRY', key, { catalogueId, versionId, ...input }, entry, 201);
      return { result: entry, replayed: false };
    });
  }

  async transitionCatalogue(context: ModuleCommandContext, catalogueId: string, versionId: string, expectedVersion: number, reason: string, target: 'SUBMITTED'|'APPROVED'|'PUBLISHED') {
    return this.transitionVersion(context, 'catalogue', catalogueId, versionId, expectedVersion, reason, target);
  }

  async listPriceLists(principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.resolveAccess(client, principal);
      const result = await client.query(
        `SELECT * FROM ${SCHEMA}.price_lists WHERE tenant_id = $1
          AND ($2::boolean OR owning_unit_id IS NULL OR owning_unit_id = ANY($3::varchar[])) ORDER BY name, id`,
        [principal.tenantId, access.readUnits === null, access.readUnits ?? []],
      );
      return { items: result.rows.map(mapPriceList) };
    });
  }

  async createPriceList(context: ModuleCommandContext, input: CreatePriceListInputV1, key: string) {
    return this.createScopedMaster(context, 'CREATE_PRICE_LIST', key, input, input.orgUnitId ?? null, async (client, id) => {
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.price_lists
          (id,tenant_id,owning_unit_id,code,name,description,currency_code,tax_included,enforce_price_limit,price_precision,audience,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
        [id, context.principal.tenantId, input.orgUnitId ?? null, input.code, input.name, input.description ?? null,
          input.currencyCode, input.isTaxIncluded ?? false, input.enforcePriceLimit ?? true,
          input.pricePrecision ?? 2, input.audience ?? null, context.principal.subject],
      );
      return mapPriceList(inserted.rows[0]);
    }, 'PRICE_LIST_CREATED', 'price_list');
  }

  async createPriceListVersion(context: ModuleCommandContext, priceListId: string, input: CreatePriceListVersionInputV1, key: string) {
    errors.assertUuid(priceListId, 'priceListId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'CREATE_PRICE_VERSION', key, { priceListId, ...input });
      if (replay) return { result: replay, replayed: true };
      const access = await this.resolveAccess(client, context.principal);
      const list = await client.query<{ owning_unit_id: string | null }>(
        `SELECT owning_unit_id FROM ${SCHEMA}.price_lists WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [context.principal.tenantId, priceListId],
      );
      if (!list.rows[0]) return errors.notFound('Price list');
      this.assertWrite(access, list.rows[0].owning_unit_id);
      const next = await client.query<{ n: number }>(
        `SELECT COALESCE(max(version_number),0)::int + 1 AS n FROM ${SCHEMA}.price_list_versions WHERE tenant_id = $1 AND price_list_id = $2`,
        [context.principal.tenantId, priceListId],
      );
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.price_list_versions
          (id,tenant_id,price_list_id,version_number,effective_from,effective_to,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, context.principal.tenantId, priceListId, next.rows[0]!.n, input.effectiveFrom,
          input.effectiveTo ?? null, input.notes ?? null, context.principal.subject],
      );
      const version = mapPriceVersion(inserted.rows[0]);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'PRICE_VERSION_CREATED', aggregateType: 'price_list_version', aggregateId: id,
        aggregateVersion: 1, payload: { priceListId, versionNumber: version.versionNumber },
      });
      await this.saveReplay(client, context, 'CREATE_PRICE_VERSION', key, { priceListId, ...input }, version, 201);
      return { result: version, replayed: false };
    });
  }

  async setPrice(context: ModuleCommandContext, priceListId: string, versionId: string, input: SetProductPriceInputV1, key: string) {
    const list = BigInt(input.listPriceMinor); const standard = BigInt(input.standardPriceMinor); const limit = BigInt(input.limitPriceMinor);
    if (list < standard || standard < limit) throw new BadRequestException('Prices must satisfy list >= standard >= limit.');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'SET_PRODUCT_PRICE', key, { priceListId, versionId, ...input });
      if (replay) return { result: replay, replayed: true };
      await this.assertPriceVersionWritable(client, context, priceListId, versionId);
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.product_prices
          (id,tenant_id,price_list_version_id,product_id,uom_id,minimum_quantity,list_price_minor,standard_price_minor,limit_price_minor,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id,price_list_version_id,product_id,uom_id,minimum_quantity)
         DO UPDATE SET list_price_minor=EXCLUDED.list_price_minor, standard_price_minor=EXCLUDED.standard_price_minor,
           limit_price_minor=EXCLUDED.limit_price_minor, updated_at=now()
         RETURNING *`,
        [id, context.principal.tenantId, versionId, input.productId, input.uomId, input.minQuantity,
          input.listPriceMinor, input.standardPriceMinor, input.limitPriceMinor, context.principal.subject],
      );
      const price = mapProductPrice(inserted.rows[0]);
      // WI-OI-120g: a price changes the version's content, so the version moves on and the event carries the new number.
      const version = await this.advanceVersion(client, context, 'price_list_versions', versionId);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'PRODUCT_PRICE_SET', aggregateType: 'price_list_version', aggregateId: versionId,
        aggregateVersion: version, payload: { priceListId, productId: input.productId, uomId: input.uomId, minimumQuantity: input.minQuantity },
      });
      await this.saveReplay(client, context, 'SET_PRODUCT_PRICE', key, { priceListId, versionId, ...input }, price, 200);
      return { result: price, replayed: false };
    });
  }

  async transitionPrice(context: ModuleCommandContext, priceListId: string, versionId: string, expectedVersion: number, reason: string, target: 'SUBMITTED'|'APPROVED'|'ACTIVATED') {
    return this.transitionVersion(context, 'price', priceListId, versionId, expectedVersion, reason, target);
  }

  async resolvePrice(principal: ModulePrincipal, input: ResolvePriceInputV1) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.resolveAccess(client, principal);
      const product = await this.visibleProduct(client, principal.tenantId, access, input.productId);
      if (!product) return errors.notFound('Product');
      const requestedUnit = input.orgUnitId ?? null;
      if (requestedUnit && access.readUnits !== null && !access.readUnits.includes(requestedUnit)) return errors.notFound('Price');
      const at = input.effectiveAt ?? new Date().toISOString();
      const uom = input.uomId ?? product.base_uom_id;
      const result = await client.query<pg.QueryResultRow>(
        `SELECT pp.*, pl.id AS price_list_id, pl.currency_code, pl.tax_included, pl.owning_unit_id,
                pv.version_number, pv.effective_from
           FROM ${SCHEMA}.product_prices pp
           JOIN ${SCHEMA}.price_list_versions pv ON pv.tenant_id=pp.tenant_id AND pv.id=pp.price_list_version_id
           JOIN ${SCHEMA}.price_lists pl ON pl.tenant_id=pv.tenant_id AND pl.id=pv.price_list_id
          WHERE pp.tenant_id=$1 AND pp.product_id=$2 AND pp.uom_id=$3 AND pp.minimum_quantity <= $4::numeric
            AND pv.status='ACTIVATED' AND pv.effective_from <= $5::timestamptz
            AND (pv.effective_to IS NULL OR pv.effective_to > $5::timestamptz)
            AND ($6::text IS NULL OR pl.currency_code=$6)
            AND (pl.owning_unit_id IS NULL OR pl.owning_unit_id=$7)
            AND ($8::text IS NULL OR pl.audience IS NULL OR pl.audience=$8)
          ORDER BY (pl.owning_unit_id IS NOT NULL) DESC, (pl.audience IS NOT NULL) DESC,
                   pp.minimum_quantity DESC, pv.effective_from DESC, pv.version_number DESC, pp.id
          LIMIT 1`,
        [principal.tenantId, input.productId, uom, input.quantity, at, input.currencyCode ?? null, requestedUnit, input.audience ?? null],
      );
      const row = result.rows[0];
      if (!row) return errors.notFound('Price');
      return {
        productId: input.productId, priceListId: row.price_list_id, priceListVersionId: row.price_list_version_id,
        currencyCode: row.currency_code, uomId: row.uom_id, listPriceMinor: String(row.list_price_minor),
        standardPriceMinor: String(row.standard_price_minor), limitPriceMinor: String(row.limit_price_minor),
        isTaxIncluded: row.tax_included, effectiveFrom: iso(row.effective_from), resolvedAt: new Date().toISOString(),
        resolutionTrace: { versionSelected: String(row.version_number), precedenceRule: 'organization > audience > quantity > effective-date', orgScope: row.owning_unit_id, quantityBreak: String(row.minimum_quantity) },
      };
    });
  }

  async productSnapshot(context: ModuleCommandContext, productId: string) {
    const product = await this.getProduct(context.principal, productId);
    const payload = { schemaVersion: 1, productId: product.id, productVersion: product.version, code: product.code,
      name: product.name, displayName: product.displayName ?? null, productType: product.productType,
      status: product.status, baseUomId: product.baseUomId, classification: product.dataClassification };
    const fingerprint = `sha256:${createHash('sha256').update(stableJson(payload)).digest('hex')}`;
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const existing = await client.query<{ id: string; created_at: Date }>(
        `SELECT id,created_at FROM ${SCHEMA}.consumer_snapshots WHERE tenant_id=$1 AND product_id=$2 AND product_version=$3 AND fingerprint=$4`,
        [context.principal.tenantId, productId, product.version, fingerprint],
      );
      let id = existing.rows[0]?.id;
      let createdAt = existing.rows[0]?.created_at;
      if (!id) {
        id = randomUUID();
        const inserted = await client.query<{ created_at: Date }>(
          `INSERT INTO ${SCHEMA}.consumer_snapshots (id,tenant_id,product_id,product_version,fingerprint,payload,created_by)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING created_at`,
          [id, context.principal.tenantId, productId, product.version, fingerprint, JSON.stringify(payload), context.principal.subject],
        );
        createdAt = inserted.rows[0]!.created_at;
        await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
          action: 'CONSUMER_SNAPSHOT_CREATED', aggregateType: 'product_snapshot', aggregateId: id,
          aggregateVersion: product.version, payload: { productId, fingerprint },
        });
      }
      return { id, tenantId: context.principal.tenantId, productId, productVersion: product.version, fingerprint, payload, createdAt: iso(createdAt!) };
    });
  }

  async addReference(context: ModuleCommandContext, productId: string, input: { sourceSystem: string; sourceKey: string; sourceMetadata: Record<string, unknown> }, key: string) {
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, 'ADD_REFERENCE', key, { productId, ...input });
      if (replay) return { result: replay, replayed: true };
      const access = await this.resolveAccess(client, context.principal);
      const product = await this.visibleProduct(client, context.principal.tenantId, access, productId, true);
      if (!product) return errors.notFound('Product');
      this.assertWrite(access, product.owning_unit_id);
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.product_reference_mappings
          (id,tenant_id,product_id,source_system,source_key,source_metadata,created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,
        [id, context.principal.tenantId, productId, input.sourceSystem, input.sourceKey,
          JSON.stringify(input.sourceMetadata), context.principal.subject],
      );
      const reference = mapReference(inserted.rows[0]);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'PRODUCT_REFERENCE_ADDED', aggregateType: 'product', aggregateId: productId,
        aggregateVersion: product.version, payload: { sourceSystem: input.sourceSystem },
      });
      await this.saveReplay(client, context, 'ADD_REFERENCE', key, { productId, ...input }, reference, 201);
      return { result: reference, replayed: false };
    });
  }

  previewImport(rows: Array<Record<string, unknown>>) {
    const seen = new Set<string>();
    const results = rows.map((raw, index) => {
      const parsed = CreateProductInputV1Schema.safeParse(raw);
      const code = typeof raw['code'] === 'string' ? raw['code'].trim().toUpperCase() : '';
      const issues = parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      if (code && seen.has(code)) issues.push('code: duplicate inside this import');
      if (code) seen.add(code);
      for (const [field, value] of Object.entries(raw)) {
        if (typeof value === 'string' && /^[=+@]/.test(value.trimStart())) issues.push(`${field}: spreadsheet formula input is not allowed`);
      }
      return { row: index + 1, status: issues.length ? 'QUARANTINED' : 'VALID', issues, value: parsed.success ? parsed.data : null };
    });
    return { total: rows.length, valid: results.filter((row) => row.status === 'VALID').length, quarantined: results.filter((row) => row.status === 'QUARANTINED').length, rows: results };
  }

  async commitImport(context: ModuleCommandContext, rows: Array<Record<string, unknown>>, key: string) {
    const preview = this.previewImport(rows);
    if (preview.quarantined) throw new BadRequestException({ code: 'PRODUCT_CATALOGUE_IMPORT_INVALID', message: 'Fix quarantined rows before committing.', preview });
    const created: unknown[] = [];
    for (let index = 0; index < preview.rows.length; index += 1) {
      const value = preview.rows[index]!.value!;
      const childKey = deterministicUuid(key, index);
      const result = await this.createProduct(context, value, childKey);
      created.push(result.result);
    }
    return { imported: created.length, items: created };
  }

  async exportProducts(principal: ModulePrincipal) {
    const result = await this.listProducts(principal, { limit: 100 });
    const fields = ['code','name','productType','status','baseUomId','categoryId','isSold','isPurchased','isStocked'];
    const lines = [fields.join(','), ...result.items.map((item) => fields.map((field) => csvCell((item as Record<string, unknown>)[field])).join(','))];
    return { mediaType: 'text/csv', filename: `products-${new Date().toISOString().slice(0,10)}.csv`, content: lines.join('\r\n') + '\r\n', truncated: result.nextCursor !== null };
  }

  private async createScopedMaster<T>(context: ModuleCommandContext, operation: string, key: string, input: unknown, unitId: string | null,
    insert: (client: Client, id: string) => Promise<T>, action: string, aggregateType: string) {
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const replay = await this.replay(client, context, operation, key, input);
      if (replay) return { result: replay as T, replayed: true };
      const access = await this.resolveAccess(client, context.principal);
      await this.assertOwner(client, context.principal, access, unitId);
      const id = randomUUID();
      const result = await insert(client, id);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action, aggregateType, aggregateId: id, aggregateVersion: 1, payload: { owningUnitId: unitId },
      });
      await this.saveReplay(client, context, operation, key, input, result, 201);
      return { result, replayed: false };
    });
  }

  private async transitionVersion(context: ModuleCommandContext, kind: 'catalogue'|'price', ownerId: string, versionId: string,
    expectedVersion: number, reason: string, target: string) {
    errors.assertUuid(ownerId, `${kind}Id`); errors.assertUuid(versionId, 'versionId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const table = kind === 'catalogue' ? 'catalogue_versions' : 'price_list_versions';
      const ownerTable = kind === 'catalogue' ? 'catalogues' : 'price_lists';
      const ownerColumn = kind === 'catalogue' ? 'catalogue_id' : 'price_list_id';
      const row = await client.query<VersionRow & { owning_unit_id: string | null }>(
        `SELECT v.*, o.owning_unit_id FROM ${SCHEMA}.${table} v JOIN ${SCHEMA}.${ownerTable} o
          ON o.tenant_id=v.tenant_id AND o.id=v.${ownerColumn}
         WHERE v.tenant_id=$1 AND v.id=$2 AND v.${ownerColumn}=$3 FOR UPDATE`,
        [context.principal.tenantId, versionId, ownerId],
      );
      const version = row.rows[0];
      if (!version) return errors.notFound(kind === 'catalogue' ? 'Catalogue version' : 'Price-list version');
      const access = await this.resolveAccess(client, context.principal);
      this.assertWrite(access, version.owning_unit_id);
      const transitions: Record<string, string> = kind === 'catalogue'
        ? { SUBMITTED: 'DRAFT', APPROVED: 'SUBMITTED', PUBLISHED: 'APPROVED' }
        : { SUBMITTED: 'DRAFT', APPROVED: 'SUBMITTED', ACTIVATED: 'APPROVED' };
      if (version.status !== transitions[target]) throw new ConflictException(`Cannot move ${kind} version from ${version.status} to ${target}.`);
      if ((target === 'APPROVED') && version.submitted_by === context.principal.subject)
        throw new ForbiddenException('The maker cannot approve their own version.');
      const contentTable = kind === 'catalogue' ? 'catalogue_entries' : 'product_prices';
      const contentColumn = kind === 'catalogue' ? 'catalogue_version_id' : 'price_list_version_id';
      if (target === 'SUBMITTED') {
        const content = await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM ${SCHEMA}.${contentTable} WHERE tenant_id=$1 AND ${contentColumn}=$2`,
          [context.principal.tenantId, versionId],
        );
        if (!content.rows[0]?.count) throw new ConflictException(`A ${kind === 'catalogue' ? 'catalogue' : 'price-list'} version cannot be submitted without entries.`);
      }
      const digest = await client.query<{ checksum: string }>(
        `SELECT 'sha256:' || encode(digest(coalesce(string_agg(row_to_json(x)::text, E'\n' ORDER BY row_to_json(x)::text),''),'sha256'),'hex') AS checksum
           FROM (SELECT * FROM ${SCHEMA}.${contentTable} WHERE tenant_id=$1 AND ${contentColumn}=$2) x`,
        [context.principal.tenantId, versionId],
      );
      const actorColumn = target === 'SUBMITTED' ? 'submitted_by' : target === 'APPROVED' ? 'approved_by' : kind === 'catalogue' ? 'published_by' : 'activated_by';
      const timeColumn = actorColumn.replace('_by', '_at');
      if (target === 'ACTIVATED' || target === 'PUBLISHED') {
        const effective = await client.query<{ effective_from: Date | null; effective_to: Date | null }>(
          `SELECT effective_from,effective_to FROM ${SCHEMA}.${table} WHERE tenant_id=$1 AND id=$2`,
          [context.principal.tenantId, versionId],
        );
        const window = effective.rows[0];
        if (!window?.effective_from) throw new ConflictException('An effective start is required before publication.');
        const liveStatus = kind === 'catalogue' ? 'PUBLISHED' : 'ACTIVATED';
        const overlap = await client.query(
          `SELECT 1 FROM ${SCHEMA}.${table}
            WHERE tenant_id=$1 AND ${ownerColumn}=$2 AND id<>$3 AND status=$4
              AND tstzrange(effective_from, effective_to, '[)') && tstzrange($5::timestamptz, $6::timestamptz, '[)')
            LIMIT 1`,
          [context.principal.tenantId, ownerId, versionId, liveStatus, window.effective_from, window.effective_to],
        );
        if (overlap.rowCount) throw new ConflictException('The effective window overlaps another published version.');
      }
      const updated = await client.query(
        `UPDATE ${SCHEMA}.${table} SET status=$4, checksum=$5, ${actorColumn}=$6, ${timeColumn}=now(),
           version=version+1, updated_at=now() WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING *`,
        [context.principal.tenantId, versionId, expectedVersion, target, digest.rows[0]!.checksum, context.principal.subject],
      );
      if (!updated.rows[0]) return errors.versionConflict(kind === 'catalogue' ? 'Catalogue version' : 'Price-list version');
      const result = kind === 'catalogue' ? mapCatalogueVersion(updated.rows[0]) : mapPriceVersion(updated.rows[0]);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: `${kind.toUpperCase()}_${target}`, aggregateType: `${kind}_version`, aggregateId: versionId,
        aggregateVersion: result.version, payload: { ownerId, reason, checksum: digest.rows[0]!.checksum },
      });
      return result;
    });
  }

  /** Moves a draft catalogue or price-list version to its next version after its content changed. */
  private async advanceVersion(client: Client, context: ModuleCommandContext, table: 'catalogue_versions' | 'price_list_versions', versionId: string): Promise<number> {
    const advanced = await client.query<{ version: number }>(
      `UPDATE ${SCHEMA}.${table} SET version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING version`,
      [context.principal.tenantId, versionId],
    );
    return Number(advanced.rows[0]!.version);
  }

  private async assertCatalogueVersionWritable(client: Client, context: ModuleCommandContext, catalogueId: string, versionId: string) {
    const row = await client.query<{ status: string; owning_unit_id: string | null }>(
      `SELECT v.status,c.owning_unit_id FROM ${SCHEMA}.catalogue_versions v JOIN ${SCHEMA}.catalogues c
        ON c.tenant_id=v.tenant_id AND c.id=v.catalogue_id WHERE v.tenant_id=$1 AND v.id=$2 AND v.catalogue_id=$3`,
      [context.principal.tenantId, versionId, catalogueId],
    );
    if (!row.rows[0]) return errors.notFound('Catalogue version');
    if (row.rows[0].status !== 'DRAFT') throw new ConflictException('Only draft catalogue versions can be edited.');
    const access = await this.resolveAccess(client, context.principal); this.assertWrite(access, row.rows[0].owning_unit_id);
  }

  private async assertPriceVersionWritable(client: Client, context: ModuleCommandContext, priceListId: string, versionId: string) {
    const row = await client.query<{ status: string; owning_unit_id: string | null }>(
      `SELECT v.status,p.owning_unit_id FROM ${SCHEMA}.price_list_versions v JOIN ${SCHEMA}.price_lists p
        ON p.tenant_id=v.tenant_id AND p.id=v.price_list_id WHERE v.tenant_id=$1 AND v.id=$2 AND v.price_list_id=$3`,
      [context.principal.tenantId, versionId, priceListId],
    );
    if (!row.rows[0]) return errors.notFound('Price-list version');
    if (row.rows[0].status !== 'DRAFT') throw new ConflictException('Only draft price-list versions can be edited.');
    const access = await this.resolveAccess(client, context.principal); this.assertWrite(access, row.rows[0].owning_unit_id);
  }

  private async visibleProduct(client: Client, tenantId: string, access: Access, id: string, lock = false): Promise<ProductRow | null> {
    const values: unknown[] = [tenantId, id];
    let visibility = '';
    if (access.denied) visibility = ' AND FALSE';
    else if (access.readUnits !== null) {
      values.push([...access.readUnits]);
      visibility = ` AND (p.owning_unit_id IS NULL OR p.owning_unit_id = ANY($3::varchar[]))
        AND (NOT EXISTS (SELECT 1 FROM ${SCHEMA}.product_org_availability aa WHERE aa.tenant_id=p.tenant_id AND aa.product_id=p.id)
          OR EXISTS (SELECT 1 FROM ${SCHEMA}.product_org_availability aa WHERE aa.tenant_id=p.tenant_id AND aa.product_id=p.id AND aa.unit_id=ANY($3::varchar[])))`;
    }
    const result = await client.query<ProductRow>(
      `SELECT ${productColumns} FROM ${SCHEMA}.products p WHERE p.tenant_id=$1 AND p.id=$2${visibility}${lock ? ' FOR UPDATE OF p' : ''}`,
      values,
    );
    return result.rows[0] ?? null;
  }

  private async resolveAccess(client: Client, principal: ModulePrincipal): Promise<Access> {
    try { return await organizationAccess(this.organization, client, principal.tenantId, principal.organization ?? { mode: 'TENANT' }); }
    catch (error) {
      if (error instanceof OrganizationVersionPendingError) throw new ServiceUnavailableException({ code: error.code, message: error.message });
      throw error;
    }
  }

  private assertWrite(access: Access, unitId: string | null) {
    try { assertOrganizationWrite(access, unitId); }
    catch (error) {
      if (error instanceof OrganizationScopeRefusal) throw new ForbiddenException({ code: error.code, message: error.message });
      throw error;
    }
  }

  private async assertOwner(client: Client, principal: ModulePrincipal, access: Access, unitId: string | null) {
    try { await assertOwningUnit(this.organization, client, principal.tenantId, access, 'EITHER', unitId); this.assertWrite(access, unitId); }
    catch (error) {
      if (error instanceof OrganizationScopeRefusal) throw new ForbiddenException({ code: error.code, message: error.message });
      throw error;
    }
  }

  private async assertOwnership(client: Client, principal: ModulePrincipal, access: Access, owner: string | null, availability: readonly string[]) {
    await this.assertOwner(client, principal, access, owner);
    for (const unit of [...new Set(availability)]) {
      if (access.writeUnits !== null && !access.writeUnits.includes(unit)) throw new ForbiddenException('Product availability includes a unit outside your write scope.');
      if (access.versionId && !(await this.organization.unit(client, principal.tenantId, access.versionId, unit)))
        throw new BadRequestException('Product availability names a unit outside the organization version in force.');
    }
  }

  private async replaceAvailability(client: Client, context: ModuleCommandContext, productId: string, units: readonly string[]) {
    await client.query(`DELETE FROM ${SCHEMA}.product_org_availability WHERE tenant_id=$1 AND product_id=$2`, [context.principal.tenantId, productId]);
    const unique = [...new Set(units)];
    if (unique.length) await client.query(
      `INSERT INTO ${SCHEMA}.product_org_availability (tenant_id,product_id,unit_id,created_by)
       SELECT $1,$2,unit_id,$4 FROM unnest($3::varchar[]) unit_id`,
      [context.principal.tenantId, productId, unique, context.principal.subject],
    );
  }

  private async replay(client: Client, context: ModuleCommandContext, operation: string, key: string, input: unknown): Promise<unknown | null> {
    const requestHash = sha256(input);
    const result = await client.query<{ request_sha256: string; response: unknown }>(
      `SELECT request_sha256,response FROM ${SCHEMA}.idempotency_records
       WHERE tenant_id=$1 AND actor_subject=$2 AND operation=$3 AND idempotency_key=$4`,
      [context.principal.tenantId, context.principal.subject, operation, key],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_sha256 !== requestHash) throw new ConflictException('This idempotency key was already used for another request.');
    return row.response;
  }

  private async saveReplay(client: Client, context: ModuleCommandContext, operation: string, key: string, input: unknown, response: unknown, status: number) {
    await client.query(
      `INSERT INTO ${SCHEMA}.idempotency_records
        (tenant_id,actor_subject,operation,idempotency_key,request_sha256,response_status,response)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [context.principal.tenantId, context.principal.subject, operation, key, sha256(input), status, JSON.stringify(response)],
    );
  }

  private encodeCursor(name: string, id: string) { return Buffer.from(JSON.stringify([name, id])).toString('base64url'); }
  private decodeCursor(cursor: string): [string, string] {
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string' || typeof value[1] !== 'string') throw new Error();
      errors.assertUuid(value[1], 'cursor'); return [value[0], value[1]];
    } catch { throw new BadRequestException('The list cursor is invalid.'); }
  }
}

export function mapProduct(row: ProductRow) {
  return { id: row.id, tenantId: row.tenant_id, owningUnitId: row.owning_unit_id, code: row.code, name: row.name,
    displayName: row.display_name ?? undefined, description: row.description, productType: row.product_type,
    status: row.status, baseUomId: row.base_uom_id, categoryId: row.category_id, isSold: row.sold,
    isPurchased: row.purchased, isStocked: row.stocked, dataClassification: row.data_classification,
    version: Number(row.version), orgUnitIds: row.org_unit_ids ?? [], customExtensions: row.extensions ?? {},
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), createdBy: row.created_by, updatedBy: row.updated_by };
}
export function mapUom(row: any) { return { id: row.id, tenantId: row.tenant_id, code: row.code, name: row.name, symbol: row.symbol,
  dimension: row.dimension, stdPrecision: Number(row.standard_precision), costingPrecision: Number(row.costing_precision),
  uomType: row.uom_type, isoCode: row.iso_code ?? undefined, ucumCode: row.ucum_code ?? undefined, isActive: row.active,
  version: Number(row.version), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), createdBy: row.created_by, updatedBy: row.updated_by }; }
export function mapConversion(row: any) { return { id: row.id, tenantId: row.tenant_id, fromUomId: row.from_uom_id, toUomId: row.to_uom_id,
  productId: row.product_id, conversionRate: String(row.conversion_rate), isActive: row.active,
  effectiveFrom: row.effective_from ? iso(row.effective_from) : null, effectiveTo: row.effective_to ? iso(row.effective_to) : null,
  version: Number(row.version), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
export function mapCategory(row: any) { return { id: row.id, tenantId: row.tenant_id, code: row.code, name: row.name,
  description: row.description, parentCategoryId: row.parent_category_id, isDefault: row.default_category,
  effectiveFrom: row.effective_from ? iso(row.effective_from) : null, effectiveTo: row.effective_to ? iso(row.effective_to) : null,
  version: Number(row.version), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
export function mapAttribute(row: any) { return { id: row.id, tenantId: row.tenant_id, code: row.code, name: row.name,
  description: row.description, valueType: row.value_type, isRequired: row.required, dataClassification: row.data_classification,
  unit: row.unit, allowedValues: row.allowed_values, minValue: row.minimum === null ? null : String(row.minimum),
  maxValue: row.maximum === null ? null : String(row.maximum), version: Number(row.version),
  createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
export function mapCatalogue(row: any) { return { id: row.id, tenantId: row.tenant_id, code: row.code, name: row.name,
  description: row.description, purpose: row.purpose, audience: row.audience, orgUnitId: row.owning_unit_id,
  isActive: row.active, version: Number(row.version), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
export function mapCatalogueVersion(row: any) { return { id: row.id, tenantId: row.tenant_id, catalogueId: row.catalogue_id,
  versionNumber: Number(row.version_number), status: row.status, checksum: row.checksum, effectiveFrom: row.effective_from ? iso(row.effective_from) : null,
  effectiveTo: row.effective_to ? iso(row.effective_to) : null, notes: row.notes, submittedAt: row.submitted_at ? iso(row.submitted_at) : null,
  submittedBy: row.submitted_by, approvedAt: row.approved_at ? iso(row.approved_at) : null, approvedBy: row.approved_by,
  publishedAt: row.published_at ? iso(row.published_at) : null, publishedBy: row.published_by,
  version: Number(row.version), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
export function mapCatalogueEntry(row: any) { return { id: row.id, tenantId: row.tenant_id, catalogueVersionId: row.catalogue_version_id,
  productId: row.product_id, sortOrder: Number(row.sort_order), isHighlighted: row.highlighted,
  displayOverrides: row.display_overrides, createdAt: iso(row.created_at), updatedAt: iso(row.created_at) }; }
export function mapPriceList(row: any) { return { id: row.id, tenantId: row.tenant_id, code: row.code, name: row.name,
  description: row.description, currencyCode: row.currency_code, isTaxIncluded: row.tax_included,
  enforcePriceLimit: row.enforce_price_limit, pricePrecision: Number(row.price_precision), orgUnitId: row.owning_unit_id,
  audience: row.audience, isActive: row.active, version: Number(row.version), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
export function mapPriceVersion(row: any) { return { id: row.id, tenantId: row.tenant_id, priceListId: row.price_list_id,
  versionNumber: Number(row.version_number), status: row.status, effectiveFrom: iso(row.effective_from), effectiveTo: row.effective_to ? iso(row.effective_to) : null,
  checksum: row.checksum, notes: row.notes, submittedAt: row.submitted_at ? iso(row.submitted_at) : null, submittedBy: row.submitted_by,
  approvedAt: row.approved_at ? iso(row.approved_at) : null, approvedBy: row.approved_by,
  activatedAt: row.activated_at ? iso(row.activated_at) : null, activatedBy: row.activated_by,
  version: Number(row.version), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
export function mapProductPrice(row: any) { return { id: row.id, tenantId: row.tenant_id, priceListVersionId: row.price_list_version_id,
  productId: row.product_id, uomId: row.uom_id, minQuantity: String(row.minimum_quantity), listPriceMinor: String(row.list_price_minor),
  standardPriceMinor: String(row.standard_price_minor), limitPriceMinor: String(row.limit_price_minor),
  createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
function mapReference(row: any) { return { id: row.id, tenantId: row.tenant_id, productId: row.product_id,
  sourceSystem: row.source_system, sourceKey: row.source_key, sourceMetadata: row.source_metadata,
  createdAt: iso(row.created_at), updatedAt: iso(row.created_at) }; }
function safeProductFact(product: any) { return { code: product.code, name: product.name, productType: product.productType,
  status: product.status, baseUomId: product.baseUomId, owningUnitId: product.owningUnitId ?? null }; }
function iso(value: Date | string) { return new Date(value).toISOString(); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`; return JSON.stringify(value); }
function sha256(value: unknown) { return createHash('sha256').update(stableJson(value)).digest('hex'); }
export function multiplyDecimals(left: string, right: string, maximumScale: number): string {
  const parse = (value: string) => {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) throw new BadRequestException('Decimal quantity is invalid.');
    const fraction = match[3] ?? '';
    return { value: BigInt(`${match[1]}${match[2]}${fraction}`), scale: fraction.length };
  };
  const a = parse(left);
  const b = parse(right);
  let value = a.value * b.value;
  let scale = a.scale + b.scale;
  if (scale > maximumScale) {
    const divisor = 10n ** BigInt(scale - maximumScale);
    const quotient = value / divisor;
    const remainder = value % divisor;
    const absoluteRemainder = remainder < 0n ? -remainder : remainder;
    value = quotient + (absoluteRemainder * 2n >= divisor ? (value < 0n ? -1n : 1n) : 0n);
    scale = maximumScale;
  }
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const integer = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, '') : '';
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}
function deterministicUuid(seed: string, index: number) { const hex = createHash('sha256').update(`${seed}:${index}`).digest('hex').slice(0,32).split(''); hex[12]='4'; hex[16]='8'; return `${hex.slice(0,8).join('')}-${hex.slice(8,12).join('')}-${hex.slice(12,16).join('')}-${hex.slice(16,20).join('')}-${hex.slice(20).join('')}`; }
function csvCell(value: unknown) { let text = value == null ? '' : String(value); if (/^[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"','""')}"`; }
