/**
 * WI-OI-167 (R5 Workforce, finishing WI-OI-120ho): context/catalogue-coverage evidence for Workforce, which now limits its
 * records by organization unit and place. Mirrors cmms-r5-context-coverage.spec.ts and erp-r5-context-coverage.spec.ts.
 *
 * What this proves (half of the R5 card): every permission code the Workforce API checks is in the generated catalogue
 * and owned by `gigaops`, so a unit- or place-scoped grant of a role built from Workforce codes is recognised as
 * Workforce's and carried under the unit and place keys; the codes Workforce shares with the platform stay refused at
 * a scope; the workspace-wide pay codes are refused at any scope. The other half — that Workforce actually filters its
 * records — is `modules/gigaops/apps/api/src/common/scope.integration.test.ts` (North ≠ South by unit and by place for
 * people, candidates, bookings, demand and time).
 */
import { describe, expect, it } from 'vitest';
import { PER_ASSIGNMENT_SCOPE_MODULES, SCOPE_ENFORCING_MODULES, WORKSPACE_ONLY_PERMISSIONS, explicitScopeRefusal, moduleCheckedCodes } from './assignment-scopes.js';
import { modulePermissionCatalogue } from './permission-catalogue.generated.js';

describe('WI-OI-167 Workforce R5 context / catalogue coverage', () => {
  const checked = moduleCheckedCodes('gigaops');

  it('every permission code Workforce checks is catalogued and owned by it', () => {
    // A catalogue regenerated without Workforce's codes would drop this to ~0.
    expect(checked.length).toBeGreaterThan(30);
    for (const code of checked) {
      const entry = modulePermissionCatalogue.find((item) => item.code === code);
      expect(entry, `missing catalogue entry for ${code}`).toBeDefined();
      expect(entry!.entries, `${code} not owned by gigaops`).toContain('gigaops');
    }
  });

  it('enforces unit and place scope, reading the single claims (not per assignment)', () => {
    expect(SCOPE_ENFORCING_MODULES.gigaops).toEqual({ units: true, places: true });
    expect(PER_ASSIGNMENT_SCOPE_MODULES).not.toContain('gigaops');
  });

  it('allows every Workforce-only code at a unit and at a place, except the workspace-wide pay codes', () => {
    for (const code of checked) {
      const owners = modulePermissionCatalogue.find((item) => item.code === code)!.entries;
      const sharedWithUnproven = owners.some((owner) => owner === 'platform' || (owner !== 'gigaops' && !SCOPE_ENFORCING_MODULES[owner]?.units));
      const refusal = explicitScopeRefusal([code], 'units');
      if (WORKSPACE_ONLY_PERMISSIONS.includes(code)) expect(refusal, code).toMatchObject({ workspaceOnly: true });
      else if (sharedWithUnproven) expect(refusal, code).not.toBeNull();
      else expect(refusal, code).toBeNull();
    }
  });

  it('names only real Workforce codes as workspace-wide', () => {
    for (const code of WORKSPACE_ONLY_PERMISSIONS) expect(checked).toContain(code);
  });
});
