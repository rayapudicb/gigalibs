import { describe, it, expect } from 'vitest';
import { GeoCalculator, GeoSearchEngine, type Coordinates, type GeofenceBoundary } from './index.js';

describe('GeoCalculator', () => {
  const sanFrancisco: Coordinates = { latitude: 37.7749, longitude: -122.4194 };
  const oakland: Coordinates = { latitude: 37.8044, longitude: -122.2711 };
  const losAngeles: Coordinates = { latitude: 34.0522, longitude: -118.2437 };

  it('calculates accurate Haversine great-circle distance', () => {
    // SF to Oakland is approx 13.5 km across the bay
    const sfToOakland = GeoCalculator.haversineDistance(sanFrancisco, oakland);
    expect(sfToOakland).toBeGreaterThan(12);
    expect(sfToOakland).toBeLessThan(15);

    // SF to LA is approx 559 km
    const sfToLa = GeoCalculator.haversineDistance(sanFrancisco, losAngeles);
    expect(sfToLa).toBeGreaterThan(550);
    expect(sfToLa).toBeLessThan(570);
  });

  it('computes forward compass bearing accurately', () => {
    // SF to LA is South-East (~135-145°)
    const bearing = GeoCalculator.computeBearing(sanFrancisco, losAngeles);
    expect(bearing).toBeGreaterThan(120);
    expect(bearing).toBeLessThan(160);
  });

  it('correctly determines if a point is within radius', () => {
    expect(GeoCalculator.isWithinRadius(sanFrancisco, oakland, 20)).toBe(true);
    expect(GeoCalculator.isWithinRadius(sanFrancisco, oakland, 5)).toBe(false);
  });

  it('correctly tests Point-in-Polygon (PIP) ray casting for arbitrary boundaries', () => {
    const squareGeofence: GeofenceBoundary = {
      id: 'sf_downtown',
      name: 'SF Downtown Quadrant',
      type: 'POLYGON',
      vertices: [
        { latitude: 37.77, longitude: -122.43 },
        { latitude: 37.79, longitude: -122.43 },
        { latitude: 37.79, longitude: -122.40 },
        { latitude: 37.77, longitude: -122.40 },
      ],
    };

    // Inside
    const insidePoint: Coordinates = { latitude: 37.78, longitude: -122.41 };
    expect(GeoCalculator.isPointInBoundary(insidePoint, squareGeofence)).toBe(true);

    // Outside
    const outsidePoint: Coordinates = { latitude: 37.81, longitude: -122.35 };
    expect(GeoCalculator.isPointInBoundary(outsidePoint, squareGeofence)).toBe(false);
  });

  it('searches and resolves global geocoded locations including Lewisville and Ongole India', () => {
    // Search Lewisville
    const lewisvilleResults = GeoSearchEngine.search('lewisville');
    expect(lewisvilleResults.length).toBeGreaterThan(0);
    expect(lewisvilleResults[0]!.name).toBe('Lewisville');
    expect(lewisvilleResults[0]!.stateOrProvince).toBe('Texas');
    expect(lewisvilleResults[0]!.coordinates.latitude).toBeCloseTo(33.0462, 2);

    // Search Ongole India
    const ongoleResults = GeoSearchEngine.search('ongole india');
    expect(ongoleResults.length).toBeGreaterThan(0);
    expect(ongoleResults[0]!.name).toBe('Ongole');
    expect(ongoleResults[0]!.country).toBe('India');
    expect(ongoleResults[0]!.coordinates.latitude).toBeCloseTo(15.5057, 2);
  });
});

