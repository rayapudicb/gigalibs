// WI-OI-120av (Phase 5A): generate the platform reference sets that are authoritatively available from the runtime's
// ICU/CLDR data — no hand-typed values. Currencies (ISO 4217), time zones (IANA), countries (ISO 3166-1), languages
// (ISO 639-1) and units of measure (CLDR measurement units) all come straight from `Intl`. Only ISO 3166-2
// subdivisions and tax jurisdictions have no ICU list; they load from a pinned official dataset separately.
//
// WI-OI-153 slice A2 (owner approval 2026-11-03): the sets ICU does not carry come from pinned published data, read
// only here (never at runtime): CLDR supplemental data (cldr-core) for each country's currency, first day of the week
// and measurement system; CLDR subdivision names (cldr-subdivisions-full) for ISO 3166-2 regions and the tax
// jurisdiction structure; phone-number metadata (libphonenumber-js) for E.164 calling codes; and two reviewed lists in
// scripts/reference-data: UN/ECE Recommendation 20 units and ICC Incoterms 2020.
//
//   node scripts/build-platform-reference-data.mjs   # writes packages/contracts/src/platform-reference/data.generated.ts
//                                                    # and regions.generated.ts
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { getCountryCallingCode, isSupportedCountry } from 'libphonenumber-js';

const require = createRequire(import.meta.url);
const cldrCore = (file) => require(`cldr-core/supplemental/${file}.json`).supplemental;
const cldrCoreVersion = require('cldr-core/package.json').version;
const subdivisionNames = require('cldr-subdivisions-full/subdivisions/en/en.json').subdivisions.localeDisplayNames.subdivisions;
const phoneVersion = require('libphonenumber-js/package.json').version;
const reviewed = (file) => JSON.parse(readFileSync(join(process.cwd(), 'scripts/reference-data', file), 'utf8'));

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
// WI-OI-153: what any country gets without a pack (ADR-0038 §2). Keys are left out, not set undefined, so the
// canonical string (and checksum) only covers facts that exist.
const currencyData = cldrCore('currencyData').currencyData.region;
const firstDay = cldrCore('weekData').weekData.firstDay;
const measurement = cldrCore('measurementData').measurementData.measurementSystem;
const DAY_NUMBER = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
function currentCurrency(country) {
  const current = (currencyData[country] ?? [])
    .flatMap((entry) => Object.entries(entry))
    .filter(([, info]) => !info._to && info._tender !== 'false')
    .sort(([, left], [, right]) => String(right._from ?? '').localeCompare(String(left._from ?? '')));
  return current[0]?.[0];
}
const countries = twoLetter(65)
  .filter((code) => code !== 'ZZ') // ICU's explicit "unknown region"
  .map((code) => ({ code, name: regionName.of(code) }))
  .filter((entry) => entry.name && entry.name !== entry.code)
  .map((entry) => {
    const currency = currentCurrency(entry.code);
    const callingCode = isSupportedCountry(entry.code) ? getCountryCallingCode(entry.code) : undefined;
    const weekStart = DAY_NUMBER[firstDay[entry.code] ?? firstDay['001']];
    const system = String(measurement[entry.code] ?? measurement['001']).toLowerCase();
    return {
      ...entry,
      ...(currency ? { currency } : {}),
      ...(callingCode ? { callingCode } : {}),
      ...(weekStart ? { weekStart } : {}),
      measurementSystem: system,
    };
  })
  .sort((a, b) => a.code.localeCompare(b.code));

// ISO 3166-2 regions: the first-level subdivisions CLDR places directly in each country, with their English names.
const containment = cldrCore('subdivisionContainment').subdivisionContainment;
const regions = countries
  .flatMap((country) =>
    (containment[country.code]?._contains ?? []).flatMap((cldrCode) => {
      const name = subdivisionNames[cldrCode];
      return name ? [{ code: `${country.code}-${cldrCode.slice(2).toUpperCase()}`, name, countryCode: country.code }] : [];
    }),
  )
  .sort((a, b) => a.code.localeCompare(b.code));
// Tax jurisdictions (structure only; rates come from country packs): every country and its regions.
const taxJurisdictions = [
  ...countries.map((country) => ({ code: country.code, name: country.name, countryCode: country.code })),
  ...regions,
].sort((a, b) => a.code.localeCompare(b.code));
const languageName = new Intl.DisplayNames(['en'], { type: 'language' });
const languages = twoLetter(97)
  .map((code) => ({ code, name: languageName.of(code) }))
  .filter((entry) => entry.name && entry.name !== entry.code)
  .sort((a, b) => a.code.localeCompare(b.code));

