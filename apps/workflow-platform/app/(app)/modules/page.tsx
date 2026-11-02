import { canOpenPlatformModule } from '@/lib/module-access';
import { moduleIconGlyphs, moduleIcons } from '@/lib/module-icons';
import { dailyGroupOrder, dailyHiddenModuleKeys, groupLabels, personaSeesModule } from '@/lib/module-navigation';
import { MaturityBadge } from '@/components/modules/MaturityBadge';
import { determinePersona } from '@/lib/persona-utils';
import { verifiedSession } from '@/lib/verified-session';
import { cookies } from 'next/headers';
import { Translator } from '@gigalibs/i18n';
import {
  type PlatformModuleDefinition,
  platformModuleCatalog,
} from '@gigalibs/contracts';
import { Boxes, ChevronRight, Lock } from 'lucide-react';
import { ModulePage } from '@gigalibs/web-sdk';
import Link from 'next/link';

type CanOpen = (module: PlatformModuleDefinition) => boolean;

// WI-OI-145: Home, where everyone lands after signing in. It lists only the modules this person can open, grouped like
// the daily sidebar, without locks, maturity or readiness notes. Administrators reach their plan in Settings (Modules
// & plan); platform operators keep the full catalogue at ?view=catalogue.
export default async function ModulesPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const session = await verifiedSession(false);
  const cookieStore = await cookies();
  const locale = cookieStore.get('gigalibs_locale')?.value || 'en-US';
  const translator = new Translator({ defaultLocale: locale });

  const context = session.context;
  const canOpen: CanOpen = (module) => Boolean(context && canOpenPlatformModule(module, context));
  const platformOperator = Boolean(context && context.platformRoles.length > 0);
  const { view } = await searchParams;
  if (view === 'catalogue' && platformOperator) return <Catalogue translator={translator} canOpen={canOpen} />;

  const persona = context ? determinePersona(context.roles, context.platformRoles, context.permissions) : null;
  const mine = platformModuleCatalog.filter(
    (module) =>
      persona !== null &&
      module.navigationGroup !== 'Settings' &&
      !dailyHiddenModuleKeys.has(module.key) &&
      personaSeesModule(persona, module.key) &&
      canOpen(module),
  );
  const groups = dailyGroupOrder
    .map((group) => ({ group, modules: mine.filter((module) => module.navigationGroup === group) }))
    .filter(({ modules }) => modules.length > 0);
  const marketplace = platformModuleCatalog.find((module) => module.key === 'module-marketplace');
  const showPlan = Boolean(marketplace && canOpen(marketplace));
  const tenantName = context?.tenant?.name;
  const secondary =
    'inline-flex items-center rounded-md bg-ui-bg-base px-3 py-1.5 text-xs font-medium text-ui-fg-base shadow-borders-base transition-colors hover:bg-ui-bg-base-hover';

  return (
    <ModulePage
      title="Home"
      description={tenantName ? `Your modules in ${tenantName}` : 'Your modules'}
      actions={
        showPlan || platformOperator ? (
          <>
            {showPlan ? <Link href="/settings/plan" className={secondary}>Modules &amp; plan</Link> : null}
            {platformOperator ? <Link href="/modules?view=catalogue" className={secondary}>Full catalogue</Link> : null}
          </>
        ) : null
      }
    >
      {groups.length === 0 ? (
        <div className="rounded-lg bg-ui-bg-base p-8 text-center shadow-borders-base">
          <p className="text-sm font-medium text-ui-fg-base">No modules are open to you yet</p>
          <p className="mt-1 text-sm text-ui-fg-subtle">Ask your workspace administrator to give you a role.</p>
        </div>
      ) : (
        groups.map(({ group, modules }) => (
          <section key={group} aria-labelledby={`home-${group}`} className="flex flex-col gap-2">
            <h2 id={`home-${group}`} className="text-xs font-medium text-ui-fg-muted">{groupLabels[group]}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module) => {
                const Icon = moduleIcons[module.iconKey] ?? Boxes;
                return (
                  <Link
                    key={module.key}
                    href={module.route}
                    className="group flex items-center gap-3 rounded-lg bg-ui-bg-base p-4 shadow-borders-base transition-colors hover:bg-ui-bg-base-hover"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ui-bg-subtle">
                      <Icon className="h-4 w-4 text-ui-fg-subtle" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ui-fg-base">
                      {module.navigationLabel}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ui-fg-muted group-hover:text-ui-fg-subtle" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </ModulePage>
  );
}

/** The full catalogue with readiness and maturity, for platform operators (the page before WI-OI-145). */
function Catalogue({ translator, canOpen }: { translator: Translator; canOpen: CanOpen }) {
  const enabledForSession = platformModuleCatalog.filter(canOpen).length;

  return (
    <div className="min-h-full bg-[#f7f8fa] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-5 border-b border-zinc-200 pb-7 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
              {translator.t('modules.title')}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-zinc-950">
              {translator.t('navigation.modules')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              {translator.t('modules.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Metric value={platformModuleCatalog.length} label={translator.t('navigation.allModules')} />
            <Metric value={enabledForSession} label={translator.t('modules.activeCapabilities')} color="violet" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {platformModuleCatalog.map((module) => {
            const open = canOpen(module);
            const card = (
              <div key={`${module.key}-content`} className="contents">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 font-mono text-base font-semibold text-white">
                    {moduleIconGlyphs[module.iconKey] ?? '•'}
                  </span>
                  {!open && (
                    <span
                      title="Not available"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-400"
                    >
                      <Lock className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    {module.area}
                  </p>
                  <MaturityBadge maturity={module.maturity} />
                </div>
                <h2 className="mt-1 text-base font-semibold text-zinc-900 group-hover:text-blue-700">
                  {module.name}
                </h2>
                <p className="mt-2 min-h-10 text-sm leading-5 text-zinc-500">{module.reason}</p>
                <p
                  className={`mt-4 text-xs font-medium ${open ? 'text-zinc-700' : 'text-zinc-400'}`}
                >
                  {open ? 'Open capability →' : 'Not available'}
                </p>
              </div>
            );
            return open ? (
              <Link
                key={module.key}
                href={module.route}
                className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.035)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_16px_45px_rgba(37,99,235,0.08)]"
              >
                {card}
              </Link>
            ) : (
              <div
                key={module.key}
                aria-disabled="true"
                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 opacity-80"
              >
                {card}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({
  value,
  label,
  color = 'zinc',
}: {
  value: number;
  label: string;
  color?: 'zinc' | 'emerald' | 'blue' | 'violet';
}) {
  const styles = {
    zinc: 'border-zinc-200 bg-white text-zinc-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${styles[color]}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}
