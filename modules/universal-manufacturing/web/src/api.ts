export async function requestManufacturing<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/universal-manufacturing/v1${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload?.message === 'string' ? payload.message : `Manufacturing request failed (${response.status}).`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const manufacturingApi = {
  listBoms: () => requestManufacturing<unknown[]>('/boms'),
  bomTree: (id: string) =>
    requestManufacturing<{ bom: unknown; unitRequirements: unknown[] }>(`/boms/${id}/tree`),
  whereUsed: (productId: string) => requestManufacturing<unknown[]>(`/boms/where-used/${productId}`),
  bomShortages: (id: string, warehouseId: string, quantity: string) =>
    requestManufacturing<{ bomId: string; lines: unknown[] }>(
      `/boms/${id}/shortages?warehouseId=${encodeURIComponent(warehouseId)}&quantity=${encodeURIComponent(quantity)}`),
  createBom: (body: unknown) => requestManufacturing('/boms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  listWorkCenters: () => requestManufacturing<unknown[]>('/work-centers'),
  createWorkCenter: (body: unknown) => requestManufacturing('/work-centers', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  listRoutings: () => requestManufacturing<unknown[]>('/routings'),
  createRouting: (body: unknown) => requestManufacturing('/routings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  listProductionOrders: () => requestManufacturing<unknown[]>('/production-orders'),
  productionOrder: (id: string) => requestManufacturing<unknown>(`/production-orders/${id}`),
  createProductionOrder: (body: unknown) =>
    requestManufacturing('/production-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  releaseProductionOrder: (id: string) =>
    requestManufacturing(`/production-orders/${id}/release`, { method: 'POST' }),
  issueProductionOrder: (id: string) =>
    requestManufacturing(`/production-orders/${id}/issue`, { method: 'POST' }),
  completeProductionOrder: (id: string) =>
    requestManufacturing(`/production-orders/${id}/complete`, { method: 'POST' }),
  mrpPreview: (body: unknown) =>
    requestManufacturing('/mrp/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
