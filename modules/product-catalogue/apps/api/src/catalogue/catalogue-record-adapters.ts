import {
  CreateAttributeDefinitionInputV1Schema,
  CreateCatalogueInputV1Schema,
  CreateCatalogueVersionInputV1Schema,
  CreatePriceListInputV1Schema,
  CreatePriceListVersionInputV1Schema,
  CreateProductCategoryInputV1Schema,
  CreateProductInputV1Schema,
  CreateUomConversionInputV1Schema,
  CreateUomInputV1Schema,
  SetProductPriceInputV1Schema,
  UpdateProductCategoryInputV1Schema,
  UpdateProductInputV1Schema,
} from '@gigalibs/contracts';
import {
  type IdempotencyStore,
  type LookupResolver,
  type ModulePrincipal,
  type RecordAction,
  type RecordAdapter,
  type RecordCommandContext,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordValues,
  RecordVersionConflict,
} from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AddCatalogueEntryV1, VersionTransitionInputV1 } from './catalogue.contract.js';
import type { CatalogueEntity, CataloguePage, CatalogueRecordsService } from './catalogue-records.service.js';
import type { CatalogueService } from './catalogue.service.js';

// WI-OI-120g (U7, ADR-0033 D1): the Catalogue's record adapters behind its metadata windows. Window field keys are the
// dictionary's kebab-case keys (`base-uom-id`); the domain speaks camelCase (`baseUomId`). Every create, update and
// action goes through the same contract schema and domain method as the Catalogue's own API, so a window enforces the
// same rules: organization scope, dimension-safe conversions, list >= standard >= limit prices, draft-only editing of
// versions, and maker-checker approval (whoever submitted a version cannot approve it).

const camel = (key: string) => key.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());

interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
  /** The domain field when it is not the camelCase key. */
  readonly domain?: string;
  /** Converts a window value to the domain value. */
  readonly toDomain?: (value: unknown) => unknown;
  /** Converts a domain value to the window value. */
  readonly toWindow?: (value: unknown) => unknown;
}

/** DATE fields: a window date is the start of that day in UTC; a timestamp shows as its date. */
const DATE: Pick<FieldSpec, 'toDomain' | 'toWindow'> = {
  toDomain: (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value),
  toWindow: (value) => (typeof value === 'string' ? value.slice(0, 10) : value),
};
/** A comma-separated list in a text box. */
const LIST: Pick<FieldSpec, 'toDomain' | 'toWindow'> = {
  toDomain: (value) => (typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value),
  toWindow: (value) => (Array.isArray(value) ? value.join(', ') : value),
};

const domainName = (field: FieldSpec) => field.domain ?? camel(field.key);

function fieldPolicies(fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> {
  return Object.fromEntries(fields.map((field) => [field.key, { writable: field.writable ?? false }]));
}

/** A domain record as window values: the declared keys only, plus id and version. */
function toWindow(fields: readonly FieldSpec[], record: Readonly<Record<string, unknown>>): RecordValues {
  const values: Record<string, unknown> = { id: record.id };
  if (record.version !== undefined) values.version = record.version;
  for (const field of fields) {
    const value = record[domainName(field)] ?? null;
    values[field.key] = value !== null && field.toWindow ? field.toWindow(value) : value;
  }
  return values;
}

/** Window values as domain input: domain keys, empty values dropped, conversions applied. */
function toDomain(fields: readonly FieldSpec[], values: RecordValues): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in values)) continue;
    const value = values[field.key];
    if (value === null || value === '') continue;
    input[domainName(field)] = field.toDomain ? field.toDomain(value) : value;
  }
  return input;
}

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } };
function parse<T>(schema: Schema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new BadRequestException({
    code: 'PRODUCT_CATALOGUE_VALIDATION_FAILED',
    message: `${issue?.path.join('.') || 'value'}: ${issue?.message ?? 'invalid'}`,
  });
}

/** The Idempotency-Key the dispatcher received: the Catalogue's own replay record uses the same key. */
function keyOf(context: RecordCommandContext): string {
  if (!context.idempotencyKey) {
    throw new BadRequestException({ code: 'PRODUCT_CATALOGUE_VALIDATION_FAILED', message: 'An Idempotency-Key is required.' });
  }
  return context.idempotencyKey;
}

/** A Catalogue version conflict (409) becomes the window's 412. */
async function versioned<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = error instanceof ConflictException ? (error.getResponse() as { code?: unknown }).code : undefined;
    if (code === 'PRODUCT_CATALOGUE_VERSION_CONFLICT') throw new RecordVersionConflict();
    throw error;
  }
}

