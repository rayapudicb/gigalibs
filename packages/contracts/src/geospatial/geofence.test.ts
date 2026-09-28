/** WI-OI-069 — geofence evaluation used by the BFF for punches. */
import { describe, expect, it } from 'vitest';
import { type SpatialBoundaryV1, evaluateGeofence } from './index.js';

// A ~111 m square yard at the equator with a ~22 m square hole (the tank) near its centre.
const yard: SpatialBoundaryV1 = {
  type: 'Polygon',
  coordinates: [
    [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]],
    [[0.0004, 0.0004], [0.0006, 0.0004], [0.0006, 0.0006], [0.0004, 0.0006], [0.0004, 0.0004]],
  ],
};

describe('evaluateGeofence', () => {
  it('reports INSIDE with the distance to the nearest edge', () => {
    const inside = evaluateGeofence(yard, { latitude: 0.0002, longitude: 0.0002 });
    expect(inside.result).toBe('INSIDE');
    expect(inside.distanceToEdgeMeters).toBeGreaterThan(20);
    expect(inside.distanceToEdgeMeters).toBeLessThan(25);
  });

  it('treats a hole as outside and measures to the hole edge', () => {
    const hole = evaluateGeofence(yard, { latitude: 0.0005, longitude: 0.0005 });
    expect(hole.result).toBe('OUTSIDE');
    expect(hole.distanceToEdgeMeters).toBeGreaterThan(10);
    expect(hole.distanceToEdgeMeters).toBeLessThan(12);
  });

  it('reports OUTSIDE beyond the boundary with a realistic distance', () => {
    const away = evaluateGeofence(yard, { latitude: 0.0005, longitude: 0.002 });
    expect(away.result).toBe('OUTSIDE');
    expect(away.distanceToEdgeMeters).toBeGreaterThan(105);
    expect(away.distanceToEdgeMeters).toBeLessThan(118);
  });

  it('is INSIDE any polygon of a MultiPolygon', () => {
    const sites: SpatialBoundaryV1 = {
      type: 'MultiPolygon',
      coordinates: [
        [[[10, 10], [10.001, 10], [10.001, 10.001], [10, 10.001], [10, 10]]],
        [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]],
      ],
    };
    expect(evaluateGeofence(sites, { latitude: 0.0005, longitude: 0.0005 }).result).toBe('INSIDE');
    expect(evaluateGeofence(sites, { latitude: 5, longitude: 5 }).result).toBe('OUTSIDE');
  });

  it('returns NO_BOUNDARY for a place without a boundary', () => {
    expect(evaluateGeofence(null, { latitude: 1, longitude: 1 })).toEqual({ result: 'NO_BOUNDARY', distanceToEdgeMeters: null });
  });

  it('scales longitude distance by latitude', () => {
    const north: SpatialBoundaryV1 = { type: 'Polygon', coordinates: [[[0, 60], [0.001, 60], [0.001, 60.001], [0, 60.001], [0, 60]]] };
    const east = evaluateGeofence(north, { latitude: 60.0005, longitude: 0.002 });
    expect(east.distanceToEdgeMeters).toBeGreaterThan(50);
    expect(east.distanceToEdgeMeters).toBeLessThan(60);
  });
});
