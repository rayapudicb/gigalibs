/**
 * WI-OI-104d: a connection's pull source, the configuration of the generic REST adapter. Everything that differs
 * between systems (where records are, how pages turn, how to log in, which field is the watermark) is data, so a new
 * REST source needs no code. Secrets are never part of it: they live encrypted in `connector_credentials`.
 */

export type PagingConfig =
  | { readonly style: 'none' }
  | { readonly style: 'page'; readonly pageParam: string; readonly sizeParam: string; readonly size: number; readonly firstPage: number }
  | { readonly style: 'offset'; readonly offsetParam: string; readonly limitParam: string; readonly size: number }
  | { readonly style: 'cursor'; readonly cursorParam: string; readonly nextCursorPath: string; readonly sizeParam?: string; readonly size?: number }
  | { readonly style: 'next-link'; readonly nextLinkPath: string };

export type AuthConfig =
  | { readonly kind: 'none' }
  | { readonly kind: 'api-key'; readonly in: 'header' | 'query'; readonly name: string }
  | { readonly kind: 'bearer' }
  | { readonly kind: 'oauth2-client-credentials'; readonly tokenUrl: string; readonly scope?: string; readonly clientAuth: 'basic' | 'body' };

export type WatermarkFormat = 'iso' | 'epoch-seconds' | 'epoch-millis';

export interface PullSource {
  readonly baseUrl: string;
  readonly resourcePath: string;
  readonly query: Readonly<Record<string, string>>;
  /** Dot path to the list of records in each response; empty when the response is the list. */
  readonly recordsPath: string;
  readonly idField: string;
  readonly watermark?: { readonly field: string; readonly param: string; readonly format: WatermarkFormat };
  readonly paging: PagingConfig;
  readonly auth: AuthConfig;
  readonly maxPages: number;
}

export type PullCredentials =
  | { readonly kind: 'api-key'; readonly apiKey: string }
  | { readonly kind: 'bearer'; readonly token: string }
  | { readonly kind: 'oauth2-client-credentials'; readonly clientId: string; readonly clientSecret: string };

export class PullConfigError extends Error {}

const PARAM = /^[A-Za-z0-9_.[\]-]{1,64}$/;
const PATH = /^[A-Za-z0-9_-]{1,64}(\.[A-Za-z0-9_-]{1,64}){0,7}$/;
const HEADER = /^[A-Za-z0-9-]{1,64}$/;
const RESOURCE = /^\/[A-Za-z0-9_\-./~%:@]{0,511}$/;
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'cookie', 'connection', 'transfer-encoding', 'authorization', 'x-tenant-id']);

function fail(message: string): never {
  throw new PullConfigError(message);
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${what} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, what: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${what} is not valid.`);
  return value;
}

function size(value: unknown, what: string, fallback: number, max = 1000): number {
  const number = value === undefined ? fallback : value;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1 || number > max) fail(`${what} must be a whole number from 1 to ${max}.`);
  return number;
}

/** An http(s) URL with no credentials, query or fragment. Whether its host may be reached is checked at pull time. */
export function sourceUrl(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length > 512) fail(`${what} is not valid.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(`${what} is not a URL.`);
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    fail(`${what} must be an http(s) URL without credentials, query or fragment.`);
  }
  return url.toString().replace(/\/+$/, '');
}

function paging(value: unknown): PagingConfig {
  const input = value === undefined ? { style: 'none' } : record(value, 'paging');
  switch (input.style) {
    case 'none':
      return { style: 'none' };
    case 'page':
      return {
        style: 'page',
        pageParam: text(input.pageParam ?? 'page', 'paging.pageParam', PARAM),
        sizeParam: text(input.sizeParam ?? 'per_page', 'paging.sizeParam', PARAM),
        size: size(input.size, 'paging.size', 100),
        firstPage: input.firstPage === 0 ? 0 : 1,
      };
    case 'offset':
      return {
        style: 'offset',
        offsetParam: text(input.offsetParam ?? 'offset', 'paging.offsetParam', PARAM),
        limitParam: text(input.limitParam ?? 'limit', 'paging.limitParam', PARAM),
        size: size(input.size, 'paging.size', 100),
      };
    case 'cursor':
      return {
        style: 'cursor',
        cursorParam: text(input.cursorParam ?? 'cursor', 'paging.cursorParam', PARAM),
        nextCursorPath: text(input.nextCursorPath, 'paging.nextCursorPath', PATH),
        ...(input.sizeParam !== undefined ? { sizeParam: text(input.sizeParam, 'paging.sizeParam', PARAM), size: size(input.size, 'paging.size', 100) } : {}),
      };
    case 'next-link':
      return { style: 'next-link', nextLinkPath: text(input.nextLinkPath, 'paging.nextLinkPath', PATH) };
    default:
      return fail('paging.style must be none, page, offset, cursor or next-link.');
  }
}

