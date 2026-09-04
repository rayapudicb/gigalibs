/**
 * @gigalibs/geofence-engine
 *
 * Point-in-polygon geofencing and circular radius boundary checking.
 *
 * @module
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export class GeoCalculator {
  /**
   * Calculates great-circle distance between two points on a sphere (in kilometers).
   */
  static haversineDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371; // Earth radius in km
    const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
    const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((coord1.latitude * Math.PI) / 180) *
        Math.cos((coord2.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export interface CircularGeofence {
  id: string;
  name: string;
  center: Coordinates;
  radiusKm: number;
}

export class GeofenceEngine {
  static isInsideRadius(point: Coordinates, fence: CircularGeofence): boolean {
    const distance = GeoCalculator.haversineDistance(point, fence.center);
    return distance <= fence.radiusKm;
  }

  /**
   * Ray-casting algorithm for Point-in-Polygon (Arbitrary boundary shape).
   */
  static isInsidePolygon(point: Coordinates, polygon: Coordinates[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i]?.longitude ?? 0;
      const yi = polygon[i]?.latitude ?? 0;
      const xj = polygon[j]?.longitude ?? 0;
      const yj = polygon[j]?.latitude ?? 0;

      const intersect =
        yi > point.latitude !== yj > point.latitude &&
        point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }
    return inside;
  }
}
