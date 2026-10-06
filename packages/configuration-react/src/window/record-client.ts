// WI-OI-120f (F0.4): the browser side of the module SDK's record routes (F0.3). Every call goes through the web
// app's signed module gateway (`/api/<module>/v1/...`); the browser never names a tenant.

export type RecordValues = Readonly<Record<string, unknown>>;

export interface RecordPage {
  readonly items: readonly RecordValues[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface RecordListRequest {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly sort?: string;
  readonly direction?: 'ASC' | 'DESC';
  readonly filters?: Readonly<Record<string, string>>;
  readonly parentId?: string;
}

export interface LookupOption {
  readonly value: string;
  readonly label: string;
}

export interface RecordClient {
  list(entityKey: string, request?: RecordListRequest): Promise<RecordPage>;
  get(entityKey: string, id: string): Promise<RecordValues>;
  /** `idempotencyKey` is made once per form, so a retry after a network failure cannot save twice. */
  create(entityKey: string, values: RecordValues, idempotencyKey: string): Promise<RecordValues>;
  /** `version` is the version the user read; a newer one on the server answers 412. */
  update(entityKey: string, id: string, values: RecordValues, version: number): Promise<RecordValues>;
  action(entityKey: string, id: string, actionKey: string, parameters: RecordValues, idempotencyKey: string): Promise<RecordValues>;
  lookup(resolverKey: string, request: { readonly search?: string; readonly ids?: readonly string[] }): Promise<readonly LookupOption[]>;
}

/** A refused or failed record call, with the HTTP status and the server's code, message and per-field messages. */
export class RecordClientError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly code: string | undefined,
    message: string,
    /** WI-OI-120r (S1): a `RECORD_RULES` refusal names each field and why, for the form to show under it. */
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'RecordClientError';
  }
}

function fieldMessages(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

export interface RecordClientOptions {
  /** The module's gateway base path, for example `/api/universal-inventory`. */
  readonly basePath: string;
  /** Lookups served by another module, for example `{ 'catalogue-products': '/api/product-catalogue' }`. */
  readonly lookupBasePaths?: Readonly<Record<string, string>>;
  readonly fetch?: typeof fetch;
}

export function createRecordClient(options: RecordClientOptions): RecordClient {
  const send = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const base = options.basePath.replace(/\/$/, '');
  const records = (entityKey: string, suffix = '') => `${base}/v1/records/${encodeURIComponent(entityKey)}${suffix}`;

  async function call(url: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await send(url, {
        ...init,
        cache: 'no-store',
        headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      });
    } catch {
      throw new RecordClientError(undefined, 'NETWORK', 'The service could not be reached.');
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body && typeof body === 'object' ? (body as { code?: unknown; message?: unknown; detail?: unknown; fields?: unknown }) : {};
      const message =
        typeof detail.message === 'string' ? detail.message : typeof detail.detail === 'string' ? detail.detail : `Request failed (${response.status}).`;
      throw new RecordClientError(response.status, typeof detail.code === 'string' ? detail.code : undefined, message, fieldMessages(detail.fields));
    }
    return body;
  }

  return {
    async list(entityKey, request = {}) {
      const query = new URLSearchParams();
      if (request.page) query.set('page', String(request.page));
      if (request.pageSize) query.set('pageSize', String(request.pageSize));
      if (request.search) query.set('search', request.search);
      if (request.sort) query.set('sort', request.sort);
      if (request.direction) query.set('direction', request.direction);
      if (request.parentId) query.set('parentId', request.parentId);
      for (const [field, value] of Object.entries(request.filters ?? {})) query.set(`filter.${field}`, value);
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return (await call(`${records(entityKey)}${suffix}`)) as RecordPage;
    },
    async get(entityKey, id) {
      return (await call(records(entityKey, `/${encodeURIComponent(id)}`))) as RecordValues;
    },
    async create(entityKey, values, idempotencyKey) {
      return (await call(records(entityKey), {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(values),
      })) as RecordValues;
    },
    async update(entityKey, id, values, version) {
      return (await call(records(entityKey, `/${encodeURIComponent(id)}`), {
        method: 'PATCH',
        headers: { 'If-Match': `"${version}"` },
        body: JSON.stringify(values),
      })) as RecordValues;
    },
    async action(entityKey, id, actionKey, parameters, idempotencyKey) {
      return (await call(records(entityKey, `/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionKey)}`), {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(parameters),
      })) as RecordValues;
    },
    async lookup(resolverKey, request) {
      const lookupBase = (options.lookupBasePaths?.[resolverKey] ?? base).replace(/\/$/, '');
      const query = new URLSearchParams();
      if (request.search) query.set('search', request.search);
      if (request.ids?.length) query.set('ids', request.ids.join(','));
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return (await call(`${lookupBase}/v1/lookups/${encodeURIComponent(resolverKey)}${suffix}`)) as readonly LookupOption[];
    },
  };
}
