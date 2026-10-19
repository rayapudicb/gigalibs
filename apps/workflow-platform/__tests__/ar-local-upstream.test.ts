import { describe, expect, it } from 'vitest';
import { parseLocalArUpstreamOrigin } from '@/lib/ar-local-upstream';

describe('parseLocalArUpstreamOrigin', () => {
  it('accepts compose internal service hostname', () => {
    expect(parseLocalArUpstreamOrigin('http://ar-api:3400')).toBe('http://ar-api:3400');
  });

  it('rejects https and paths', () => {
    expect(() => parseLocalArUpstreamOrigin('https://127.0.0.1:3400')).toThrow(/loopback/);
    expect(() => parseLocalArUpstreamOrigin('http://127.0.0.1:3400/v1')).toThrow(/loopback/);
  });
});
