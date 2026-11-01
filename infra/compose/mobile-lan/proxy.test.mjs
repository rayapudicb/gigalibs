// WI-OI-120cf: the mobile pilot's local-network HTTPS proxy over real TLS, with a certificate from
// scripts/mobile-lan-certificate.sh: only /mobile/v1/* reaches the web app, with only the mobile headers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const certificates = mkdtempSync(join(tmpdir(), 'mobile-lan-proof-'));
const received = [];
let upstreamAnswer = { status: 200, body: '{"contractVersion":"mobile-session.v3"}' };
const upstream = createServer((incoming, answer) => {
  let body = '';
  incoming.on('data', (chunk) => {
    body += chunk;
  });
  incoming.on('end', () => {
    received.push({ method: incoming.method, url: incoming.url, headers: incoming.headers, body });
    answer.writeHead(upstreamAnswer.status, { 'content-type': 'application/json', 'set-cookie': 'web=1', 'x-powered-by': 'Next.js' });
    answer.end(upstreamAnswer.body);
  });
});

let proxy;
let port;
let ca;

function call(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      { host: '127.0.0.1', port, path, method, headers, ca, checkServerIdentity: () => undefined },
      (answer) => {
        let text = '';
        answer.on('data', (chunk) => {
          text += chunk;
        });
        answer.on('end', () => resolve({ status: answer.statusCode, headers: answer.headers, text }));
      },
    );
    outgoing.on('error', reject);
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
  });
}

describe('mobile LAN proxy', () => {
  beforeAll(async () => {
    execFileSync('bash', [join(root, 'scripts/mobile-lan-certificate.sh'), certificates, '10.0.0.10', 'proof-mac.local'], { stdio: 'ignore' });
    ca = readFileSync(join(certificates, 'ca.crt'));
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    process.env.MOBILE_LAN_UPSTREAM = `http://127.0.0.1:${upstream.address().port}`;
    const { createMobileLanServer } = await import('./proxy.mjs');
    proxy = createMobileLanServer({ key: readFileSync(join(certificates, 'server.key')), cert: readFileSync(join(certificates, 'server.crt')) });
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    port = proxy.address().port;
  });

  afterAll(() => {
    proxy?.close();
    upstream.close();
    rmSync(certificates, { recursive: true, force: true });
  });

  it('issues a server certificate for the address and name, signed by the local authority', () => {
    const text = execFileSync('openssl', ['x509', '-in', join(certificates, 'server.crt'), '-noout', '-ext', 'subjectAltName,extendedKeyUsage'], { encoding: 'utf8' });
    assert.match(text, /IP Address:10\.0\.0\.10/);
    assert.match(text, /DNS:proof-mac\.local/);
    assert.match(text, /TLS Web Server Authentication/);
    execFileSync('openssl', ['verify', '-CAfile', join(certificates, 'ca.crt'), join(certificates, 'server.crt')]);
  });

  it('forwards a mobile route with only the mobile headers, and answers without cookies', async () => {
    received.length = 0;
    const answer = await call('/mobile/v1/auth/password?tenant=t-2', {
      method: 'POST',
      body: '{"contractVersion":"mobile-password-sign-in.v1"}',
      headers: {
        'content-type': 'application/json',
        cookie: 'gigalibs_access_token=web',
        'x-tenant-id': 'tenant-2',
        'x-forwarded-for': '10.0.0.99',
        'x-gigalibs-installation-id': '0199d6f4-3af2-7b4e-8eb2-4e58b2be4a01',
        authorization: 'Bearer mobile',
      },
    });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.equal(answer.headers['x-content-type-options'], 'nosniff');
    assert.equal(answer.headers['set-cookie'], undefined);
    assert.equal(answer.headers['x-powered-by'], undefined);
    const [forwarded] = received;
    assert.equal(forwarded.url, '/mobile/v1/auth/password');
    assert.equal(forwarded.body, '{"contractVersion":"mobile-password-sign-in.v1"}');
    assert.equal(forwarded.headers.authorization, 'Bearer mobile');
    assert.equal(forwarded.headers['x-gigalibs-installation-id'], '0199d6f4-3af2-7b4e-8eb2-4e58b2be4a01');
    for (const name of ['cookie', 'x-tenant-id', 'x-forwarded-for']) assert.equal(forwarded.headers[name], undefined, name);
  });

  it('refuses everything outside /mobile/v1 and other methods, without reaching the web app', async () => {
    received.length = 0;
    for (const [path, method] of [
      ['/', 'GET'],
      ['/api/auth/context', 'GET'],
      ['/mobile/v1/../api/auth/context', 'GET'],
      ['/mobile/v1/%2e%2e/api', 'GET'],
      ['/mobile/v1/session%2Fx', 'GET'],
      ['/mobile/v1/session', 'DELETE'],
      ['/mobile/v2/session', 'GET'],
    ]) {
      const answer = await call(path, { method });
      assert.equal(answer.status, 404, `${method} ${path}`);
      assert.equal(answer.headers['content-type'], 'application/problem+json');
      assert.equal(JSON.parse(answer.text).code, 'MOBILE_NOT_FOUND');
    }
    assert.equal(received.length, 0);
  });

  it('refuses an oversized body and answers an unreachable web app as a mobile problem', async () => {
    const big = await call('/mobile/v1/auth/refresh', { method: 'POST', body: 'x'.repeat(70_000), headers: { 'content-type': 'application/json' } });
    assert.equal(big.status, 400);
    assert.equal(JSON.parse(big.text).code, 'MOBILE_REQUEST_INVALID');
    upstreamAnswer = { status: 401, body: '{"type":"about:blank","title":"Sign in again.","status":401,"code":"MOBILE_AUTH_REQUIRED"}' };
    const refused = await call('/mobile/v1/session');
    assert.equal(refused.status, 401);
    assert.equal(JSON.parse(refused.text).code, 'MOBILE_AUTH_REQUIRED');
    await new Promise((resolve) => upstream.close(resolve));
    const down = await call('/mobile/v1/session');
    assert.equal(down.status, 503);
    assert.equal(JSON.parse(down.text).code, 'MOBILE_UNAVAILABLE');
  });

  it('refuses a TLS client that does not trust the local authority', async () => {
    await assert.rejects(
      new Promise((resolve, reject) => {
        const outgoing = request({ host: '127.0.0.1', port, path: '/mobile/v1/session', checkServerIdentity: () => undefined }, resolve);
        outgoing.on('error', reject);
        outgoing.end();
      }),
      /self[- ]signed|unable to verify|certificate/i,
    );
  });
});
