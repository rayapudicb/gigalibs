/**
 * WI-OI-083c — sidebar groups, icons, sub-menus and persona lenses now come from each entry's manifest
 * (`navigationGroup`, `iconKey`, `menu`, `personas`) instead of hand-written tables in the shell. Every catalogue
 * entry must look and appear exactly as before.
 */
import { platformModuleCatalog } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { moduleIcons } from '../lib/module-icons';
import { moduleMenu, personaSeesModule } from '../lib/module-navigation';
import {
  LEGACY_MODULE_MENUS,
  LEGACY_PERSONA_MODULE_KEYS,
  LEGACY_SIDEBAR_NAVIGATION,
} from './fixtures/legacy-module-navigation';

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

  // Deliberate navigation changes made after the freeze, each with its work item. Every other entry must still match
  // the frozen tables exactly.
  const INTENDED_MENU_CHANGES: Readonly<Record<string, ReturnType<typeof moduleMenu>>> = {
    // WI-OI-103d: Analytics gains Overview, Places and the new Explore screen.
    'analytics-studio': [
      { key: 'overview', label: 'Overview', href: '/analytics', icon: moduleIcons['bar-chart'] },
      { key: 'places', label: 'Places', href: '/analytics/places', icon: moduleIcons['map-pin'] },
      { key: 'explore', label: 'Explore', href: '/analytics/explore', icon: moduleIcons.layers },
    ],
  };

  it.each(platformModuleCatalog.map((module) => [module.key] as const))(
    '%s keeps its sub-menu',
    (key) => {
      expect(moduleMenu(key)).toEqual(INTENDED_MENU_CHANGES[key] ?? LEGACY_MODULE_MENUS[key] ?? []);
    },
  );

  it('shows each persona lens exactly the entries it showed before', () => {
    const personas = ['PLATFORM_OPERATOR', 'TENANT_ADMIN', ...Object.keys(LEGACY_PERSONA_MODULE_KEYS)] as const;
    for (const persona of personas) {
      const legacy = LEGACY_PERSONA_MODULE_KEYS[persona];
      for (const module of platformModuleCatalog) {
        expect([persona, module.key, personaSeesModule(persona as never, module.key)]).toEqual([
          persona,
          module.key,
          legacy === undefined || legacy.includes(module.key),
        ]);
      }
    }
  });
});
