import { UserNav } from '@/components/auth/UserNav';
import { CurrencyLocaleProvider } from '@/components/currency/CurrencyLocaleContext';
import { AppI18nProvider } from '@/components/i18n/AppI18nProvider';
import { hasPermission } from '@/lib/module-access';
import { verifiedSession } from '@/lib/verified-session';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type React from 'react';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response) redirect('/modules');
  if (!session.context.tenant) redirect('/select-tenant');

  const cookieStore = await cookies();
  const initialLocale = cookieStore.get('gigalibs_locale')?.value || 'en-US';

  return (
    <AppI18nProvider initialLocale={initialLocale}>
      <div className="flex h-screen flex-col overflow-hidden bg-ui-bg-subtle text-ui-fg-base">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-amber-300 bg-ui-bg-base px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/modules"
              className="rounded-md border border-ui-border-base px-2.5 py-1.5 text-xs font-medium text-ui-fg-subtle hover:bg-ui-bg-subtle"
            >
              Exit Studio
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">GigaLibs Configuration Studio</p>
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-amber-700">
                Isolated authoring mode · {session.context.tenant.name}
              </p>
            </div>
          </div>
          <UserNav session={session.context} />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto" data-module-content-root>
          {/* WI-OI-120n: Currency is asked only when the workspace has it and the person may read it. */}
          <CurrencyLocaleProvider
            enabled={Boolean(session.context.tenant.features?.includes('multi-currency')) && hasPermission(session.context.permissions, 'currency:read')}
          >
            {children}
          </CurrencyLocaleProvider>
        </main>
      </div>
    </AppI18nProvider>
  );
}
