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
    // WI-OI-141 M-INC (ADR-0036): Safety Operations for supervisors and frontline workers; its permissions decide.
    'safety-operations': {
      group: 'Workforce & Operations',
      icon: moduleIcons['shield-alert'],
      personas: ['OPERATIONS_SUPERVISOR', 'WORKFORCE_MEMBER'],
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

  // WI-OI-145 (owner, 2026-11-02): administration, integration and automation tools leave the daily sidebar for the
  // Settings sidebar; the AP-only approval queue joins Finance next to 3-Way Match.
  const INTENDED_GROUP_CHANGES: Readonly<Record<string, string>> = {
    'tenant-access': 'Settings',
    'personal-security': 'Settings',
    'module-marketplace': 'Settings',
    'platform-control': 'Settings',
    connections: 'Settings',
    'connector-hub': 'Settings',
    'workflow-definitions': 'Settings',
    'dynamic-forms': 'Settings',
    'execution-runs': 'Settings',
    'exceptions-recovery': 'Settings',
    'approval-queue': 'Financial Operations',
  };

  it.each(platformModuleCatalog.map((module) => [module.key, module] as const))(
    '%s keeps its sidebar group and icon',
    (key, module) => {
      const legacy = LEGACY_SIDEBAR_NAVIGATION[key];
      const addition = INTENDED_ADDITIONS[key as keyof typeof INTENDED_ADDITIONS];
      expect(module.navigationGroup).toBe(INTENDED_GROUP_CHANGES[key] ?? addition?.group ?? legacy?.group);
      expect(moduleIcons[module.iconKey]).toBe(addition?.icon ?? legacy?.icon);
    },
  );

  // Deliberate navigation changes made after the freeze, each with its work item. Every other entry must still match
  // the frozen tables exactly.
  const m = (key: string, label: string, href: string, icon: keyof typeof moduleIcons, permissions?: readonly string[]) => ({
    key,
    label,
    href,
    icon: moduleIcons[icon],
    ...(permissions ? { permissions } : {}),
  });
  const INTENDED_MENU_CHANGES: Record<string, ReturnType<typeof moduleMenu>> = {
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
    // WI-OI-145: one sentence-case name per screen (the same as its page title), Overview added, Floor Kiosk (not
    // connected yet) off the menu; the in-page section bar is gone.
    'asset-maintenance': [
      m('overview', 'Overview', '/cmms', 'gauge'),
      m('requests', 'Requests', '/cmms/requests', 'file-text'),
      m('work-orders', 'Work orders', '/cmms/work-orders', 'wrench'),
      m('assets', 'Assets', '/cmms/assets', 'factory'),
      m('spaces', 'Spaces', '/cmms/spaces', 'building'),
      m('classifications', 'Classifications', '/cmms/classifications', 'layers'),
      m('schedules', 'Preventive maintenance', '/cmms/schedules', 'clock'),
      m('inventory', 'Parts', '/cmms/inventory', 'boxes'),
      m('meters', 'Meters', '/cmms/meters', 'gauge'),
      m('calibration', 'Calibration', '/cmms/calibration', 'shield-check', ['cmms.calibration.read']),
      m('commissioning', 'Commissioning', '/cmms/commissioning', 'map-pin', ['cmms.commissioning.read']),
      m('spares', 'Visual spares', '/cmms/spares', 'layers', ['cmms.bom.read']),
      m('sop', 'Work instructions', '/cmms/sop', 'file-check', ['cmms.sop.read']),
      m('fleet', 'Fleet readiness', '/cmms/fleet', 'gauge', ['cmms.fleet.read']),
      m('request-links', 'QR request links', '/cmms/request-links', 'scan-line', ['cmms.portal.manage']),
      m('permits', 'Permits & LOTO', '/cmms/permits', 'lock', ['cmms.permits.read']),
      m('analytics', 'Reliability', '/cmms/analytics', 'bar-chart', ['cmms.analytics.read', 'analytics:read']),
    ],
    // WI-OI-130 / WI-OI-126: new capability modules after the WI-OI-083c freeze.
    // WI-OI-130 / WI-OI-126, then WI-OI-145: Overview joins the menus and Rules keeps one name.
    'iot-gateway': [
      m('overview', 'Overview', '/iot', 'gauge'),
      m('devices', 'Devices', '/iot/devices', 'radio'),
      m('protocols', 'Protocols', '/iot/protocols', 'network'),
      m('rules', 'Rules', '/iot/rules', 'workflow'),
      m('discovery', 'Discovery', '/iot/discovery', 'scan-line'),
      m('alerts', 'Alerts', '/iot/alerts', 'shield-alert'),
    ],
    'universal-manufacturing': [
      m('overview', 'Overview', '/universal-manufacturing', 'gauge'),
      m('boms', 'BOMs', '/universal-manufacturing/boms', 'layers'),
      m('production', 'Production', '/universal-manufacturing/production', 'factory'),
      m('mrp', 'MRP preview', '/universal-manufacturing/mrp', 'bar-chart'),
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

  // WI-OI-145 (owner, 2026-11-02): every module with more than one screen lists them in the sidebar and in the shell's
  // module tab bar, one route each (a screen's views are tabs only inside one component). Settings entries list theirs
  // in the Settings sidebar.
  Object.assign(INTENDED_MENU_CHANGES, {
    'tenant-access': [
      m('team', 'Team & access', '/settings', 'key-round'),
      m('people', 'People', '/settings/people', 'users'),
      m('organization', 'Organization & hierarchy', '/settings/organization', 'building'),
      m('plan', 'Plan & entitlements', '/settings/plan', 'credit-card'),
      m('general', 'General & localization', '/settings/general', 'globe'),
      m('security', 'Security & SSO', '/settings/security', 'shield-check'),
    ],
    'workflow-definitions': [
      m('workflows', 'Workflows', '/workflows', 'zap'),
      m('templates', 'Templates', '/workflows/templates', 'layers'),
      m('api-keys', 'API keys', '/workflows/api-keys', 'key-round'),
    ],
    connections: [m('connections', 'Connections', '/connections', 'radio'), m('credentials', 'Credentials', '/connections/credentials', 'key-round')],
    'platform-control': [
      m('overview', 'Platform Control Tower', '/platform-admin', 'server'),
      m('users', 'Platform users', '/platform-admin/users', 'users'),
    ],
    'universal-inventory': [
      m('warehouses', 'Warehouses', '/inventory', 'building'),
      m('items', 'Items', '/inventory/items', 'boxes'),
      m('lots', 'Lots', '/inventory/lots', 'layers'),
      m('receipts', 'Receipts', '/inventory/receipts', 'inbox'),
      m('balances', 'Balances', '/inventory/balances', 'database'),
      m('reservations', 'Reservations', '/inventory/reservations', 'lock'),
      m('ledger', 'Stock ledger', '/inventory/ledger', 'file-text'),
      m('movement-costs', 'Movement costs', '/inventory/movement-costs', 'coins'),
      m('posted-receipt-costs', 'Posted receipt costs', '/inventory/posted-receipt-costs', 'file-check'),
      m('warehouse-map', 'Warehouse map', '/inventory/warehouse-map', 'map-pin'),
      m('transfers', 'Transfers', '/inventory/transfers', 'arrow-left-right'),
      m('replenishment', 'Replenishment', '/inventory/replenishment', 'gauge'),
      m('availability', 'Availability', '/inventory/availability', 'check-circle'),
      m('valuation', 'Valuation setup', '/inventory/valuation', 'scale'),
      m('barcode', 'Barcode lookup', '/inventory/barcode', 'scan-line'),
    ],
    'product-catalogue': [
      m('products', 'Products', '/products', 'boxes'),
      m('units', 'Units', '/products/units', 'scale'),
      m('categories', 'Categories', '/products/categories', 'layers'),
      m('attributes', 'Attributes', '/products/attributes', 'database'),
      m('catalogues', 'Catalogues', '/products/catalogues', 'file-text'),
      m('catalogue-versions', 'Catalogue versions', '/products/catalogue-versions', 'file-check'),
      m('price-lists', 'Price lists', '/products/price-lists', 'coins'),
      m('price-list-versions', 'Price-list versions', '/products/price-list-versions', 'file-check'),
      m('price-resolver', 'Price resolver', '/products/price-resolver', 'check-circle'),
      m('import-export', 'Import & export', '/products/import-export', 'arrow-left-right'),
    ],
    'universal-procurement': [
      m('requisitions', 'Requisitions', '/procurement', 'file-text'),
      m('purchase-orders', 'Purchase orders', '/procurement/purchase-orders', 'shopping-bag'),
      m('vendor-bills', 'Vendor bills', '/procurement/vendor-bills', 'file-check'),
      m('debit-memos', 'Debit memos', '/procurement/debit-memos', 'credit-card'),
      m('landed-cost', 'Landed cost', '/procurement/landed-cost', 'coins'),
    ],
    'universal-orders': [
      m('quotes', 'Quotes', '/orders', 'file-text'),
      m('sales-orders', 'Sales orders', '/orders/sales-orders', 'shopping-bag'),
      m('fulfillment', 'Fulfillment', '/orders/fulfillment', 'boxes'),
      m('invoices', 'Invoices', '/orders/invoices', 'file-check'),
      m('credit-memos', 'Credit memos', '/orders/credit-memos', 'credit-card'),
    ],
    'financial-operations': [
      m('journal-entries', 'Journal entries', '/finance', 'file-text'),
      m('posted-journals', 'Posted journals', '/finance/posted-journals', 'file-check'),
      m('accounts', 'Chart of accounts', '/finance/accounts', 'layers'),
      m('periods', 'Periods', '/finance/periods', 'calendar'),
      m('books', 'Books', '/finance/books', 'database'),
      m('reports', 'Reports', '/finance/reports', 'bar-chart'),
      m('set-up', 'Set up a book', '/finance/set-up', 'settings', ['finance:books:manage']),
    ],
    'safety-operations': [
      m('stop-work', 'Stop work', '/safety-operations', 'shield-alert', ['safety-operations.hazards.report']),
      m('triage', 'Triage', '/safety-operations/triage', 'inbox', ['safety-operations.hazards.triage']),
      m('reports', 'Reports', '/safety-operations/reports', 'file-text', ['safety-operations.hazards.read']),
      m('insights', 'Insights', '/safety-operations/insights', 'bar-chart', ['safety-operations.hazards.read']),
      m('contractors', 'Contractors', '/safety-operations/contractors', 'users'),
    ],
    'operator-rounds': [
      m('routes', 'Routes', '/operator-rounds', 'workflow', ['operator-rounds.routes.read']),
      m('board', 'Live board', '/operator-rounds/board', 'gauge', ['operator-rounds.board.read']),
      m('exceptions', 'Exceptions', '/operator-rounds/exceptions', 'shield-alert', ['operator-rounds.exceptions.read']),
      m('skips', 'Skip approvals', '/operator-rounds/skips', 'check-circle', ['operator-rounds.skips.approve']),
    ],
    gigaops: [
      m('overview', 'Overview', '/gigaops', 'gauge'),
      m('resources', 'People', '/gigaops/resources', 'check-circle'),
      m('jobs', 'Jobs & positions', '/gigaops/jobs', 'layers'),
      m('capabilities', 'Skills & qualifications', '/gigaops/capabilities', 'shield-check'),
      m('availability', 'Availability', '/gigaops/availability', 'calendar'),
      m('bookings', 'Bookings', '/gigaops/bookings', 'layers'),
      m('scheduling', 'Scheduling & dispatch', '/gigaops/scheduling', 'calendar'),
      m('time', 'Time & attendance', '/gigaops/time', 'clock'),
      m('pay', 'Pay-ready outputs', '/gigaops/pay', 'coins'),
      m('logbook', 'Shift logbook', '/gigaops/logbook', 'file-text', ['workforce.logbook.read']),
      m('analytics', 'Analytics & trends', '/gigaops/analytics', 'bar-chart', ['workforce.positions.read', 'analytics:read']),
    ],
  });

  it.each(platformModuleCatalog.map((module) => [module.key] as const))('%s keeps its sub-menu', (key) => {
    expect(moduleMenu(key)).toEqual(INTENDED_MENU_CHANGES[key] ?? LEGACY_MODULE_MENUS[key] ?? []);
  });

  // Persona lenses widened after the freeze, each with its reason (the module's permission still decides).
  const INTENDED_LENS_ADDITIONS: Readonly<Record<string, { readonly personas: readonly string[]; readonly reason: string }>> = {
    'asset-maintenance': {
      personas: ['CUSTOMER_GUEST'],
      reason: 'WI-OI-120n: a Viewer holding the Maintenance viewer role (an auditor) sees CMMS; cmms:read still decides.',
    },
    'personal-security': {
      personas: ['C_LEVEL', 'OPERATIONS_SUPERVISOR', 'WORKFORCE_MEMBER', 'CUSTOMER_GUEST'],
      reason: 'WI-OI-145: everyone finds My profile & security in the Settings sidebar; profile:* still decides.',
    },
  };
  // Persona lenses narrowed after the freeze, each with its reason (WI-OI-145, owner 2026-11-02).
  const INTENDED_LENS_REMOVALS: Readonly<Record<string, { readonly personas: readonly string[]; readonly reason: string }>> = {
    'execution-runs': {
      personas: ['C_LEVEL', 'OPERATIONS_SUPERVISOR'],
      reason: 'Run history is a diagnostic tool for administrators, in Settings.',
    },
    'exceptions-recovery': {
      personas: ['OPERATIONS_SUPERVISOR'],
      reason: 'Processing exceptions are an integration tool for administrators, in Settings.',
    },
    'workflow-definitions': {
      personas: ['C_LEVEL', 'OPERATIONS_SUPERVISOR'],
      reason: 'Building workflows is an administrator task, in Settings.',
    },
    'approval-queue': {
      personas: ['WORKFORCE_MEMBER'],
      reason: 'Invoice approvals read only the AP action queue; frontline workers approve nothing there.',
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
          (legacy === undefined ||
            legacy.includes(module.key) ||
            addition?.personas.includes(persona as never) === true ||
            INTENDED_LENS_ADDITIONS[module.key]?.personas.includes(persona) === true) &&
            INTENDED_LENS_REMOVALS[module.key]?.personas.includes(persona) !== true,
        ]);
      }
    }
  });
});
