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

// ============================================================================
// GLOBAL GEOCODING & KNOWLEDGE DIRECTORY
// ============================================================================

export interface GeocodedPlace {
  id: string;
  name: string;
  formattedAddress: string;
  city: string;
  stateOrProvince: string;
  country: string;
  countryCode: string;
  postalCode?: string;
  coordinates: Coordinates;
  category: 'Commercial Hub' | 'Industrial Logistics' | 'Port / Terminal' | 'Retail District';
  regionalCluster: string;
  economicZone: string;
  nearestHub?: {
    name: string;
    distanceKm: number;
    mode: string;
  };
  details?: Record<string, any>;
}

export const GLOBAL_GEOCODED_LOCATIONS: GeocodedPlace[] = [
  {
    id: 'place-lewisville-tx',
    name: 'Lewisville',
    formattedAddress: 'Lewisville, Denton County, Texas 75057, United States',
    city: 'Lewisville',
    stateOrProvince: 'Texas',
    country: 'United States',
    countryCode: 'US',
    postalCode: '75057',
    coordinates: { latitude: 33.0462, longitude: -96.9942 },
    category: 'Commercial Hub',
    regionalCluster: 'Texas Triangle Economic Metro',
    economicZone: 'Dallas-Fort Worth (DFW) Metroplex Intermodal',
    nearestHub: {
      name: 'Dallas Inland Port (DFW)',
      distanceKm: 38.4,
      mode: 'Intermodal Rail / Highway',
    },
    details: {
      population: '112,500 residents',
      taxJurisdiction: 'Texas Comptroller (8.25% Composite State + Local)',
      logisticsCorridor: 'I-35E NAFTA / USMCA Primary Freight Spine',
      majorIndustries: 'Commercial Distribution, Technology Manufacturing & Corporate Campuses',
      nearestAirport: 'Dallas/Fort Worth International (DFW) — 18.2 km',
    },
  },
  {
    id: 'place-ongole-ap-in',
    name: 'Ongole',
    formattedAddress: 'Ongole, Prakasam District, Andhra Pradesh 523001, India',
    city: 'Ongole',
    stateOrProvince: 'Andhra Pradesh',
    country: 'India',
    countryCode: 'IN',
    postalCode: '523001',
    coordinates: { latitude: 15.5057, longitude: 80.0499 },
    category: 'Industrial Logistics',
    regionalCluster: 'South India Bay of Bengal Coastal Corridor',
    economicZone: 'Andhra Pradesh Industrial Corridor (NH-16 / Golden Quadrilateral)',
    nearestHub: {
      name: 'Krishnapatnam Deepwater Port',
      distanceKm: 135.2,
      mode: 'Deep Sea Maritime Port',
    },
    details: {
      population: '252,000 residents',
      taxJurisdiction: 'Andhra Pradesh GST (18% Composite CGST + SGST)',
      logisticsCorridor: 'National Highway 16 (Chennai-Kolkata Freight Corridor)',
      majorIndustries: 'Galaxy Granite Export Processing, Marine Seafood & Cold-Chain Logistics',
      nearestSeaports: 'Krishnapatnam Port (135 km), Chennai Seaport (285 km)',
    },
  },
  {
    id: 'place-tokyo-jp',
    name: 'Tokyo',
    formattedAddress: 'Chiyoda-ku, Tokyo 100-0001, Japan',
    city: 'Tokyo',
    stateOrProvince: 'Tokyo Prefecture',
    country: 'Japan',
    countryCode: 'JP',
    postalCode: '100-0001',
    coordinates: { latitude: 35.6762, longitude: 139.6503 },
    category: 'Commercial Hub',
    regionalCluster: 'Greater Tokyo Kanto Economic Basin',
    economicZone: 'Tokyo Bay Keihin Industrial Zone',
    nearestHub: {
      name: 'Port of Tokyo & Haneda Airfreight Hub',
      distanceKm: 12.0,
      mode: 'Deep Sea & Air Cargo',
    },
    details: {
      population: '14,100,000 residents',
      taxJurisdiction: 'National Tax Agency Japan (10% Consumption Tax)',
      majorIndustries: 'Robotics, Financial Services & Global Headquarters',
    },
  },
  {
    id: 'place-london-uk',
    name: 'London',
    formattedAddress: 'City of London, Greater London, United Kingdom',
    city: 'London',
    stateOrProvince: 'Greater London',
    country: 'United Kingdom',
    countryCode: 'GB',
    postalCode: 'EC2N 2DB',
    coordinates: { latitude: 51.5074, longitude: -0.1278 },
    category: 'Commercial Hub',
    regionalCluster: 'UK Southeast Economic Supercluster',
    economicZone: 'London Heathrow / Thames Gateway Corridor',
    nearestHub: {
      name: 'London Gateway Port',
      distanceKm: 42.5,
      mode: 'Automated Deep Sea Container Terminal',
    },
    details: {
      population: '8,980,000 residents',
      taxJurisdiction: 'HMRC (20% Standard VAT)',
      majorIndustries: 'Global FinTech, Insurance & Treasury Operations',
    },
  },
  {
    id: 'place-dallas-tx',
    name: 'Dallas',
    formattedAddress: 'Dallas, Dallas County, Texas, United States',
    city: 'Dallas',
    stateOrProvince: 'Texas',
    country: 'United States',
    countryCode: 'US',
    postalCode: '75201',
    coordinates: { latitude: 32.7767, longitude: -96.797 },
    category: 'Industrial Logistics',
    regionalCluster: 'Texas Triangle Economic Metro',
    economicZone: 'Dallas Inland Port (DFW)',
    nearestHub: {
      name: 'DFW International Intermodal Hub',
      distanceKm: 24.0,
      mode: 'Class I BNSF/Union Pacific Rail',
    },
    details: {
      population: '1,304,000 residents',
      taxJurisdiction: 'Texas Comptroller (8.25%)',
    },
  },
  {
    id: 'place-bengaluru-in',
    name: 'Bengaluru',
    formattedAddress: 'Bengaluru, Karnataka 560001, India',
    city: 'Bengaluru',
    stateOrProvince: 'Karnataka',
    country: 'India',
    countryCode: 'IN',
    postalCode: '560001',
    coordinates: { latitude: 12.9716, longitude: 77.5946 },
    category: 'Commercial Hub',
    regionalCluster: 'Deccan Tech & Aerospace Hub',
    economicZone: 'Electronic City & Whitefield Export Corridor',
    nearestHub: {
      name: 'Kempegowda International Cargo Village',
      distanceKm: 34.8,
      mode: 'Air Cargo Intermodal',
    },
    details: {
      population: '13,200,000 residents',
      taxJurisdiction: 'Karnataka GST (18%)',
    },
  },
];

