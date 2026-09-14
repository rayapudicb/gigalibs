import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseAes256KeyRing, requireAes256KeyVersion } from './keyring.js';

const key = () => randomBytes(32).toString('base64');

describe('AES-256 key ring', () => {
  it('loads one active key and bounded previous versions', () => {
    const active = key();
    const previous = key();
    const ring = parseAes256KeyRing('v2', active, JSON.stringify({ v1: previous }));

    expect(requireAes256KeyVersion(ring, 'v2')).toBe(active);
    expect(requireAes256KeyVersion(ring, 'v1')).toBe(previous);
  });

  it('fails closed for malformed, ambiguous, or missing key versions', () => {
    const active = key();
    expect(() => parseAes256KeyRing('v2', active, '{')).toThrow('valid JSON object');
    expect(() => parseAes256KeyRing('v2', active, JSON.stringify({ v2: key() }))).toThrow(
      'cannot redefine the active key version',
    );
    expect(() => parseAes256KeyRing('v2', active, JSON.stringify({ v1: 'not-a-key' }))).toThrow(
      'canonical base64-encoded 32-byte key',
    );
    expect(() => requireAes256KeyVersion(new Map([['v2', active]]), 'v1')).toThrow(
      "Encryption key version 'v1' is not loaded",
    );
  });
});
