import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLACES_MODULE_KEY,
  PLACES_READ_PERMISSION,
  canReadPlaces,
  placesDecision,
} from '../lib/geospatial-access';
import { isLockedModule, tenantModulePermission } from '../lib/module-access';

// WI-OI-120ao (journey 89ac2g): screens ask Geospatial for places only when the proxy would answer.
describe('who may read Geospatial places', () => {
  const allowed = {
    tenant: {
      features: [PLACES_MODULE_KEY],
      entitlements: [{ moduleKey: PLACES_MODULE_KEY, status: 'ENABLED' }],
    },
    permissions: ['maps:read', PLACES_READ_PERMISSION],
  };

  it('allows a user whose workspace has Geospatial Studio and who may read places', () => {
    expect(canReadPlaces(allowed)).toBe(true);
    expect(canReadPlaces({ ...allowed, permissions: ['maps.*', 'maps:read'] })).toBe(true);
  });

  it('refuses without the module, its entitlement, its permission or the place permission', () => {
    expect(canReadPlaces(null)).toBe(false);
    expect(canReadPlaces({ tenant: null, permissions: allowed.permissions })).toBe(false);
    // The journey's workspace: no Geospatial Studio at all.
    expect(canReadPlaces({ ...allowed, tenant: { features: [], entitlements: [] } })).toBe(false);
    expect(canReadPlaces({ ...allowed, tenant: { ...allowed.tenant, entitlements: [] } })).toBe(
      false,
    );
    expect(
      canReadPlaces({
        ...allowed,
        tenant: {
          ...allowed.tenant,
          entitlements: [{ moduleKey: PLACES_MODULE_KEY, status: 'DISABLED' }],
        },
      }),
    ).toBe(false);
    expect(canReadPlaces({ ...allowed, permissions: [PLACES_READ_PERMISSION] })).toBe(false);
    expect(canReadPlaces({ ...allowed, permissions: ['maps:read'] })).toBe(false);
  });

  it('uses the same module, permissions and lock as the Geospatial proxy', () => {
    const proxy = readFileSync(join(__dirname, '../lib/geospatial-proxy.ts'), 'utf8');
    expect(proxy).toContain(`moduleKey: '${PLACES_MODULE_KEY}'`);
    expect(proxy).toMatch(
      /if \(joined === 'v1\/nodes'\) \{\s*return method === 'GET' \? 'maps\.nodes\.read'/,
    );
    expect(tenantModulePermission[PLACES_MODULE_KEY]).toBe('maps:read');
    // The browser cannot know the server-only UAT preview; that is safe only while the module is not locked.
    expect(isLockedModule(PLACES_MODULE_KEY)).toBe(false);
  });

  it('asks for places only when they may be read; an unreadable session leaves it to the proxy', () => {
    // Still asking: nothing yet.
    expect(placesDecision(undefined)).toEqual({ ask: false, available: null });
    // The session could not be read (review Low-2): ask, and say nothing untrue.
    expect(placesDecision(null)).toEqual({ ask: true, available: null });
    expect(placesDecision(allowed)).toEqual({ ask: true, available: true });
    // The journey's workspace: no Geospatial Studio, so no request and no 403.
    expect(placesDecision({ ...allowed, tenant: { features: [], entitlements: [] } })).toEqual({
      ask: false,
      available: false,
    });
    const picker = readFileSync(join(__dirname, '../components/geospatial/SitePicker.tsx'), 'utf8');
    expect(picker).toMatch(/const \{ ask, available \} = placesDecision\(context\);/);
    expect(picker).toMatch(
      /useEffect\(\(\) => \{\s*if \(!ask\) return;\s*let active = true;\s*requestGeospatial/,
    );
    expect(picker).toMatch(
      /export function useSites\(\)[^\n]*\{\s*return useSitesFor\(useAuthContext\(\)\);/,
    );
  });

  // Review I-3: the proxy's own gate, so a change to it shows up here.
  it('mirrors the gate in the signed module proxy', () => {
    const gate = readFileSync(join(__dirname, '../lib/signed-module-proxy.ts'), 'utf8');
    expect(gate).toMatch(
      /!canUseTenantModule\(config\.moduleKey, new Set\(session\.context\.tenant\.features\), session\.context\.permissions\) \|\|/,
    );
    expect(gate).toMatch(
      /entitlement\.moduleKey === config\.moduleKey && entitlement\.status === 'ENABLED'/,
    );
    expect(gate).toMatch(
      /!acceptedPermissions\.some\(\(permission\) => hasPermission\(session\.context\.permissions, permission\)\)/,
    );
  });
});
