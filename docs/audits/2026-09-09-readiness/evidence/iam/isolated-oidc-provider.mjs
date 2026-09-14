import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.OIDC_CERT_PROVIDER_PORT ?? '5449');
const issuer = `http://${host}:${port}`;
const clientId = 'gigalibs-iam-cert-client';
const clientSecret = process.env.OIDC_CERT_CLIENT_SECRET;
const redirectUri = process.env.OIDC_REDIRECT_URI;
if (!clientSecret || !redirectUri) throw new Error('OIDC certification provider configuration is missing');

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: 'jwk' });
const kid = randomBytes(12).toString('hex');
const codes = new Map();
let identity = {
  sub: 'cert-admin-subject',
  email: process.env.OIDC_CERT_ADMIN_EMAIL ?? 'unconfigured@certification.invalid',
  name: 'OIDC Certification Admin',
};

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function idToken(nonce) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'RS256', kid, typ: 'JWT' });
  const payload = base64url({
    iss: issuer,
    aud: clientId,
    sub: identity.sub,
    email: identity.email,
    email_verified: true,
    name: identity.name,
    nonce,
    iat: now,
    exp: now + 300,
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', issuer);
  if (request.method === 'GET' && url.pathname === '/ready') return json(response, 200, { ready: true });
  if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
    return json(response, 200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'email', 'profile'],
      claims_supported: ['sub', 'iss', 'aud', 'email', 'email_verified', 'name', 'nonce'],
    });
  }
  if (request.method === 'GET' && url.pathname === '/jwks') {
    return json(response, 200, { keys: [{ ...publicJwk, kid, use: 'sig', alg: 'RS256' }] });
  }
  if (request.method === 'GET' && url.pathname === '/authorize') {
    if (
      url.searchParams.get('client_id') !== clientId ||
      url.searchParams.get('redirect_uri') !== redirectUri ||
      url.searchParams.get('response_type') !== 'code' ||
      url.searchParams.get('code_challenge_method') !== 'S256' ||
      !url.searchParams.get('state') ||
      !url.searchParams.get('nonce') ||
      !url.searchParams.get('code_challenge')
    ) return json(response, 400, { error: 'invalid_request' });
    const code = randomBytes(32).toString('base64url');
    codes.set(code, {
      challenge: url.searchParams.get('code_challenge'),
      nonce: url.searchParams.get('nonce'),
    });
    const callback = new URL(redirectUri);
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', url.searchParams.get('state'));
    response.writeHead(302, { Location: callback.toString(), 'Cache-Control': 'no-store' });
    return response.end();
  }
  if (request.method === 'POST' && url.pathname === '/token') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const form = new URLSearchParams(body);
    const code = form.get('code');
    const record = code ? codes.get(code) : undefined;
    const verifier = form.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (
      form.get('grant_type') !== 'authorization_code' ||
      form.get('client_id') !== clientId ||
      form.get('client_secret') !== clientSecret ||
      form.get('redirect_uri') !== redirectUri ||
      !record ||
      challenge !== record.challenge
    ) return json(response, 400, { error: 'invalid_grant' });
    codes.delete(code);
    return json(response, 200, {
      access_token: randomBytes(32).toString('base64url'),
      token_type: 'Bearer',
      expires_in: 300,
      id_token: idToken(record.nonce),
    });
  }
  if (request.method === 'POST' && url.pathname === '/certification/identity') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const next = JSON.parse(body);
    if (typeof next.sub !== 'string' || typeof next.email !== 'string') {
      return json(response, 400, { error: 'invalid_identity' });
    }
    identity = { sub: next.sub, email: next.email, name: String(next.name ?? 'OIDC Test User') };
    return json(response, 200, { updated: true });
  }
  return json(response, 404, { error: 'not_found' });
});

server.listen(port, host, () => {
  process.stdout.write(JSON.stringify({ issuer, isolatedCertificationProvider: true }) + '\n');
});
