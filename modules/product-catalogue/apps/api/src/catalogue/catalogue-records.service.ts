import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { LookupOption, ModulePrincipal } from '@gigalibs/module-sdk';
import type pg from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import {
  type CatalogueAccess,
  CatalogueService,
  mapAttribute,
  mapCatalogue,
  mapCatalogueEntry,
  mapCatalogueVersion,
  mapCategory,
  mapConversion,
  mapPriceList,
  mapPriceVersion,
  mapProduct,
  mapProductPrice,
  mapUom,
  productColumns,
} from './catalogue.service.js';

// WI-OI-120g (U7, ADR-0033 D1): the paged, tenant-bound reads the Catalogue's metadata windows need, beside the
// domain service. Products, catalogues and price lists, and the versions, entries and prices under them, are read with
// the caller's organization access exactly as the Catalogue's own list routes read them; units, conversions,
// categories and attributes are tenant-wide, as their routes are. Only declared columns are searched, filtered or
// sorted, and every value is a bound parameter.

export type CatalogueEntity =
  | 'uoms'
  | 'conversions'
  | 'categories'
  | 'attributes'
  | 'products'
  | 'catalogues'
  | 'catalogueVersions'
  | 'catalogueEntries'
  | 'priceLists'
  | 'priceListVersions'
  | 'prices';

export interface CataloguePageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  /** A domain field name from the entity's `sort` list. */
  readonly sortField?: string;
  readonly sortDirection: 'ASC' | 'DESC';
  /** Domain field name → value, from the entity's `filter` list. */
  readonly filters: Readonly<Record<string, string>>;
  readonly parentId?: string;
}

