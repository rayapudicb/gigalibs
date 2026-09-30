/**
 * WI-OI-104d: turning the pages of a source and checking each record. Paging stops at an empty or short page, a
 * missing next cursor or link, a repeated cursor or link, or `maxPages` (then the run is marked truncated). A next
 * link must stay on the source's origin. Records that cannot be identified go to quarantine with a reason instead of
 * stopping the run.
 */

import { createHash } from 'node:crypto';
import type { PullSource, WatermarkFormat } from './pull-source.js';
import type { SourceLogin } from './source-auth.js';
import { SourceError, type SourceHttp } from './source-http.js';

export const MAX_RECORD_BYTES = 256 * 1024;

export function readPath(value: unknown, path: string): unknown {
  if (path === '') return value;
  let current = value;
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export type InspectedRecord =
  | { readonly ok: true; readonly sourceId: string; readonly watermark: Date | null; readonly json: string; readonly payloadSha256: string }
  | { readonly ok: false; readonly sourceId: string | null; readonly reason: string; readonly json: string | null };

export function parseWatermark(value: unknown, format: WatermarkFormat): Date | null {
  if (format === 'iso') {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) return null;
  const date = new Date(format === 'epoch-seconds' ? number * 1000 : number);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatWatermark(date: Date, format: WatermarkFormat): string {
  if (format === 'iso') return date.toISOString();
  return String(format === 'epoch-seconds' ? Math.floor(date.getTime() / 1000) : date.getTime());
}

export function inspectRecord(record: unknown, source: PullSource): InspectedRecord {
  let json: string | null = null;
  try {
    json = JSON.stringify(record);
  } catch {
    return { ok: false, sourceId: null, reason: 'The record cannot be stored as JSON.', json: null };
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, sourceId: null, reason: 'The record is not an object.', json: json.length <= MAX_RECORD_BYTES ? json : null };
  }
  const rawId = readPath(record, source.idField);
  const sourceId = typeof rawId === 'number' && Number.isFinite(rawId) ? String(rawId) : typeof rawId === 'string' && rawId.trim() !== '' && rawId.length <= 256 ? rawId : null;
  if (Buffer.byteLength(json) > MAX_RECORD_BYTES) {
    return { ok: false, sourceId, reason: `The record is larger than ${MAX_RECORD_BYTES / 1024} KB.`, json: null };
  }
  if (!sourceId) return { ok: false, sourceId: null, reason: `The record has no usable id at "${source.idField}".`, json };
  let watermark: Date | null = null;
  if (source.watermark) {
    const raw = readPath(record, source.watermark.field);
    if (raw !== undefined && raw !== null) {
      watermark = parseWatermark(raw, source.watermark.format);
      if (!watermark) return { ok: false, sourceId, reason: `The record's "${source.watermark.field}" is not a readable ${source.watermark.format} time.`, json };
    }
  }
  return { ok: true, sourceId, watermark, json, payloadSha256: createHash('sha256').update(json).digest('hex') };
}

export interface PagingOutcome {
  pages: number;
  truncated: boolean;
}

function firstUrl(source: PullSource, since: Date | null): URL {
  const url = new URL(`${source.baseUrl}${source.resourcePath === '/' ? '' : source.resourcePath}`);
  for (const [key, value] of Object.entries(source.query)) url.searchParams.set(key, value);
  if (since && source.watermark) url.searchParams.set(source.watermark.param, formatWatermark(since, source.watermark.format));
  return url;
}

/**
 * Yields each page's records. `outcome` is filled in as pages are read, so a caller that stops early still knows how
 * far it got.
 */
export async function* pullPages(
  source: PullSource,
  http: SourceHttp,
  login: SourceLogin,
  since: Date | null,
  outcome: PagingOutcome,
): AsyncGenerator<unknown[]> {
  const origin = new URL(source.baseUrl).origin;
  const seen = new Set<string>();
  let url = firstUrl(source, since);
  const paging = source.paging;
  if (paging.style === 'page') {
    url.searchParams.set(paging.pageParam, String(paging.firstPage));
    url.searchParams.set(paging.sizeParam, String(paging.size));
  } else if (paging.style === 'offset') {
    url.searchParams.set(paging.offsetParam, '0');
    url.searchParams.set(paging.limitParam, String(paging.size));
  } else if (paging.style === 'cursor' && paging.sizeParam && paging.size) {
    url.searchParams.set(paging.sizeParam, String(paging.size));
  }

  for (let index = 0; ; index += 1) {
    if (index >= source.maxPages) {
      outcome.truncated = true;
      return;
    }
    seen.add(url.toString());
    const body = await fetchPage(url, http, login);
    outcome.pages += 1;
    const list = readPath(body, source.recordsPath);
    if (!Array.isArray(list)) {
      throw new SourceError('invalid', source.recordsPath ? `The response has no list at "${source.recordsPath}".` : 'The response is not a list of records.');
    }
    yield list;
    if (list.length === 0) return;

    const next = new URL(url);
    if (paging.style === 'none') return;
    if (paging.style === 'page') {
      if (list.length < paging.size) return;
      next.searchParams.set(paging.pageParam, String(paging.firstPage + index + 1));
    } else if (paging.style === 'offset') {
      if (list.length < paging.size) return;
      next.searchParams.set(paging.offsetParam, String((index + 1) * paging.size));
    } else if (paging.style === 'cursor') {
      const cursor = readPath(body, paging.nextCursorPath);
      if ((typeof cursor !== 'string' && typeof cursor !== 'number') || String(cursor) === '') return;
      next.searchParams.set(paging.cursorParam, String(cursor));
    } else {
      const link = readPath(body, paging.nextLinkPath);
      if (typeof link !== 'string' || link === '') return;
      let resolved: URL;
      try {
        resolved = new URL(link, url);
      } catch {
        throw new SourceError('invalid', 'The next link is not a URL.');
      }
      if (resolved.origin !== origin) throw new SourceError('invalid', 'The next link leaves the source; paging stopped.');
      url = resolved;
      if (seen.has(url.toString())) return;
      continue;
    }
    if (seen.has(next.toString())) return;
    url = next;
  }
}

async function fetchPage(url: URL, http: SourceHttp, login: SourceLogin): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    const authorized = await login.request();
    const target = new URL(url);
    for (const [key, value] of Object.entries(authorized.query)) target.searchParams.set(key, value);
    try {
      return (await http.json(target, { headers: authorized.headers })).body;
    } catch (error) {
      if (attempt === 0 && error instanceof SourceError && error.status === 401 && login.rejected()) continue;
      throw error;
    }
  }
}
