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
  // Entries removed after the freeze, each with its reason. Every other frozen entry must still be in the catalogue.
  const INTENDED_REMOVALS: Readonly<Record<string, string>> = {
    reports: 'WI-OI-103e (ADR-0016 F11): Analytics owns reports; the contained core Reports entry is removed.',
  };

  // Capability modules intentionally added after the WI-OI-083c freeze. Keeping these separate from the frozen
  // fixture makes each new navigation surface an explicit, reviewable architecture decision.
  const INTENDED_ADDITIONS = {
    'product-catalogue': {
      group: 'Workforce & Operations',
      icon: moduleIcons.boxes,
      personas: ['OPERATIONS_SUPERVISOR'],
    },
    'universal-inventory': {
      group: 'Workforce & Operations',
      icon: moduleIcons.boxes,
      personas: ['OPERATIONS_SUPERVISOR'],
    },
    'universal-procurement': {
      group: 'Financial Operations',
      icon: moduleIcons['shopping-bag'],
      personas: ['OPERATIONS_SUPERVISOR'],
    },
    'universal-orders': {
      group: 'Financial Operations',
      icon: moduleIcons['shopping-bag'],
      personas: ['OPERATIONS_SUPERVISOR'],
    },
    'financial-operations': {
      group: 'Financial Operations',
      icon: moduleIcons.scale,
      personas: ['OPERATIONS_SUPERVISOR'],
    },
  } as const;

  it('covers exactly the catalogue entries the frozen tables covered, less the intended removals', () => {
    expect(platformModuleCatalog.map((module) => module.key).sort()).toEqual(
      Object.keys(LEGACY_SIDEBAR_NAVIGATION)
        .filter((key) => !(key in INTENDED_REMOVALS))
        .concat(Object.keys(INTENDED_ADDITIONS))
        .sort(),
    );
  });

  it.each(platformModuleCatalog.map((module) => [module.key, module] as const))(
    '%s keeps its sidebar group and icon',
    (key, module) => {
      const legacy = LEGACY_SIDEBAR_NAVIGATION[key];
      const addition = INTENDED_ADDITIONS[key as keyof typeof INTENDED_ADDITIONS];
      expect(module.navigationGroup).toBe(addition?.group ?? legacy?.group);
      expect(moduleIcons[module.iconKey]).toBe(addition?.icon ?? legacy?.icon);
    },
  );

  // Deliberate navigation changes made after the freeze, each with its work item. Every other entry must still match
  // the frozen tables exactly.
  const INTENDED_MENU_CHANGES: Readonly<Record<string, ReturnType<typeof moduleMenu>>> = {
    // WI-OI-103d: Analytics gains Overview, Places and the new Explore screen; WI-OI-103e adds Dashboards and Reports;
    // WI-OI-104e adds Sources (no-code mapping of pulled records into datasets).
    'analytics-studio': [
      { key: 'overview', label: 'Overview', href: '/analytics', icon: moduleIcons['bar-chart'] },
      { key: 'places', label: 'Places', href: '/analytics/places', icon: moduleIcons['map-pin'] },
      { key: 'explore', label: 'Explore', href: '/analytics/explore', icon: moduleIcons.layers },
      { key: 'dashboards', label: 'Dashboards', href: '/analytics/dashboards', icon: moduleIcons.gauge },
      { key: 'reports', label: 'Reports', href: '/analytics/reports', icon: moduleIcons['file-text'] },
      { key: 'sources', label: 'Sources', href: '/analytics/sources', icon: moduleIcons.database },
    ],
    'asset-maintenance': [
      LEGACY_MODULE_MENUS['asset-maintenance']![0]!,
      { key: 'spaces', label: 'CAFM Spaces', href: '/cmms/spaces', icon: moduleIcons.building },
      ...LEGACY_MODULE_MENUS['asset-maintenance']!.slice(1),
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
        const addition = INTENDED_ADDITIONS[module.key as keyof typeof INTENDED_ADDITIONS];
        expect([persona, module.key, personaSeesModule(persona as never, module.key)]).toEqual([
          persona,
          module.key,
          legacy === undefined || legacy.includes(module.key) || addition?.personas.includes(persona as never) === true,
        ]);
      }
    }
  });
});
