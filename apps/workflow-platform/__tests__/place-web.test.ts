import type { AnalyticsQueryResultV1 } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { compatibleChartTypes, placeMap, resultShape } from '../lib/analytics/chart-render';
import { fieldMappingsFromDraft, NO_PLACE, placeDraftFromDiscovery } from '../lib/analytics/mapping-draft';
import { placeFormFrom, placeSettingsFrom } from '../lib/connectors/place-delivery-form';

// WI-OI-105e: the web pieces for places — a Hub connection sending places, a mapping tagging records with their
// place, and the place map.
describe('places on the web', () => {
  it('shapes Connector Hub place settings and catches what is missing', () => {
    const form = { nodeTypeCode: ' FIELD ', nodeTypeField: '', nameField: 'name', geometryField: 'geometry.wkt', codeField: '', parentField: 'farm_id' };
    expect(placeSettingsFrom(form)).toEqual({ nodeTypeCode: 'FIELD', nameField: 'name', geometryField: 'geometry.wkt', parentField: 'farm_id' });
    expect(placeSettingsFrom({ ...form, geometryField: '' })).toHaveProperty('error');
    expect(placeSettingsFrom({ ...form, codeField: 'a..b' })).toHaveProperty('error');
    expect(placeFormFrom({ nodeTypeCode: 'FIELD', nameField: 'n', geometryField: 'g' })).toMatchObject({ codeField: '', parentField: '' });
    expect(placeFormFrom(null).nodeTypeCode).toBe('');
  });

  it('adds one place entry to a mapping, from a point or a code', () => {
    const draft = [{ include: true, sourceField: 'pests', analyticalField: 'pests', analyticalType: 'number' as const, unitMode: 'none' as const, unitFrom: '' as const, unitFromField: '', unitTo: '' as const }];
    const proposed = placeDraftFromDiscovery([
      { fieldName: 'loc.lat', inferredType: 'number', sampleMin: '12.9', sampleMax: '13', nonNullRatio: 1 },
      { fieldName: 'loc.lng', inferredType: 'number', sampleMin: '77.5', sampleMax: '77.6', nonNullRatio: 1 },
    ]);
    expect(proposed).toMatchObject({ mode: 'none', latitudeField: 'loc.lat', longitudeField: 'loc.lng' });
    expect(fieldMappingsFromDraft(draft, { ...proposed, mode: 'point' }).fieldMappings.at(-1)).toEqual({
      sourceField: 'loc.lat',
      analyticalField: 'place',
      analyticalType: 'string',
      place: { longitudeField: 'loc.lng' },
    });
    expect(fieldMappingsFromDraft(draft, { ...NO_PLACE, mode: 'code', codeField: 'plot' }).fieldMappings.at(-1)).toMatchObject({ place: { byCode: true } });
    expect(fieldMappingsFromDraft(draft, { ...NO_PLACE, mode: 'code' }).error).toMatch(/place code/);
    expect(fieldMappingsFromDraft(draft, { ...NO_PLACE, mode: 'code', codeField: 'plot', fieldName: 'pests' }).error).toMatch(/taken/);
    expect(fieldMappingsFromDraft(draft).fieldMappings).toHaveLength(1);
  });

  it('draws the places in a result by their boundaries, coloured by the measure, and counts what it cannot draw', () => {
    const square = (x: number) => ({ type: 'Polygon' as const, coordinates: [[[x, 12.9], [x + 0.01, 12.9], [x + 0.01, 12.91], [x, 12.91], [x, 12.9]] as Array<[number, number]>] });
    const place = (id: string, name: string, x: number | null, depth = 2) => ({
      id, parentId: null, path: name, depth, nodeTypeCode: 'FIELD', name, latitude: null, longitude: null, areaM2: 1, boundary: x === null ? null : square(x),
    });
    const result = {
      columns: [
        { name: 'place_id', label: 'Place', role: 'dimension', type: 'string' },
        { name: 'pests', label: 'Pests', role: 'measure', type: 'number' },
      ],
      rows: [['00000000-0000-4000-8000-000000000001', 20], ['00000000-0000-4000-8000-000000000002', 7], [null, 5]],
    } as unknown as AnalyticsQueryResultV1;
    expect(compatibleChartTypes(resultShape(result))[0]).toBe('place_map');
    const drawn = placeMap(
      result,
      [place('00000000-0000-4000-8000-000000000001', 'North', 77.5), place('00000000-0000-4000-8000-000000000002', 'South', null), place('00000000-0000-4000-8000-000000000003', 'East', 77.52)],
      'places-test',
      { low: 'var-low', high: 'var-high', empty: 'var-empty', border: 'var-border' },
    )!;
    expect(drawn.geoJson.features.map((feature) => feature.properties.name)).toEqual(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003']);
    expect(drawn.notDrawn).toBe(2);
    const series = (drawn.option.series as Array<{ type: string; map: string; data: Array<{ placeName: string; value: number | null }> }>)[0]!;
    expect([series.type, series.map]).toEqual(['map', 'places-test']);
    expect(series.data.map((item) => [item.placeName, item.value])).toEqual([['North', 20], ['East', null]]);
    expect(JSON.stringify(drawn.option)).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});
