/**
 * WI-OI-104e: the Sources screen's mapping draft. Discovered fields (dot paths into nested records) become proposed
 * dataset fields with a type guessed from their samples; the member edits names, types and unit conversions, and the
 * draft becomes the field mappings Analytics validates. A new dataset gets simple default measures so it can be
 * explored at once.
 * WI-OI-105c: a draft may also tag each record with its place, found from a latitude and longitude, or from a place
 * code or id; the dataset then has a place field (the place's name, or "Unplaced").
 */

import { type AnalyticsUnit, isAnalyticsUnit } from '@gigalibs/contracts';

export type AnalyticalType = 'string' | 'number' | 'boolean' | 'date' | 'timestamp';

export interface DiscoveredField {
  readonly fieldName: string;
  readonly inferredType: string;
  readonly sampleMin: string | null;
  readonly sampleMax: string | null;
  readonly nonNullRatio: number;
}

export interface DraftField {
  include: boolean;
  sourceField: string;
  analyticalField: string;
  analyticalType: AnalyticalType;
  unitMode: 'none' | 'fixed' | 'field';
  unitFrom: AnalyticsUnit | '';
  unitFromField: string;
  unitTo: AnalyticsUnit | '';
}

export interface FieldMappingEntry {
  sourceField: string;
  analyticalField: string;
  analyticalType: AnalyticalType;
  unit?: { to: AnalyticsUnit; from?: AnalyticsUnit; fromField?: string };
  place?: { longitudeField: string } | { byCode: true };
  /** WI-OI-109e3: this field names each record's organization unit (by code or id); empty means tenant-shared. */
  organizationUnit?: { match: 'CODE' | 'ID' };
}

export interface PlaceDraft {
  mode: 'none' | 'point' | 'code';
  /** The dataset field holding each record's place name. */
  fieldName: string;
  latitudeField: string;
  longitudeField: string;
  codeField: string;
}

export const NO_PLACE: PlaceDraft = { mode: 'none', fieldName: 'place', latitudeField: '', longitudeField: '', codeField: '' };

/** WI-OI-109e3: which source field names each record's organization unit, matched by unit code or id. */
export interface UnitDraft {
  mode: 'none' | 'code' | 'id';
  /** The dataset field holding each record's unit name. */
  fieldName: string;
  sourceField: string;
}

export const NO_UNIT: UnitDraft = { mode: 'none', fieldName: 'unit', sourceField: '' };

/** Proposes a point from discovered latitude and longitude fields, when both are there. */
export function placeDraftFromDiscovery(fields: readonly DiscoveredField[]): PlaceDraft {
  const find = (pattern: RegExp) => fields.find((field) => field.inferredType === 'number' && pattern.test(field.fieldName.split('.').pop() ?? ''))?.fieldName ?? '';
  const latitudeField = find(/^(lat|latitude)$/i);
  const longitudeField = find(/^(lon|lng|long|longitude)$/i);
  return { ...NO_PLACE, latitudeField, longitudeField };
}

const NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/;

/** `attributes.quantity` → `quantity`, falling back to the whole path when the last segment is taken. */
export function datasetFieldName(path: string, taken: ReadonlySet<string> = new Set()): string {
  const clean = (value: string) => value.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^[^a-zA-Z]+/, '').replace(/_+$/, '').slice(0, 63).toLowerCase();
  const last = clean(path.split('.').pop() ?? path);
  if (last && !taken.has(last)) return last;
  return clean(path) || 'field';
}

function guessType(field: DiscoveredField): AnalyticalType {
  if (field.inferredType === 'number') return 'number';
  if (field.inferredType === 'boolean') return 'boolean';
  const sample = field.sampleMin ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(sample)) return 'date';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(sample)) return 'timestamp';
  return 'string';
}

export function draftFromDiscovery(fields: readonly DiscoveredField[]): DraftField[] {
  const taken = new Set<string>();
  return fields.map((field) => {
    const analyticalField = datasetFieldName(field.fieldName, taken);
    taken.add(analyticalField);
    const mappable = !['object', 'array'].includes(field.inferredType);
    return {
      include: mappable,
      sourceField: field.fieldName,
      analyticalField,
      analyticalType: guessType(field),
      unitMode: 'none',
      unitFrom: '',
      unitFromField: '',
      unitTo: '',
    };
  });
}

