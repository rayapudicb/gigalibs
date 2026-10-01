import { z } from 'zod';
import { SpatialBoundaryV1Schema } from '../geospatial/index.js';

// WI-OI-105e (ADR-0016 F15): the places Analytics knows (its place directory, kept from Geospatial's place facts) as a
// member may see them: within their place scope, optionally under one place. The map chart draws their boundaries.

export const PlaceDirectoryQueryV1Schema = z
  .object({
    /** Only this place and the places inside it. */
    under: z.string().uuid().optional(),
    /** Include boundaries (the map needs them; a place picker does not). */
    boundaries: z.enum(['true', 'false']).default('false'),
    /** At most this many levels below the top (or below `under`), for pickers. */
    maxDepth: z.coerce.number().int().min(1).max(12).optional(),
  })
  .strict();

export const PlaceDirectoryEntryV1Schema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  path: z.string(),
  depth: z.number().int(),
  nodeTypeCode: z.string(),
  name: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  areaM2: z.number().nullable(),
  boundary: SpatialBoundaryV1Schema.nullable().optional(),
});
export type PlaceDirectoryEntryV1 = z.infer<typeof PlaceDirectoryEntryV1Schema>;

export interface PlaceDirectoryV1 {
  readonly places: readonly PlaceDirectoryEntryV1[];
  /** More places matched than the limit returned. */
  readonly truncated: boolean;
}
