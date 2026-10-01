/**
 * WI-OI-105c (ADR-0016 F15): tags each record with its place from Analytics' place directory (fed by Geospatial,
 * WI-OI-105b), computed in code. A point goes to the smallest active place whose boundary contains it (bounding box
 * first, then the shared point-in-polygon test, holes counting as outside). A code or id matches one active place; a
 * code shared by several places is ambiguous and stays unplaced rather than guessed.
 */

import { type SpatialBoundaryV1, boundaryAreaM2, evaluateGeofence } from '@gigalibs/contracts';
import type { DatabaseService } from '../database/database.service.js';

export interface TaggedPlace {
  readonly id: string;
  readonly path: string;
  readonly name: string;
}

interface DirectoryPlace extends TaggedPlace {
  readonly boundary: SpatialBoundaryV1 | null;
  readonly box: readonly [number, number, number, number] | null;
  readonly area: number;
}

export class PlaceTagger {
  private constructor(
    private readonly bounded: readonly DirectoryPlace[],
    private readonly byKey: ReadonlyMap<string, DirectoryPlace | null>,
  ) {}

  static async load(db: Pick<DatabaseService, 'queryWithTenant'>, tenantId: string): Promise<PlaceTagger> {
    const result = await db.queryWithTenant<{
      place_id: string;
      path: string;
      display_name: string | null;
      boundary: SpatialBoundaryV1 | null;
      min_longitude: number | null;
      min_latitude: number | null;
      max_longitude: number | null;
      max_latitude: number | null;
      area_m2: number | null;
    }>(
      tenantId,
      `SELECT place_id, path, display_name, boundary, min_longitude, min_latitude, max_longitude, max_latitude, area_m2
         FROM gigalibs_analytics.place_directory WHERE status = 'ACTIVE'`,
    );
    const places = result.rows.map((row): DirectoryPlace => ({
      id: row.place_id,
      path: row.path,
      name: row.display_name ?? row.path.split('.').pop()!,
      boundary: row.boundary,
      box: row.min_longitude !== null && row.min_latitude !== null && row.max_longitude !== null && row.max_latitude !== null
        ? [row.min_longitude, row.min_latitude, row.max_longitude, row.max_latitude]
        : null,
      area: row.area_m2 ?? boundaryAreaM2(row.boundary) ?? Number.POSITIVE_INFINITY,
    }));
    const byKey = new Map<string, DirectoryPlace | null>();
    for (const place of places) {
      byKey.set(place.id.toLowerCase(), place);
      const code = place.path.split('.').pop()!.toLowerCase();
      byKey.set(code, byKey.has(code) ? null : place);
    }
    return new PlaceTagger(places.filter((place) => place.boundary && place.box), byKey);
  }

  byPoint(latitude: unknown, longitude: unknown): TaggedPlace | null {
    const lat = typeof latitude === 'string' && latitude.trim() !== '' ? Number(latitude) : latitude;
    const lon = typeof longitude === 'string' && longitude.trim() !== '' ? Number(longitude) : longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    let best: DirectoryPlace | null = null;
    for (const place of this.bounded) {
      const [minLon, minLat, maxLon, maxLat] = place.box!;
      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
      if (best && place.area >= best.area) continue;
      if (evaluateGeofence(place.boundary, { latitude: lat, longitude: lon }).result === 'INSIDE') best = place;
    }
    return best ? { id: best.id, path: best.path, name: best.name } : null;
  }

  byCode(value: unknown): TaggedPlace | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const place = this.byKey.get(String(value).trim().toLowerCase());
    return place ? { id: place.id, path: place.path, name: place.name } : null;
  }
}
