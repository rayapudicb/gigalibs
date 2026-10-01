import { describe, expect, it } from 'vitest';
import { type SpatialBoundaryV1, boundaryAreaM2, boundaryBoundingBox, evaluateGeofence } from './index.js';

// WI-OI-105a (ADR-0016 F15): field areas computed in code.
describe('boundary area and bounding box', () => {
  it('measures a one-hectare field near Bengaluru to within 0.5%', () => {
    // 100 m × 100 m square at 12.97° N: 100 m of latitude ≈ 0.000904°, of longitude ≈ 0.000926°.
    const dLat = 100 / 110_605;
    const dLon = 100 / (111_320 * Math.cos((12.9716 * Math.PI) / 180));
    const field: SpatialBoundaryV1 = { type: 'Polygon', coordinates: [[[77.5946, 12.9716], [77.5946 + dLon, 12.9716], [77.5946 + dLon, 12.9716 + dLat], [77.5946, 12.9716 + dLat], [77.5946, 12.9716]]] };
    const area = boundaryAreaM2(field)!;
    expect(Math.abs(area - 10_000) / 10_000).toBeLessThan(0.005);
    expect(boundaryBoundingBox(field)).toEqual({ minLongitude: 77.5946, minLatitude: 12.9716, maxLongitude: 77.5946 + dLon, maxLatitude: 12.9716 + dLat });
  });

  it('subtracts holes, adds the parts of a multipolygon, and ignores ring direction', () => {
    const square = (x: number, y: number, size: number, clockwise = false): [number, number][] => {
      const ring: [number, number][] = [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
      return clockwise ? ring.reverse() : ring;
    };
    const outer = boundaryAreaM2({ type: 'Polygon', coordinates: [square(0, 0, 0.01)] })!;
    const holed = boundaryAreaM2({ type: 'Polygon', coordinates: [square(0, 0, 0.01), square(0.004, 0.004, 0.002, true)] })!;
    expect(holed).toBeCloseTo(outer * (1 - 0.04), -1);
    const two = boundaryAreaM2({ type: 'MultiPolygon', coordinates: [[square(0, 0, 0.01)], [square(1, 0, 0.01, true)]] })!;
    expect(Math.abs(two - 2 * outer) / outer).toBeLessThan(0.001);
    expect(boundaryAreaM2(null)).toBeNull();
  });

  it('agrees with the geofence on what is inside', () => {
    const field: SpatialBoundaryV1 = { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]] };
    expect(evaluateGeofence(field, { latitude: 0.005, longitude: 0.005 }).result).toBe('INSIDE');
  });
});
