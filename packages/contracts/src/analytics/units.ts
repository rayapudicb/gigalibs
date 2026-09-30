/**
 * WI-OI-104e: units a mapping can convert between when a dataset is built, so sources that report kg, quintals or
 * tonnes (or hectares and acres, litres and cubic metres) land in one unit. Conversions stay within a dimension.
 * A source's own unit text is read case-insensitively with common spellings.
 */

export type UnitDimension = 'mass' | 'area' | 'volume';

export const ANALYTICS_UNITS = {
  g: { dimension: 'mass', label: 'gram (g)', factor: 0.001, aliases: ['gram', 'grams', 'gm', 'gms'] },
  kg: { dimension: 'mass', label: 'kilogram (kg)', factor: 1, aliases: ['kilogram', 'kilograms', 'kgs', 'kilo', 'kilos'] },
  quintal: { dimension: 'mass', label: 'quintal (100 kg)', factor: 100, aliases: ['quintals', 'q', 'qtl', 'qtls', 'qt'] },
  t: { dimension: 'mass', label: 'tonne (t)', factor: 1000, aliases: ['tonne', 'tonnes', 'ton', 'tons', 'mt', 'metric ton', 'metric tonne'] },
  lb: { dimension: 'mass', label: 'pound (lb)', factor: 0.45359237, aliases: ['lbs', 'pound', 'pounds'] },
  m2: { dimension: 'area', label: 'square metre (m²)', factor: 1, aliases: ['m²', 'sq m', 'sqm', 'square metre', 'square meter', 'square metres', 'square meters'] },
  ha: { dimension: 'area', label: 'hectare (ha)', factor: 10_000, aliases: ['hectare', 'hectares'] },
  acre: { dimension: 'area', label: 'acre', factor: 4046.8564224, aliases: ['acres', 'ac'] },
  mL: { dimension: 'volume', label: 'millilitre (mL)', factor: 0.001, aliases: ['ml', 'millilitre', 'milliliter', 'millilitres', 'milliliters'] },
  L: { dimension: 'volume', label: 'litre (L)', factor: 1, aliases: ['l', 'litre', 'liter', 'litres', 'liters', 'ltr'] },
  m3: { dimension: 'volume', label: 'cubic metre (m³)', factor: 1000, aliases: ['m³', 'cubic metre', 'cubic meter', 'cubic metres', 'cubic meters', 'cbm'] },
} as const satisfies Record<string, { dimension: UnitDimension; label: string; factor: number; aliases: readonly string[] }>;

export type AnalyticsUnit = keyof typeof ANALYTICS_UNITS;

const LOOKUP = new Map<string, AnalyticsUnit>();
for (const [unit, spec] of Object.entries(ANALYTICS_UNITS) as Array<[AnalyticsUnit, (typeof ANALYTICS_UNITS)[AnalyticsUnit]]>) {
  LOOKUP.set(unit.toLowerCase(), unit);
  for (const alias of spec.aliases) LOOKUP.set(alias.toLowerCase(), unit);
}

/** The unit a source's text names, or null when it names none this table knows. */
export function normalizeUnit(value: unknown): AnalyticsUnit | null {
  if (typeof value !== 'string') return null;
  return LOOKUP.get(value.trim().toLowerCase().replace(/\s+/g, ' ')) ?? null;
}

export function isAnalyticsUnit(value: unknown): value is AnalyticsUnit {
  return typeof value === 'string' && Object.hasOwn(ANALYTICS_UNITS, value);
}

/** The value in the target unit, or null when the units are of different dimensions or the value is not a number. */
export function convertUnit(value: number, from: AnalyticsUnit, to: AnalyticsUnit): number | null {
  const source = ANALYTICS_UNITS[from];
  const target = ANALYTICS_UNITS[to];
  if (!Number.isFinite(value) || source.dimension !== target.dimension) return null;
  if (from === to) return value;
  // Round away binary noise (for example 12 × 100 / 1 = 1200, not 1199.9999999999998).
  return Number(((value * source.factor) / target.factor).toPrecision(15));
}

/** How a mapped number field converts: from a fixed unit, or from the unit named in another field of each record. */
export interface FieldUnitConversion {
  readonly to: AnalyticsUnit;
  readonly from?: AnalyticsUnit;
  readonly fromField?: string;
}
