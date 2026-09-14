import { describe, expect, it } from 'vitest';
import {
  generateMfaRecoveryCode,
  hashMfaRecoveryCode,
  normalizeMfaRecoveryCode,
} from './recovery-code.js';

describe('MFA recovery codes', () => {
  it('generates 100-bit human-readable credentials without ambiguous characters', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateMfaRecoveryCode()));
    expect(codes.size).toBe(100);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){4}$/);
  });

  it('normalizes case and separators while rejecting malformed input', () => {
    expect(normalizeMfaRecoveryCode('abcd-efgh-jkmn-pqrs-tuvw')).toBe('ABCDEFGHJKMNPQRSTUVW');
    expect(normalizeMfaRecoveryCode('ABCD-EFGH-IJKL-MNOP-QRST')).toBeNull();
    expect(normalizeMfaRecoveryCode('too-short')).toBeNull();
  });

  it('creates deterministic user-bound one-way lookup digests', () => {
    const code = 'ABCD-EFGH-JKMN-PQRS-TUVW';
    const first = hashMfaRecoveryCode(code, 'user-1');
    expect(first).toHaveLength(64);
    expect(first).toBe(hashMfaRecoveryCode(code.toLowerCase(), 'user-1'));
    expect(first).not.toBe(hashMfaRecoveryCode(code, 'user-2'));
    expect(first).not.toContain(code.replaceAll('-', ''));
  });
});
