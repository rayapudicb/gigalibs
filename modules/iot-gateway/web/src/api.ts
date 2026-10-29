export async function requestIot<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/iot/v1${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload?.message === 'string' ? payload.message : `IoT request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const iotApi = {
  dashboard: () => requestIot<{ kpis: Record<string, number>; recentAlerts: unknown[]; recentDevices: unknown[] }>('/dashboard/summary'),
  devices: () => requestIot<{ items: unknown[] }>('/devices'),
  device: (id: string) => requestIot(`/devices/${id}`),
  createDevice: (body: unknown) =>
    requestIot('/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  alerts: () => requestIot<{ items: unknown[] }>('/alerts'),
  rules: () => requestIot<{ items: unknown[] }>('/rules'),
  protocols: () => requestIot<{ adapters: unknown[] }>('/protocols'),
  discovery: () => requestIot('/discovery'),
  scan: (subnetCidr: string) =>
    requestIot('/discovery/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subnetCidr }),
    }),
};
