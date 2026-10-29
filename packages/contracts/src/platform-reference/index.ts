import { z } from 'zod';

// WI-OI-120av (Phase 5A): platform reference data — standards-based master data the kernel owns and workspaces read
// but cannot write (countries, currencies, units of measure, languages, time zones, tax jurisdictions). This module is
// the shared, browser-safe core: the set keys, the per-set entry shapes, the provenance every loaded set records
// (source, version, checksum, when), the read-only lookup shape, and the canonical serialization the checksum is taken
// over. The card requires loading published files with a checksum, so nothing here hand-types
// data; the sha256 itself is computed by the node loader/generator over `canonicalReferenceString` (crypto is not
// browser-safe). M-CUR and M-TAX read these instead of keeping their own lists.

export const ReferenceSetKeySchema = z.enum([
  'COUNTRIES',
  'CURRENCIES',
  'UNITS_OF_MEASURE',
  'LANGUAGES',
  'TIME_ZONES',
  'TAX_JURISDICTIONS',
]);
export type ReferenceSetKey = z.infer<typeof ReferenceSetKeySchema>;

// ─── Per-set entry shapes (the stored/served rows) ──────────────────────────────
export interface CurrencyEntry {
  readonly code: string; // ISO 4217 alpha
  readonly name: string;
  readonly minorUnits: number; // ISO 4217 minor units (JPY 0, USD 2, BHD 3)
}
export interface CountryEntry {
  readonly code: string; // ISO 3166-1 alpha-2
  readonly name: string;
}
export interface SubdivisionEntry {
  readonly code: string; // ISO 3166-2
  readonly name: string;
  readonly countryCode: string;
}
export interface UomEntry {
  readonly code: string; // CLDR measurement unit id (ICU), e.g. "kilogram", "liter"
  readonly name: string;
}
export interface LanguageEntry {
  readonly code: string; // ISO 639-1
  readonly name: string;
}
export interface TimeZoneEntry {
  readonly code: string; // IANA tz database id
  readonly name: string; // the IANA id is its own display name (uniform code+name shape across sets)
}
export interface TaxJurisdictionEntry {
  readonly code: string; // country or subdivision code
  readonly name: string;
  readonly countryCode: string;
}

/** Where a loaded set came from and how to tell it has not been tampered with. */
export const ReferenceProvenanceSchema = z
  .object({
    setKey: ReferenceSetKeySchema,
    /** The authority, e.g. "Unicode CLDR via ICU (Intl)", "ISO 4217", "UN/ECE Recommendation 20". */
    source: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(64),
    checksum: z
      .string()
      .regex(/^sha256:[0-9a-f]{64}$/, 'A sha256 checksum of the canonical entries.'),
    entryCount: z.number().int().nonnegative(),
    loadedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ReferenceProvenance = z.infer<typeof ReferenceProvenanceSchema>;

/** A locked set as served to workspaces: its provenance and its entries, read-only. */
export interface PlatformReferenceSet<Entry> {
  readonly provenance: ReferenceProvenance;
  readonly entries: readonly Entry[];
}

/** A platform operator loads a new version of a set (the data + provenance) in Platform Control Tower, with a reason. */
export const LoadReferenceSetSchema = z
  .object({
    setKey: ReferenceSetKeySchema,
    source: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(64),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type LoadReferenceSetDto = z.infer<typeof LoadReferenceSetSchema>;

/**
 * The canonical string a set's checksum is taken over: entries sorted by `code`, each a compact record of its own
 * keys in sorted order, one per line. Deterministic and browser-safe, so the generator, the loader and a verifier all
 * hash the same bytes. (The sha256 of this string, prefixed `sha256:`, is the provenance checksum.)
 */
export function canonicalReferenceString(entries: ReadonlyArray<Record<string, unknown>>): string {
  return entries
    .map((entry) =>
      Object.keys(entry)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => `${key}=${String(entry[key])}`)
        .join('\t'),
    )
    .sort((a, b) => a.localeCompare(b))
    .join('\n');
}

/** Look up one entry by its code in a served set (null when absent). Codes are compared case-insensitively. */
export function findReferenceEntry<Entry extends { readonly code: string }>(
  set: PlatformReferenceSet<Entry>,
  code: string,
): Entry | null {
  const needle = code.trim().toUpperCase();
  return set.entries.find((entry) => entry.code.toUpperCase() === needle) ?? null;
}

export * from './data.generated.js';