function domainQuery(fields: readonly FieldSpec[], query: RecordListQuery) {
  const name = (key: string) => {
    const field = fields.find((candidate) => candidate.key === key);
    return field ? domainName(field) : camel(key);
  };
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.search ? { search: query.search } : {}),
    ...(query.sortField ? { sortField: name(query.sortField) } : {}),
    sortDirection: query.sortDirection,
    filters: Object.fromEntries(Object.entries(query.filters).map(([key, value]) => [name(key), value])),
    ...(query.parentId ? { parentId: query.parentId } : {}),
  };
}

const pageOf = (fields: readonly FieldSpec[], page: CataloguePage) => ({ ...page, items: page.items.map((item) => toWindow(fields, item)) });

const UOM_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'symbol', writable: true },
  { key: 'dimension', writable: true },
  { key: 'std-precision', writable: true },
  { key: 'costing-precision', writable: true },
  { key: 'iso-code', writable: true },
  { key: 'ucum-code', writable: true },
  { key: 'is-active' },
];
const CONVERSION_FIELDS: readonly FieldSpec[] = [
  { key: 'from-uom-id', writable: true },
  { key: 'to-uom-id', writable: true },
  { key: 'conversion-rate', writable: true },
  { key: 'product-id', writable: true },
  { key: 'effective-from', writable: true, ...DATE },
  { key: 'effective-to', writable: true, ...DATE },
  { key: 'is-active' },
];
const CATEGORY_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'parent-category-id', writable: true },
  { key: 'is-default', writable: true },
];
const ATTRIBUTE_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'value-type', writable: true },
  { key: 'is-required', writable: true },
  { key: 'unit', writable: true },
  { key: 'allowed-values', writable: true, ...LIST },
  { key: 'min-value', writable: true },
  { key: 'max-value', writable: true },
];
const PRODUCT_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'display-name', writable: true },
  { key: 'description', writable: true },
  { key: 'product-type', writable: true },
  { key: 'status', writable: true },
  { key: 'base-uom-id', writable: true },
  { key: 'category-id', writable: true },
  { key: 'is-sold', writable: true },
  { key: 'is-purchased', writable: true },
  { key: 'is-stocked', writable: true },
  { key: 'data-classification', writable: true },
  { key: 'updated-at' },
];
const CATALOGUE_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'purpose', writable: true },
  { key: 'audience', writable: true },
  { key: 'is-active' },
];
const CATALOGUE_VERSION_FIELDS: readonly FieldSpec[] = [
  { key: 'catalogue-id', writable: true },
  { key: 'version-number' },
  { key: 'status' },
  { key: 'effective-from', writable: true, ...DATE },
  { key: 'effective-to', writable: true, ...DATE },
  { key: 'notes', writable: true },
  { key: 'submitted-by' },
  { key: 'approved-by' },
  { key: 'published-by' },
  { key: 'checksum' },
];
const ENTRY_FIELDS: readonly FieldSpec[] = [
  { key: 'catalogue-version-id', writable: true },
  { key: 'product-id', writable: true },
  { key: 'sort-order', writable: true },
  { key: 'is-highlighted', writable: true },
];
const PRICE_LIST_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'currency-code', writable: true },
  { key: 'is-tax-included', writable: true },
  { key: 'enforce-price-limit', writable: true },
  { key: 'price-precision', writable: true },
  { key: 'audience', writable: true },
  { key: 'is-active' },
];
const PRICE_VERSION_FIELDS: readonly FieldSpec[] = [
  { key: 'price-list-id', writable: true },
  { key: 'version-number' },
  { key: 'status' },
  { key: 'effective-from', writable: true, ...DATE },
  { key: 'effective-to', writable: true, ...DATE },
  { key: 'notes', writable: true },
  { key: 'submitted-by' },
  { key: 'approved-by' },
  { key: 'activated-by' },
  { key: 'checksum' },
];
const PRICE_FIELDS: readonly FieldSpec[] = [
  { key: 'price-list-version-id', writable: true },
  { key: 'product-id', writable: true },
  { key: 'uom-id', writable: true },
  { key: 'min-quantity', writable: true },
  { key: 'list-price-minor', writable: true },
  { key: 'standard-price-minor', writable: true },
  { key: 'limit-price-minor', writable: true },
];

export interface CatalogueRecordDependencies {
  readonly catalogue: Pick<
    CatalogueService,
    | 'createUom' | 'createConversion' | 'createCategory' | 'updateCategory' | 'createAttribute' | 'createProduct' | 'updateProduct'
    | 'setProductArchive' | 'createCatalogue' | 'createCatalogueVersion' | 'addCatalogueEntry' | 'transitionCatalogue'
    | 'createPriceList' | 'createPriceListVersion' | 'setPrice' | 'transitionPrice'
  >;
  readonly records: Pick<CatalogueRecordsService, 'page' | 'get' | 'lookup'>;
}

