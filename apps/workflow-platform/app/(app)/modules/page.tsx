import { canOpenPlatformModule } from '@/lib/module-access';
import { verifiedSession } from '@/lib/verified-session';
import { cookies } from 'next/headers';
import { Translator } from '@gigalibs/i18n';
import {
  type PlatformModuleDefinition,
  platformModuleCatalog,
} from '@gigalibs/contracts';
import { Lock } from 'lucide-react';
import Link from 'next/link';

const moduleIcon: Readonly<Record<string, string>> = {
  settings: '◎',
  'personal-security': '◈',
  workflow: '↯',
  runs: '▷',
  exceptions: '!',
  approvals: '✓',
  value: '◇',
  'data-contracts': '{}',
  connections: '⌁',
  'invoice-match': '≋',
  'accounts-receivable': '$',
  spend: '▣',
  tax: '%',
  currency: '¤',
  recovery: '↺',
  rules: '⌘',
  'dynamic-forms': '✦',
  'connector-hub': '∞',
  'platform-control': '▦',
  marketplace: '◫',
  analytics: '⌁',
  cmms: '⚙',
  maps: '⌖',
  esign: '✎',
  scanner: '▤',
  ontology: '⬡',
  saga: '⇄',
  reports: '▥',
  solutions: '⬢',
  communications: '✉',
  gigaops: '⏱',
};

export default async function ModulesPage() {
  const session = await verifiedSession(false);
  const cookieStore = await cookies();
  const locale = cookieStore.get('gigalibs_locale')?.value || 'en-US';
  const translator = new Translator({ defaultLocale: locale });

  const context = session.context;
  const canOpen = (module: PlatformModuleDefinition) =>
    Boolean(context && canOpenPlatformModule(module, context));
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
                    {moduleIcon[module.iconKey] ?? '•'}
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
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  {module.area}
                </p>
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
