import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { boundedJsonMiddleware } from './bounded-json.middleware.js';

// WI-OI-138: the route-scoped JSON parser for mobile work-instruction photos.
function request(body: string, headers: Record<string, string> = {}, method = 'POST') {
  const stream = new PassThrough() as PassThrough & Record<string, unknown>;
  Object.assign(stream, { method, headers: { 'content-type': 'application/json', ...headers } });
  queueMicrotask(() => stream.end(body));
  return stream;
}
function response() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 200, body: '', headers,
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    end(text: string) { this.body = text; },
  };
}
const run = (req: ReturnType<typeof request>, res: ReturnType<typeof response>) =>
  new Promise<unknown>((resolve) => {
    const next = vi.fn((error?: unknown) => resolve({ next: true, error }));
    const done = res.end.bind(res);
    res.end = (text: string) => { done(text); resolve({ next: false }); };
    boundedJsonMiddleware(1024)(req as never, res as never, next);
  });

describe('boundedJsonMiddleware (WI-OI-138)', () => {
  it('parses a JSON body under its cap and marks it parsed for the default parser', async () => {
    const req = request('{"stepKey":"evidence"}');
    expect(await run(req, response())).toEqual({ next: true, error: undefined });
    expect(req.body).toEqual({ stepKey: 'evidence' });
    expect(req._body).toBe(true);
  });

  it('refuses a body over its cap, declared or streamed, with a mobile problem', async () => {
    const declared = response();
    expect(await run(request('{}', { 'content-length': '4096' }), declared)).toEqual({ next: false });
    expect(declared.statusCode).toBe(413);
    expect(JSON.parse(declared.body)).toMatchObject({ code: 'MOBILE_REQUEST_INVALID', status: 413 });
    const streamed = response();
    expect(await run(request(`{"a":"${'x'.repeat(2048)}"}`), streamed)).toEqual({ next: false });
    expect(streamed.statusCode).toBe(413);
  });

  it('refuses malformed JSON and passes other requests through untouched', async () => {
    const bad = response();
    expect(await run(request('{"a":'), bad)).toEqual({ next: false });
    expect(bad.statusCode).toBe(400);
    const get = request('', {}, 'GET');
    expect(await run(get, response())).toEqual({ next: true, error: undefined });
    expect(get.body).toBeUndefined();
  });
});
