import { describe, expect, it } from 'vitest';
import { ConnectorPlaceDeliveryV1Schema, parsePlaceGeometry, placeCodeFrom } from './place-source.js';

// WI-OI-105e: places pulled through Connector Hub carry GeoJSON or WKT.
describe('place geometry from a pulled record', () => {
  const ring: Array<[number, number]> = [[77.5, 12.9], [77.51, 12.9], [77.51, 12.91], [77.5, 12.91], [77.5, 12.9]];

  it('reads GeoJSON as an object, as text, or inside a Feature', () => {
    const polygon = { type: 'Polygon', coordinates: [ring] };
    expect(parsePlaceGeometry(polygon)).toEqual({ boundary: polygon, latitude: null, longitude: null });
    expect(parsePlaceGeometry(JSON.stringify(polygon))).toEqual({ boundary: polygon, latitude: null, longitude: null });
    expect(parsePlaceGeometry({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [77.5, 12.9] } })).toEqual({
      boundary: null,
      latitude: 12.9,
      longitude: 77.5,
    });
  });

  it('reads WKT points, polygons with holes and multipolygons, with an optional WGS 84 SRID', () => {
    expect(parsePlaceGeometry('POINT (77.5 12.9)')).toEqual({ boundary: null, latitude: 12.9, longitude: 77.5 });
    const hole = '(77.502 12.902, 77.503 12.902, 77.503 12.903, 77.502 12.902)';
    const polygon = parsePlaceGeometry(`SRID=4326;POLYGON((77.5 12.9, 77.51 12.9, 77.51 12.91, 77.5 12.91, 77.5 12.9), ${hole})`);
    expect(polygon).toMatchObject({ boundary: { type: 'Polygon', coordinates: [ring, expect.any(Array)] } });
    expect(parsePlaceGeometry('MULTIPOLYGON (((77.5 12.9 5, 77.51 12.9 5, 77.51 12.91 5, 77.5 12.91 5, 77.5 12.9 5)))')).toMatchObject({
      boundary: { type: 'MultiPolygon', coordinates: [[ring]] },
    });
  });

  it('gives a reason for what it cannot use', () => {
    expect(parsePlaceGeometry(null)).toEqual({ error: 'The record has no geometry.' });
    expect(parsePlaceGeometry('LINESTRING (0 0, 1 1)')).toHaveProperty('error');
    expect(parsePlaceGeometry('SRID=32643;POINT (500000 1400000)')).toEqual({ error: 'Only WGS 84 (SRID 4326) is supported, not SRID 32643.' });
    expect(parsePlaceGeometry('POLYGON ((77.5 12.9, 77.51 12.9, 77.5 12.9')).toHaveProperty('error');
    expect(parsePlaceGeometry('POLYGON ((77.5 12.9, 77.51 12.9, 77.51 12.91, 77.5 12.91))')).toHaveProperty('error');
    expect(parsePlaceGeometry({ type: 'Point', coordinates: [200, 12] })).toHaveProperty('error');
  });

  it('turns source values into place codes, and validates the delivery settings', () => {
    expect(placeCodeFrom(' Field 12-A ')).toBe('Field_12_A');
    expect(placeCodeFrom('---')).toBeNull();
    expect(ConnectorPlaceDeliveryV1Schema.safeParse({ nodeTypeCode: 'FIELD', nameField: 'name', geometryField: 'geometry.wkt' }).success).toBe(true);
    expect(ConnectorPlaceDeliveryV1Schema.safeParse({ nodeTypeCode: 'FIELD', nameField: 'name', geometryField: 'a..b' }).success).toBe(false);
  });
});