/** The field mappings of the included fields, or the first problem to fix. */
export function fieldMappingsFromDraft(
  draft: readonly DraftField[],
  place: PlaceDraft = NO_PLACE,
  unit: UnitDraft = NO_UNIT,
): { fieldMappings: FieldMappingEntry[]; error: string | null } {
  const included = draft.filter((field) => field.include);
  if (included.length === 0) return { fieldMappings: [], error: 'Include at least one field.' };
  const names = new Set<string>();
  const fieldMappings: FieldMappingEntry[] = [];
  for (const field of included) {
    if (!NAME.test(field.analyticalField)) return { fieldMappings: [], error: `"${field.analyticalField}" is not a valid dataset field name (letters, digits, _).` };
    if (names.has(field.analyticalField)) return { fieldMappings: [], error: `Two fields are named "${field.analyticalField}".` };
    names.add(field.analyticalField);
    const entry: FieldMappingEntry = { sourceField: field.sourceField, analyticalField: field.analyticalField, analyticalType: field.analyticalType };
    if (field.unitMode !== 'none') {
      if (field.analyticalType !== 'number') return { fieldMappings: [], error: `Only number fields convert units ("${field.analyticalField}").` };
      if (!isAnalyticsUnit(field.unitTo)) return { fieldMappings: [], error: `Choose the unit "${field.analyticalField}" is stored in.` };
      if (field.unitMode === 'fixed') {
        if (!isAnalyticsUnit(field.unitFrom)) return { fieldMappings: [], error: `Choose the unit "${field.analyticalField}" arrives in.` };
        entry.unit = { to: field.unitTo, from: field.unitFrom };
      } else {
        if (!field.unitFromField) return { fieldMappings: [], error: `Choose the field that names the unit of "${field.analyticalField}".` };
        entry.unit = { to: field.unitTo, fromField: field.unitFromField };
      }
    }
    fieldMappings.push(entry);
  }
  if (place.mode !== 'none') {
    const fieldName = place.fieldName.trim();
    if (!NAME.test(fieldName)) return { fieldMappings: [], error: `"${fieldName}" is not a valid name for the place field.` };
    if (names.has(fieldName) || ['place_id', 'place_path'].includes(fieldName)) return { fieldMappings: [], error: `Choose another name for the place field; "${fieldName}" is taken.` };
    if (place.mode === 'point') {
      if (!place.latitudeField || !place.longitudeField) return { fieldMappings: [], error: 'Choose the latitude and longitude fields that locate each record.' };
      fieldMappings.push({ sourceField: place.latitudeField, analyticalField: fieldName, analyticalType: 'string', place: { longitudeField: place.longitudeField } });
    } else {
      if (!place.codeField) return { fieldMappings: [], error: 'Choose the field holding each record’s place code or id.' };
      fieldMappings.push({ sourceField: place.codeField, analyticalField: fieldName, analyticalType: 'string', place: { byCode: true } });
    }
    names.add(fieldName);
  }
  if (unit.mode !== 'none') {
    const fieldName = unit.fieldName.trim();
    if (!NAME.test(fieldName)) return { fieldMappings: [], error: `"${fieldName}" is not a valid name for the unit field.` };
    if (names.has(fieldName) || fieldName === 'unit_id') return { fieldMappings: [], error: `Choose another name for the unit field; "${fieldName}" is taken.` };
    if (!unit.sourceField) return { fieldMappings: [], error: 'Choose the field naming each record’s unit.' };
    fieldMappings.push({ sourceField: unit.sourceField, analyticalField: fieldName, analyticalType: 'string', organizationUnit: { match: unit.mode === 'code' ? 'CODE' : 'ID' } });
  }
  return { fieldMappings, error: null };
}

/** A total of each number field and a record count, so a new dataset can be explored at once. */
export function defaultMeasures(fieldMappings: readonly FieldMappingEntry[]) {
  const numbers = fieldMappings.filter((field) => field.analyticalType === 'number');
  const label = (name: string) => name.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase());
  return [
    ...numbers.map((field) => ({
      measureName: `total_${field.analyticalField}`.slice(0, 63),
      aggregateFn: 'SUM',
      fieldReference: field.analyticalField,
      displayLabel: `${label(field.analyticalField)}${field.unit && !field.analyticalField.toLowerCase().endsWith(`_${field.unit.to.toLowerCase()}`) ? ` (${field.unit.to})` : ''}`,
    })),
    { measureName: 'records', aggregateFn: 'COUNT', fieldReference: fieldMappings[0]!.analyticalField, displayLabel: 'Records' },
  ];
}