// Units of measure (WI-OI-153 slice C, owner approval 2026-11-03): a reviewed list of common UN/ECE Recommendation 20
// units with symbol, dimension and conversion factor — replacing CLDR's 45 measurement units, which had no symbols,
// trade codes or counting units (each, piece, box).
const unitList = reviewed('unece-rec20-units.json');
const units = unitList.units.map((unit) => ({ ...unit })).sort((a, b) => a.code.localeCompare(b.code));
const termList = reviewed('incoterms-2020.json');
const tradeTerms = termList.terms.map((term) => ({ ...term })).sort((a, b) => a.code.localeCompare(b.code));

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
    source: `Unicode CLDR ${cldr} via ICU (Intl); ISO 3166-1 (CLDR territory set); currency, week and measurement from CLDR ${cldrCoreVersion} supplemental (cldr-core); calling codes from libphonenumber-js ${phoneVersion}`,
    version: `${cldr}+${cldrCoreVersion}+${phoneVersion}`,
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
    source: unitList.source,
    version: unitList.version,
    checksum: checksum(units),
    entryCount: units.length,
    entries: units,
  },
  TRADE_TERMS: {
    setKey: 'TRADE_TERMS',
    source: termList.source,
    version: termList.version,
    checksum: checksum(tradeTerms),
    entryCount: tradeTerms.length,
    entries: tradeTerms,
  },
  REGIONS: {
    setKey: 'REGIONS',
    source: `ISO 3166-2 first-level subdivisions with English names, Unicode CLDR ${cldrCoreVersion} (cldr-core subdivisionContainment, cldr-subdivisions-full)`,
    version: cldrCoreVersion,
    checksum: checksum(regions),
    entryCount: regions.length,
    entries: regions,
  },
  TAX_JURISDICTIONS: {
    setKey: 'TAX_JURISDICTIONS',
    source: `Countries (ISO 3166-1) and their first-level subdivisions (ISO 3166-2), Unicode CLDR ${cldrCoreVersion}; structure only — rates come from country packs`,
    version: cldrCoreVersion,
    checksum: checksum(taxJurisdictions),
    entryCount: taxJurisdictions.length,
    entries: taxJurisdictions,
  },
};

const renderSet = (name, set, keyLiteral, entryType) =>
  `export const ${name} = ${JSON.stringify(set, null, 2)} as const satisfies {
  readonly setKey: ${keyLiteral}; readonly source: string; readonly version: string; readonly checksum: string;
  readonly entryCount: number; readonly entries: readonly ${entryType}[];
};
`;

const file = `// Generated by \`node scripts/build-platform-reference-data.mjs\` (WI-OI-120av, WI-OI-153) from ICU/CLDR and the
// pinned sources the script names. Do not edit: regenerate. Checksums are sha256 over contracts’
// canonicalReferenceString; a test re-derives them.
import type { CountryEntry, CurrencyEntry, LanguageEntry, TimeZoneEntry, TradeTermEntry, UomEntry } from './index.js';

${renderSet('GENERATED_CURRENCIES', sets.CURRENCIES, '"CURRENCIES"', 'CurrencyEntry')}
${renderSet('GENERATED_TIME_ZONES', sets.TIME_ZONES, '"TIME_ZONES"', 'TimeZoneEntry')}
${renderSet('GENERATED_COUNTRIES', sets.COUNTRIES, '"COUNTRIES"', 'CountryEntry')}
${renderSet('GENERATED_LANGUAGES', sets.LANGUAGES, '"LANGUAGES"', 'LanguageEntry')}
${renderSet('GENERATED_UNITS_OF_MEASURE', sets.UNITS_OF_MEASURE, '"UNITS_OF_MEASURE"', 'UomEntry')}
${renderSet('GENERATED_TRADE_TERMS', sets.TRADE_TERMS, '"TRADE_TERMS"', 'TradeTermEntry')}`;

// Regions and tax jurisdictions are large (thousands of entries) and only the loader needs them, so they live in their
// own file, imported through \`@gigalibs/contracts/platform-reference/regions\`, never by the web app. One entry a line.
const compactSet = (name, set, keyLiteral, entryType) => {
  const { entries, ...head } = set;
  const body = JSON.stringify(head, null, 2).replace(/\n}$/, `,\n  "entries": [\n${entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]\n}`);
  return `export const ${name} = ${body} as const satisfies {
  readonly setKey: ${keyLiteral}; readonly source: string; readonly version: string; readonly checksum: string;
  readonly entryCount: number; readonly entries: readonly ${entryType}[];
};
`;
};
const regionsFile = `// Generated by \`node scripts/build-platform-reference-data.mjs\` (WI-OI-153) from Unicode CLDR. Do not edit: regenerate.
import type { SubdivisionEntry, TaxJurisdictionEntry } from './index.js';

${compactSet('GENERATED_REGIONS', sets.REGIONS, '"REGIONS"', 'SubdivisionEntry')}
${compactSet('GENERATED_TAX_JURISDICTIONS', sets.TAX_JURISDICTIONS, '"TAX_JURISDICTIONS"', 'TaxJurisdictionEntry')}`;

const out = join(process.cwd(), 'packages/contracts/src/platform-reference/data.generated.ts');
writeFileSync(out, file);
const regionsOut = join(process.cwd(), 'packages/contracts/src/platform-reference/regions.generated.ts');
writeFileSync(regionsOut, regionsFile);
process.stdout.write(
  `Wrote ${out} and ${regionsOut}\n  CURRENCIES: ${currencies.length}\n  TIME_ZONES: ${timeZones.length}\n  COUNTRIES: ${countries.length} (${countries.filter((c) => c.currency).length} with a currency, ${countries.filter((c) => c.callingCode).length} with a calling code)\n  LANGUAGES: ${languages.length}\n  UNITS_OF_MEASURE: ${units.length} (UN/ECE Rec 20)\n  TRADE_TERMS: ${tradeTerms.length}\n  REGIONS: ${regions.length}\n  TAX_JURISDICTIONS: ${taxJurisdictions.length}\n`,
);
