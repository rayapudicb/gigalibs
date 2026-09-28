import { z } from 'zod';

// ─── Canonical Geospatial places hierarchy (WI-OI-063b, ADR-0006) ────────────

export const SpatialRecordStatusV1Schema = z.enum(['ACTIVE', 'INACTIVE']);
export type SpatialRecordStatusV1 = z.infer<typeof SpatialRecordStatusV1Schema>;

/** One ltree label: the node code that becomes the last segment of its path. */
export const SpatialNodeCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{1,63}$/, 'Use 1–63 letters, digits or underscores.');

/** The most places one member can be scoped to. */
export const MAX_SPATIAL_SCOPE_PLACES = 50;

/**
 * Places (each with everything inside it) assigned to one member. Stored by id rather than path, so a
 * move keeps the assignment on the same place and a path that is later re-used never grants access.
 */
export const SpatialScopePlaceIdsSchema = z
  .array(z.string().uuid())
  .max(MAX_SPATIAL_SCOPE_PLACES)
  .refine((ids) => new Set(ids).size === ids.length, 'Each place can be listed once.');

export const SpatialNodeTypeCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'Start with a letter; use letters, digits or underscores.'));

const CountryCodeSchema = z.string().trim().regex(/^[A-Z]{2}$/, 'Use an ISO 3166-1 alpha-2 code.');
const SubdivisionCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, 'Use an ISO 3166-2 code such as IN-KA.');
const TimeZoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(value);
    } catch {
      return false;
    }
  }, 'Use an IANA time zone such as Asia/Kolkata.');

const PositionSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const LinearRingSchema = z
  .array(PositionSchema)
  .min(4)
  .max(2_000)
  .refine(
    (ring) => ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1],
    'A polygon ring must end where it starts.',
  );

/** GeoJSON Polygon or MultiPolygon in WGS 84 longitude/latitude order. */
export const SpatialBoundaryV1Schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(LinearRingSchema).min(1).max(50) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(LinearRingSchema).min(1).max(50)).min(1).max(50),
  }),
]);
export type SpatialBoundaryV1 = z.infer<typeof SpatialBoundaryV1Schema>;

const PlaceAttributesSchema = z.object({
  countryCode: CountryCodeSchema.nullable().optional(),
  subdivisionCode: SubdivisionCodeSchema.nullable().optional(),
  timeZone: TimeZoneSchema.nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  boundary: SpatialBoundaryV1Schema.nullable().optional(),
});

function consistentPlace(value: z.infer<typeof PlaceAttributesSchema>): boolean {
  const hasLatitude = value.latitude !== undefined && value.latitude !== null;
  const hasLongitude = value.longitude !== undefined && value.longitude !== null;
  return hasLatitude === hasLongitude;
}

function subdivisionMatchesCountry(value: z.infer<typeof PlaceAttributesSchema>): boolean {
  if (!value.subdivisionCode) return true;
  return Boolean(value.countryCode) && value.subdivisionCode.startsWith(`${value.countryCode}-`);
}

export const SpatialNodeTypeV1Schema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  status: SpatialRecordStatusV1Schema,
  version: z.number().int().positive(),
  nodeCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SpatialNodeTypeV1 = z.infer<typeof SpatialNodeTypeV1Schema>;

export const CreateSpatialNodeTypeV1Schema = z.object({
  code: SpatialNodeTypeCodeSchema,
  label: z.string().trim().min(1).max(120),
});
export type CreateSpatialNodeTypeV1 = z.infer<typeof CreateSpatialNodeTypeV1Schema>;

export const SpatialNodeV1Schema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  nodeTypeId: z.string().uuid(),
  nodeTypeCode: z.string(),
  code: z.string(),
  path: z.string(),
  depth: z.number().int().positive(),
  displayName: z.string(),
  countryCode: z.string().nullable(),
  subdivisionCode: z.string().nullable(),
  timeZone: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  hasBoundary: z.boolean(),
  childCount: z.number().int().nonnegative(),
  status: SpatialRecordStatusV1Schema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SpatialNodeV1 = z.infer<typeof SpatialNodeV1Schema>;

export const SpatialNodeDetailV1Schema = SpatialNodeV1Schema.extend({
  boundary: SpatialBoundaryV1Schema.nullable(),
  ancestors: z.array(
    z.object({ id: z.string().uuid(), code: z.string(), displayName: z.string(), path: z.string() }),
  ),
});
export type SpatialNodeDetailV1 = z.infer<typeof SpatialNodeDetailV1Schema>;

