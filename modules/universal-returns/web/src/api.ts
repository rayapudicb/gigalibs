import type {
  RmaDispositionCode,
  RmaV1,
  RecordRmaDispositionInputV1,
  RequestRmaCreditMemoInputV1,
  RmaDocumentActionInputV1,
} from '@gigalibs/contracts';

async function requestReturns<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/universal-returns/v1${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
    const detail =
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.code === 'string'
          ? payload.code
          : `Returns request failed (${response.status}).`;
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const returnsApi = {
  listRmas: () => requestReturns<{ items: RmaV1[] }>('/rmas'),
  getRma: (id: string) => requestReturns<RmaV1>(`/rmas/${id}`),
  submit: (id: string, body: RmaDocumentActionInputV1) =>
    requestReturns<RmaV1>(`/rmas/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  authorize: (id: string, body: RmaDocumentActionInputV1) =>
    requestReturns<RmaV1>(`/rmas/${id}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  recordDisposition: (id: string, body: RecordRmaDispositionInputV1) =>
    requestReturns<RmaV1>(`/rmas/${id}/dispositions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  requestCreditMemo: (id: string, body: RequestRmaCreditMemoInputV1) =>
    requestReturns<RmaV1>(`/rmas/${id}/credit-memo-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

export type { RmaDispositionCode, RmaV1 };
