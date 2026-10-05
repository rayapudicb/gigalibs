import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { ModulePrincipal } from './signed-context.js';

// WI-OI-120f (F0.3, ADR-0033 D1; ADR-0019 tenets 9, 11, 13): the record dispatcher behind every metadata window. It
// never touches tables: each list, read, create, update, action and lookup goes to a typed adapter the module
// registers, which calls the module's own domain service. The dispatcher enforces what every window needs:
// - the entity's permission for each operation, from the signed context;
// - field permissions: unreadable fields are left out of every answer, unwritable ones are refused;
// - only declared search, filter and sort fields, server paging bounded to 100 rows;
// - If-Match on every update (a stale version answers 412);
// - Idempotency-Key on every create and action (a repeat returns the first answer; a different body under the same
//   key is refused).
// Tenant scope comes only from the signed principal, which every adapter call receives.

export type RecordValues = Readonly<Record<string, unknown>>;

export interface RecordFieldPolicy {
  /** Shown only to a principal holding this permission. */
  readonly readPermission?: string;
  /** Written only by a principal holding this permission. */
  readonly writePermission?: string;
  /** False for fields the domain sets itself (status, totals, timestamps). */
  readonly writable: boolean;
}

export interface RecordListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly sortField?: string;
  readonly sortDirection: 'ASC' | 'DESC';
  readonly filters: Readonly<Record<string, string>>;
  /** Child tabs list the records of one parent. */
  readonly parentId?: string;
}

