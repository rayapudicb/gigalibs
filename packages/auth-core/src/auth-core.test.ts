import { describe, expect, it, vi } from 'vitest';
import {
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  signJwt,
  validatePasswordStrength,
  verifyJwt,
  verifyPassword,
} from './index.js';

const secret = 'test-secret-with-at-least-thirty-two-characters';

describe('password security', () => {
  it('enforces the default length limits', () => {
    expect(validatePasswordStrength('too-short').isValid).toBe(false);
    expect(validatePasswordStrength('a'.repeat(129)).isValid).toBe(false);
    expect(validatePasswordStrength('correct horse battery staple').isValid).toBe(true);
  });

  it('creates salted hashes and verifies without storing plaintext', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');

    expect(first).not.toBe(second);
    expect(first).not.toContain('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', first)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', first)).resolves.toBe(false);
    await expect(verifyPassword('anything', 'invalid-format')).resolves.toBe(false);
  });
});

describe('token security', () => {
  it('signs, verifies, and rejects tampered JWTs', () => {
    const token = signJwt({ sub: 'user-1', sid: 'session-1', roles: ['MEMBER'] }, secret, 60);
    const signatureSeparator = token.lastIndexOf('.');
    const signature = token.slice(signatureSeparator + 1);
    const replacement = signature.startsWith('A') ? 'B' : 'A';
    const tampered = `${token.slice(0, signatureSeparator + 1)}${replacement}${signature.slice(1)}`;

    expect(verifyJwt(token, secret)).toMatchObject({ sub: 'user-1', sid: 'session-1' });
    expect(verifyJwt(tampered, secret)).toBeNull();
  });

  it('rejects expired JWTs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    const token = signJwt({ sub: 'user-1', sid: 'session-1', roles: [] }, secret, 1);
    vi.advanceTimersByTime(1_000);

    expect(verifyJwt(token, secret)).toBeNull();
    vi.useRealTimers();
  });

  it('produces opaque refresh tokens and deterministic one-way lookup hashes', () => {
    const token = generateRefreshToken();
    expect(token.refreshToken.length).toBeGreaterThanOrEqual(64);
    expect(hashRefreshToken(token.refreshToken)).toHaveLength(64);
    expect(hashRefreshToken(token.refreshToken)).toBe(hashRefreshToken(token.refreshToken));
    expect(hashRefreshToken(token.refreshToken)).not.toContain(token.refreshToken);
  });
});
