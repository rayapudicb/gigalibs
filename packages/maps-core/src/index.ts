/**
 * @gigalibs/maps-core
 *
 * Enterprise Geolocation, High-Precision Haversine Geodesic Distance,
 * Point-in-Polygon Geofence Ray Casting, and Compass Bearing Engine.
 * Benchmark: Uber H3 / Mapbox Core Geometry / Turf.js.
 *
 * @module
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type GeofenceType = 'POLYGON' | 'RADIAL_CIRCLE';

export interface GeofenceBoundary {
  id: string;
  name: string;
  type: GeofenceType;
  color?: string | undefined;
  category?: string | undefined;
  center?: Coordinates | undefined;
  radiusMeters?: number | undefined;
  vertices?: Coordinates[] | undefined;
}

export interface GpsTrackedAsset {
  id: string;
  name: string;
  role: string;
  icon: string;
  currentPosition: Coordinates;
  speedKph: number;
  headingDeg: number;
  isInside: boolean;
  activeGeofenceName?: string | undefined;
  lastPingAt: string;
}

export interface GeofenceEvent {
  id: string;
  eventType: 'ENTER' | 'EXIT' | 'DWELL';
  assetName: string;
  geofenceName: string;
  timestamp: string;
  coordinates: Coordinates;
  triggerAction: string;
}

export interface GeocodedAddress {
  formattedAddress: string;
  coordinates: Coordinates;
  city?: string | undefined;
  stateOrProvince?: string | undefined;
  country?: string | undefined;
  postalCode?: string | undefined;
}

export interface GeofencePolygon {
  id: string;
  name: string;
  vertices: Coordinates[];
}

export class GeoCalculator {
  /**
   * Great-circle distance between two geographic coordinates using the Haversine trigonometric formula.
   * Returns distance in kilometers with high floating-point precision.
   */
  static haversineDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371.0; // Earth radius in km
    const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
    const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((coord1.latitude * Math.PI) / 180) *
        Math.cos((coord2.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(3));
  }

  /**
   * Verifies if target coordinate falls within a specified radius (km) from origin.
   */
  static isWithinRadius(origin: Coordinates, target: Coordinates, maxRadiusKm: number): boolean {
    const distance = this.haversineDistance(origin, target);
    return distance <= maxRadiusKm;
  }

  /**
   * Computes forward initial compass bearing (0° to 360°) between two coordinates.
   */
  static computeBearing(from: Coordinates, to: Coordinates): number {
    const lat1 = (from.latitude * Math.PI) / 180;
    const lat2 = (to.latitude * Math.PI) / 180;
    const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearingRad = Math.atan2(y, x);
    const bearingDeg = ((bearingRad * 180) / Math.PI + 360) % 360;

    return Number(bearingDeg.toFixed(1));
  }

  /**
   * Point-in-Polygon (PIP) Ray-Casting algorithm to test if a coordinate is inside an arbitrary polygon geofence.
   */
  static isInsideGeofence(point: Coordinates, polygon: GeofencePolygon): boolean {
    const vs = polygon.vertices;
    if (vs.length < 3) return false;

    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i]?.longitude ?? 0;
      const yi = vs[i]?.latitude ?? 0;
      const xj = vs[j]?.longitude ?? 0;
      const yj = vs[j]?.latitude ?? 0;

      const intersect =
        yi > point.latitude !== yj > point.latitude &&
        point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Unified tester for either Polygon or Radial Circle geofence boundary.
   */
  static isPointInBoundary(point: Coordinates, boundary: GeofenceBoundary): boolean {
    if (boundary.type === 'RADIAL_CIRCLE' && boundary.center && boundary.radiusMeters) {
      const distKm = this.haversineDistance(boundary.center, point);
      return distKm * 1000 <= boundary.radiusMeters;
    }

    if (boundary.type === 'POLYGON' && boundary.vertices && boundary.vertices.length >= 3) {
      return this.isInsideGeofence(point, { id: boundary.id, name: boundary.name, vertices: boundary.vertices });
    }

    return false;
  }
}
