/** Browser client for the workflow Analytics BFF (`/api/analytics/...`). */
export async function moduleAnalyticsBffApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/analytics/${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (body as { message?: string; detail?: string }).message ?? (body as { detail?: string }).detail;
    if (response.status === 403) throw new Error(detail ?? 'You do not have permission for this.');
    throw new Error(detail ?? `Request failed (${response.status}).`);
  }
  return body as T;
}
