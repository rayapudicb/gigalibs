/**
 * WI-OI-104d: the pull-source form's flat fields and the Connector Hub pull source they describe. Connector Hub
 * validates the result; this only shapes it, keeping settings for paging styles and logins that are not chosen out
 * of the request.
 */

export type PagingStyle = 'none' | 'page' | 'offset' | 'cursor' | 'next-link';
export type LoginKind = 'none' | 'api-key' | 'bearer' | 'oauth2-client-credentials';

export interface PullSourceForm {
  baseUrl: string;
  resourcePath: string;
  /** Fixed query parameters, one `key=value` per line. */
  query: string;
  recordsPath: string;
  idField: string;
  watermarkField: string;
  watermarkParam: string;
  watermarkFormat: 'iso' | 'epoch-seconds' | 'epoch-millis';
  pagingStyle: PagingStyle;
  pageParam: string;
  sizeParam: string;
  size: string;
  firstPage: '0' | '1';
  offsetParam: string;
  limitParam: string;
  cursorParam: string;
  nextCursorPath: string;
  nextLinkPath: string;
  loginKind: LoginKind;
  apiKeyIn: 'header' | 'query';
  apiKeyName: string;
  tokenUrl: string;
  scope: string;
  clientAuth: 'basic' | 'body';
  maxPages: string;
}

export const EMPTY_PULL_SOURCE_FORM: PullSourceForm = {
  baseUrl: '',
  resourcePath: '/',
  query: '',
  recordsPath: '',
  idField: 'id',
  watermarkField: '',
  watermarkParam: '',
  watermarkFormat: 'iso',
  pagingStyle: 'none',
  pageParam: 'page',
  sizeParam: 'per_page',
  size: '100',
  firstPage: '1',
  offsetParam: 'offset',
  limitParam: 'limit',
  cursorParam: 'cursor',
  nextCursorPath: '',
  nextLinkPath: 'links.next',
  loginKind: 'none',
  apiKeyIn: 'header',
  apiKeyName: 'X-Api-Key',
  tokenUrl: '',
  scope: '',
  clientAuth: 'basic',
  maxPages: '50',
};

const str = (value: unknown, fallback: string) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** The form for a stored pull source; missing parts fall back to the defaults. */
export function formFromSource(stored: unknown): PullSourceForm {
  const source = obj(stored);
  const watermark = obj(source.watermark);
  const paging = obj(source.paging);
  const auth = obj(source.auth);
  const empty = EMPTY_PULL_SOURCE_FORM;
  return {
    baseUrl: str(source.baseUrl, empty.baseUrl),
    resourcePath: str(source.resourcePath, empty.resourcePath),
    query: Object.entries(obj(source.query))
      .map(([key, value]) => `${key}=${str(value, '')}`)
      .join('\n'),
    recordsPath: str(source.recordsPath, empty.recordsPath),
    idField: str(source.idField, empty.idField),
    watermarkField: str(watermark.field, ''),
    watermarkParam: str(watermark.param, ''),
    watermarkFormat: watermark.format === 'epoch-seconds' || watermark.format === 'epoch-millis' ? watermark.format : 'iso',
    pagingStyle: (['none', 'page', 'offset', 'cursor', 'next-link'] as const).find((style) => style === paging.style) ?? 'none',
    pageParam: str(paging.pageParam, empty.pageParam),
    sizeParam: str(paging.sizeParam, empty.sizeParam),
    size: str(paging.size, empty.size),
    firstPage: paging.firstPage === 0 ? '0' : '1',
    offsetParam: str(paging.offsetParam, empty.offsetParam),
    limitParam: str(paging.limitParam, empty.limitParam),
    cursorParam: str(paging.cursorParam, empty.cursorParam),
    nextCursorPath: str(paging.nextCursorPath, empty.nextCursorPath),
    nextLinkPath: str(paging.nextLinkPath, empty.nextLinkPath),
    loginKind: (['none', 'api-key', 'bearer', 'oauth2-client-credentials'] as const).find((kind) => kind === auth.kind) ?? 'none',
    apiKeyIn: auth.in === 'query' ? 'query' : 'header',
    apiKeyName: str(auth.name, empty.apiKeyName),
    tokenUrl: str(auth.tokenUrl, ''),
    scope: str(auth.scope, ''),
    clientAuth: auth.clientAuth === 'body' ? 'body' : 'basic',
    maxPages: str(source.maxPages, empty.maxPages),
  };
}

const whole = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);

/** The pull source Connector Hub stores; only the chosen paging style's and login's settings are sent. */
export function sourceFromForm(form: PullSourceForm): Record<string, unknown> {
  const paging: Record<string, unknown> = { style: form.pagingStyle };
  if (form.pagingStyle === 'page') Object.assign(paging, { pageParam: form.pageParam.trim(), sizeParam: form.sizeParam.trim(), size: whole(form.size), firstPage: Number(form.firstPage) });
  if (form.pagingStyle === 'offset') Object.assign(paging, { offsetParam: form.offsetParam.trim(), limitParam: form.limitParam.trim(), size: whole(form.size) });
  if (form.pagingStyle === 'cursor') Object.assign(paging, { cursorParam: form.cursorParam.trim(), nextCursorPath: form.nextCursorPath.trim() });
  if (form.pagingStyle === 'next-link') Object.assign(paging, { nextLinkPath: form.nextLinkPath.trim() });
  const auth: Record<string, unknown> = { kind: form.loginKind };
  if (form.loginKind === 'api-key') Object.assign(auth, { in: form.apiKeyIn, name: form.apiKeyName.trim() });
  if (form.loginKind === 'oauth2-client-credentials') {
    Object.assign(auth, { tokenUrl: form.tokenUrl.trim(), clientAuth: form.clientAuth, ...(form.scope.trim() ? { scope: form.scope.trim() } : {}) });
  }
  return {
    baseUrl: form.baseUrl.trim(),
    resourcePath: form.resourcePath.trim() || '/',
    query: Object.fromEntries(
      form.query
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const at = line.indexOf('=');
          return at < 0 ? [line, ''] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
        }),
    ),
    recordsPath: form.recordsPath.trim(),
    idField: form.idField.trim() || 'id',
    ...(form.watermarkField.trim() || form.watermarkParam.trim()
      ? { watermark: { field: form.watermarkField.trim(), param: form.watermarkParam.trim(), format: form.watermarkFormat } }
      : {}),
    paging,
    auth,
    maxPages: whole(form.maxPages),
  };
}

/** The secret fields each login needs; the values are sent once and never shown again. */
export function credentialFields(kind: LoginKind): ReadonlyArray<{ key: string; label: string }> {
  if (kind === 'api-key') return [{ key: 'apiKey', label: 'API key' }];
  if (kind === 'bearer') return [{ key: 'token', label: 'Token' }];
  if (kind === 'oauth2-client-credentials') {
    return [
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client secret' },
    ];
  }
  return [];
}
