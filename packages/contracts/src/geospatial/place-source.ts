import { z } from 'zod';
import { SpatialBoundaryV1Schema, SpatialNodeCodeSchema, type SpatialBoundaryV1 } from './index.js';

/**
 * WI-OI-105e (ADR-0016 F15): a Connector Hub connection can send its pulled records to Geospatial as places. The
 * Hub reads the named fields from each record (dot paths reach nested values) and sends one
 * CONNECTOR_PLACE_PULLED_V1 fact per new record version; Geospatial creates or updates the place linked to the
 * record's source id.
 */
const FieldPathSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,7}$/, 'Use a field name, or a dot path such as geometry.wkt.');

export const ConnectorPlaceDeliveryV1Schema = z.object({
  /** The Geospatial place type every record becomes, such as FIELD. */
  nodeTypeCode: z.string().trim().min(1).max(64),
  /** A field naming each record's place type (FARM, FIELD, …), when one source lists several; nodeTypeCode otherwise. */
  nodeTypeField: FieldPathSchema.optional(),
  /** The place's name. */
  nameField: FieldPathSchema,
  /** GeoJSON (object or text) or WKT: a Polygon, MultiPolygon or Point in WGS 84 longitude/latitude. */
  geometryField: FieldPathSchema,
  /** The place code; the record's source id when left out. */
  codeField: FieldPathSchema.optional(),
  /** The source id of the record's parent place, pulled on the same connection. */
  parentField: FieldPathSchema.optional(),
});
export type ConnectorPlaceDeliveryV1 = z.infer<typeof ConnectorPlaceDeliveryV1Schema>;

export const CONNECTOR_PLACE_PULLED_V1 = 'CONNECTOR_PLACE_PULLED_V1';

export const ConnectorPlacePulledV1Schema = z.object({
  hubConnectionId: z.string().min(1).max(64),
  connectionName: z.string().max(200).optional(),
  syncJobId: z.string().max(64).optional(),
  sourceId: z.string().min(1).max(256),
  place: z.object({
    nodeTypeCode: z.string().min(1).max(64),
    code: z.string().max(256).nullable(),
    name: z.string().max(400).nullable(),
    geometry: z.unknown(),
    parentSourceId: z.string().max(256).nullable(),
  }),
});
export type ConnectorPlacePulledV1 = z.infer<typeof ConnectorPlacePulledV1Schema>;

/** A place code from a source value: letters, digits and underscores, at most 63 characters. */
export function placeCodeFrom(value: string): string | null {
  const code = value.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 63);
  return SpatialNodeCodeSchema.safeParse(code).success ? code : null;
}

export type PlaceGeometry =
  | { readonly boundary: SpatialBoundaryV1; readonly latitude: null; readonly longitude: null }
  | { readonly boundary: null; readonly latitude: number; readonly longitude: number };

/**
 * Reads a place's geometry from GeoJSON (a geometry, a Feature, or its JSON text) or WKT (POINT, POLYGON or
 * MULTIPOLYGON, optionally with an SRID=4326 prefix). Returns a reason instead when it is not usable.
 */
export function parsePlaceGeometry(value: unknown): PlaceGeometry | { readonly error: string } {
  let geometry = value;
  if (typeof geometry === 'string') {
    const text = geometry.trim();
    if (text.startsWith('{')) {
      try {
        geometry = JSON.parse(text) as unknown;
      } catch {
        return { error: 'The geometry is neither GeoJSON nor WKT.' };
      }
    } else {
      const parsed = parseWkt(text);
      if ('error' in parsed) return parsed;
      geometry = parsed;
    }
  }
  if (!geometry || typeof geometry !== 'object') return { error: 'The record has no geometry.' };
  const object = geometry as { type?: unknown; geometry?: unknown; coordinates?: unknown };
  if (object.type === 'Feature') return parsePlaceGeometry(object.geometry);
  if (object.type === 'Point') {
    const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).safeParse(object.coordinates);
    if (!point.success) return { error: 'A point needs a longitude and a latitude in WGS 84.' };
    return { boundary: null, latitude: point.data[1], longitude: point.data[0] };
  }
  const boundary = SpatialBoundaryV1Schema.safeParse({ type: object.type, coordinates: object.coordinates });
  if (!boundary.success) {
    return { error: `The geometry is not a valid Polygon, MultiPolygon or Point: ${boundary.error.issues[0]?.message ?? 'invalid'}` };
  }
  return { boundary: boundary.data, latitude: null, longitude: null };
}

type Coordinates = number[] | Coordinates[];

function parseWkt(text: string): { type: string; coordinates: unknown } | { error: string } {
  const match = /^(?:SRID=(\d+);\s*)?(POINT|POLYGON|MULTIPOLYGON)\s*(?:Z\s*)?(\(.*\))$/is.exec(text);
  if (!match) return { error: 'The geometry is neither GeoJSON nor WKT (POINT, POLYGON or MULTIPOLYGON).' };
  if (match[1] && match[1] !== '4326') return { error: `Only WGS 84 (SRID 4326) is supported, not SRID ${match[1]}.` };
  const type = match[2]!.toUpperCase();
  const tokens = match[3]!.match(/\(|\)|,|[^\s(),]+/g) ?? [];
  let index = 0;
  // A list is "(" item ("," item)* ")"; an item is a nested list or a position of two or three numbers.
  const list = (): Coordinates => {
    if (tokens[index] !== '(') throw new Error('expected (');
    index += 1;
    const items: Coordinates[] = [];
    for (;;) {
      if (tokens[index] === '(') items.push(list());
      else {
        const position: number[] = [];
        while (tokens[index] !== undefined && tokens[index] !== ',' && tokens[index] !== ')') {
          const number = Number(tokens[index]);
          if (!Number.isFinite(number)) throw new Error('not a number');
          position.push(number);
          index += 1;
        }
        if (position.length < 2 || position.length > 3) throw new Error('bad position');
        items.push(position.slice(0, 2));
      }
      if (tokens[index] === ',') index += 1;
      else if (tokens[index] === ')') {
        index += 1;
        return items;
      } else throw new Error('expected , or )');
    }
  };
  try {
    const parsed = list();
    if (index !== tokens.length) throw new Error('trailing text');
    if (type === 'POINT') return { type: 'Point', coordinates: parsed[0] };
    return { type: type === 'POLYGON' ? 'Polygon' : 'MultiPolygon', coordinates: parsed };
  } catch {
    return { error: `The ${type} text is not well formed.` };
  }
}
