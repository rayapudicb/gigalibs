export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === 'object'
        ? (payload as { detail?: unknown; message?: unknown })
        : null;
    const detail =
      typeof errorPayload?.detail === 'string'
        ? errorPayload.detail
        : typeof errorPayload?.message === 'string'
          ? errorPayload.message
          : null;
    const rawDetail = detail ?? 'The request failed.';
    const sanitizedDetail = rawDetail.toLowerCase().includes('upstream service is unavailable')
      ? 'Service is temporarily synchronizing. Please try again shortly.'
      : rawDetail;
    throw new ApiError(sanitizedDetail, response.status);
  }
  return payload as T;
}
