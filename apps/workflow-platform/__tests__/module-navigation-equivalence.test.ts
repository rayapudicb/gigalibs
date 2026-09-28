/**
 * WI-OI-083c — sidebar groups and icons now come from each entry's manifest (`navigationGroup`, `iconKey`) instead
 * of hand-written tables in the shell. Every catalogue entry must land in the same group with the same icon as
 * before.
 */
import { platformModuleCatalog } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { moduleIcons } from '../lib/module-icons';
import { LEGACY_SIDEBAR_NAVIGATION } from './fixtures/legacy-module-navigation';

describe('manifest-declared navigation equals the former sidebar tables', () => {
  it('covers exactly the catalogue entries the frozen tables covered', () => {
    expect(platformModuleCatalog.map((module) => module.key).sort()).toEqual(
      Object.keys(LEGACY_SIDEBAR_NAVIGATION).sort(),
    );
  });

  it.each(platformModuleCatalog.map((module) => [module.key, module] as const))(
    '%s keeps its sidebar group and icon',
    (key, module) => {
      const legacy = LEGACY_SIDEBAR_NAVIGATION[key];
      expect(module.navigationGroup).toBe(legacy?.group);
      expect(moduleIcons[module.iconKey]).toBe(legacy?.icon);
    },
  );
});
