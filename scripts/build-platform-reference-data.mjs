// WI-OI-120av (Phase 5A): generate the platform reference sets that are authoritatively available from the runtime's
// ICU/CLDR data — no hand-typed values. Currencies (ISO 4217), time zones (IANA), countries (ISO 3166-1), languages
// (ISO 639-1) and units of measure (CLDR measurement units) all come straight from `Intl`. Only ISO 3166-2
// subdivisions and tax jurisdictions have no ICU list; they load from a pinned official dataset separately.
//
//   node scripts/build-platform-reference-data.mjs   # writes packages/contracts/src/platform-reference/data.generated.ts
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Kept byte-identical to contracts' canonicalReferenceString; a contracts test re-derives the checksum to prove it.
function canonicalReferenceString(entries) {
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
const checksum = (entries) =>
  `sha256:${createHash('sha256').update(canonicalReferenceString(entries)).digest('hex')}`;

const currencyName = new Intl.DisplayNames(['en'], { type: 'currency' });
const currencies = Intl.supportedValuesOf('currency')
  .map((code) => ({
    code,
    name: currencyName.of(code) ?? code,
    minorUnits: new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
      .maximumFractionDigits,
  }))
  .sort((a, b) => a.code.localeCompare(b.code));

const timeZones = Intl.supportedValuesOf('timeZone')
  .map((code) => ({ code, name: code }))
  .sort((a, b) => a.code.localeCompare(b.code));

// Countries (ISO 3166-1 + CLDR territories) and languages (ISO 639-1) are enumerated from ICU itself: every two-letter
// code whose DisplayName differs from the code is a real territory/language. Same CLDR provenance as the sets above,
// no dataset dependency. (ISO 3166-2 subdivisions and tax jurisdictions are not in ICU; they load from an official
// file separately.)
const twoLetter = (from) => {
  const letters = [...Array(26)].map((_, i) => String.fromCharCode(from + i));
  return letters.flatMap((a) => letters.map((b) => a + b));
};
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = twoLetter(65)
  .filter((code) => code !== 'ZZ') // ICU's explicit "unknown region"
  .map((code) => ({ code, name: regionName.of(code) }))
  .filter((entry) => entry.name && entry.name !== entry.code)
  .sort((a, b) => a.code.localeCompare(b.code));
const languageName = new Intl.DisplayNames(['en'], { type: 'language' });
const languages = twoLetter(97)
  .map((code) => ({ code, name: languageName.of(code) }))
  .filter((entry) => entry.name && entry.name !== entry.code)
  .sort((a, b) => a.code.localeCompare(b.code));

// Units of measure: the CLDR measurement units ICU sanctions for Intl.NumberFormat (code = the unit id, name = its
// long English form). Same ICU/CLDR provenance as the sets above — not UN/ECE Rec 20 (those trade codes aren't in ICU
// and would load from an official file). Owner accepted the ICU set (2026-10-27).
const unitName = (unit) => {
  try {
    const parts = new Intl.NumberFormat('en', { style: 'unit', unit, unitDisplay: 'long' }).formatToParts(1);
    return parts.find((part) => part.type === 'unit')?.value ?? unit;
  } catch {
    return unit;
  }
};
const units = Intl.supportedValuesOf('unit')
  .map((code) => ({ code, name: unitName(code) }))
  .sort((a, b) => a.code.localeCompare(b.code));

const cldr = process.versions.cldr ?? process.versions.icu ?? 'unknown';
const tz = process.versions.tz ?? 'unknown';
const sets = {
  CURRENCIES: {
    setKey: 'CURRENCIES',
    source: `Unicode CLDR ${cldr} via ICU (Intl); ISO 4217`,
    version: cldr,
    checksum: checksum(currencies),
    entryCount: currencies.length,
    entries: currencies,
  },
  TIME_ZONES: {
    setKey: 'TIME_ZONES',
    source: `IANA tz ${tz} via ICU (Intl)`,
    version: tz,
    checksum: checksum(timeZones),
    entryCount: timeZones.length,
    entries: timeZones,
  },
  COUNTRIES: {
    setKey: 'COUNTRIES',
    source: `Unicode CLDR ${cldr} via ICU (Intl); ISO 3166-1 (CLDR territory set)`,
    version: cldr,
    checksum: checksum(countries),
    entryCount: countries.length,
    entries: countries,
  },
  LANGUAGES: {
    setKey: 'LANGUAGES',
    source: `Unicode CLDR ${cldr} via ICU (Intl); ISO 639-1`,
    version: cldr,
    checksum: checksum(languages),
    entryCount: languages.length,
    entries: languages,
  },
  UNITS_OF_MEASURE: {
    setKey: 'UNITS_OF_MEASURE',
    source: `Unicode CLDR ${cldr} via ICU (Intl); CLDR measurement units`,
    version: cldr,
    checksum: checksum(units),
    entryCount: units.length,
    entries: units,
  },
};

const renderSet = (name, set, keyLiteral, entryType) =>
  `export const ${name} = ${JSON.stringify(set, null, 2)} as const satisfies {
  readonly setKey: ${keyLiteral}; readonly source: string; readonly version: string; readonly checksum: string;
  readonly entryCount: number; readonly entries: readonly ${entryType}[];
};
`;

const file = `// Generated by \`node scripts/build-platform-reference-data.mjs\` (WI-OI-120av) from the runtime ICU/CLDR data.
// Do not edit: regenerate. Checksums are sha256 over contracts’ canonicalReferenceString; a test re-derives them.
import type { CountryEntry, CurrencyEntry, LanguageEntry, TimeZoneEntry, UomEntry } from './index.js';

${renderSet('GENERATED_CURRENCIES', sets.CURRENCIES, '"CURRENCIES"', 'CurrencyEntry')}
${renderSet('GENERATED_TIME_ZONES', sets.TIME_ZONES, '"TIME_ZONES"', 'TimeZoneEntry')}
${renderSet('GENERATED_COUNTRIES', sets.COUNTRIES, '"COUNTRIES"', 'CountryEntry')}
${renderSet('GENERATED_LANGUAGES', sets.LANGUAGES, '"LANGUAGES"', 'LanguageEntry')}
${renderSet('GENERATED_UNITS_OF_MEASURE', sets.UNITS_OF_MEASURE, '"UNITS_OF_MEASURE"', 'UomEntry')}`;

const out = join(process.cwd(), 'packages/contracts/src/platform-reference/data.generated.ts');
writeFileSync(out, file);
process.stdout.write(
  `Wrote ${out}\n  CURRENCIES: ${currencies.length} (CLDR ${cldr})\n  TIME_ZONES: ${timeZones.length} (tz ${tz})\n  COUNTRIES: ${countries.length} (CLDR ${cldr})\n  LANGUAGES: ${languages.length} (CLDR ${cldr})\n  UNITS_OF_MEASURE: ${units.length} (CLDR ${cldr})\n`,
);
