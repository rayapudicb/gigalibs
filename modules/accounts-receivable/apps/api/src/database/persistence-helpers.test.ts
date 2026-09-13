import { describe, expect, it } from 'vitest';
import { hashCanonicalJson, requireIdempotencyKey } from './persistence-helpers.js';

describe('hashCanonicalJson', () => {
  it('produces the same hash regardless of object key order', () => {
    expect(hashCanonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      hashCanonicalJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it('preserves array order because it is business-significant', () => {
    expect(hashCanonicalJson({ lines: ['a', 'b'] })).not.toBe(
      hashCanonicalJson({ lines: ['b', 'a'] }),
    );
  });
});

describe('requireIdempotencyKey', () => {
  it('accepts a bounded safe key', () => {
    expect(requireIdempotencyKey('request-00000001')).toBe('request-00000001');
  });

  it.each([undefined, 'short', 'unsafe key with spaces'])('rejects invalid keys', (value) => {
    expect(() => requireIdempotencyKey(value)).toThrow('16–128 safe characters');
  });
});
