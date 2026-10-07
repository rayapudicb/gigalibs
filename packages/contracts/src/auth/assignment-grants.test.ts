import { describe, expect, it } from 'vitest';
import { decodeAssignmentGrants, encodeAssignmentGrants } from './platform-context.js';

// WI-OI-120w (R2 slice 3): an assignment's permissions travel as a bitmap over the context's `granted_scopes`.
describe('assignment grants bitmap', () => {
  const granted = ['a:1', 'a:2', 'a:3', 'a:4', 'a:5', 'a:6', 'a:7', 'a:8', 'b:1', 'b:2'];

  it('round-trips across byte boundaries as unpadded base64url, and leaves out codes not granted', () => {
    expect(encodeAssignmentGrants(granted, ['a:1', 'a:8', 'b:2'])).toBe('gQI'); // bytes 0x81 0x02
    expect(decodeAssignmentGrants(granted, 'gQI')).toEqual(['a:1', 'a:8', 'b:2']);
    expect(encodeAssignmentGrants(granted, ['b:1', 'z:9'])).toBe('AAE');
    expect(encodeAssignmentGrants(granted, [])).toBe('AAA');
    expect(encodeAssignmentGrants([], ['a:1'])).toBe('');
    for (const count of [1, 7, 8, 9, 16, 24, 25, 279]) {
      const codes = Array.from({ length: count }, (_, index) => `x:${index}`);
      const picked = codes.filter((_, index) => index % 3 === 0);
      expect(decodeAssignmentGrants(codes, encodeAssignmentGrants(codes, picked))).toEqual(picked);
    }
  });

  it('refuses a bitmap of the wrong length, with bits past the last code, or not the one canonical encoding', () => {
    // Too short, too long, bit 10 of 10 codes, padding bits set, a character outside base64url, padding.
    for (const grants of ['gQ', 'gQIA', 'gQQ', 'gQJ', 'gQ+', 'gQ='])
      expect(() => decodeAssignmentGrants(granted, grants)).toThrow(/does not hold/);
  });
});