export const CreateSpatialNodeV1Schema = PlaceAttributesSchema.extend({
  code: SpatialNodeCodeSchema,
  displayName: z.string().trim().min(1).max(200),
  nodeTypeId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
})
  .refine(consistentPlace, { message: 'Provide both latitude and longitude, or neither.', path: ['latitude'] })
  .refine(subdivisionMatchesCountry, {
    message: 'The subdivision must belong to the selected country.',
    path: ['subdivisionCode'],
  });
export type CreateSpatialNodeV1 = z.infer<typeof CreateSpatialNodeV1Schema>;

export const UpdateSpatialNodeV1Schema = PlaceAttributesSchema.extend({
  expectedVersion: z.number().int().positive(),
  displayName: z.string().trim().min(1).max(200).optional(),
  nodeTypeId: z.string().uuid().optional(),
  status: SpatialRecordStatusV1Schema.optional(),
})
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'), {
    message: 'At least one mutable field is required.',
  })
  .refine(consistentPlace, { message: 'Provide both latitude and longitude, or neither.', path: ['latitude'] })
  .refine(subdivisionMatchesCountry, {
    message: 'The subdivision must belong to the selected country.',
    path: ['subdivisionCode'],
  });
export type UpdateSpatialNodeV1 = z.infer<typeof UpdateSpatialNodeV1Schema>;

export const MoveSpatialNodeV1Schema = z.object({
  expectedVersion: z.number().int().positive(),
  newParentId: z.string().uuid().nullable(),
});
export type MoveSpatialNodeV1 = z.infer<typeof MoveSpatialNodeV1Schema>;

/** Rows per import; one import stays under the 1 MiB request limit. Larger estates import one region at a time. */
export const MAX_SPATIAL_IMPORT_ROWS = 2_000;

/**
 * One place in a bulk import. Places reference their parent by path (an existing place or one created
 * earlier in the same file) and their type by code, so a spreadsheet can be written by hand.
 */
export const SpatialNodeImportRowV1Schema = PlaceAttributesSchema.omit({ boundary: true })
  .extend({
    code: SpatialNodeCodeSchema,
    displayName: z.string().trim().min(1).max(200),
    nodeTypeCode: SpatialNodeTypeCodeSchema,
    parentPath: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_]{1,63}(\.[A-Za-z0-9_]{1,63}){0,30}$/, 'Use a parent path such as APAC or APAC.BLR_01.')
      .nullable()
      .optional(),
  })
  .refine(consistentPlace, { message: 'Provide both latitude and longitude, or neither.', path: ['latitude'] })
  .refine(subdivisionMatchesCountry, {
    message: 'The subdivision must belong to the selected country.',
    path: ['subdivisionCode'],
  });
export type SpatialNodeImportRowV1 = z.infer<typeof SpatialNodeImportRowV1Schema>;

/** Rows are validated one by one on the server so every problem is reported with its row number. */
export const ImportSpatialNodesV1Schema = z.object({
  mode: z.enum(['VALIDATE', 'COMMIT']),
  rows: z.array(z.unknown()).min(1).max(MAX_SPATIAL_IMPORT_ROWS),
});
export type ImportSpatialNodesV1 = z.infer<typeof ImportSpatialNodesV1Schema>;

export const SpatialNodeImportResultV1Schema = z.object({
  mode: z.enum(['VALIDATE', 'COMMIT']),
  rowCount: z.number().int().nonnegative(),
  valid: z.boolean(),
  /** Places written; always 0 for VALIDATE and for a COMMIT with errors (imports are all-or-nothing). */
  created: z.number().int().nonnegative(),
  errors: z.array(
    z.object({
      /** 1-based position in `rows`. */
      row: z.number().int().positive(),
      field: z.string().nullable(),
      message: z.string(),
    }),
  ),
});
export type SpatialNodeImportResultV1 = z.infer<typeof SpatialNodeImportResultV1Schema>;

