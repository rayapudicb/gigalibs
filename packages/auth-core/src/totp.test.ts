import { describe, expect, it } from 'vitest';
import { createTotpUri, generateTotpCode, generateTotpSecret, matchTotpStep } from './totp.js';

const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('RFC 6238 TOTP', () => {
  it('matches the published SHA-1 vectors', () => {
    expect(generateTotpCode(RFC_SECRET, 59_000, { digits: 8 })).toBe('94287082');
    expect(generateTotpCode(RFC_SECRET, 1_111_111_109_000, { digits: 8 })).toBe('07081804');
  });

  it('accepts bounded clock drift and exposes the matched step for replay prevention', () => {
    const now = 1_700_000_000_000;
    const code = generateTotpCode(RFC_SECRET, now - 30_000);
    expect(matchTotpStep(code, RFC_SECRET, now, 1)).toBe(BigInt(Math.floor(now / 1_000 / 30) - 1));
    expect(matchTotpStep(code, RFC_SECRET, now, 0)).toBeNull();
    expect(matchTotpStep('12345x', RFC_SECRET, now, 1)).toBeNull();
  });

  it('generates 160-bit secrets and an authenticator URI without altering the secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = new URL(createTotpUri(secret, 'GigaLibs', 'owner@example.com'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.searchParams.get('secret')).toBe(secret);
    expect(uri.searchParams.get('issuer')).toBe('GigaLibs');
  });
});
