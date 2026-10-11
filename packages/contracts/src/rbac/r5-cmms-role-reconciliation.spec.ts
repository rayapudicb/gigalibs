import { describe, expect, it } from 'vitest';
import { moduleDefaultRoles } from '../modules/roles.generated.js';
import {
  SCOPE_ENFORCING_MODULES,
  explicitScopeRefusal,
  type ScopeEnforcement,
} from './assignment-scopes.js';

describe('WI-OI-120ac: CMMS Default Role Reconciliation & explicitScopeRefusal Proof', () => {
  const cmmsRoles = moduleDefaultRoles.filter((role) => role.catalogKey === 'asset-maintenance');

  // The 11 core CMMS permissions exclusively owned by asset-maintenance
  const CORE_CMMS_PERMISSIONS = [
    'cmms:read',
    'cmms.work-orders.read',
    'cmms.work-orders.write',
    'cmms.assets.read',
    'cmms.assets.write',
    'cmms.meters.read',
    'cmms.meters.write',
    'cmms.pm.read',
    'cmms.pm.write',
    'cmms.parts.read',
    'cmms.parts.write',
  ] as const;

  it('finds all 3 default CMMS roles in the generated catalogue', () => {
    expect(cmmsRoles.map((r) => r.name)).toEqual([
      'Maintenance technician',
      'Maintenance planner',
      'Maintenance viewer',
    ]);
  });

  it('refuses all 3 default CMMS roles at units and places while explicit scope gate remains empty', () => {
    expect(SCOPE_ENFORCING_MODULES).toEqual({});

    for (const role of cmmsRoles) {
      const unitRefusal = explicitScopeRefusal(role.permissions, 'units');
      expect(unitRefusal).not.toBeNull();

      const placeRefusal = explicitScopeRefusal(role.permissions, 'places');
      expect(placeRefusal).not.toBeNull();
    }
  });

  it('proves that bundling platform-checked permissions refuses unit scope even if asset-maintenance units were enabled', () => {
    const candidateEnforcing: Record<string, ScopeEnforcement> = {
      'asset-maintenance': { units: true, places: false },
    };

    // Maintenance viewer carries cmms.analytics.read (platform) and maps.nodes.read (platform)
    const viewer = cmmsRoles.find((r) => r.name === 'Maintenance viewer')!;
    const refusal = explicitScopeRefusal(viewer.permissions, 'units', candidateEnforcing);

    expect(refusal).not.toBeNull();
    expect(refusal?.owners).toContain('platform');
  });

  it('proves that bundling workforce and maps permissions refuses unit scope for technician and planner', () => {
    const candidateEnforcing: Record<string, ScopeEnforcement> = {
      'asset-maintenance': { units: true, places: false },
    };

    const technician = cmmsRoles.find((r) => r.name === 'Maintenance technician')!;
    const techRefusal = explicitScopeRefusal(technician.permissions, 'units', candidateEnforcing);
    expect(techRefusal).not.toBeNull();

    const planner = cmmsRoles.find((r) => r.name === 'Maintenance planner')!;
    const plannerRefusal = explicitScopeRefusal(planner.permissions, 'units', candidateEnforcing);
    expect(plannerRefusal).not.toBeNull();
  });

  it('proves that pure CMMS core permissions pass explicitScopeRefusal once asset-maintenance units are enforced', () => {
    const candidateEnforcing: Record<string, ScopeEnforcement> = {
      'asset-maintenance': { units: true, places: false },
    };

    // All 11 core CMMS permissions pass unit refusal once asset-maintenance enforces units
    const refusal = explicitScopeRefusal(CORE_CMMS_PERMISSIONS, 'units', candidateEnforcing);
    expect(refusal).toBeNull();

    // Technician's core CMMS subset passes
    const techCore = [
      'cmms:read',
      'cmms.work-orders.read',
      'cmms.work-orders.write',
      'cmms.assets.read',
      'cmms.meters.read',
      'cmms.meters.write',
      'cmms.pm.read',
      'cmms.parts.read',
    ];
    expect(explicitScopeRefusal(techCore, 'units', candidateEnforcing)).toBeNull();
  });

  it('preserves place refusal for core CMMS permissions until T3 place proof opens places gate', () => {
    const candidateEnforcing: Record<string, ScopeEnforcement> = {
      'asset-maintenance': { units: true, places: false },
    };

    const placeRefusal = explicitScopeRefusal(CORE_CMMS_PERMISSIONS, 'places', candidateEnforcing);
    expect(placeRefusal).not.toBeNull();
    expect(placeRefusal?.owners).toContain('asset-maintenance');
  });
});
