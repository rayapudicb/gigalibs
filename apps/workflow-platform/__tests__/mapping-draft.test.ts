import { describe, expect, it } from 'vitest';
import { datasetFieldName, defaultMeasures, draftFromDiscovery, fieldMappingsFromDraft } from '../lib/analytics/mapping-draft';

// WI-OI-104e: the Sources screen proposes dataset fields from discovery and sends mappings Analytics accepts.
describe('mapping draft', () => {
  const discovered = [
    { fieldName: 'id', inferredType: 'string', sampleMin: 'h-1', sampleMax: 'h-9', nonNullRatio: 1 },
    { fieldName: 'attributes.quantity', inferredType: 'number', sampleMin: '1', sampleMax: '12', nonNullRatio: 1 },
    { fieldName: 'attributes.unit', inferredType: 'string', sampleMin: 'kg', sampleMax: 'quintal', nonNullRatio: 1 },
    { fieldName: 'attributes.harvested_on', inferredType: 'string', sampleMin: '2026-09-21', sampleMax: '2026-09-26', nonNullRatio: 1 },
    { fieldName: 'links.self', inferredType: 'object', sampleMin: null, sampleMax: null, nonNullRatio: 1 },
  ];

  it('proposes short names and guessed types, leaving objects out', () => {
    const draft = draftFromDiscovery(discovered);
    expect(draft.map((field) => [field.analyticalField, field.analyticalType, field.include])).toEqual([
      ['id', 'string', true],
      ['quantity', 'number', true],
      ['unit', 'string', true],
      ['harvested_on', 'date', true],
      ['self', 'string', false],
    ]);
    expect(datasetFieldName('a.b.name', new Set(['name']))).toBe('a_b_name');
  });

  it('sends unit conversions and refuses drafts Analytics would refuse', () => {
    const draft = draftFromDiscovery(discovered);
    draft[1] = { ...draft[1]!, analyticalField: 'yield_kg', unitMode: 'field', unitFromField: 'attributes.unit', unitTo: 'kg' };
    const { fieldMappings, error } = fieldMappingsFromDraft(draft);
    expect(error).toBeNull();
    expect(fieldMappings[1]).toEqual({ sourceField: 'attributes.quantity', analyticalField: 'yield_kg', analyticalType: 'number', unit: { to: 'kg', fromField: 'attributes.unit' } });
    expect(defaultMeasures(fieldMappings).map((measure) => [measure.measureName, measure.aggregateFn, measure.displayLabel])).toEqual([
      ['total_yield_kg', 'SUM', 'Yield kg'],
      ['records', 'COUNT', 'Records'],
    ]);
    expect(fieldMappingsFromDraft(draft.map((field) => ({ ...field, analyticalField: 'same' }))).error).toContain('Two fields');
    expect(fieldMappingsFromDraft([{ ...draft[0]!, unitMode: 'fixed', unitTo: 'kg', unitFrom: 'quintal' }]).error).toContain('Only number');
    expect(fieldMappingsFromDraft(draft.map((field) => ({ ...field, include: false }))).error).toContain('at least one');
  });
});
