import type {
  CreateSpatialNodeTypeV1,
  CreateSpatialNodeV1,
  ImportSpatialNodesV1,
  MoveSpatialNodeV1,
  SpatialNodeDetailV1,
  SpatialNodeImportResultV1,
  SpatialNodePageV1,
  SpatialNodeTypeV1,
  UpdateSpatialNodeV1,
  MobileSpatialSyncResponseV1,
} from '@gigalibs/contracts';

export interface GeospatialApiError extends Error {
  status?: number;
  errorCode?: string;
}

export async function requestGeospatial<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/maps${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.location.assign('/login');
    const payload: unknown = await response.json().catch(() => null);
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const nested = body.message && typeof body.message === 'object' ? (body.message as Record<string, unknown>) : null;
    const issues = Array.isArray(nested?.issues) ? (nested.issues as { message?: unknown }[]) : [];
    const detail =
      stringValue(issues[0]?.message) ??
      stringValue(nested?.message) ??
      stringValue(body.title) ??
      stringValue(body.message) ??
      `Geospatial request failed (${response.status}).`;
    const error = new Error(detail) as GeospatialApiError;
    error.status = response.status;
    error.errorCode = stringValue(nested?.code) ?? stringValue(body.code);
    throw error;
  }
  return (await response.json()) as T;
}

export const geospatialApi = {
  listNodeTypes: () => requestGeospatial<{ items: SpatialNodeTypeV1[] }>('/node-types'),
  createNodeType: (input: CreateSpatialNodeTypeV1) =>
    requestGeospatial<SpatialNodeTypeV1>('/node-types', jsonRequest('POST', input)),
  listNodes: (params: { q?: string; pageSize?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    search.set('pageSize', String(params.pageSize ?? 200));
    return requestGeospatial<SpatialNodePageV1>(`/nodes?${search.toString()}`);
  },
  getNode: (id: string) => requestGeospatial<SpatialNodeDetailV1>(`/nodes/${encodeURIComponent(id)}`),
  createNode: (input: CreateSpatialNodeV1) =>
    requestGeospatial<SpatialNodeDetailV1>('/nodes', jsonRequest('POST', input)),
  updateNode: (id: string, input: UpdateSpatialNodeV1) =>
    requestGeospatial<SpatialNodeDetailV1>(`/nodes/${encodeURIComponent(id)}`, jsonRequest('PATCH', input)),
  moveNode: (id: string, input: MoveSpatialNodeV1) =>
    requestGeospatial<SpatialNodeDetailV1>(`/nodes/${encodeURIComponent(id)}/move`, jsonRequest('POST', input)),
  importNodes: (input: ImportSpatialNodesV1) =>
    requestGeospatial<SpatialNodeImportResultV1>('/nodes/import', jsonRequest('POST', input)),
  mobileSync: (params: { since?: string; under?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.since) search.set('since', params.since);
    if (params.under) search.set('under', params.under);
    return requestGeospatial<MobileSpatialSyncResponseV1>(`/nodes/mobile/sync?${search.toString()}`);
  },
  lookupTag: (tag: string) =>
    requestGeospatial<SpatialNodeDetailV1>(`/nodes/lookup/tag?tag=${encodeURIComponent(tag)}`),
};

function jsonRequest(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
