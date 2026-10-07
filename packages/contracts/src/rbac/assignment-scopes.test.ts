import { describe, expect, it } from 'vitest';
import {
  assignmentScopeConflicts,
  assignmentScopeKey,
  explicitScopeRefusal,
  grantsModule,
  moduleCheckedCodes,
  moduleGrantScope,
} from './assignment-scopes.js';
import { baseRolePermissions } from './base-roles.js';

// WI-OI-120w (R2 slice 2b, ADR-0034 §6): until a module decides access per assignment, its permissions come from one
// scope per member.
describe('assignment scopes and the transition rule', () => {
  const member = baseRolePermissions('MEMBER');
  const technician = ['cmms:read', 'cmms.work-orders.read'];
  const worker = ['workforce:read', 'workforce.time.punch'];

  it('keys a scope the same however its ids are ordered or repeated', () => {
    expect(assignmentScopeKey({ kind: 'UNITS', unitIds: ['south', 'north', 'north'] })).toBe('UNITS:north,south');
    expect(assignmentScopeKey({ kind: 'TENANT' })).toBe('WORKSPACE');
    expect(assignmentScopeKey({ kind: 'MEMBER' })).toBe('MEMBER');
    expect(assignmentScopeKey({ kind: 'PLACES', placeIds: ['b', 'a'] })).toBe('PLACES:a,b');
  });

  it('knows the codes a module checks, including other families it reads', () => {
    expect(moduleCheckedCodes('asset-maintenance')).toEqual(expect.arrayContaining(['cmms:read', 'cmms.work-orders.read']));
    expect(grantsModule(worker, 'asset-maintenance')).toBe(true); // CMMS also checks Workforce codes
    expect(grantsModule(['finance:read'], 'asset-maintenance')).toBe(false);
    expect(moduleCheckedCodes('no-such-module')).toEqual([]);
  });

  it("allows one scope per module, and names each module whose permissions would come from two", () => {
    expect(assignmentScopeConflicts([{ permissions: member, scopeKey: 'MEMBER' }, { permissions: technician, scopeKey: 'UNITS:north' }])).toEqual([]);
    expect(
      assignmentScopeConflicts([
        { permissions: member, scopeKey: 'MEMBER' },
        { permissions: technician, scopeKey: 'UNITS:north' },
        { permissions: worker, scopeKey: 'MEMBER' },
      ]),
    ).toEqual(['asset-maintenance']);
    expect(
      assignmentScopeConflicts([
        { permissions: ['finance:read', 'finance:journals:approve'], scopeKey: 'UNITS:north' },
        { permissions: ['finance:read'], scopeKey: 'UNITS:south' },
      ]),
    ).toContain('financial-operations');
    // Two roles at the same scope are one scope.
    expect(assignmentScopeConflicts([{ permissions: technician, scopeKey: 'UNITS:north' }, { permissions: ['cmms:read'], scopeKey: 'UNITS:north' }])).toEqual([]);
  });

  it('finds the one scope a module receives, nothing when no role grants it, and a conflict when two do', () => {
    const grants = [
      { permissions: member, scopeKey: 'MEMBER' },
      { permissions: technician, scopeKey: 'UNITS:north' },
    ];
    expect(moduleGrantScope(grants, 'asset-maintenance')).toBe(1);
    expect(moduleGrantScope(grants, 'financial-operations')).toBeNull();
    expect(moduleGrantScope([...grants, { permissions: worker, scopeKey: 'MEMBER' }], 'asset-maintenance')).toBe('CONFLICT');
  });

  // Security review of slice 2b (H1, H2): units or places only where every module checking the role's codes is proven
  // to limit its records by them, and never for a code the platform checks.
  it('refuses units and places until the modules checking a role are proven to enforce them', () => {
    expect(explicitScopeRefusal(technician, 'units')).toMatchObject({ code: expect.stringMatching(/^cmms/) });
    const cmmsOnly = { 'asset-maintenance': { units: true, places: true } };
    expect(explicitScopeRefusal(technician, 'units', cmmsOnly)).toBeNull();
    expect(explicitScopeRefusal(technician, 'places', { 'asset-maintenance': { units: true, places: false } })).not.toBeNull();
    // Maps codes are also checked by Geospatial and the platform; Finance codes by the platform.
    expect(explicitScopeRefusal(['maps.nodes.read'], 'places', cmmsOnly)).toMatchObject({ owners: expect.arrayContaining(['platform']) });
    expect(explicitScopeRefusal(['finance:read'], 'units', { 'financial-operations': { units: true, places: true } })).toMatchObject({
      owners: expect.arrayContaining(['platform']),
    });
  });

  it('refuses a code the catalogue does not know, at units or places', () => {
    expect(explicitScopeRefusal(['reports:export'], 'units', { 'asset-maintenance': { units: true, places: true } })).toMatchObject({
      code: 'reports:export',
      owners: [],
    });
  });

  // Re-check of 2b: an R5 card that adds an enforcing module must replace this guard with a test that the module's
  // minted context key covers every code its API checks (the Geospatial and Connector Hub keys do not today).
  it('has no enforcing module until an R5 card proves one', async () => {
    const { SCOPE_ENFORCING_MODULES } = await import('./assignment-scopes.js');
    expect(SCOPE_ENFORCING_MODULES).toEqual({});
  });
});