export interface CataloguePage {
  readonly items: readonly Record<string, unknown>[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

interface EntitySpec {
  /** The entity's table, aliased `r` (products: `p`, which the shared product columns name). */
  readonly from: string;
  readonly alias: 'r' | 'p';
  /** Columns returned for the mapper. */
  readonly select: string;
  /** None (tenant-wide), the product visibility rules, or the owning unit of the record or of the alias `o` it joins. */
  readonly scope: 'tenant' | 'product' | { readonly owner: 'r' | 'o' };
  readonly search: readonly string[];
  readonly filter: Readonly<Record<string, string>>;
  readonly sort: Readonly<Record<string, string>>;
  readonly defaultSort: string;
  readonly parent?: string;
  /** Condition for options a picker may offer. */
  readonly selectable?: string;
  readonly map: (row: any) => Record<string, unknown>;
}

const t = (table: string) => `${SCHEMA}.${table}`;

const SPECS: Readonly<Record<CatalogueEntity, EntitySpec>> = {
  uoms: {
    from: `${t('uom_definitions')} r`, alias: 'r', select: 'r.*', scope: 'tenant',
    search: ['r.code', 'r.name', 'r.symbol'], filter: { dimension: 'r.dimension' }, sort: { code: 'r.code', name: 'r.name' },
    defaultSort: 'r.code', selectable: 'r.active = true', map: mapUom,
  },
  conversions: {
    from: `${t('uom_conversions')} r`, alias: 'r', select: 'r.*', scope: 'tenant',
    search: [], filter: {}, sort: { effectiveFrom: 'r.effective_from' }, defaultSort: 'r.created_at', parent: 'r.from_uom_id', map: mapConversion,
  },
  categories: {
    from: `${t('product_categories')} r`, alias: 'r', select: 'r.*', scope: 'tenant',
    search: ['r.code', 'r.name'], filter: {}, sort: { code: 'r.code', name: 'r.name' }, defaultSort: 'r.name', map: mapCategory,
  },
  attributes: {
    from: `${t('attribute_definitions')} r`, alias: 'r', select: 'r.*', scope: 'tenant',
    search: ['r.code', 'r.name'], filter: { valueType: 'r.value_type' }, sort: { code: 'r.code', name: 'r.name' }, defaultSort: 'r.code',
    map: mapAttribute,
  },
  products: {
    from: `${t('products')} p`, alias: 'p', select: productColumns, scope: 'product',
    search: ['p.code', 'p.name'], filter: { status: 'p.status', productType: 'p.product_type', categoryId: 'p.category_id' },
    sort: { code: 'p.code', name: 'p.name', updatedAt: 'p.updated_at' }, defaultSort: 'p.name', selectable: 'p.archived_at IS NULL', map: mapProduct,
  },
  catalogues: {
    from: `${t('catalogues')} r`, alias: 'r', select: 'r.*', scope: { owner: 'r' },
    search: ['r.code', 'r.name'], filter: {}, sort: { code: 'r.code', name: 'r.name' }, defaultSort: 'r.name', selectable: 'r.active = true',
    map: mapCatalogue,
  },
  catalogueVersions: {
    from: `${t('catalogue_versions')} r JOIN ${t('catalogues')} o ON o.tenant_id = r.tenant_id AND o.id = r.catalogue_id`,
    alias: 'r', select: 'r.*', scope: { owner: 'o' },
    search: ['r.notes'], filter: { status: 'r.status' }, sort: { versionNumber: 'r.version_number', effectiveFrom: 'r.effective_from' },
    defaultSort: 'r.version_number', parent: 'r.catalogue_id', map: mapCatalogueVersion,
  },
  catalogueEntries: {
    from: `${t('catalogue_entries')} r JOIN ${t('catalogue_versions')} v ON v.tenant_id = r.tenant_id AND v.id = r.catalogue_version_id
      JOIN ${t('catalogues')} o ON o.tenant_id = v.tenant_id AND o.id = v.catalogue_id`,
    alias: 'r', select: 'r.*', scope: { owner: 'o' },
    search: [], filter: {}, sort: { sortOrder: 'r.sort_order' }, defaultSort: 'r.sort_order', parent: 'r.catalogue_version_id',
    map: mapCatalogueEntry,
  },
  priceLists: {
    from: `${t('price_lists')} r`, alias: 'r', select: 'r.*', scope: { owner: 'r' },
    search: ['r.code', 'r.name'], filter: { currencyCode: 'r.currency_code' }, sort: { code: 'r.code', name: 'r.name' }, defaultSort: 'r.name',
    selectable: 'r.active = true', map: mapPriceList,
  },
  priceListVersions: {
    from: `${t('price_list_versions')} r JOIN ${t('price_lists')} o ON o.tenant_id = r.tenant_id AND o.id = r.price_list_id`,
    alias: 'r', select: 'r.*', scope: { owner: 'o' },
    search: ['r.notes'], filter: { status: 'r.status' }, sort: { versionNumber: 'r.version_number', effectiveFrom: 'r.effective_from' },
    defaultSort: 'r.version_number', parent: 'r.price_list_id', map: mapPriceVersion,
  },
  prices: {
    from: `${t('product_prices')} r JOIN ${t('price_list_versions')} v ON v.tenant_id = r.tenant_id AND v.id = r.price_list_version_id
      JOIN ${t('price_lists')} o ON o.tenant_id = v.tenant_id AND o.id = v.price_list_id`,
    alias: 'r', select: 'r.*', scope: { owner: 'o' },
    search: [], filter: { productId: 'r.product_id' }, sort: { minQuantity: 'r.minimum_quantity' }, defaultSort: 'r.minimum_quantity',
    parent: 'r.price_list_version_id', map: mapProductPrice,
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const like = (text: string) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

/** The organization conditions for a read, as the Catalogue's list routes apply them. */
function visibility(spec: EntitySpec, access: CatalogueAccess | null, values: unknown[]): string[] {
  if (spec.scope === 'tenant' || !access) return [];
  if (spec.scope === 'product') {
    if (access.denied) return ['FALSE'];
    if (access.readUnits === null) return [];
    values.push([...access.readUnits]);
    const slot = `$${values.length}::varchar[]`;
    return [
      `(p.owning_unit_id IS NULL OR p.owning_unit_id = ANY(${slot}))`,
      `(NOT EXISTS (SELECT 1 FROM ${t('product_org_availability')} aa WHERE aa.tenant_id = p.tenant_id AND aa.product_id = p.id)
        OR EXISTS (SELECT 1 FROM ${t('product_org_availability')} aa WHERE aa.tenant_id = p.tenant_id AND aa.product_id = p.id AND aa.unit_id = ANY(${slot})))`,
    ];
  }
  if (access.readUnits === null) return [];
  values.push([...access.readUnits]);
  return [`(${spec.scope.owner}.owning_unit_id IS NULL OR ${spec.scope.owner}.owning_unit_id = ANY($${values.length}::varchar[]))`];
}

@Injectable()
export class CatalogueRecordsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
  ) {}

  page(principal: ModulePrincipal, entity: CatalogueEntity, query: CataloguePageQuery): Promise<CataloguePage> {
    const spec = SPECS[entity];
    return this.read(principal, spec, async (client, access) => {
      const values: unknown[] = [principal.tenantId];
      const where = [`${spec.alias}.tenant_id = $1`, ...visibility(spec, access, values)];
      if (query.parentId !== undefined) {
        if (!spec.parent) throw new BadRequestException(`${entity} has no parent.`);
        if (!UUID.test(query.parentId)) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
        values.push(query.parentId);
        where.push(`${spec.parent} = $${values.length}`);
      }
      if (query.search && spec.search.length > 0) {
        values.push(like(query.search));
        where.push(`(${spec.search.map((column) => `${column} ILIKE $${values.length}`).join(' OR ')})`);
      }
      for (const [field, value] of Object.entries(query.filters)) {
        const column = spec.filter[field];
        if (!column) throw new BadRequestException(`${entity} cannot be filtered by ${field}.`);
        values.push(value);
        where.push(`${column} = $${values.length}`);
      }
      const sortColumn = query.sortField ? spec.sort[query.sortField] : spec.defaultSort;
      if (!sortColumn) throw new BadRequestException(`${entity} cannot be sorted by ${query.sortField}.`);
      const direction = query.sortDirection === 'DESC' ? 'DESC' : 'ASC';
      const count = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${spec.from} WHERE ${where.join(' AND ')}`, values);
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const result = await client.query(
        `SELECT ${spec.select} FROM ${spec.from}
          WHERE ${where.join(' AND ')}
          ORDER BY ${sortColumn} ${direction}, ${spec.alias}.id ASC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => spec.map(row)), total: Number(count.rows[0]?.n ?? 0), page: query.page, pageSize: query.pageSize };
    });
  }

