/**
 * WI-OI-120p slice 9 (R14): R5 context/catalogue-coverage evidence for the ERP modules that now limit their records by
 * organization unit (Procurement requisitions/POs/vendor-bills/debit-memos; Orders quotes/orders and their downstream
 * documents; Finance fixed assets). Mirrors cmms-r5-context-coverage.spec.ts.
 *
 * What this proves (half of the R5 card): every permission code each module's API checks is in the generated catalogue
 * and owned by that module, so a unit-scoped grant of a role built from the module's codes is recognised as the
 * module's and carried under the unit key — no code falls through to `platform` or an un-enforcing owner. The other
 * half — that the module actually filters its records by that unit — is the per-module Docker-gated cross-department
 * integration test (…-organization-scope.integration.test.ts for Procurement and Orders; fixed-assets wiring for
 * Finance).
 *
 * This file deliberately does NOT assert a SCOPE_ENFORCING_MODULES entry: adding one is the owner/Security flip that
 * turns unit-scoped role *grants* on for the module. When that flip lands, extend this spec to assert the entry
 * (`{ units: true, places: false }` — these modules scope by organization unit, not place) exactly as the CMMS spec
 * asserts `{ units: true, places: true }`.
 */
import { describe, expect, it } from 'vitest';
import { moduleCheckedCodes } from './assignment-scopes.js';
import { modulePermissionCatalogue } from './permission-catalogue.generated.js';

const MODULES = ['universal-procurement', 'universal-orders', 'financial-operations'] as const;

describe('WI-OI-120p ERP R5 context / catalogue coverage', () => {
  it.each(MODULES)('every permission code %s checks is catalogued and owned by it', (moduleKey) => {
    const checked = moduleCheckedCodes(moduleKey);
    // Each module guards a non-trivial set of codes; a catalogue regenerated without them would drop this to ~0.
    expect(checked.length).toBeGreaterThan(5);
    for (const code of checked) {
      const entry = modulePermissionCatalogue.find((item) => item.code === code);
      expect(entry, `missing catalogue entry for ${code}`).toBeDefined();
      expect(entry!.entries, `${code} not owned by ${moduleKey}`).toContain(moduleKey);
    }
  });

  it.each(MODULES)('%s is not yet in SCOPE_ENFORCING_MODULES (the flip is the owner/Security decision)', async (moduleKey) => {
    const { SCOPE_ENFORCING_MODULES } = await import('./assignment-scopes.js');
    // Standing reminder: this stays undefined until the reviewed flip; flipping it turns on unit-scoped grants.
    expect(SCOPE_ENFORCING_MODULES[moduleKey]).toBeUndefined();
  });
});