export const ListSpatialNodesV1QuerySchema = z.object({
  parentId: z.string().uuid().optional(),
  roots: z.enum(['true', 'false']).optional(),
  under: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  status: SpatialRecordStatusV1Schema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListSpatialNodesV1Query = z.infer<typeof ListSpatialNodesV1QuerySchema>;

export const SpatialNodePageV1Schema = z.object({
  items: z.array(SpatialNodeV1Schema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  tenantNodeCount: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});
export type SpatialNodePageV1 = z.infer<typeof SpatialNodePageV1Schema>;

/** Outbox fact published once per affected node on create, update, move or status change. */
export const SpatialNodeChangedV1Schema = z.object({
  nodeId: z.string().uuid(),
  change: z.enum(['CREATED', 'UPDATED', 'MOVED', 'DEACTIVATED', 'REACTIVATED']),
  path: z.string(),
  previousPath: z.string().nullable(),
  parentId: z.string().uuid().nullable(),
  nodeTypeCode: z.string(),
  countryCode: z.string().nullable(),
  subdivisionCode: z.string().nullable(),
  timeZone: z.string().nullable(),
  status: SpatialRecordStatusV1Schema,
  aggregateVersion: z.number().int().positive(),
});
export type SpatialNodeChangedV1 = z.infer<typeof SpatialNodeChangedV1Schema>;

// ─── Mobile-First Delta Sync & QR Tag Lookup (Offline Field Support) ─────────

export const MobileSpatialSyncQuerySchema = z.object({
  since: z.string().optional(),
  under: z.string().uuid().optional(),
});
export type MobileSpatialSyncQuery = z.infer<typeof MobileSpatialSyncQuerySchema>;

export const MobileSpatialNodeSummaryV1Schema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  displayName: z.string(),
  path: z.string(),
  depth: z.number().int().positive(),
  nodeTypeCode: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  status: SpatialRecordStatusV1Schema,
  version: z.number().int().positive(),
  updatedAt: z.string(),
});
export type MobileSpatialNodeSummaryV1 = z.infer<typeof MobileSpatialNodeSummaryV1Schema>;

export const MobileSpatialSyncResponseV1Schema = z.object({
  serverTime: z.string(),
  nodes: z.array(MobileSpatialNodeSummaryV1Schema),
  tenantNodeCount: z.number().int().nonnegative(),
});
export type MobileSpatialSyncResponseV1 = z.infer<typeof MobileSpatialSyncResponseV1Schema>;

export const SpatialTagLookupQuerySchema = z.object({
  tag: z.string().trim().min(1).max(200),
});
export type SpatialTagLookupQuery = z.infer<typeof SpatialTagLookupQuerySchema>;


// ─── Geofence evaluation (WI-OI-069) ──────────────────────────────────────────────────────────────────────
/**
 * A position against a place boundary: INSIDE or OUTSIDE (holes count as outside), or NO_BOUNDARY. The
 * distance to the nearest edge (metres, equirectangular approximation, exact enough within a site) lets the
 * caller weigh the device's reported accuracy. Pure: the BFF evaluates the boundary it reads through the
 * Geospatial API, and Geospatial can adopt the same function for a server-side check.
 */
export interface GeofenceEvaluationV1 {
  readonly result: 'INSIDE' | 'OUTSIDE' | 'NO_BOUNDARY';
  readonly distanceToEdgeMeters: number | null;
}

const EARTH_RADIUS_METERS = 6_371_008.8;

export function evaluateGeofence(
  boundary: SpatialBoundaryV1 | null | undefined,
  point: { readonly latitude: number; readonly longitude: number },
): GeofenceEvaluationV1 {
  if (!boundary) return { result: 'NO_BOUNDARY', distanceToEdgeMeters: null };
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates;
  const x = point.longitude;
  const y = point.latitude;
  let inside = false;
  let nearest = Number.POSITIVE_INFINITY;
  for (const rings of polygons) {
    const [outer, ...holes] = rings;
    if (!outer) continue;
    if (insideRing(outer, x, y) && !holes.some((hole) => insideRing(hole, x, y))) inside = true;
    for (const ring of rings) nearest = Math.min(nearest, distanceToRing(ring, point));
  }
  return {
    result: inside ? 'INSIDE' : 'OUTSIDE',
    distanceToEdgeMeters: Number.isFinite(nearest) ? Math.round(nearest * 10) / 10 : null,
  };
}

/** Even-odd ray casting over one ring of [longitude, latitude] positions. */
function insideRing(ring: readonly (readonly number[])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance from the point to any ring segment, in a local plane around the point. */
function distanceToRing(ring: readonly (readonly number[])[], point: { readonly latitude: number; readonly longitude: number }): number {
  const scaleX = ((Math.PI / 180) * EARTH_RADIUS_METERS) * Math.cos((point.latitude * Math.PI) / 180);
  const scaleY = (Math.PI / 180) * EARTH_RADIUS_METERS;
  const project = (position: readonly number[]) => [
    ((position[0] as number) - point.longitude) * scaleX,
    ((position[1] as number) - point.latitude) * scaleY,
  ] as const;
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < ring.length; i += 1) {
    const [ax, ay] = project(ring[i]!);
    const [bx, by] = project(ring[i + 1]!);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return nearest;
}
