// WI-OI-120u (M-WF1): lookups the platform serves to every module's metadata windows, over workspace data that no module
// holds (its members, its organization units). The web app answers them at `${PLATFORM_LOOKUP_BASE_PATH}/v1/lookups/<key>`
// as the signed-in user, so the control plane's own permission decides who may read them; they add no authority.

/** Where a window's record client sends a platform lookup (`lookupBasePaths` in `@gigalibs/configuration-react`). */
export const PLATFORM_LOOKUP_BASE_PATH = '/api/control';

/** Each platform lookup and the control-plane list it reads (which also names the permission that list requires). */
export const PLATFORM_LOOKUPS = {
  'workspace-members':
    'The workspace members, as name and email (tenants/current/members, users:read).',
  'organization-units':
    'The organization units, as name and code (tenants/current/organization/units, organization:read).',
} as const;

export type PlatformLookupKey = keyof typeof PLATFORM_LOOKUPS;

export function isPlatformLookupKey(key: string): key is PlatformLookupKey {
  return Object.prototype.hasOwnProperty.call(PLATFORM_LOOKUPS, key);
}

/** The record client's `lookupBasePaths` entries for the platform lookups. */
export const PLATFORM_LOOKUP_BASE_PATHS: Readonly<Record<PlatformLookupKey, string>> = {
  'workspace-members': PLATFORM_LOOKUP_BASE_PATH,
  'organization-units': PLATFORM_LOOKUP_BASE_PATH,
};
