/** WI-OI-120bk: CMMS module checks only catalogue-listed codes; scope gate is on. */
import { describe, expect, it } from 'vitest';
import { modulePermissionCatalogue } from './permission-catalogue.generated.js';
import { SCOPE_ENFORCING_MODULES, moduleCheckedCodes } from './assignment-scopes.js';

const CMMS = 'asset-maintenance';

describe('WI-OI-120bk CMMS context / catalogue coverage', () => {
  it('SCOPE_ENFORCING and PER_ASSIGNMENT include asset-maintenance', async () => {
    const { PER_ASSIGNMENT_SCOPE_MODULES } = await import('./assignment-scopes.js');
    expect(SCOPE_ENFORCING_MODULES[CMMS]).toEqual({ units: true, places: true });
    expect(PER_ASSIGNMENT_SCOPE_MODULES).toContain(CMMS);
  });

  it('every permission code CMMS checks appears in the generated catalogue', () => {
    const checked = moduleCheckedCodes(CMMS);
    expect(checked.length).toBeGreaterThan(10);
    for (const code of checked) {
      const entry = modulePermissionCatalogue.find((item) => item.code === code);
      expect(entry, `missing catalogue entry for ${code}`).toBeDefined();
      expect(entry!.entries, `${code} has no owning module`).toContain(CMMS);
    }
  });
});