export interface RecordPage {
  readonly items: readonly RecordValues[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface RecordCommandContext {
  readonly principal: ModulePrincipal;
  readonly correlationId: string;
}

export interface RecordAction {
  readonly permission: string;
  run(context: RecordCommandContext, id: string, parameters: RecordValues): Promise<RecordValues>;
}

export interface RecordAdapter {
  /** The dictionary entity key, for example `inventory.warehouses`. */
  readonly entityKey: string;
  readonly permissions: { readonly read: string; readonly create?: string; readonly update?: string };
  /** Every field a window may show. Anything else an adapter returns is dropped. */
  readonly fields: Readonly<Record<string, RecordFieldPolicy>>;
  readonly searchFields?: readonly string[];
  readonly filterFields?: readonly string[];
  readonly sortFields?: readonly string[];
  /** The field that links a child record to its parent, when the entity appears in a child tab. */
  readonly parentField?: string;
  list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage>;
  /** Null when the record does not exist for the principal's tenant. Returns `id` and `version`. */
  get(principal: ModulePrincipal, id: string): Promise<RecordValues | null>;
  create?(context: RecordCommandContext, values: RecordValues): Promise<RecordValues>;
  /** Throws RecordVersionConflict when `expectedVersion` is not the record's current version. */
  update?(context: RecordCommandContext, id: string, values: RecordValues, expectedVersion: number): Promise<RecordValues>;
  readonly actions?: Readonly<Record<string, RecordAction>>;
}

export interface LookupOption {
  readonly value: string;
  readonly label: string;
}

export interface LookupResolver {
  readonly key: string;
  readonly permission: string;
  resolve(principal: ModulePrincipal, request: { readonly search?: string; readonly ids?: readonly string[]; readonly limit: number }): Promise<readonly LookupOption[]>;
}

/** Thrown by an adapter when the record changed since the caller read it. */
export class RecordVersionConflict extends Error {
  constructor() {
    super('The record was changed by someone else.');
    this.name = 'RecordVersionConflict';
  }
}

export interface IdempotencyEntry {
  readonly requestHash: string;
  readonly state: 'IN_PROGRESS' | 'COMPLETED';
  readonly response: RecordValues | null;
}

/** Persists Idempotency-Key results per tenant. `claim` returns the existing entry, or null when this call owns the key. */
export interface IdempotencyStore {
  claim(tenantId: string, key: string, operation: string, requestHash: string): Promise<IdempotencyEntry | null>;
  complete(tenantId: string, key: string, response: RecordValues): Promise<void>;
  release(tenantId: string, key: string): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITY_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/;
const MAX_PAGE_SIZE = 100;
const MAX_TEXT = 200;
const ALWAYS_RETURNED = ['id', 'version'];

function holds(principal: ModulePrincipal, permission: string): boolean {
  const prefix = permission.slice(0, permission.indexOf(':'));
  return (
    principal.permissions.includes('*') ||
    principal.permissions.includes(permission) ||
    principal.permissions.includes(`${prefix}:*`)
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export class RecordDispatcher {
  private readonly adapters = new Map<string, RecordAdapter>();
  private readonly resolvers = new Map<string, LookupResolver>();

  constructor(
    adapters: readonly RecordAdapter[],
    resolvers: readonly LookupResolver[],
    private readonly idempotency: IdempotencyStore,
  ) {
    for (const adapter of adapters) {
      if (!ENTITY_KEY.test(adapter.entityKey)) throw new Error(`Invalid entity key ${adapter.entityKey}.`);
      if (this.adapters.has(adapter.entityKey)) throw new Error(`Duplicate record adapter ${adapter.entityKey}.`);
      for (const field of [...(adapter.searchFields ?? []), ...(adapter.filterFields ?? []), ...(adapter.sortFields ?? [])]) {
        if (!adapter.fields[field]) throw new Error(`${adapter.entityKey}: ${field} is searchable, filterable or sortable but not declared.`);
      }
      this.adapters.set(adapter.entityKey, adapter);
    }
    for (const resolver of resolvers) {
      if (this.resolvers.has(resolver.key)) throw new Error(`Duplicate lookup resolver ${resolver.key}.`);
      this.resolvers.set(resolver.key, resolver);
    }
  }

  /** Entity keys and action handlers the module registers, for the control plane's publish-time checks. */
  registry(): { entities: readonly string[]; actions: readonly string[]; resolvers: readonly string[] } {
    return {
      entities: [...this.adapters.keys()].sort(),
      actions: [...this.adapters.values()].flatMap((adapter) => Object.keys(adapter.actions ?? {}).map((key) => `${adapter.entityKey}.${key}`)).sort(),
      resolvers: [...this.resolvers.keys()].sort(),
    };
  }

  async list(principal: ModulePrincipal, entityKey: string, raw: Readonly<Record<string, unknown>>): Promise<RecordPage> {
    const adapter = this.adapter(entityKey);
    this.require(principal, adapter.permissions.read);
    const page = await adapter.list(principal, this.listQuery(adapter, raw));
    return { ...page, items: page.items.map((item) => this.readable(principal, adapter, item)) };
  }

  async get(principal: ModulePrincipal, entityKey: string, id: string): Promise<RecordValues> {
    const adapter = this.adapter(entityKey);
    this.require(principal, adapter.permissions.read);
    this.assertId(id);
    const record = await adapter.get(principal, id);
    if (!record) throw new NotFoundException({ code: 'RECORD_NOT_FOUND', message: 'The record was not found.' });
    return this.readable(principal, adapter, record);
  }

  async create(
    context: RecordCommandContext,
    entityKey: string,
    body: unknown,
    idempotencyKey: string | undefined,
  ): Promise<RecordValues> {
    const adapter = this.adapter(entityKey);
    if (!adapter.create || !adapter.permissions.create) throw this.notSupported(entityKey, 'create');
    this.require(context.principal, adapter.permissions.create);
    const values = this.writable(context.principal, adapter, body);
    const create = adapter.create.bind(adapter);
    return this.once(context.principal, idempotencyKey, `create:${entityKey}`, values, async () =>
      this.readable(context.principal, adapter, await create(context, values)),
    );
  }

  async update(
    context: RecordCommandContext,
    entityKey: string,
    id: string,
    body: unknown,
    ifMatch: string | undefined,
  ): Promise<RecordValues> {
    const adapter = this.adapter(entityKey);
    if (!adapter.update || !adapter.permissions.update) throw this.notSupported(entityKey, 'update');
    this.require(context.principal, adapter.permissions.update);
    this.assertId(id);
    const expectedVersion = this.expectedVersion(ifMatch);
    const values = this.writable(context.principal, adapter, body);
    try {
      return this.readable(context.principal, adapter, await adapter.update(context, id, values, expectedVersion));
    } catch (error) {
      if (error instanceof RecordVersionConflict) {
        throw new HttpException(
          { code: 'RECORD_VERSION_CONFLICT', message: 'The record was changed by someone else; reload it and try again.' },
          HttpStatus.PRECONDITION_FAILED,
        );
      }
      throw error;
    }
  }

  async action(
    context: RecordCommandContext,
    entityKey: string,
    id: string,
    actionKey: string,
    body: unknown,
    idempotencyKey: string | undefined,
  ): Promise<RecordValues> {
    const adapter = this.adapter(entityKey);
    const action = adapter.actions?.[actionKey];
    if (!action) throw new NotFoundException({ code: 'RECORD_ACTION_NOT_FOUND', message: `No action ${actionKey} on ${entityKey}.` });
    this.require(context.principal, action.permission);
    this.assertId(id);
    const parameters = body && typeof body === 'object' && !Array.isArray(body) ? (body as RecordValues) : {};
    return this.once(context.principal, idempotencyKey, `action:${entityKey}:${actionKey}:${id}`, parameters, async () =>
      this.readable(context.principal, adapter, await action.run(context, id, parameters)),
    );
  }

  async lookup(
    principal: ModulePrincipal,
    resolverKey: string,
    raw: Readonly<Record<string, unknown>>,
  ): Promise<readonly LookupOption[]> {
    const resolver = this.resolvers.get(resolverKey);
    if (!resolver) throw new NotFoundException({ code: 'LOOKUP_NOT_FOUND', message: `No lookup ${resolverKey}.` });
    this.require(principal, resolver.permission);
    const search = this.text(raw.search, 'search');
    const ids = typeof raw.ids === 'string' && raw.ids.length > 0 ? raw.ids.split(',') : undefined;
    if (ids && (ids.length > MAX_PAGE_SIZE || ids.some((id) => !UUID.test(id)))) {
      throw new BadRequestException({ code: 'RECORD_QUERY_INVALID', message: 'ids must be up to 100 comma-separated UUIDs.' });
    }
    return resolver.resolve(principal, { ...(search ? { search } : {}), ...(ids ? { ids } : {}), limit: 50 });
  }

  private adapter(entityKey: string): RecordAdapter {
    const adapter = ENTITY_KEY.test(entityKey) ? this.adapters.get(entityKey) : undefined;
    if (!adapter) throw new NotFoundException({ code: 'RECORD_ENTITY_NOT_FOUND', message: `No records of ${entityKey}.` });
    return adapter;
  }

  private require(principal: ModulePrincipal, permission: string): void {
    if (!holds(principal, permission)) {
      throw new ForbiddenException({ code: 'RECORD_PERMISSION_DENIED', message: `Missing required permission: ${permission}` });
    }
  }

  private notSupported(entityKey: string, operation: string): HttpException {
    return new HttpException(
      { code: 'RECORD_OPERATION_NOT_SUPPORTED', message: `${entityKey} records cannot be ${operation}d here.` },
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }

  private assertId(id: string): void {
    if (!UUID.test(id)) throw new BadRequestException({ code: 'RECORD_QUERY_INVALID', message: 'The record id must be a UUID.' });
  }

  private text(value: unknown, name: string): string | undefined {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.length > MAX_TEXT) {
      throw new BadRequestException({ code: 'RECORD_QUERY_INVALID', message: `${name} must be text of at most ${MAX_TEXT} characters.` });
    }
    return value.trim();
  }

  private listQuery(adapter: RecordAdapter, raw: Readonly<Record<string, unknown>>): RecordListQuery {
    const invalid = (message: string) => new BadRequestException({ code: 'RECORD_QUERY_INVALID', message });
    const integer = (value: unknown, fallback: number) => (value === undefined ? fallback : Number(value));
    const page = integer(raw.page, 1);
    const pageSize = integer(raw.pageSize, 25);
    if (!Number.isInteger(page) || page < 1) throw invalid('page must be a positive whole number.');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw invalid(`pageSize must be 1 to ${MAX_PAGE_SIZE}.`);
    const search = this.text(raw.search, 'search');
    if (search && !(adapter.searchFields ?? []).length) throw invalid(`${adapter.entityKey} cannot be searched.`);
    const sortField = this.text(raw.sort, 'sort');
    if (sortField && !(adapter.sortFields ?? []).includes(sortField)) throw invalid(`${adapter.entityKey} cannot be sorted by ${sortField}.`);
    const direction = raw.direction === undefined ? 'ASC' : String(raw.direction).toUpperCase();
    if (direction !== 'ASC' && direction !== 'DESC') throw invalid('direction must be ASC or DESC.');
    const filters: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!key.startsWith('filter.')) continue;
      const field = key.slice('filter.'.length);
      if (!(adapter.filterFields ?? []).includes(field)) throw invalid(`${adapter.entityKey} cannot be filtered by ${field}.`);
      const text = this.text(value, key);
      if (text !== undefined) filters[field] = text;
    }
    const parentId = this.text(raw.parentId, 'parentId');
    if (parentId !== undefined) {
      if (!adapter.parentField) throw invalid(`${adapter.entityKey} is not a child of another record.`);
      if (!UUID.test(parentId)) throw invalid('parentId must be a UUID.');
    }
    return {
      page,
      pageSize,
      ...(search ? { search } : {}),
      ...(sortField ? { sortField } : {}),
      sortDirection: direction,
      filters,
      ...(parentId ? { parentId } : {}),
    };
  }

  /** Only declared fields the principal may read, plus id and version. */
  private readable(principal: ModulePrincipal, adapter: RecordAdapter, record: RecordValues): RecordValues {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      const policy = adapter.fields[key];
      if (ALWAYS_RETURNED.includes(key) || (policy && (!policy.readPermission || holds(principal, policy.readPermission)))) {
        result[key] = value;
      }
    }
    return result;
  }

  /** The body's fields, all declared, writable, and permitted; otherwise 400 or 403 naming the fields. */
  private writable(principal: ModulePrincipal, adapter: RecordAdapter, body: unknown): RecordValues {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException({ code: 'RECORD_BODY_INVALID', message: 'The body must be a JSON object of field values.' });
    }
    const unknown: string[] = [];
    const forbidden: string[] = [];
    for (const key of Object.keys(body)) {
      const policy = adapter.fields[key];
      if (!policy || !policy.writable) unknown.push(key);
      else if (policy.writePermission && !holds(principal, policy.writePermission)) forbidden.push(key);
    }
    if (unknown.length > 0) {
      throw new BadRequestException({ code: 'RECORD_FIELD_NOT_WRITABLE', message: `These fields cannot be written: ${unknown.join(', ')}.` });
    }
    if (forbidden.length > 0) {
      throw new ForbiddenException({ code: 'RECORD_FIELD_PERMISSION_DENIED', message: `You may not change: ${forbidden.join(', ')}.` });
    }
    return body as RecordValues;
  }

  private expectedVersion(ifMatch: string | undefined): number {
    const match = ifMatch?.trim().match(/^(?:W\/)?"?(\d{1,9})"?$/);
    if (!match) {
      throw new HttpException(
        { code: 'RECORD_IF_MATCH_REQUIRED', message: 'An update needs If-Match with the version you read.' },
        HttpStatus.PRECONDITION_REQUIRED,
      );
    }
    return Number(match[1]);
  }

  private async once(
    principal: ModulePrincipal,
    key: string | undefined,
    operation: string,
    payload: RecordValues,
    run: () => Promise<RecordValues>,
  ): Promise<RecordValues> {
    if (!key || !UUID.test(key)) {
      throw new BadRequestException({ code: 'RECORD_IDEMPOTENCY_KEY_REQUIRED', message: 'A create or action needs an Idempotency-Key UUID.' });
    }
    const requestHash = createHash('sha256').update(`${operation}\u0000${stableJson(payload)}`).digest('hex');
    const existing = await this.idempotency.claim(principal.tenantId, key, operation, requestHash);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({ code: 'RECORD_IDEMPOTENCY_KEY_REUSED', message: 'This Idempotency-Key was used for a different request.' });
      }
      if (existing.state === 'COMPLETED' && existing.response) return existing.response;
      throw new ConflictException({ code: 'RECORD_REQUEST_IN_PROGRESS', message: 'The same request is still being processed.' });
    }
    try {
      const response = await run();
      await this.idempotency.complete(principal.tenantId, key, response);
      return response;
    } catch (error) {
      await this.idempotency.release(principal.tenantId, key).catch(() => undefined);
      throw error;
    }
  }
}
