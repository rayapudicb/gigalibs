// WI-OI-120u (M-WF1): lookups the platform serves to every module's metadata windows, over workspace data that no module
// holds (its members, organization units and places). The web app answers them at
// `${PLATFORM_LOOKUP_BASE_PATH}/v1/lookups/<key>` as the signed-in user, so the owning service's own permission decides
// who may read them; they add no authority.

/** Where a window's record client sends a platform lookup (`lookupBasePaths` in `@gigalibs/configuration-react`). */
export const PLATFORM_LOOKUP_BASE_PATH = '/api/control';

/** Each platform lookup and the control-plane list it reads (which also names the permission that list requires). */
export const PLATFORM_LOOKUPS = {
  'workspace-members':
    'The workspace members, as name and email (tenants/current/members, users:read).',
  'organization-units':
    'The organization units, as name and code (tenants/current/organization/unit-options, users:read; QA-025).',
  // WI-OI-120u Slice 2 (owner D2a): sites and other places, read from Geospatial through its signed proxy.
  'workspace-sites': 'The active places, as name and code (Geospatial v1/nodes, maps.nodes.read).',
  // WI-OI-153 (ADR-0038 §1): platform reference data, read-only to every workspace (the public platform-reference read).
  'platform-countries': 'Countries (ISO 3166-1), as code and name, from the loaded platform reference set.',
  'platform-currencies': 'Currencies (ISO 4217), as code and name, from the loaded platform reference set.',
  'platform-languages': 'Languages (ISO 639), as code and name, from the loaded platform reference set.',
  'platform-time-zones': 'Time zones (IANA), from the loaded platform reference set.',
} as const;

/** The platform lookups over platform reference data, and the set each reads (WI-OI-153). */
export const PLATFORM_REFERENCE_LOOKUP_SETS = {
  'platform-countries': 'COUNTRIES',
  'platform-currencies': 'CURRENCIES',
  'platform-languages': 'LANGUAGES',
  'platform-time-zones': 'TIME_ZONES',
} as const satisfies Partial<Record<keyof typeof PLATFORM_LOOKUPS, string>>;

export type PlatformLookupKey = keyof typeof PLATFORM_LOOKUPS;

export function isPlatformLookupKey(key: string): key is PlatformLookupKey {
  return Object.prototype.hasOwnProperty.call(PLATFORM_LOOKUPS, key);
}

/** The record client's `lookupBasePaths` entries for the platform lookups. */
export const PLATFORM_LOOKUP_BASE_PATHS: Readonly<Record<PlatformLookupKey, string>> = {
  'workspace-members': PLATFORM_LOOKUP_BASE_PATH,
  'organization-units': PLATFORM_LOOKUP_BASE_PATH,
  'workspace-sites': PLATFORM_LOOKUP_BASE_PATH,
  'platform-countries': PLATFORM_LOOKUP_BASE_PATH,
  'platform-currencies': PLATFORM_LOOKUP_BASE_PATH,
  'platform-languages': PLATFORM_LOOKUP_BASE_PATH,
  'platform-time-zones': PLATFORM_LOOKUP_BASE_PATH,
};
