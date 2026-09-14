import { describe, expect, it } from 'vitest';
import {
  domainVerificationDigest,
  domainVerificationRecordName,
  matchingTxtRecord,
  normalizeTenantDomain,
} from './domain-verification.js';

describe('tenant DNS domain verification', () => {
  it('normalizes a public internationalized hostname to canonical ASCII', () => {
    expect(normalizeTenantDomain(' BÜCHER.Example.COM. ')).toBe('xn--bcher-kva.example.com');
    expect(domainVerificationRecordName('login.example.com')).toBe(
      '_gigalibs-verification.login.example.com',
    );
  });

  it.each([
    'localhost',
    '127.0.0.1',
    'tenant.local',
    'tenant.example',
    'https://login.example.com',
    'login.example.com/path',
    '-bad.example.com',
  ])('rejects a non-public or malformed hostname: %s', (domain) => {
    expect(() => normalizeTenantDomain(domain)).toThrow();
  });

  it('matches a split TXT answer using the digest without storing the raw challenge', () => {
    const challenge = 'gigalibs-domain-verification=attributable-test-value';
    const digest = domainVerificationDigest(challenge);
    expect(
      matchingTxtRecord(
        [['unrelated'], ['gigalibs-domain-', 'verification=attributable-test-value']],
        digest,
      ),
    ).toBe(true);
    expect(matchingTxtRecord([['gigalibs-domain-verification=wrong']], digest)).toBe(false);
    expect(digest).not.toContain(challenge);
  });
});
