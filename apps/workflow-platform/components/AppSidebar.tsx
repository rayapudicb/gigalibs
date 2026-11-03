'use client';

import { useTranslation } from '@/components/i18n';
import {
  canOpenPlatformModule,
  isNavigationPathActive,
  mostSpecificActiveModuleKey,
} from '@/lib/module-access';
import type { VerifiedSession } from '@/lib/verified-session';
import {
  type PlatformModuleDefinition,
  type PlatformModuleReadiness,
  type PlatformContextPersona,
  holdsAnyPermission,
  holdsPermission,
  MASTER_DATA_GROUP_LABELS,
  platformModuleCatalog,
} from '@gigalibs/contracts';
import { MASTER_DATA_PERSONAS, masterGroups, readableMasters } from '@/lib/master-data';
import { determinePersona } from '@/lib/persona-utils';
import { moduleIcons } from '@/lib/module-icons';
import {
  type ModuleMenuItem,
  dailyGroupOrder,
  dailyHiddenModuleKeys,
  groupLabels,
  hiddenModuleKeys,
  moduleMenu,
  personaSeesModule,
} from '@/lib/module-navigation';
import {
  ArrowLeft,
  ArrowLeftRight,
  Boxes,
  ChevronDown,
  ChevronRight,
  Database,
  Gauge,
  Home,
  Lock,
  type LucideIcon,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Settings sidebar sections (WI-OI-145): the `area` of each Settings entry, in this order; an unlisted area follows.
const settingsSectionOrder = ['Workspace', 'Integrations', 'Automation', 'Platform', 'Account'];

// Personas that see the Executive Control Tower (WI-OI-145: executives and administrators, not supervisors).
const EXECUTIVE_PERSONAS: readonly PlatformContextPersona[] = ['C_LEVEL', 'TENANT_ADMIN', 'PLATFORM_OPERATOR'];

/** Whether this page belongs to the Settings area: under /settings, or on a Settings entry's route. */
function isSettingsPath(pathname: string): boolean {
  return (
    isNavigationPathActive(pathname, '/settings') ||
    pathname === '/setup' ||
    platformModuleCatalog.some(
      (module) => module.navigationGroup === 'Settings' && isNavigationPathActive(pathname, module.route),
    )
  );
}

const PERSONA_CONFIG: Record<
  PlatformContextPersona,
  { label: string; badge: string; pillClass: string }
> = {
  PLATFORM_OPERATOR: {
    label: 'Platform Operator',
    badge: 'Platform Operator',
    pillClass: 'bg-amber-500/10 text-amber-700 border-amber-300 dark:border-amber-700 dark:text-amber-400',
  },
  C_LEVEL: {
    label: 'Executive (C-Level)',
    badge: 'Executive',
    pillClass: 'bg-purple-500/10 text-purple-700 border-purple-300 dark:border-purple-700 dark:text-purple-400',
  },
  TENANT_ADMIN: {
    label: 'Workspace Admin',
    badge: 'Workspace Admin',
    pillClass: 'bg-blue-500/10 text-blue-700 border-blue-300 dark:border-blue-700 dark:text-blue-400',
  },
  OPERATIONS_SUPERVISOR: {
    label: 'Operations Supervisor',
    badge: 'Operations Supervisor',
    pillClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:border-emerald-700 dark:text-emerald-400',
  },
  WORKFORCE_MEMBER: {
    label: 'Operations Member',
    badge: 'Operations Member',
    pillClass: 'bg-sky-500/10 text-sky-700 border-sky-300 dark:border-sky-700 dark:text-sky-400',
  },
  CUSTOMER_GUEST: {
    label: 'Guest / Client',
    badge: 'Guest',
    pillClass: 'bg-zinc-500/10 text-zinc-700 border-zinc-300 dark:border-zinc-700 dark:text-zinc-400',
  },
};

export default function AppSidebar({
  session,
  uatPreview = false,
}: {
  session: VerifiedSession;
  /** UAT instance only (WI-OI-120a): locked modules are listed like any other module. */
  uatPreview?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useTranslation('navigation');
  const [tenantApps, setTenantApps] = useState<Array<{ entityKey: string; manifest: { title?: string } }>>([]);
  const hasPlatformAuthority = session.platformRoles.length > 0;
  const mayReadTenantApps = holdsAnyPermission(session.permissions, ['configuration-apps:read']);


  useEffect(() => {
    if (!session.tenant || !mayReadTenantApps) return;
    void fetch('/api/control/configuration/apps', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((apps: Array<{ entityKey: string; manifest: { title?: string } }>) => setTenantApps(apps))
      .catch(() => setTenantApps([]));
  }, [mayReadTenantApps, session.tenant]);


  const naturalPersona = determinePersona(session.roles, session.platformRoles, session.permissions);
  const [activePersona, setActivePersona] = useState<PlatformContextPersona>(naturalPersona);
  const isSimulating = activePersona !== naturalPersona;

  const canSwitchPersona =
    naturalPersona === 'PLATFORM_OPERATOR' || naturalPersona === 'TENANT_ADMIN';

  const allowedPersonas: PlatformContextPersona[] =
    naturalPersona === 'PLATFORM_OPERATOR'
      ? [
          'PLATFORM_OPERATOR',
          'C_LEVEL',
          'TENANT_ADMIN',
          'OPERATIONS_SUPERVISOR',
          'WORKFORCE_MEMBER',
          'CUSTOMER_GUEST',
        ]
      : naturalPersona === 'TENANT_ADMIN'
        ? [
            'TENANT_ADMIN',
            'C_LEVEL',
            'OPERATIONS_SUPERVISOR',
            'WORKFORCE_MEMBER',
            'CUSTOMER_GUEST',
          ]
        : [naturalPersona];


  const openable = (module: PlatformModuleDefinition) =>
    personaSeesModule(activePersona, module.key) && canOpenPlatformModule(module, { ...session, uatPreview });
  const visibleModules = platformModuleCatalog.filter(
    (module) => module.navigationGroup !== 'Settings' && !dailyHiddenModuleKeys.has(module.key) && openable(module),
  );
  const activeModuleKey = mostSpecificActiveModuleKey(visibleModules, pathname);

  const grouped = dailyGroupOrder
    .map((group) => {
      const modules = visibleModules.filter((module) => module.navigationGroup === group);
      return {
        group,
        label: groupLabels[group],
        modules,
      };
    })
    .filter(({ modules }) => modules.length > 0);

  // WI-OI-152 (ADR-0037 §3): the Master data area, for administrators, with one link per group they can read.
  const masterDataGroups = MASTER_DATA_PERSONAS.includes(activePersona)
    ? masterGroups(readableMasters({ ...session, uatPreview }))
    : [];

  // The Settings sidebar (WI-OI-145, Medusa's settings layout): Settings entries sectioned by `area`.
  const settingsModules = platformModuleCatalog.filter(
    (module) => module.navigationGroup === 'Settings' && !hiddenModuleKeys.has(module.key) && openable(module),
  );
  const settingsAreas = [...new Set(settingsModules.map((module) => module.area))].sort((left, right) => {
    const rank = (area: string) => {
      const at = settingsSectionOrder.indexOf(area);
      return at === -1 ? settingsSectionOrder.length : at;
    };
    return rank(left) - rank(right);
  });
  const settingsSections = settingsAreas.map((area) => ({
    area,
    modules: settingsModules.filter((module) => module.area === area),
  }));
  // The Settings link opens Workspace settings, else the person's own profile, else the first entry they can open.
  const settingsHome =
    (
      settingsModules.find((module) => module.key === 'tenant-access') ??
      settingsModules.find((module) => module.key === 'personal-security') ??
      settingsSections[0]?.modules[0]
    )?.route ?? null;
  const activeSettingsKey = mostSpecificActiveModuleKey(settingsModules, pathname);
  const inSettings = isSettingsPath(pathname);

  return (
    <aside className="flex h-full w-64 shrink-0 select-none flex-col border-r border-ui-border-base bg-ui-bg-base font-sans text-ui-fg-base">
      <div className="border-b border-ui-border-base px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ui-button-inverted font-mono text-xs font-bold text-ui-fg-on-inverted shadow-xs">
              G
            </div>
            <div>
              <span className="block text-xs font-semibold leading-none tracking-tight text-ui-fg-base">
                GigaPlatform
              </span>
              <span className="font-mono text-[10px] text-ui-fg-muted">Operations Engine</span>
            </div>
          </div>
        </div>

        {/* Persona lens. Someone who can switch sees only the switcher, which names the lens; it never overflows the
            sidebar (WI-OI-145: the badge and the select side by side were wider than it and covered page titles). */}
        <div className="mt-2.5 flex min-w-0 items-center gap-1.5">
          {canSwitchPersona ? (
            <select
              aria-label="View As Persona"
              value={activePersona}
              onChange={(e) => setActivePersona(e.target.value as PlatformContextPersona)}
              className="w-full min-w-0 truncate text-[11px] bg-ui-bg-subtle text-ui-fg-subtle hover:text-ui-fg-base border border-ui-border-base rounded px-1.5 py-1 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-ui-fg-base"
              title="Simulate subordinate persona navigation lens"
            >
              {allowedPersonas.map((p) => (
                <option key={p} value={p}>
                  {p === naturalPersona ? `My view: ${PERSONA_CONFIG[p].label}` : `View as: ${PERSONA_CONFIG[p].label}`}
                </option>
              ))}
            </select>
          ) : (
            <div
              className={`inline-flex max-w-full items-center gap-1 truncate whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-semibold border ${PERSONA_CONFIG[activePersona].pillClass}`}
              title={`Active Persona Lens: ${PERSONA_CONFIG[activePersona].label}`}
            >
              <span className="truncate">{PERSONA_CONFIG[activePersona].badge}</span>
            </div>
          )}
        </div>

        {isSimulating && (
          <div className="mt-1.5 flex items-center justify-between bg-amber-500/10 border border-amber-300 dark:border-amber-700/50 rounded px-2 py-0.5 text-[9px] text-amber-800 dark:text-amber-300 font-medium">
            <span>Previewing subordinate persona</span>
            <button
              type="button"
              onClick={() => setActivePersona(naturalPersona)}
              className="underline hover:text-amber-950 dark:hover:text-amber-100 ml-1 cursor-pointer font-semibold"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {inSettings ? (
        <nav aria-label={t('settings')} className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            <SidebarLink href="/modules" label={t('home')} icon={ArrowLeft} pathname={pathname} active={false} />
            <p className="px-2.5 pt-1 text-sm font-semibold text-ui-fg-base">{t('settings')}</p>
          </div>
          {settingsSections.map(({ area, modules }) => (
            <div key={area} className="space-y-1">
              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted">{area}</span>
              <div className="mt-1 space-y-0.5">
                {modules.flatMap((module) => {
                  // An entry with a menu lists its screens here instead of itself (Workspace settings: Team & access, …).
                  const items = moduleMenu(module.key).filter(
                    (item) => !item.permissions?.length || item.permissions.every((code) => holdsPermission(session.permissions, code)),
                  );
                  if (items.length === 0)
                    return [
                      <SidebarLink
                        key={module.key}
                        href={module.route}
                        label={module.navigationLabel}
                        icon={moduleIcons[module.iconKey] ?? Boxes}
                        pathname={pathname}
                        active={activeSettingsKey === module.key}
                      />,
                    ];
                  const activeItem =
                    activeSettingsKey === module.key
                      ? [...items]
                          .filter((item) =>
                            item.href === module.route ? pathname === item.href : isNavigationPathActive(pathname, item.href),
                          )
                          .sort((left, right) => right.href.length - left.href.length)[0]?.key
                      : undefined;
                  return items.map((item) => (
                    <SidebarLink
                      key={`${module.key}-${item.key}`}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      pathname={pathname}
                      active={activeItem === item.key}
                    />
                  ));
                })}
              </div>
            </div>
          ))}
        </nav>
      ) : (
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        <div className="space-y-1">
          <SidebarLink href="/modules" label={t('home')} icon={Home} pathname={pathname} />
          {EXECUTIVE_PERSONAS.includes(naturalPersona) ? (
            <SidebarLink href="/dashboard" label="Executive Control Tower" icon={Gauge} pathname={pathname} />
          ) : null}
        </div>

        {grouped.map(({ group, label, modules }) => (
          <div key={group} className="space-y-1">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted">
              {label}
            </span>
            <div className="mt-1 space-y-0.5">
              {modules.map((module) => (
                <ModuleLink
                  key={module.key}
                  module={module}
                  label={module.navigationLabel}
                  pathname={pathname}
                  isActive={activeModuleKey === module.key}
                  uatPreview={uatPreview}
                  permissions={session.permissions}
                />
              ))}
            </div>
          </div>
        ))}
        {masterDataGroups.length > 0 ? (
          <div className="space-y-1">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted">
              Master data
            </span>
            <div className="mt-1 space-y-0.5">
              <SidebarLink
                href="/master-data"
                label="All masters"
                icon={Database}
                pathname={pathname}
                active={pathname === '/master-data'}
              />
              {masterDataGroups.map((group) => (
                <SidebarLink
                  key={group}
                  href={`/master-data/${group}`}
                  label={MASTER_DATA_GROUP_LABELS[group]}
                  icon={Database}
                  pathname={pathname}
                />
              ))}
            </div>
          </div>
        ) : null}
        {tenantApps.length > 0 ? (
          <div className="space-y-1">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted">
              {t('tenantApplications')}
            </span>
            <div className="mt-1 space-y-0.5">
              {tenantApps.map((app) => (
                <SidebarLink
                  key={app.entityKey}
                  href={`/apps/${app.entityKey}`}
                  label={app.manifest.title ?? app.entityKey}
                  icon={Boxes}
                  pathname={pathname}
                />
              ))}
            </div>
          </div>
        ) : null}
      </nav>
      )}

      {!inSettings && settingsHome ? (
        <div className="border-t border-ui-border-base px-3 py-2">
          <SidebarLink href={settingsHome} label={t('settings')} icon={Settings} pathname={pathname} active={false} />
        </div>
      ) : null}

      <div className="border-t border-ui-border-base bg-ui-bg-subtle/50 p-3">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-ui-border-base bg-ui-bg-base p-2 shadow-xs">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-subtle text-xs font-semibold uppercase text-ui-fg-base">
              {(session.tenant?.name || 'PA').slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold leading-tight text-ui-fg-base">
                {session.tenant?.name ?? 'Platform Tower'}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] leading-tight text-ui-fg-muted">
                {session.tenant?.slug ?? 'global-admin'}
              </p>
            </div>
          </div>
          <Link
            href="/select-tenant"
            title={t('switchWorkspace')}
            className="shrink-0 rounded-md p-1 text-ui-fg-muted transition-colors hover:bg-ui-bg-subtle hover:text-ui-fg-base"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function ModuleLink({
  module,
  label,
  pathname,
  isActive,
  uatPreview = false,
  permissions,
}: {
  module: PlatformModuleDefinition;
  label?: string;
  pathname: string;
  isActive: boolean;
  uatPreview?: boolean;
  permissions: readonly string[];
}) {
  const isUnavailable = module.readiness === 'CONTAINED' || module.readiness === 'PLANNED';
  const submodules = moduleMenu(module.key).filter(
    (item) => !item.permissions?.length || item.permissions.every((code) => holdsPermission(permissions, code)),
  );

  if ((!isUnavailable || uatPreview) && submodules.length > 0) {
    return (
      <ExpandableModuleItem
        module={module}
        label={label}
        pathname={pathname}
        submodules={submodules}
        isUnavailable={isUnavailable}
        isActive={isActive}
        uatPreview={uatPreview}
      />
    );
  }

  return (
    <SidebarLink
      href={module.route}
      label={label ?? module.navigationLabel}
      icon={moduleIcons[module.iconKey] ?? Boxes}
      pathname={pathname}
      isUnavailable={isUnavailable}
      active={isActive}
      uatPreview={uatPreview}
    />
  );
}

function ExpandableModuleItem({
  module,
  label,
  pathname,
  submodules,
  isUnavailable,
  isActive,
  uatPreview = false,
}: {
  module: PlatformModuleDefinition;
  label?: string;
  pathname: string;
  submodules: readonly ModuleMenuItem[];
  isUnavailable?: boolean;
  isActive: boolean;
  uatPreview?: boolean;
}) {
  const isModuleActive = isActive;
  const [isOpen, setIsOpen] = useState(isModuleActive);

  useEffect(() => {
    if (isModuleActive) {
      setIsOpen(true);
    }
  }, [isModuleActive]);

  const Icon = moduleIcons[module.iconKey] ?? Boxes;
  const isExactParentActive = pathname === module.route;

  return (
    <div className="space-y-0.5">
      <div
        className={`group flex min-h-8 w-full items-center justify-between gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
          isExactParentActive
            ? 'bg-ui-bg-base-hover font-semibold text-ui-fg-base shadow-borders-base'
            : isModuleActive
              ? 'bg-ui-bg-subtle/70 font-semibold text-ui-fg-base'
              : 'font-medium text-ui-fg-subtle hover:bg-ui-bg-subtle hover:text-ui-fg-base'
        }`}
      >
        <Link
          href={module.route}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Icon className={`h-4 w-4 shrink-0 ${isModuleActive ? 'text-ui-fg-base' : 'text-ui-fg-muted'}`} />
          <span className="truncate">{label ?? module.navigationLabel}</span>
        </Link>
        <div className="flex items-center gap-0.5">
          {isUnavailable && <UnavailableMark uatPreview={uatPreview} className="mr-1" />}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen((prev) => !prev);
            }}
            aria-label={isOpen ? `Collapse ${module.navigationLabel}` : `Expand ${module.navigationLabel}`}
            className="flex h-5 w-5 items-center justify-center rounded text-ui-fg-muted hover:bg-ui-bg-base hover:text-ui-fg-base focus:outline-none"
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="ml-3 border-l border-ui-border-base pl-2 space-y-0.5 mt-0.5">
          {submodules.map((sub) => {
            const SubIcon = sub.icon;
            // An item at the entry's own route (an overview) is active only there, not on its sub-pages.
            const isSubActive = sub.href === module.route
              ? pathname === sub.href
              : isNavigationPathActive(pathname, sub.href);
            return (
              <Link
                key={sub.key}
                href={sub.href}
                className={`flex min-h-7 w-full items-center justify-between gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  isSubActive
                    ? 'bg-ui-bg-base font-semibold text-ui-fg-base shadow-borders-base'
                    : 'font-medium text-ui-fg-muted hover:bg-ui-bg-subtle hover:text-ui-fg-base'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SubIcon className={`h-3.5 w-3.5 shrink-0 ${isSubActive ? 'text-ui-fg-base' : 'text-ui-fg-muted'}`} />
                  <span className="truncate">{sub.label}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  pathname,
  isUnavailable,
  active,
  uatPreview = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
  isUnavailable?: boolean;
  active?: boolean;
  uatPreview?: boolean;
}) {
  const isActive = active ?? isNavigationPathActive(pathname, href);
  return (
    <Link
      href={href}
      className={`flex min-h-8 w-full items-center justify-between gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
        isActive
          ? 'bg-ui-bg-base-hover font-semibold text-ui-fg-base shadow-borders-base'
          : 'font-medium text-ui-fg-subtle hover:bg-ui-bg-subtle hover:text-ui-fg-base'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-ui-fg-base' : 'text-ui-fg-muted'}`} />
        <span className="truncate">{label}</span>
      </span>
      {isUnavailable && <UnavailableMark uatPreview={uatPreview} className="ml-1" />}
    </Link>
  );
}

/**
 * A locked module shows a padlock. On the UAT instance it shows no mark: the owner removed the UAT labels on 2026-10-05
 * (WI-OI-120b) so every module appears as a normal entry.
 */
function UnavailableMark({ uatPreview, className }: { uatPreview: boolean; className: string }) {
  if (uatPreview) return null;
  return (
    <span title="Not available" className={`${className} shrink-0 text-ui-fg-muted`}>
      <Lock className="h-3 w-3" aria-label="Not available" />
    </span>
  );
}
