import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:https';

// WI-OI-120cf: the local-network HTTPS address for the mobile pilot (owner, 2026-10-22). Phones on the same network
// reach `/mobile/v1/*` and nothing else: every other path, method or oversized request is refused here and never
// reaches the web app. TLS uses a certificate from the local CA the test phones trust (scripts/mobile-lan-certificate.sh).
// Only the mobile headers are forwarded; the web app's own `/mobile/v1` handler applies the rest of the contract.

const UPSTREAM = new URL(process.env.MOBILE_LAN_UPSTREAM ?? 'http://web:5180');
const PORT = Number(process.env.MOBILE_LAN_PORT ?? '8443');
const CERT_DIR = process.env.MOBILE_LAN_CERT_DIR ?? '/run/mobile-lan';
const PREFIX = '/mobile/v1/';
const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 15_000;
const FORWARDED = [
  'accept',
  'authorization',
  'content-length',
  'content-type',
  'idempotency-key',
  'x-correlation-id',
  'x-gigalibs-app-profile',
  'x-gigalibs-app-version',
  'x-gigalibs-installation-id',
  'x-gigalibs-runtime-version',
];
const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
};

function refuse(response, status, code, title) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/problem+json' });
  response.end(JSON.stringify({ type: 'about:blank', title, status, code }));
}

/** A path the proxy forwards: under /mobile/v1/, no dot segments, no encoded slash or dot, no query. */
export function forwardablePath(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith(PREFIX) || rawUrl.length > 512) return null;
  const path = rawUrl.split('?')[0] ?? '';
  if (/(^|\/)\.{1,2}(\/|$)|%2e|%2f|%5c|\\/i.test(path)) return null;
  return /^\/mobile\/v1\/[A-Za-z0-9/_-]+$/.test(path) ? path : null;
}

export function createMobileLanServer(tls) {
  const server = createServer({ ...tls, minVersion: 'TLSv1.2' }, (request, response) => {
    const path = forwardablePath(request.url);
    if (!path || (request.method !== 'GET' && request.method !== 'POST')) {
      request.resume();
      return refuse(response, 404, 'MOBILE_NOT_FOUND', 'There is no such mobile route.');
    }
    const declared = Number(request.headers['content-length'] ?? '0');
    if (!Number.isSafeInteger(declared) || declared > MAX_BODY_BYTES) {
      request.resume();
      return refuse(response, 400, 'MOBILE_REQUEST_INVALID', 'The request does not match its contract.');
    }
    const headers = { host: UPSTREAM.host };
    for (const name of FORWARDED) {
      const value = request.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    const upstream = httpRequest(
      { hostname: UPSTREAM.hostname, port: UPSTREAM.port, path, method: request.method, headers, timeout: UPSTREAM_TIMEOUT_MS },
      (answer) => {
        const out = { ...SECURITY_HEADERS };
        for (const name of ['content-type', 'content-length']) {
          const value = answer.headers[name];
          if (typeof value === 'string') out[name] = value;
        }
        response.writeHead(answer.statusCode ?? 502, out);
        answer.pipe(response);
      },
    );
    let tooLarge = false;
    upstream.on('timeout', () => upstream.destroy(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })));
    upstream.on('error', (error) => {
      if (tooLarge) return;
      if (error.code === 'TIMEOUT') refuse(response, 504, 'MOBILE_UPSTREAM_TIMEOUT', 'The service took too long to answer.');
      else refuse(response, 503, 'MOBILE_UNAVAILABLE', 'The service is unavailable. Try again shortly.');
    });
    // A body sent without a length (chunked) is counted as it arrives and refused once it passes the limit.
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES && !tooLarge) {
        tooLarge = true;
        request.unpipe(upstream);
        upstream.destroy();
        response.setHeader('connection', 'close');
        refuse(response, 400, 'MOBILE_REQUEST_INVALID', 'The request does not match its contract.');
        request.resume();
      }
    });
    request.pipe(upstream);
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  return server;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const server = createMobileLanServer({
    key: readFileSync(`${CERT_DIR}/server.key`),
    cert: readFileSync(`${CERT_DIR}/server.crt`),
  });
  server.listen(PORT, '0.0.0.0', () => console.log(`mobile-lan: https on ${PORT}, forwarding ${PREFIX} to ${UPSTREAM.origin}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
