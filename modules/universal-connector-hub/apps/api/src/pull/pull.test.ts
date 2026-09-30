import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type PagingOutcome, inspectRecord, pullPages } from './pager.js';
import { nextWatermark } from './pull-runner.js';
import { type PullSource, parsePullCredentials, parsePullSource } from './pull-source.js';
import { SourceLogin, TokenCache } from './source-auth.js';
import { SourceHttp } from './source-http.js';

// WI-OI-104d: the generic REST adapter against a local source that pages, throttles and logs in like real systems.
const items = Array.from({ length: 7 }, (_, index) => ({ id: `h-${index + 1}`, crop: 'maize', kg: 100 + index, updated_at: `2026-09-2${index + 1}T00:00:00Z` }));
let base = '';
let server: Server;
const hits: Record<string, number> = {};
let tokensIssued = 0;

async function body(request: IncomingMessage): Promise<string> {
  let text = '';
  for await (const chunk of request) text += chunk;
  return text;
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://local');
    hits[url.pathname] = (hits[url.pathname] ?? 0) + 1;
    const send = (status: number, value: unknown, headers: Record<string, string> = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(value));
    };
    const since = url.searchParams.get('updated_since');
    const visible = items.filter((item) => !since || item.updated_at >= since);
    switch (url.pathname) {
      case '/token': {
        const form = new URLSearchParams(await body(request));
        const basic = request.headers.authorization === `Basic ${Buffer.from('farm-client:s3cret').toString('base64')}`;
        const inBody = form.get('client_id') === 'farm-client' && form.get('client_secret') === 's3cret';
        if (form.get('grant_type') !== 'client_credentials' || !(basic || inBody)) return send(401, { error: 'invalid_client' });
        tokensIssued += 1;
        return send(200, { access_token: `tok-${tokensIssued}`, expires_in: 3600, token_type: 'Bearer' });
      }
      case '/page': {
        if (request.headers['x-api-key'] !== 'key-1') return send(401, { error: 'no key' });
        const page = Number(url.searchParams.get('page'));
        const size = Number(url.searchParams.get('per_page'));
        return send(200, { data: visible.slice((page - 1) * size, page * size) });
      }
      case '/offset': {
        const offset = Number(url.searchParams.get('offset'));
        const limit = Number(url.searchParams.get('limit'));
        return send(200, visible.slice(offset, offset + limit));
      }
      case '/cursor': {
        const at = Number(url.searchParams.get('cursor') ?? 0);
        return send(200, { results: visible.slice(at, at + 3), meta: { next: at + 3 < visible.length ? String(at + 3) : null } });
      }
      case '/jsonapi': {
        if (request.headers.authorization !== `Bearer tok-${tokensIssued}` || tokensIssued === 0) return send(401, { error: 'expired' });
        const page = Number(url.searchParams.get('page[number]') ?? 1);
        const next = page * 3 < visible.length ? `/jsonapi?page[number]=${page + 1}` : undefined;
        return send(200, { data: visible.slice((page - 1) * 3, page * 3).map((item) => ({ id: item.id, attributes: item })), links: next ? { next } : {} });
      }
      case '/flaky':
        return hits['/flaky'] === 1 ? send(503, { error: 'busy' }, { 'Retry-After': '0' }) : send(200, [items[0]]);
      case '/throttled':
        return send(429, { error: 'slow down' }, { 'Retry-After': '0' });
      case '/escape':
        return send(200, { data: [items[0]], links: { next: 'https://elsewhere.example/steal' } });
      case '/huge':
        return send(200, [{ id: 'x', blob: 'a'.repeat(2048) }]);
      case '/mixed':
        return send(200, [items[0], 'not an object', { crop: 'no id' }, { id: 'h-bad', updated_at: 'yesterday' }, { id: 'h-big', blob: 'b'.repeat(300 * 1024) }]);
      default:
        return send(404, { error: 'unknown' });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  for (const key of Object.keys(hits)) delete hits[key];
});

const http = (overrides: Partial<ConstructorParameters<typeof SourceHttp>[0]> = {}) =>
  new SourceHttp({ allowedOutboundHosts: new Set(['127.0.0.1']), allowInsecureOutbound: true, deadline: Date.now() + 10_000, sleep: async () => undefined, ...overrides });