function auth(value: unknown): AuthConfig {
  const input = value === undefined ? { kind: 'none' } : record(value, 'auth');
  switch (input.kind) {
    case 'none':
      return { kind: 'none' };
    case 'api-key': {
      const where = input.in === 'query' ? 'query' : input.in === 'header' || input.in === undefined ? 'header' : fail('auth.in must be header or query.');
      const name = text(input.name, 'auth.name', where === 'header' ? HEADER : PARAM);
      if (where === 'header' && FORBIDDEN_HEADERS.has(name.toLowerCase())) fail(`auth.name cannot be ${name}.`);
      return { kind: 'api-key', in: where, name };
    }
    case 'bearer':
      return { kind: 'bearer' };
    case 'oauth2-client-credentials':
      return {
        kind: 'oauth2-client-credentials',
        tokenUrl: sourceUrl(input.tokenUrl, 'auth.tokenUrl'),
        ...(input.scope !== undefined ? { scope: text(input.scope, 'auth.scope', /^[\x21-\x7e ]{1,256}$/) } : {}),
        clientAuth: input.clientAuth === 'body' ? 'body' : 'basic',
      };
    default:
      return fail('auth.kind must be none, api-key, bearer or oauth2-client-credentials.');
  }
}

export function parsePullSource(value: unknown): PullSource {
  const input = record(value, 'The pull source');
  const query: Record<string, string> = {};
  for (const [key, entry] of Object.entries(input.query === undefined ? {} : record(input.query, 'query'))) {
    if (Object.keys(query).length >= 20) fail('query may have at most 20 parameters.');
    query[text(key, 'A query parameter name', PARAM)] = text(entry, `query.${key}`, /^[^\r\n]{0,256}$/);
  }
  const watermark = input.watermark === undefined ? undefined : record(input.watermark, 'watermark');
  const format = watermark?.format ?? 'iso';
  if (!['iso', 'epoch-seconds', 'epoch-millis'].includes(format as string)) fail('watermark.format must be iso, epoch-seconds or epoch-millis.');
  const recordsPath = input.recordsPath === undefined || input.recordsPath === '' ? '' : text(input.recordsPath, 'recordsPath', PATH);
  return {
    baseUrl: sourceUrl(input.baseUrl, 'baseUrl'),
    resourcePath: input.resourcePath === undefined ? '/' : text(input.resourcePath, 'resourcePath', RESOURCE),
    query,
    recordsPath,
    idField: input.idField === undefined ? 'id' : text(input.idField, 'idField', PATH),
    ...(watermark
      ? { watermark: { field: text(watermark.field, 'watermark.field', PATH), param: text(watermark.param, 'watermark.param', PARAM), format: format as WatermarkFormat } }
      : {}),
    paging: paging(input.paging),
    auth: auth(input.auth),
    maxPages: size(input.maxPages, 'maxPages', 50, 500),
  };
}

export function parsePullCredentials(value: unknown): PullCredentials {
  const input = record(value, 'The credentials');
  const secret = (field: unknown, what: string) => text(field, what, /^[^\r\n]{1,4096}$/);
  switch (input.kind) {
    case 'api-key':
      return { kind: 'api-key', apiKey: secret(input.apiKey, 'apiKey') };
    case 'bearer':
      return { kind: 'bearer', token: secret(input.token, 'token') };
    case 'oauth2-client-credentials':
      return { kind: 'oauth2-client-credentials', clientId: secret(input.clientId, 'clientId'), clientSecret: secret(input.clientSecret, 'clientSecret') };
    default:
      return fail('kind must be api-key, bearer or oauth2-client-credentials.');
  }
}
