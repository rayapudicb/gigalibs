/** ADR-0007 relay tokens cannot be confused with user contexts and are bound to tenant, message and body. */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { signPlatformContextToken, verifyPlatformContextToken } from './platform-context.js';
import { signRelayToken, verifyRelayToken } from './relay-token.js';

const pair = () =>
  generateKeyPairSync('ed25519', { privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const relay = pair();
const other = pair();
const body = JSON.stringify({ messageId: 'm-1', tenantId: 't-1', eventType: 'CMMS_STAFFING_REQUESTED_V1' });
const token = (overrides: Partial<Parameters<typeof signRelayToken>[0]> = {}, key = relay.privateKey, lifetime = 60) =>
  signRelayToken({ audience: 'gigalibs-workforce-inbox', source: 'cmms', tenantId: 't-1', messageId: 'm-1', body, ...overrides }, key, lifetime);
const expected = { audience: 'gigalibs-workforce-inbox', source: 'cmms', body };

describe('relay tokens', () => {
  it('verifies a token for its audience, source and exact body', () => {
    expect(verifyRelayToken(token(), relay.publicKey, expected)).toMatchObject({ tenant_id: 't-1', message_id: 'm-1', sub: 'cmms' });
  });

  it('refuses another key, audience, source, body or an expired token', () => {
    expect(() => verifyRelayToken(token({}, other.privateKey), relay.publicKey, expected)).toThrow(/signature/);
    expect(() => verifyRelayToken(token({ audience: 'gigalibs-cmms-inbox' }), relay.publicKey, expected)).toThrow(/audience/);
    expect(() => verifyRelayToken(token({ source: 'analytics' }), relay.publicKey, expected)).toThrow(/source/);
    expect(() => verifyRelayToken(token(), relay.publicKey, { ...expected, body: `${body} ` })).toThrow(/different content/);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() - 10 * 60_000);
    const stale = token();
    vi.useRealTimers();
    expect(() => verifyRelayToken(stale, relay.publicKey, expected)).toThrow(/expired/);
  });

  it('is never accepted as a user platform context, and a user context is never accepted as a relay token', () => {
    expect(() => verifyPlatformContextToken(token(), relay.publicKey, 'gigalibs-workforce-inbox')).toThrow();
    const now = Math.floor(Date.now() / 1000);
    const user = signPlatformContextToken(
      {
        iss: 'gigalibs-control-plane', aud: 'gigalibs-workforce-inbox', sub: 'u', tenant_id: 't-1', session_id: 's', auth_version: 1,
        roles: [], granted_scopes: ['*'], persona_type: 'TENANT_ADMIN', org_scope: { mode: 'FLAT_TENANT' },
        entitlement: { module_key: 'gigaops', status: 'ENABLED', version: 'v1' }, iat: now, exp: now + 60, jti: 'j',
      },
      relay.privateKey,
    );
    expect(() => verifyRelayToken(user, relay.publicKey, expected)).toThrow(/Not a relay token/);
  });
});
