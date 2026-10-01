import { ForbiddenException } from '@nestjs/common';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';

/**
 * WI-OI-105d (ADR-0016 F15, D2): what a member with a place scope may see. Each assigned place grants itself and
 * everything inside it, resolved through the place directory's current paths, so a moved place moves its records
 * with it. Records are matched by the place id stamped at build, never by a stored path. Unplaced records, and
 * places the directory does not know yet, are not visible (fail closed). `null` means no place scope.
 */
export interface PlaceScope {
  /** Every visible place id: the assigned places and all places inside them. */
  readonly placeIds: readonly string[];
  /** The current paths of the assigned places the directory knows. */
  readonly paths: readonly string[];
}

export async function resolvePlaceScope(db: DatabaseService, principal: AnalyticsPrincipal): Promise<PlaceScope | null> {
  const scope = principal.spatialScope;
  if (scope.mode === 'UNBOUNDED') return null;
  if (scope.place_ids.length === 0) return { placeIds: [], paths: [] };
  const result = await db.queryWithTenant<{ place_id: string; path: string; assigned: boolean }>(
    principal.tenantId,
    `SELECT d.place_id::text AS place_id, d.path, d.place_id = ANY($1::uuid[]) AS assigned
       FROM gigalibs_analytics.place_directory d
      WHERE EXISTS (SELECT 1 FROM gigalibs_analytics.place_directory s
                     WHERE s.place_id = ANY($1::uuid[]) AND (d.path = s.path OR starts_with(d.path, s.path || '.')))`,
    [[...scope.place_ids]],
  );
  return {
    placeIds: result.rows.map((row) => row.place_id),
    paths: result.rows.filter((row) => row.assigned).map((row) => row.path),
  };
}

/** True when a rollup path is one of the scope's places or inside one. */
export function pathInScope(scope: PlaceScope, path: string): boolean {
  return scope.paths.some((granted) => path === granted || path.startsWith(`${granted}.`));
}

export function spatialScopeDenied(message: string): ForbiddenException {
  return new ForbiddenException({ code: 'SPATIAL_SCOPE_DENIED', message });
}

/** A dataset built without places cannot be filtered by place, so a scoped member does not see it at all (D2). */
export function assertPlacedDataset(scope: PlaceScope | null, fields: ReadonlyMap<string, unknown>): void {
  if (scope && !fields.has('place_id')) {
    throw spatialScopeDenied('This dataset has no places, so members with a place scope cannot see it.');
  }
}

/** SQL condition keeping only records tagged with a visible place; `bind` returns the parameter placeholder. */
export function placeScopeCondition(alias: string, scope: PlaceScope, bind: (value: unknown) => string): string {
  return `(${alias ? `${alias}.` : ''}analytical_payload->>'place_id') = ANY(${bind([...scope.placeIds])}::text[])`;
}

/** WI-OI-105e: a place and every place inside it, by the directory's current paths (empty when unknown). */
export async function placesUnder(db: DatabaseService, tenantId: string, placeId: string): Promise<string[]> {
  const result = await db.queryWithTenant<{ place_id: string }>(
    tenantId,
    `SELECT d.place_id::text AS place_id
       FROM gigalibs_analytics.place_directory u
       JOIN gigalibs_analytics.place_directory d ON d.tenant_id = u.tenant_id AND (d.path = u.path OR starts_with(d.path, u.path || '.'))
      WHERE u.place_id = $1::uuid`,
    [placeId],
  );
  return result.rows.map((row) => row.place_id);
}