  /** One record the principal may see, or null. */
  get(principal: ModulePrincipal, entity: CatalogueEntity, id: string): Promise<Record<string, unknown> | null> {
    if (!UUID.test(id)) return Promise.resolve(null);
    const spec = SPECS[entity];
    return this.read(principal, spec, async (client, access) => {
      const values: unknown[] = [principal.tenantId, id];
      const where = [`${spec.alias}.tenant_id = $1`, `${spec.alias}.id = $2`, ...visibility(spec, access, values)];
      const result = await client.query(`SELECT ${spec.select} FROM ${spec.from} WHERE ${where.join(' AND ')}`, values);
      return result.rows[0] ? spec.map(result.rows[0]) : null;
    });
  }

  /** Picker options the principal may see, by text or by ids: `code — name`. */
  lookup(
    principal: ModulePrincipal,
    entity: 'uoms' | 'categories' | 'products' | 'catalogues' | 'priceLists',
    request: { readonly search?: string; readonly ids?: readonly string[]; readonly limit: number },
  ): Promise<readonly LookupOption[]> {
    const spec = SPECS[entity];
    const a = spec.alias;
    return this.read(principal, spec, async (client, access) => {
      const values: unknown[] = [principal.tenantId];
      const where = [`${a}.tenant_id = $1`, ...visibility(spec, access, values)];
      if (request.ids?.length) {
        values.push(request.ids);
        where.push(`${a}.id = ANY($${values.length}::uuid[])`);
      } else {
        if (spec.selectable) where.push(spec.selectable);
        if (request.search) {
          values.push(like(request.search));
          where.push(`(${a}.code ILIKE $${values.length} OR ${a}.name ILIKE $${values.length})`);
        }
      }
      values.push(request.limit);
      const result = await client.query(
        `SELECT ${a}.id, ${a}.code || ' — ' || ${a}.name AS label FROM ${spec.from}
          WHERE ${where.join(' AND ')} ORDER BY ${a}.code ASC LIMIT $${values.length}`,
        values,
      );
      return result.rows.map((row) => ({ value: String(row.id), label: String(row.label) }));
    });
  }

  private read<T>(principal: ModulePrincipal, spec: EntitySpec, run: (client: pg.PoolClient, access: CatalogueAccess | null) => Promise<T>): Promise<T> {
    if (spec.scope === 'tenant') return this.database.withTenantTransaction(principal.tenantId, (client) => run(client, null));
    return this.catalogue.readWithAccess(principal, run);
  }
}
