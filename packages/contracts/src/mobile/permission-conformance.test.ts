import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { holdsPermission } from '../rbac/permission-match.js';

// WI-OI-120cf: the mobile team's permission vectors (`gigalibs_mobile/docs/contracts/mobile-permission-conformance-v1.json`,
// copied unchanged 2026-10-26) give the same answer from the platform's `holdsPermission` as from the app's helper, so
// the app never offers what the server refuses, or hides what it allows.

const vectors = JSON.parse(readFileSync(new URL('./mobile-permission-conformance-v1.json', import.meta.url), 'utf8')) as {
  contractVersion: string;
  vectors: { granted: string[]; required: string; expected: boolean }[];
};

describe('mobile permission conformance v1', () => {
  it('is the version the app checks', () => {
    expect(vectors.contractVersion).toBe('mobile-permission-conformance.v1');
    expect(vectors.vectors.length).toBeGreaterThan(0);
  });

  it.each(vectors.vectors)('$granted grants $required: $expected', ({ granted, required, expected }) => {
    expect(holdsPermission(granted, required)).toBe(expected);
  });
});