function readAdapter(
  deps: CatalogueRecordDependencies,
  entityKey: string,
  entity: CatalogueEntity,
  fields: readonly FieldSpec[],
  permissions: RecordAdapter['permissions'],
  options: { search?: readonly string[]; filter?: readonly string[]; sort?: readonly string[]; parent?: string } = {},
): RecordAdapter {
  return {
    entityKey,
    permissions,
    fields: fieldPolicies(fields),
    searchFields: options.search ?? [],
    filterFields: options.filter ?? [],
    sortFields: options.sort ?? [],
    ...(options.parent ? { parentField: options.parent } : {}),
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      return pageOf(fields, await deps.records.page(principal, entity, domainQuery(fields, query)));
    },
    async get(principal: ModulePrincipal, id: string) {
      const record = await deps.records.get(principal, entity, id);
      return record ? toWindow(fields, record) : null;
    },
  };
}

/** A required id from the window values, by window key. */
function idOf(values: RecordValues, key: string): string {
  const value = values[key];
  if (typeof value !== 'string' || value === '') {
    throw new BadRequestException({ code: 'PRODUCT_CATALOGUE_VALIDATION_FAILED', message: `${key} is required.` });
  }
  return value;
}

/** Submit, approve and publish/activate a version: the record's version and a reason travel with the action. */
function transition(
  deps: CatalogueRecordDependencies,
  entity: 'catalogueVersions' | 'priceListVersions',
  fields: readonly FieldSpec[],
  permission: string,
  target: 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | 'ACTIVATED',
): RecordAction {
  return {
    permission,
    async run(context, id, parameters) {
      const input = parse(VersionTransitionInputV1, { expectedVersion: parameters['expectedVersion'], reason: parameters['reason'] });
      const version = await deps.records.get(context.principal, entity, id);
      if (!version) throw new BadRequestException({ code: 'PRODUCT_CATALOGUE_NOT_FOUND', message: 'The version was not found.' });
      const result = await versioned(() =>
        entity === 'catalogueVersions'
          ? deps.catalogue.transitionCatalogue(context, String(version['catalogueId']), id, input.expectedVersion, input.reason, target as 'SUBMITTED' | 'APPROVED' | 'PUBLISHED')
          : deps.catalogue.transitionPrice(context, String(version['priceListId']), id, input.expectedVersion, input.reason, target as 'SUBMITTED' | 'APPROVED' | 'ACTIVATED'),
      );
      return toWindow(fields, result as Record<string, unknown>);
    },
  };
}

