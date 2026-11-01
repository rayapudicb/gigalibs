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
    'master-data':
      'WI-OI-120at (owner, 2026-10-15): the in-memory Master Data Hub prototype is retired; each module owns its master data.',
  };

  // Capability modules intentionally added after the WI-OI-083c freeze. Keeping these separate from the frozen
  // fixture makes each new navigation surface an explicit, reviewable architecture decision.
  const INTENDED_ADDITIONS = {
    'business-partners': {
      group: 'Financial Operations',
      icon: moduleIcons.building,
      personas: ['OPERATIONS_SUPERVISOR'],
    },
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
    'iot-gateway': {
      group: 'Workforce & Operations',
      icon: moduleIcons.radio,
      personas: ['OPERATIONS_SUPERVISOR'],
    },
    'universal-manufacturing': {
      group: 'Workforce & Operations',
      icon: moduleIcons.factory,
      personas: ['OPERATIONS_SUPERVISOR'],
    },
    'universal-returns': {
      group: 'Financial Operations',
      icon: moduleIcons.boxes,
      personas: ['OPERATIONS_SUPERVISOR'],
    },
    'project-operations': {
      group: 'Workforce & Operations',
      icon: moduleIcons.boxes,
      personas: ['OPERATIONS_SUPERVISOR'],
    },
    'operator-rounds': {
      group: 'Workforce & Operations',
      icon: moduleIcons['scan-line'],
      personas: ['OPERATIONS_SUPERVISOR'],
    },
    // WI-OI-120bw (SPEED S3, WI-OI-120bn): SPEED process safety screening for lab leads and chemists.
    'process-safety-screening': {
      group: 'Intelligence',
      icon: moduleIcons['shield-alert'],
      personas: ['OPERATIONS_SUPERVISOR', 'WORKFORCE_MEMBER'],
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
    // WI-OI-120be (W1 review C, I3): Maintenance Requests (first, WI-OI-120t slice 2) and Classifications (after
    // Assets, owner 2026-10-13) were accepted by the CMMS Security review.
    'asset-maintenance': (() => {
      const base = [
        LEGACY_MODULE_MENUS['asset-maintenance']![0]!,
        { key: 'spaces', label: 'CAFM Spaces', href: '/cmms/spaces', icon: moduleIcons.building },
        ...LEGACY_MODULE_MENUS['asset-maintenance']!.slice(1),
      ];
      const assetsAt = base.findIndex((item) => item.key === 'assets');
      const items = [
        { key: 'requests', label: 'Maintenance Requests', href: '/cmms/requests', icon: moduleIcons['file-text'] },
        ...base.slice(0, assetsAt + 1),
        { key: 'classifications', label: 'Classifications', href: '/cmms/classifications', icon: moduleIcons.layers },
        ...base.slice(assetsAt + 1),
      ];
      // WI-OI-134 M-CAL: Calibration follows Meters & IoT and is gated on cmms.calibration.read.
      const metersAt = items.findIndex((item) => item.key === 'meters');
      items.splice(metersAt + 1, 0, {
        key: 'calibration', label: 'Calibration', href: '/cmms/calibration', icon: moduleIcons['shield-check'],
        permissions: ['cmms.calibration.read'] as const,
      } as (typeof items)[number]);
      // WI-OI-135 M-TAG: Commissioning follows Calibration and is gated on cmms.commissioning.read.
      items.splice(metersAt + 2, 0, {
        key: 'commissioning', label: 'Commissioning', href: '/cmms/commissioning', icon: moduleIcons['map-pin'],
        permissions: ['cmms.commissioning.read'] as const,
      } as (typeof items)[number]);
      // WI-OI-136 M-BOM: Visual Spares follows Commissioning and is gated on cmms.bom.read.
      items.splice(metersAt + 3, 0, {
        key: 'spares', label: 'Visual Spares', href: '/cmms/spares', icon: moduleIcons.layers,
        permissions: ['cmms.bom.read'] as const,
      } as (typeof items)[number]);
      // WI-OI-131 C11: Reliability tab is permission-gated in the sidebar.
      return items.map((item) =>
        item.key === 'analytics'
          ? { ...item, permissions: ['cmms.analytics.read', 'analytics:read'] as const }
          : item,
      );
    })(),
    // WI-OI-120u: Bookings, a read-only metadata window, follows Availability (Slice 2); Compliance and Workforce
    // Analytics, which showed the retired WFO screens, are gone (Slice 3, owner "retire all").
    gigaops: [
      ...LEGACY_MODULE_MENUS.gigaops!.slice(0, 5),
      { key: 'bookings', label: 'Bookings', href: '/gigaops/bookings', icon: moduleIcons.layers },
      ...LEGACY_MODULE_MENUS.gigaops!.slice(5).filter((item) => item.key !== 'compliance' && item.key !== 'analytics'),
      {
        key: 'analytics',
        label: 'Analytics & Trends',
        href: '/gigaops/analytics',
        icon: moduleIcons['bar-chart'],
        permissions: ['workforce.positions.read', 'analytics:read'] as const,
      },
    ],
    // WI-OI-130 / WI-OI-126: new capability modules after the WI-OI-083c freeze.
    'iot-gateway': [
      { key: 'devices', label: 'Devices', href: '/iot/devices', icon: moduleIcons.radio },
      { key: 'protocols', label: 'Protocols', href: '/iot/protocols', icon: moduleIcons.network },
      { key: 'rules', label: 'Condition Rules', href: '/iot/rules', icon: moduleIcons.workflow },
      { key: 'discovery', label: 'Discovery', href: '/iot/discovery', icon: moduleIcons['scan-line'] },
      { key: 'alerts', label: 'Alerts', href: '/iot/alerts', icon: moduleIcons['shield-alert'] },
    ],
    'universal-manufacturing': [
      { key: 'boms', label: 'BOMs', href: '/universal-manufacturing/boms', icon: moduleIcons.layers },
      { key: 'production', label: 'Production', href: '/universal-manufacturing/production', icon: moduleIcons.factory },
      { key: 'mrp', label: 'MRP preview', href: '/universal-manufacturing/mrp', icon: moduleIcons['bar-chart'] },
    ],
    // WI-OI-120cb (owner, 2026-10-21): SPEED expands into its screens like EAM, each on its own page.
    'process-safety-screening': [
      { key: 'projects', label: 'Projects', href: '/speed/projects', icon: moduleIcons.layers },
      { key: 'routes', label: 'Routes', href: '/speed/routes', icon: moduleIcons.workflow },
      { key: 'substances', label: 'Substances', href: '/speed/substances', icon: moduleIcons.database },
      { key: 'library', label: 'Screening library', href: '/speed/library', icon: moduleIcons['shield-alert'] },
      { key: 'criteria', label: 'Screening criteria', href: '/speed/criteria', icon: moduleIcons.scale },
      { key: 'outcomes', label: 'Outcomes', href: '/speed/outcomes', icon: moduleIcons['bar-chart'] },
      { key: 'audit', label: 'Audit trail', href: '/speed/audit', icon: moduleIcons['file-check'] },
    ],
  };

  it.each(platformModuleCatalog.map((module) => [module.key] as const))('%s keeps its sub-menu', (key) => {
    expect(moduleMenu(key)).toEqual(INTENDED_MENU_CHANGES[key] ?? LEGACY_MODULE_MENUS[key] ?? []);
  });

  // Persona lenses widened after the freeze, each with its reason (the module's permission still decides).
  const INTENDED_LENS_ADDITIONS: Readonly<Record<string, { readonly personas: readonly string[]; readonly reason: string }>> = {
    'asset-maintenance': {
      personas: ['CUSTOMER_GUEST'],
      reason: 'WI-OI-120n: a Viewer holding the Maintenance viewer role (an auditor) sees CMMS; cmms:read still decides.',
    },
  };

  it('shows each persona lens exactly the entries it showed before', () => {
    const personas = ['PLATFORM_OPERATOR', 'TENANT_ADMIN', ...Object.keys(LEGACY_PERSONA_MODULE_KEYS)] as const;
    for (const persona of personas) {
      const legacy = LEGACY_PERSONA_MODULE_KEYS[persona];
      for (const module of platformModuleCatalog) {
        const addition = INTENDED_ADDITIONS[module.key as keyof typeof INTENDED_ADDITIONS];
        expect([persona, module.key, personaSeesModule(persona as never, module.key)]).toEqual([
          persona,
          module.key,
          legacy === undefined ||
            legacy.includes(module.key) ||
            addition?.personas.includes(persona as never) === true ||
            INTENDED_LENS_ADDITIONS[module.key]?.personas.includes(persona) === true,
        ]);
      }
    }
  });
});
