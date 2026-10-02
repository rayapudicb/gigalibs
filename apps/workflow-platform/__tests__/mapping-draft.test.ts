import { describe, expect, it } from 'vitest';
import { NO_PLACE, datasetFieldName, defaultMeasures, draftFromDiscovery, fieldMappingsFromDraft } from '../lib/analytics/mapping-draft';

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

// WI-OI-109e3: a field naming each record's organization unit, by code or id.
describe('unit of each record', () => {
  const store = { sourceField: 'store', analyticalField: 'store', analyticalType: 'string' as const, include: true, unitMode: 'none' as const, unitTo: '', unitFrom: '', unitFromField: '' };

  it('adds a unit field matched by code or id beside the plain fields', () => {
    const byCode = fieldMappingsFromDraft([store as never], NO_PLACE, { mode: 'code', fieldName: 'unit', sourceField: 'store' });
    expect(byCode).toEqual({
      error: null,
      fieldMappings: [
        { sourceField: 'store', analyticalField: 'store', analyticalType: 'string' },
        { sourceField: 'store', analyticalField: 'unit', analyticalType: 'string', organizationUnit: { match: 'CODE' } },
      ],
    });
    expect(fieldMappingsFromDraft([store as never], NO_PLACE, { mode: 'id', fieldName: 'unit', sourceField: 'store' }).fieldMappings[1]).toMatchObject({ organizationUnit: { match: 'ID' } });
  });

  it('refuses a missing source, a taken name and the reserved unit_id', () => {
    expect(fieldMappingsFromDraft([store as never], NO_PLACE, { mode: 'code', fieldName: 'unit', sourceField: '' }).error).toMatch(/naming each record/);
    expect(fieldMappingsFromDraft([store as never], NO_PLACE, { mode: 'code', fieldName: 'store', sourceField: 'store' }).error).toMatch(/taken/);
    expect(fieldMappingsFromDraft([store as never], NO_PLACE, { mode: 'code', fieldName: 'unit_id', sourceField: 'store' }).error).toMatch(/taken/);
    expect(fieldMappingsFromDraft([store as never], { ...NO_PLACE, mode: 'code', codeField: 'store', fieldName: 'place' }, { mode: 'code', fieldName: 'place', sourceField: 'store' }).error).toMatch(/taken/);
  });
});