/** The Catalogue's record dispatcher: its eleven entities and the pickers its own and other modules' windows use. */
export function catalogueRecordDispatcher(deps: CatalogueRecordDependencies, idempotency: IdempotencyStore): RecordDispatcher {
  const uoms: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.uoms', 'uoms', UOM_FIELDS, { read: 'uoms:read', create: 'uoms:manage' }, {
      search: ['code', 'name', 'symbol'], filter: ['dimension'], sort: ['code', 'name'],
    }),
    async create(context, values) {
      const input = parse(CreateUomInputV1Schema, toDomain(UOM_FIELDS, values));
      return toWindow(UOM_FIELDS, (await deps.catalogue.createUom(context, input, keyOf(context))).result as Record<string, unknown>);
    },
  };

  const conversions: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.uom-conversions', 'conversions', CONVERSION_FIELDS, { read: 'uoms:read', create: 'uoms:manage' }, {
      sort: ['effective-from'], parent: 'from-uom-id',
    }),
    async create(context, values) {
      const input = parse(CreateUomConversionInputV1Schema, toDomain(CONVERSION_FIELDS, values));
      return toWindow(CONVERSION_FIELDS, (await deps.catalogue.createConversion(context, input, keyOf(context))).result as Record<string, unknown>);
    },
  };

  const categories: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.categories', 'categories', CATEGORY_FIELDS,
      { read: 'products:read', create: 'product-categories:manage', update: 'product-categories:manage' },
      { search: ['code', 'name'], sort: ['code', 'name'] }),
    async create(context, values) {
      const input = parse(CreateProductCategoryInputV1Schema, toDomain(CATEGORY_FIELDS, values));
      return toWindow(CATEGORY_FIELDS, (await deps.catalogue.createCategory(context, input, keyOf(context))).result as Record<string, unknown>);
    },
    async update(context, id, values, expectedVersion) {
      const { code: _code, ...changes } = toDomain(CATEGORY_FIELDS, values);
      const input = parse(UpdateProductCategoryInputV1Schema, { ...changes, expectedVersion });
      return toWindow(CATEGORY_FIELDS, await versioned(() => deps.catalogue.updateCategory(context, id, input)));
    },
  };

  const attributes: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.attributes', 'attributes', ATTRIBUTE_FIELDS, { read: 'products:read', create: 'products:update' }, {
      search: ['code', 'name'], filter: ['value-type'], sort: ['code', 'name'],
    }),
    async create(context, values) {
      const input = parse(CreateAttributeDefinitionInputV1Schema, toDomain(ATTRIBUTE_FIELDS, values));
      return toWindow(ATTRIBUTE_FIELDS, (await deps.catalogue.createAttribute(context, input, keyOf(context))).result as Record<string, unknown>);
    },
  };

  const archive = (restore: boolean): RecordAction => ({
    permission: 'products:archive',
    async run(context, id, parameters) {
      const input = parse(VersionTransitionInputV1, { expectedVersion: parameters['expectedVersion'], reason: parameters['reason'] });
      return toWindow(PRODUCT_FIELDS, await versioned(() => deps.catalogue.setProductArchive(context, id, input.expectedVersion, input.reason, restore)));
    },
  });
  const products: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.products', 'products', PRODUCT_FIELDS,
      { read: 'products:read', create: 'products:create', update: 'products:update' },
      { search: ['code', 'name'], filter: ['status', 'product-type', 'category-id'], sort: ['code', 'name', 'updated-at'] }),
    async create(context, values) {
      // A new product starts in DRAFT; its status changes by edit, archive and restore.
      const { status: _status, ...fields } = toDomain(PRODUCT_FIELDS, values);
      const input = parse(CreateProductInputV1Schema, { isSold: false, isPurchased: false, isStocked: false, ...fields });
      return toWindow(PRODUCT_FIELDS, (await deps.catalogue.createProduct(context, input, keyOf(context))).result as Record<string, unknown>);
    },
    async update(context, id, values, expectedVersion) {
      const { code: _code, productType: _type, baseUomId: _uom, ...changes } = toDomain(PRODUCT_FIELDS, values);
      if (changes['status'] === 'ARCHIVED') {
        throw new BadRequestException({ code: 'PRODUCT_CATALOGUE_VALIDATION_FAILED', message: 'Use Archive to archive a product.' });
      }
      const input = parse(UpdateProductInputV1Schema, { ...changes, expectedVersion });
      return toWindow(PRODUCT_FIELDS, await versioned(() => deps.catalogue.updateProduct(context, id, input)));
    },
    actions: { archive: archive(false), restore: archive(true) },
  };

  const catalogues: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.catalogues', 'catalogues', CATALOGUE_FIELDS, { read: 'catalogues:read', create: 'catalogues:draft' }, {
      search: ['code', 'name'], sort: ['code', 'name'],
    }),
    async create(context, values) {
      const input = parse(CreateCatalogueInputV1Schema, toDomain(CATALOGUE_FIELDS, values));
      return toWindow(CATALOGUE_FIELDS, (await deps.catalogue.createCatalogue(context, input, keyOf(context))).result as Record<string, unknown>);
    },
  };

  const catalogueVersions: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.catalogue-versions', 'catalogueVersions', CATALOGUE_VERSION_FIELDS,
      { read: 'catalogues:read', create: 'catalogues:draft' },
      { search: ['notes'], filter: ['status'], sort: ['version-number', 'effective-from'], parent: 'catalogue-id' }),
    async create(context, values) {
      const { catalogueId: _catalogue, ...fields } = toDomain(CATALOGUE_VERSION_FIELDS, values);
      const input = parse(CreateCatalogueVersionInputV1Schema, fields);
      const created = await deps.catalogue.createCatalogueVersion(context, idOf(values, 'catalogue-id'), input, keyOf(context));
      return toWindow(CATALOGUE_VERSION_FIELDS, created.result as Record<string, unknown>);
    },
    actions: {
      submit: transition(deps, 'catalogueVersions', CATALOGUE_VERSION_FIELDS, 'catalogues:submit', 'SUBMITTED'),
      approve: transition(deps, 'catalogueVersions', CATALOGUE_VERSION_FIELDS, 'catalogues:approve', 'APPROVED'),
      publish: transition(deps, 'catalogueVersions', CATALOGUE_VERSION_FIELDS, 'catalogues:publish', 'PUBLISHED'),
    },
  };

  const catalogueEntries: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.catalogue-entries', 'catalogueEntries', ENTRY_FIELDS, { read: 'catalogues:read', create: 'catalogues:draft' }, {
      sort: ['sort-order'], parent: 'catalogue-version-id',
    }),
    async create(context, values) {
      const versionId = idOf(values, 'catalogue-version-id');
      const version = await deps.records.get(context.principal, 'catalogueVersions', versionId);
      if (!version) throw new BadRequestException({ code: 'PRODUCT_CATALOGUE_NOT_FOUND', message: 'The catalogue version was not found.' });
      const { catalogueVersionId: _version, ...fields } = toDomain(ENTRY_FIELDS, values);
      const input = parse(AddCatalogueEntryV1, fields);
      const created = await deps.catalogue.addCatalogueEntry(context, String(version['catalogueId']), versionId, input, keyOf(context));
      return toWindow(ENTRY_FIELDS, created.result as Record<string, unknown>);
    },
  };

  const priceLists: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.price-lists', 'priceLists', PRICE_LIST_FIELDS, { read: 'pricing:read', create: 'pricing:draft' }, {
      search: ['code', 'name'], filter: ['currency-code'], sort: ['code', 'name'],
    }),
    async create(context, values) {
      const input = parse(CreatePriceListInputV1Schema, toDomain(PRICE_LIST_FIELDS, values));
      return toWindow(PRICE_LIST_FIELDS, (await deps.catalogue.createPriceList(context, input, keyOf(context))).result as Record<string, unknown>);
    },
  };

  const priceListVersions: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.price-list-versions', 'priceListVersions', PRICE_VERSION_FIELDS,
      { read: 'pricing:read', create: 'pricing:draft' },
      { search: ['notes'], filter: ['status'], sort: ['version-number', 'effective-from'], parent: 'price-list-id' }),
    async create(context, values) {
      const { priceListId: _list, ...fields } = toDomain(PRICE_VERSION_FIELDS, values);
      const input = parse(CreatePriceListVersionInputV1Schema, fields);
      const created = await deps.catalogue.createPriceListVersion(context, idOf(values, 'price-list-id'), input, keyOf(context));
      return toWindow(PRICE_VERSION_FIELDS, created.result as Record<string, unknown>);
    },
    actions: {
      submit: transition(deps, 'priceListVersions', PRICE_VERSION_FIELDS, 'pricing:submit', 'SUBMITTED'),
      approve: transition(deps, 'priceListVersions', PRICE_VERSION_FIELDS, 'pricing:approve', 'APPROVED'),
      activate: transition(deps, 'priceListVersions', PRICE_VERSION_FIELDS, 'pricing:activate', 'ACTIVATED'),
    },
  };

  const prices: RecordAdapter = {
    ...readAdapter(deps, 'catalogue.prices', 'prices', PRICE_FIELDS, { read: 'pricing:read', create: 'pricing:draft' }, {
      filter: ['product-id'], sort: ['min-quantity'], parent: 'price-list-version-id',
    }),
    async create(context, values) {
      const versionId = idOf(values, 'price-list-version-id');
      const version = await deps.records.get(context.principal, 'priceListVersions', versionId);
      if (!version) throw new BadRequestException({ code: 'PRODUCT_CATALOGUE_NOT_FOUND', message: 'The price-list version was not found.' });
      const { priceListVersionId: _version, ...fields } = toDomain(PRICE_FIELDS, values);
      const input = parse(SetProductPriceInputV1Schema, fields);
      const created = await deps.catalogue.setPrice(context, String(version['priceListId']), versionId, input, keyOf(context));
      return toWindow(PRICE_FIELDS, created.result as Record<string, unknown>);
    },
  };

  const picker = (key: string, permission: string, entity: 'uoms' | 'categories' | 'products' | 'catalogues' | 'priceLists'): LookupResolver => ({
    key,
    permission,
    resolve: (principal, request) => deps.records.lookup(principal, entity, request),
  });
  const resolvers: LookupResolver[] = [
    picker('catalogue-products', 'products:read', 'products'),
    picker('catalogue-uoms', 'uoms:read', 'uoms'),
    picker('catalogue-categories', 'products:read', 'categories'),
    picker('catalogue-catalogues', 'catalogues:read', 'catalogues'),
    picker('catalogue-price-lists', 'pricing:read', 'priceLists'),
  ];

  return new RecordDispatcher(
    [uoms, conversions, categories, attributes, products, catalogues, catalogueVersions, catalogueEntries, priceLists, priceListVersions, prices],
    resolvers,
    idempotency,
  );
}
