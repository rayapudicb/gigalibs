import { describe, expect, it } from 'vitest';
import {
  LoadReferenceSetSchema,
  type PlatformReferenceSet,
  ReferenceProvenanceSchema,
  canonicalReferenceString,
  findReferenceEntry,
} from './index.js';

// WI-OI-120av (Phase 5A): the pure core of platform reference data.
describe('canonicalReferenceString', () => {
  it('is deterministic regardless of entry or key order', () => {
    const a = canonicalReferenceString([
      { code: 'USD', name: 'US Dollar', minorUnits: 2 },
      { code: 'JPY', name: 'Yen', minorUnits: 0 },
    ]);
    const b = canonicalReferenceString([
      { minorUnits: 0, name: 'Yen', code: 'JPY' },
      { name: 'US Dollar', minorUnits: 2, code: 'USD' },
    ]);
    expect(a).toBe(b);
    // JPY sorts before USD; keys sorted within a line.
    expect(a).toBe('code=JPY\tminorUnits=0\tname=Yen\ncode=USD\tminorUnits=2\tname=US Dollar');
  });

  it('changes when any value changes (so the checksum catches tampering)', () => {
    const base = canonicalReferenceString([{ code: 'USD', minorUnits: 2 }]);
    const tampered = canonicalReferenceString([{ code: 'USD', minorUnits: 3 }]);
    expect(base).not.toBe(tampered);
  });
});

describe('findReferenceEntry', () => {
  const set: PlatformReferenceSet<{ code: string; name: string }> = {
    provenance: {
      setKey: 'COUNTRIES',
      source: 'ISO 3166-1',
      version: '2024',
      checksum: `sha256:${'0'.repeat(64)}`,
      entryCount: 2,
      loadedAt: '2026-10-26T00:00:00.000Z',
    },
    entries: [
      { code: 'US', name: 'United States' },
      { code: 'GB', name: 'United Kingdom' },
    ],
  };

  it('finds by code, case-insensitively, else null', () => {
    expect(findReferenceEntry(set, 'us')?.name).toBe('United States');
    expect(findReferenceEntry(set, 'GB')?.name).toBe('United Kingdom');
    expect(findReferenceEntry(set, 'FR')).toBeNull();
  });
});

describe('schemas', () => {
  it('ReferenceProvenance requires a sha256 checksum', () => {
    const ok = {
      setKey: 'CURRENCIES',
      source: 'ISO 4217',
      version: '2024',
      checksum: `sha256:${'a'.repeat(64)}`,
      entryCount: 162,
      loadedAt: '2026-10-26T00:00:00.000Z',
    };
    expect(ReferenceProvenanceSchema.safeParse(ok).success).toBe(true);
    expect(ReferenceProvenanceSchema.safeParse({ ...ok, checksum: 'deadbeef' }).success).toBe(
      false,
    );
    expect(ReferenceProvenanceSchema.safeParse({ ...ok, setKey: 'NONSENSE' }).success).toBe(false);
  });

  it('LoadReferenceSet needs a set, source, version and a reason', () => {
    expect(
      LoadReferenceSetSchema.safeParse({
        setKey: 'CURRENCIES',
        source: 'ISO 4217',
        version: '2024',
        reason: 'initial load',
      }).success,
    ).toBe(true);
    expect(
      LoadReferenceSetSchema.safeParse({
        setKey: 'CURRENCIES',
        source: 'ISO 4217',
        version: '2024',
      }).success,
    ).toBe(false);
  });
});
