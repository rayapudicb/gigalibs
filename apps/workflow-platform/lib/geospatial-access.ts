import { canUseTenantModule, hasPermission } from './module-access';

/**
 * WI-OI-120ao: whether the signed-in user may read Geospatial places, by the same rule as the Geospatial proxy
 * (`lib/geospatial-proxy.ts` through `createSignedModuleProxy`): the workspace has Geospatial Studio switched on with
 * an enabled entitlement, and the user holds the module's permission and `maps.nodes.read`. Screens ask for places
 * only then, so a workspace without Geospatial is not refused on every page. A display decision; the proxy still
 * decides every request.
 */
export const PLACES_MODULE_KEY = 'geospatial-studio';
export const PLACES_READ_PERMISSION = 'maps.nodes.read';

export interface PlacesAccessContext {
  readonly tenant: {
    readonly features: readonly string[];
    readonly entitlements: readonly { readonly moduleKey: string; readonly status: string }[];
  } | null;
  readonly permissions: readonly string[];
}

export function canReadPlaces(context: PlacesAccessContext | null): boolean {
  if (!context?.tenant) return false;
  // Geospatial Studio is not a locked module, so the UAT preview (a server-only setting) cannot change this answer.
  return (
    canUseTenantModule(PLACES_MODULE_KEY, new Set(context.tenant.features), context.permissions, {
      uatPreview: false,
    }) &&
    context.tenant.entitlements.some(
      (entitlement) =>
        entitlement.moduleKey === PLACES_MODULE_KEY && entitlement.status === 'ENABLED',
    ) &&
    hasPermission(context.permissions, PLACES_READ_PERMISSION)
  );
}

/**
 * Whether a screen asks for places, and what it may say about them. While the session is being asked: nothing yet.
 * If the session could not be read, the screen cannot decide, so it asks and the proxy decides, as before WI-OI-120ao
 * (review Low-2), and says nothing. Otherwise it asks only when `canReadPlaces` allows, and says so when it does not.
 */
export function placesDecision(context: PlacesAccessContext | null | undefined): {
  ask: boolean;
  available: boolean | null;
} {
  if (context === undefined) return { ask: false, available: null };
  if (context === null) return { ask: true, available: null };
  const allowed = canReadPlaces(context);
  return { ask: allowed, available: allowed };
}
