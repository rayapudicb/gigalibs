import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  GENERATED_COUNTRIES,
  GENERATED_CURRENCIES,
  GENERATED_LANGUAGES,
  GENERATED_TIME_ZONES,
} from './data.generated.js';
import { canonicalReferenceString } from './index.js';

// WI-OI-120av (Phase 5A): the ICU-generated reference sets are authoritative and tamper-evident. This re-derives each
// set's checksum from contracts' canonicalReferenceString, so the generator and the loader provably agree, and
// spot-checks known ISO 4217 facts (no hand-typed data — these are stable standards values ICU must reflect).
const recompute = (entries: ReadonlyArray<Record<string, unknown>>): string =>
  `sha256:${createHash('sha256').update(canonicalReferenceString(entries)).digest('hex')}`;

describe('generated platform reference data', () => {
  for (const set of [
    GENERATED_CURRENCIES,
    GENERATED_TIME_ZONES,
    GENERATED_COUNTRIES,
    GENERATED_LANGUAGES,
  ]) {
    it(`${set.setKey}: stored checksum matches the canonical serialization, and entryCount matches`, () => {
      expect(recompute(set.entries as ReadonlyArray<Record<string, unknown>>)).toBe(set.checksum);
      expect(set.entryCount).toBe(set.entries.length);
      expect(set.entries.length).toBeGreaterThan(0);
    });
  }

  it('currencies carry correct ISO 4217 minor units', () => {
    const minor = (code: string) =>
      GENERATED_CURRENCIES.entries.find((e) => e.code === code)?.minorUnits;
    expect(minor('USD')).toBe(2);
    expect(minor('JPY')).toBe(0); // no minor unit
    expect(minor('BHD')).toBe(3); // three decimal places
    expect(
      GENERATED_CURRENCIES.entries.every(
        (e) => typeof e.minorUnits === 'number' && e.minorUnits >= 0,
      ),
    ).toBe(true);
  });

  it('time zones are the ICU IANA set — well-formed ids including well-known zones', () => {
    const codes = new Set(GENERATED_TIME_ZONES.entries.map((e) => e.code));
    expect(codes.has('America/New_York')).toBe(true);
    expect(codes.has('Europe/London')).toBe(true);
    expect(GENERATED_TIME_ZONES.entries.length).toBeGreaterThan(100);
    expect(
      GENERATED_TIME_ZONES.entries.every((e) => typeof e.code === 'string' && e.code.length > 0),
    ).toBe(true);
  });

  it('countries and languages are the ICU/CLDR sets with names', () => {
    const country = (code: string) =>
      GENERATED_COUNTRIES.entries.find((e) => e.code === code)?.name;
    expect(country('US')).toBe('United States');
    expect(country('JP')).toBe('Japan');
    expect(GENERATED_COUNTRIES.entries.length).toBeGreaterThan(200);

    const language = (code: string) =>
      GENERATED_LANGUAGES.entries.find((e) => e.code === code)?.name;
    expect(language('en')).toBe('English');
    expect(language('hi')).toBe('Hindi');
    expect(GENERATED_LANGUAGES.entries.length).toBeGreaterThan(100);
    for (const set of [GENERATED_COUNTRIES, GENERATED_LANGUAGES])
      expect(set.entries.every((e) => e.name.length > 0 && String(e.name) !== String(e.code))).toBe(
        true,
      );
  });
});
