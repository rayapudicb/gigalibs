import type { IncomingMessage, ServerResponse } from 'node:http';
import { mobileProblem } from '@gigalibs/contracts';

type ParsedRequest = IncomingMessage & { body?: unknown; _body?: boolean };

/**
 * WI-OI-138: a JSON body parser with its own cap, mounted only on routes that carry a bounded photo (mobile work
 * instruction steps); every other route keeps the default 100 KB parser. It marks the request parsed (`_body`), so the
 * default parser skips it. Requests that are not JSON POSTs pass through untouched.
 */
export function boundedJsonMiddleware(limitBytes: number) {
  return (request: ParsedRequest, response: ServerResponse, next: (error?: unknown) => void): void => {
    if (request.method !== 'POST' || request._body || !/^application\/json\b/i.test(request.headers['content-type'] ?? '')) {
      next();
      return;
    }
    let settled = false;
    const refuse = (status: number) => {
      if (settled) return;
      settled = true;
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/problem+json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ ...mobileProblem('MOBILE_REQUEST_INVALID'), status }));
      request.resume();
    };
    const declared = request.headers['content-length'];
    if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > limitBytes)) {
      refuse(413);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > limitBytes) refuse(413);
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      try {
        request.body = size === 0 ? {} : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } catch {
        refuse(400);
        return;
      }
      settled = true;
      request._body = true;
      next();
    });
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      next(error);
    });
  };
}
