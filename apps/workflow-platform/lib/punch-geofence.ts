import { type GeofenceEvidenceV1, SpatialNodeDetailV1Schema, evaluateGeofence } from '@gigalibs/contracts';
import { hasPermission } from '@/lib/module-access';
import { type SignedModuleProxyConfig, callSignedModule } from '@/lib/signed-module-proxy';
import type { VerifiedSession } from '@/lib/verified-session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Only what the check needs from the place, so unrelated place fields never break a punch. */
const PlaceBoundarySchema = SpatialNodeDetailV1Schema.pick({ id: true, boundary: true });

/** Read-only Geospatial access for the punch geofence; the same module identity the Geospatial proxy uses. */
const GEOSPATIAL: SignedModuleProxyConfig = {
  moduleKey: 'geospatial-studio',
  audience: 'gigalibs-geospatial-api',
  upstream: 'geospatial',
  privateKeyEnvironmentKey: 'GEOSPATIAL_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
  codePrefix: 'GEOSPATIAL',
  routeNoun: 'Geospatial',
  serviceName: 'Geospatial Studio',
  entitlementName: 'Geospatial Studio',
  requiredPermission: () => null,
};

/**
 * Composes the geofence evidence of a punch (WI-OI-069). Any client-supplied `geofence` is discarded. When the
 * punch names a site and carries a device position, the BFF reads that place through the Geospatial API as the
 * same user and evaluates its boundary; Workforce records the result and raises exceptions. Anything that
 * prevents the check (no permission, unknown place, Geospatial unavailable) yields NOT_CHECKED, never a refusal.
 */
export async function composePunchBody(
  session: VerifiedSession,
  method: string,
  path: readonly string[],
  body: string,
  lookup: (session: VerifiedSession, siteRef: string) => Promise<Response> = readPlace,
): Promise<string> {
  if (method !== 'POST' || path.join('/') !== 'v1/punches') return body;
  let punch: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
    punch = parsed as Record<string, unknown>;
  } catch {
    return body;
  }
  delete punch.geofence;
  const siteRef = typeof punch.siteRef === 'string' ? punch.siteRef : null;
  const location = punch.location as { latitude?: unknown; longitude?: unknown } | null | undefined;
  if (siteRef && UUID.test(siteRef) && location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    punch.geofence = await geofenceEvidence(session, siteRef, { latitude: location.latitude, longitude: location.longitude }, lookup);
  }
  return JSON.stringify(punch);
}

async function geofenceEvidence(
  session: VerifiedSession,
  siteRef: string,
  point: { readonly latitude: number; readonly longitude: number },
  lookup: (session: VerifiedSession, siteRef: string) => Promise<Response>,
): Promise<GeofenceEvidenceV1> {
  const unverified = (reason: string): GeofenceEvidenceV1 => ({ result: 'NOT_CHECKED', placeRef: siteRef, distanceToEdgeMeters: null, reason });
  if (!hasPermission(session.permissions, 'maps.nodes.read')) return unverified('NO_PLACE_PERMISSION');
  try {
    const response = await lookup(session, siteRef);
    if (response.status === 404) return unverified('PLACE_NOT_FOUND');
    if (!response.ok) return unverified(`GEOSPATIAL_${response.status}`);
    const place = PlaceBoundarySchema.safeParse(await response.json());
    if (!place.success || place.data.id !== siteRef) return unverified('PLACE_INVALID');
    const evaluation = evaluateGeofence(place.data.boundary, point);
    return evaluation.result === 'NO_BOUNDARY'
      ? { result: 'UNKNOWN', placeRef: siteRef, distanceToEdgeMeters: null, reason: 'NO_BOUNDARY' }
      : { result: evaluation.result, placeRef: siteRef, distanceToEdgeMeters: evaluation.distanceToEdgeMeters, reason: null };
  } catch {
    return unverified('GEOSPATIAL_UNAVAILABLE');
  }
}

function readPlace(session: VerifiedSession, siteRef: string): Promise<Response> {
  return callSignedModule(GEOSPATIAL, session, 'GET', ['v1', 'nodes', siteRef], undefined, 2_000);
}
