import {
  PLATFORM_REFERENCE_LOOKUP_SETS,
  ReferenceSetKeySchema,
  type ReferenceSetKey,
} from '@gigalibs/contracts';

export const REFERENCE_SET_LABELS: Readonly<Record<ReferenceSetKey, string>> = {
  COUNTRIES: 'Countries',
  CURRENCIES: 'Currencies',
  UNITS_OF_MEASURE: 'Units of measure',
  LANGUAGES: 'Languages',
  TIME_ZONES: 'Time zones',
  TAX_JURISDICTIONS: 'Tax jurisdictions',
  REGIONS: 'Regions',
  TRADE_TERMS: 'Trade terms',
};

export function isReferenceSetKey(value: string): value is ReferenceSetKey {
  return ReferenceSetKeySchema.safeParse(value).success;
}

export function lookupKeyForReferenceSet(setKey: ReferenceSetKey): string | null {
  for (const [lookup, mapped] of Object.entries(PLATFORM_REFERENCE_LOOKUP_SETS)) {
    if (mapped === setKey) return lookup;
  }
  return null;
}
