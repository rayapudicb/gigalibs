'use client';

import { useTranslation } from '@/components/i18n';
import { canUseTenantModule } from '@/lib/module-access';
import type { VerifiedSession } from '@/lib/verified-session';
import {
  type PlatformModuleArea,
  type PlatformModuleDefinition,
  type PlatformModuleReadiness,
  platformModuleCatalog,
} from '@gigalibs/contracts';
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  Coins,
  Cpu,
  CreditCard,
  Database,
  Factory,
  FileCheck2,
  FileSignature,
  FileText,
  KeyRound,
  Lock,
  type LucideIcon,
  MapPin,
  MessageSquare,
  Network,
  Radio,
  Scale,
  ScanLine,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const groupOrder: readonly PlatformModuleArea[] = [
  'Executive Intelligence',
  'Financial Operations',
  'Physical Operations & CMMS',
  'Studio & Orchestration',
  'Platform Administration',
];

const iconByKey: Readonly<Record<string, LucideIcon>> = {
  settings: Settings,
  'personal-security': KeyRound,
  workflow: Zap,
  runs: FileCheck2,
  exceptions: ShieldAlert,
  approvals: CheckCircle2,
  value: CheckCircle2,
  'data-contracts': Database,
  connections: Radio,
  'invoice-match': FileText,
  'accounts-receivable': ArrowLeftRight,
  spend: CreditCard,
  tax: Building2,
  currency: Coins,
  recovery: ShieldCheck,
  rules: Scale,
  'dynamic-forms': Sparkles,
  'connector-hub': Lock,
  'platform-control': Server,
  marketplace: ShoppingBag,
  analytics: BarChart3,
  cmms: Factory,
  maps: MapPin,
  esign: FileSignature,
  scanner: ScanLine,
  ontology: Network,
  saga: Workflow,
  reports: BarChart3,
  'master-data': Database,
  solutions: Boxes,
  infrastructure: Cpu,
  communications: MessageSquare,
};

export default function AppSidebar({ session }: { session: VerifiedSession }) {
  const pathname = usePathname();
  const { t } = useTranslation('navigation');
  const [tenantApps, setTenantApps] = useState<Array<{ entityKey: string; manifest: { title?: string } }>>([]);
  const hasPlatformAuthority = session.platformRoles.length > 0;
  const enabledModules = new Set(session.tenant?.features ?? []);
  const mayReadTenantApps = session.permissions.includes('*') || session.permissions.includes('configuration-apps:*') || session.permissions.includes('configuration-apps:read');

  const groupLabelByKey: Record<PlatformModuleArea, string> = {
    'Executive Intelligence': t('executiveIntelligence'),
    'Financial Operations': t('financialOperations'),
    'Physical Operations & CMMS': t('physicalOperations'),
    'Studio & Orchestration': t('studioOrchestration'),
    'Platform Administration': t('platformAdmin'),
  };

  const moduleLabelByKey: Record<string, string> = {
    esign: t('eSignatureStudio'),
    'accounts-receivable': t('accountsReceivable'),
    'invoice-match': t('invoices'),
    spend: t('spendManagement'),
    tax: t('taxConfiguration'),
    value: t('valueLedger'),
    analytics: t('analytics'),
    rules: t('rules'),
    settings: t('settings'),
    runs: t('workflows'),
    workflow: t('workflows'),
    fraud: t('fraud'),
    geofence: t('geofence'),
    products: t('products'),
    orders: t('orders'),
    clients: t('clients'),
    exceptions: t('exceptions'),
  };

  useEffect(() => {
    if (!session.tenant || !mayReadTenantApps) return;
    void fetch('/api/control/configuration/apps', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((apps: Array<{ entityKey: string; manifest: { title?: string } }>) => setTenantApps(apps))
      .catch(() => setTenantApps([]));
  }, [mayReadTenantApps, session.tenant]);

  const visibleModules = platformModuleCatalog.filter((module) => {
    if (module.key === 'platform-control') return hasPlatformAuthority;
    if (module.platformInspection && hasPlatformAuthority) return true;
    if (!session.tenant) return false;
    return (
      (module.readiness === 'AVAILABLE' || module.readiness === 'REVIEW') &&
      (hasPlatformAuthority ||
        session.permissions.includes('*') ||
        canUseTenantModule(module.key, enabledModules, session.permissions))
    );
  });

  const grouped = groupOrder
    .map((group) => ({
      group,
      modules: visibleModules.filter((module) => module.navigationGroup === group),
    }))
    .filter(({ modules }) => modules.length > 0);

  return (
    <aside className="flex h-full w-64 shrink-0 select-none flex-col border-r border-ui-border-base bg-ui-bg-base font-sans text-ui-fg-base">
      <div className="flex h-14 items-center justify-between border-b border-ui-border-base px-4">
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

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        <div className="space-y-1">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted">
            {t('moduleCatalogue')}
          </span>
          <SidebarLink href="/modules" label={t('allModules')} icon={Boxes} pathname={pathname} />
        </div>

        {grouped.map(({ group, modules }) => (
          <div key={group} className="space-y-1">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted">
              {groupLabelByKey[group] ?? group}
            </span>
            <div className="mt-1 space-y-0.5">
              {modules.map((module) => (
                <ModuleLink
                  key={module.key}
                  module={module}
                  label={moduleLabelByKey[module.key] ?? module.navigationLabel}
                  pathname={pathname}
                />
              ))}
              {group === 'Platform Administration' && hasPlatformAuthority && (
                <SidebarLink
                  href="/platform-admin/users"
                  label={t('platformUsersRbac')}
                  icon={Users}
                  pathname={pathname}
                />
              )}
            </div>
          </div>
        ))}
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
}: {
  module: PlatformModuleDefinition;
  label?: string;
  pathname: string;
}) {
  const isUnavailable = module.readiness === 'CONTAINED' || module.readiness === 'PLANNED';
  return (
    <SidebarLink
      href={module.route}
      label={label ?? module.navigationLabel}
      icon={iconByKey[module.iconKey] ?? Boxes}
      pathname={pathname}
      isUnavailable={isUnavailable}
    />
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  pathname,
  isUnavailable,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
  isUnavailable?: boolean;
}) {
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
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
      {isUnavailable && (
        <span title="Not available" className="ml-1 shrink-0 text-ui-fg-muted">
          <Lock className="h-3 w-3" />
        </span>
      )}
    </Link>
  );
}

