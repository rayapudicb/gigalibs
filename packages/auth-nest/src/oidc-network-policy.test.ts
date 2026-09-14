import { describe, expect, it } from 'vitest';
import { isForbiddenOidcAddress, isLoopbackOidcAddress } from './oidc-network-policy.js';

describe('OIDC outbound address policy', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.10',
    '198.18.0.1',
    '198.51.100.10',
    '203.0.113.10',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:8.8.8.8',
  ])(
    'rejects private, local, metadata, multicast, documentation and mapped address %s',
    (address) => {
      expect(isForbiddenOidcAddress(address)).toBe(true);
    },
  );

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts public address %s',
    (address) => {
      expect(isForbiddenOidcAddress(address)).toBe(false);
    },
  );

  it('identifies only loopback addresses for the isolated test exception', () => {
    expect(isLoopbackOidcAddress('127.8.9.10')).toBe(true);
    expect(isLoopbackOidcAddress('::1')).toBe(true);
    expect(isLoopbackOidcAddress('10.0.0.1')).toBe(false);
  });
});