async function collect(source: PullSource, options: { credentials?: unknown; since?: Date; tokens?: TokenCache; client?: SourceHttp } = {}) {
  const client = options.client ?? http();
  const login = new SourceLogin(source.auth, options.credentials ? parsePullCredentials(options.credentials) : null, client, options.tokens ?? new TokenCache(), 'tenant:conn');
  const outcome: PagingOutcome = { pages: 0, truncated: false };
  const records: unknown[] = [];
  for await (const page of pullPages(source, client, login, options.since ?? null, outcome)) records.push(...page);
  return { records, outcome, requests: client.requests };
}

describe('pull source configuration', () => {
  it('fills sensible defaults and refuses unsafe or malformed settings', () => {
    expect(parsePullSource({ baseUrl: 'https://farm.example/api/' })).toMatchObject({ baseUrl: 'https://farm.example/api', resourcePath: '/', idField: 'id', paging: { style: 'none' }, auth: { kind: 'none' }, maxPages: 50 });
    for (const bad of [
      { baseUrl: 'ftp://farm.example' },
      { baseUrl: 'https://user:pw@farm.example' },
      { baseUrl: 'https://farm.example?x=1' },
      { baseUrl: 'https://farm.example', resourcePath: 'no-slash' },
      { baseUrl: 'https://farm.example', auth: { kind: 'api-key', in: 'header', name: 'Authorization' } },
      { baseUrl: 'https://farm.example', auth: { kind: 'api-key', in: 'header', name: 'X-Tenant-Id' } },
      { baseUrl: 'https://farm.example', paging: { style: 'page', size: 5000 } },
      { baseUrl: 'https://farm.example', paging: { style: 'cursor' } },
      { baseUrl: 'https://farm.example', watermark: { field: 'updated_at', param: 'since', format: 'weekday' } },
      { baseUrl: 'https://farm.example', maxPages: 501 },
    ]) {
      expect(() => parsePullSource(bad), JSON.stringify(bad)).toThrow();
    }
    expect(() => parsePullCredentials({ kind: 'bearer', token: 'a\nb' })).toThrow();
  });
});

