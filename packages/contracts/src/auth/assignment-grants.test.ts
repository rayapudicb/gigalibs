import { describe, expect, it } from 'vitest';
import { decodeAssignmentGrants, encodeAssignmentGrants } from './platform-context.js';

// WI-OI-120w (R2 slice 3): an assignment's permissions travel as a bitmap over the context's `granted_scopes`.
describe('assignment grants bitmap', () => {
  const granted = ['a:1', 'a:2', 'a:3', 'a:4', 'a:5', 'a:6', 'a:7', 'a:8', 'b:1', 'b:2'];

  it('round-trips across byte boundaries and leaves out codes not granted', () => {
    expect(encodeAssignmentGrants(granted, ['a:1', 'a:8', 'b:2'])).toBe('8102');
    expect(decodeAssignmentGrants(granted, '8102')).toEqual(['a:1', 'a:8', 'b:2']);
    expect(encodeAssignmentGrants(granted, ['b:1', 'z:9'])).toBe('0001');
    expect(encodeAssignmentGrants(granted, [])).toBe('0000');
    expect(encodeAssignmentGrants([], ['a:1'])).toBe('');
  });

  it('refuses a bitmap of the wrong length or with bits past the last code', () => {
    for (const grants of ['81', '810200', '8104', '81g2', '8'])
      expect(() => decodeAssignmentGrants(granted, grants)).toThrow(/does not hold/);
  });
});