export class GeoSearchEngine {
  /**
   * Performs an instant multi-attribute search across the global geocoded knowledge directory.
   */
  static search(query: string): GeocodedPlace[] {
    if (!query || !query.trim()) return [];
    const q = query.trim().toLowerCase();

    // Check exact or partial tokens
    const tokens = q.split(/[\s,]+/).filter(Boolean);

    return GLOBAL_GEOCODED_LOCATIONS.filter((place) => {
      const searchTarget = [
        place.name,
        place.city,
        place.stateOrProvince,
        place.country,
        place.countryCode,
        place.postalCode,
        place.category,
        place.regionalCluster,
        place.economicZone,
        place.formattedAddress,
        place.nearestHub?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      // Match if all tokens appear in target or if whole query appears
      if (searchTarget.includes(q)) return true;
      return tokens.every((token) => searchTarget.includes(token));
    });
  }

  /**
   * Calculates proximity and geodesic distance from a query coordinate to known global hubs.
   */
  static findNearestHubs(coord: Coordinates, limit = 3): Array<{ place: GeocodedPlace; distanceKm: number }> {
    return GLOBAL_GEOCODED_LOCATIONS.map((place) => ({
      place,
      distanceKm: GeoCalculator.haversineDistance(coord, place.coordinates),
    }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }
}