describe('paging, logins and records', () => {
  it('pages by number with an API key header and sends the watermark', async () => {
    const source = parsePullSource({
      baseUrl: base, resourcePath: '/page', recordsPath: 'data',
      watermark: { field: 'updated_at', param: 'updated_since', format: 'iso' },
      paging: { style: 'page', size: 3 }, auth: { kind: 'api-key', in: 'header', name: 'X-Api-Key' },
    });
    const all = await collect(source, { credentials: { kind: 'api-key', apiKey: 'key-1' } });
    expect([all.records.length, all.outcome]).toEqual([7, { pages: 3, truncated: false }]);
    const since = await collect(source, { credentials: { kind: 'api-key', apiKey: 'key-1' }, since: new Date('2026-09-25T00:00:00Z') });
    expect(since.records.map((record) => (record as { id: string }).id)).toEqual(['h-5', 'h-6', 'h-7']);
    await expect(collect(source, { credentials: { kind: 'api-key', apiKey: 'wrong' } })).rejects.toMatchObject({ kind: 'refused', status: 401 });
    await expect(collect(source)).rejects.toThrow('store matching credentials');
  });

  it('pages by offset and by cursor, and stops at maxPages marking the run truncated', async () => {
    expect((await collect(parsePullSource({ baseUrl: base, resourcePath: '/offset', paging: { style: 'offset', size: 2 } }))).records).toHaveLength(7);
    const cursor = await collect(parsePullSource({ baseUrl: base, resourcePath: '/cursor', recordsPath: 'results', paging: { style: 'cursor', nextCursorPath: 'meta.next' } }));
    expect([cursor.records.length, cursor.outcome.pages]).toEqual([7, 3]);
    const truncated = await collect(parsePullSource({ baseUrl: base, resourcePath: '/offset', paging: { style: 'offset', size: 2 }, maxPages: 2 }));
    expect([truncated.records.length, truncated.outcome.truncated]).toEqual([4, true]);
  });

  it('follows JSON:API next links with an OAuth2 client-credentials token, reused and renewed after a 401', async () => {
    const tokens = new TokenCache();
    const source = parsePullSource({
      baseUrl: base, resourcePath: '/jsonapi', recordsPath: 'data', idField: 'id',
      paging: { style: 'next-link', nextLinkPath: 'links.next' },
      auth: { kind: 'oauth2-client-credentials', tokenUrl: `${base}/token`, clientAuth: 'body' },
    });
    const credentials = { kind: 'oauth2-client-credentials', clientId: 'farm-client', clientSecret: 's3cret' };
    const first = await collect(source, { credentials, tokens });
    expect([first.records.length, hits['/token']]).toEqual([7, 1]);
    await collect(source, { credentials, tokens });
    expect(hits['/token']).toBe(1);
    tokens.set('tenant:conn', 'stale', 3600);
    expect((await collect(source, { credentials, tokens })).records).toHaveLength(7);
    expect(hits['/token']).toBe(2);
    const basic = parsePullSource({ ...source, auth: { kind: 'oauth2-client-credentials', tokenUrl: `${base}/token` } });
    expect((await collect(basic, { credentials })).records).toHaveLength(7);
    await expect(collect(source, { credentials: { ...credentials, clientSecret: 'nope' } })).rejects.toThrow('refused the client credentials');
  });

  it('retries throttling and outages within the deadline, then reports the source unavailable', async () => {
    const flaky = await collect(parsePullSource({ baseUrl: base, resourcePath: '/flaky' }));
    expect([flaky.records.length, hits['/flaky']]).toEqual([1, 2]);
    await expect(collect(parsePullSource({ baseUrl: base, resourcePath: '/throttled' }))).rejects.toMatchObject({ kind: 'unavailable', status: 429 });
    expect(hits['/throttled']).toBe(4);
    await expect(collect(parsePullSource({ baseUrl: 'http://127.0.0.1:1', resourcePath: '/x' }))).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('refuses hosts off the allowlist, next links that leave the source, and oversized pages', async () => {
    await expect(collect(parsePullSource({ baseUrl: base, resourcePath: '/page' }), { client: http({ allowedOutboundHosts: new Set(['farm.example']) }) })).rejects.toThrow('allowlist');
    await expect(collect(parsePullSource({ baseUrl: base, resourcePath: '/escape', recordsPath: 'data', paging: { style: 'next-link', nextLinkPath: 'links.next' } }))).rejects.toThrow('leaves the source');
    await expect(collect(parsePullSource({ baseUrl: base, resourcePath: '/huge' }), { client: http({ maxBytes: 1024 }) })).rejects.toThrow('smaller page size');
  });

  it('keeps identifiable records and quarantines the rest with a reason', async () => {
    const source = parsePullSource({ baseUrl: base, resourcePath: '/mixed', watermark: { field: 'updated_at', param: 'since', format: 'iso' } });
    const inspected = (await collect(source)).records.map((record) => inspectRecord(record, source));
    expect(inspected.map((record) => (record.ok ? 'ok' : record.reason))).toEqual([
      'ok',
      'The record is not an object.',
      'The record has no usable id at "id".',
      'The record\'s "updated_at" is not a readable iso time.',
      'The record is larger than 256 KB.',
    ]);
    expect(inspected[0]).toMatchObject({ ok: true, sourceId: 'h-1', watermark: new Date('2026-09-21T00:00:00Z') });
  });

  it('moves the watermark only as far as the records prove', () => {
    const [a, b] = [new Date('2026-09-21T00:00:00Z'), new Date('2026-09-25T00:00:00Z')];
    expect(nextWatermark(null, b, a, false, false)).toBe(b.toISOString());
    expect(nextWatermark(a.toISOString(), b, b, true, true)).toBe(b.toISOString());
    expect(nextWatermark(a.toISOString(), b, a, true, false)).toBe(a.toISOString());
    expect(nextWatermark(b.toISOString(), a, a, false, true)).toBe(b.toISOString());
    expect(nextWatermark(null, null, null, false, true)).toBeNull();
  });
});
