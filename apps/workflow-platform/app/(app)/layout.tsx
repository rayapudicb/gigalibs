import AppSidebar from '@/components/AppSidebar';
import { UserNav } from '@/components/auth/UserNav';
import { OmnichannelSoftphoneDrawer } from '@/components/communications/OmnichannelSoftphoneDrawer';
import { StudioModeProvider, StudioModeToggle } from '@/components/configuration/StudioMode';
import { CurrencyLocaleProvider } from '@/components/currency/CurrencyLocaleContext';
import { GeospatialPlacesProvider } from '@/components/geospatial/GeospatialPlacesProvider';
import { AppI18nProvider } from '@/components/i18n/AppI18nProvider';
import { ModuleHeaderAndDrawer } from '@/components/navigation/ModuleHeaderAndDrawer';
import { verifiedSession } from '@/lib/verified-session';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type React from 'react';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response)
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
        <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Workspace access
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
            {session.response.status === 403
              ? 'This account cannot open the selected workspace'
              : 'The sign-in service is temporarily unavailable'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            {session.response.status === 403
              ? 'Choose another workspace or start a fresh sign-in. No workspace data has been loaded.'
              : 'Retry the workspace. If the service is still unavailable, start a fresh sign-in.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-medium">
            <Link
              className="rounded-lg bg-zinc-950 px-4 py-2.5 text-white"
              href={session.response.status === 403 ? '/select-tenant' : '/modules'}
            >
              {session.response.status === 403 ? 'Choose workspace' : 'Retry workspace'}
            </Link>
            <Link
              className="rounded-lg border border-zinc-200 px-4 py-2.5 text-zinc-700"
              href="/login"
            >
              Sign in again
            </Link>
          </div>
        </section>
      </main>
    );
  if (!session.context.tenant && session.context.platformRoles.length === 0)
    redirect('/select-tenant');
  const cookieStore = await cookies();
  const userLocale = cookieStore.get('gigalibs_locale')?.value;
  const initialLocale = userLocale || 'en-US';
  const canUseStudioMode =
    session.context.permissions.includes('*') ||
    session.context.permissions.includes('configuration:*') ||
    session.context.permissions.includes('configuration:draft');

  return (
    <AppI18nProvider initialLocale={initialLocale}>
      <StudioModeProvider
        canUseStudioMode={canUseStudioMode}
        currentUserId={session.context.user.id}
        permissions={session.context.permissions}
        tenantId={session.context.tenant?.id ?? ''}
        tenantName={session.context.tenant?.name ?? 'Platform administration'}
      >
        <div className="flex h-screen overflow-hidden bg-ui-bg-subtle text-ui-fg-base print:h-auto print:overflow-visible print:bg-white print:block">
          <aside className="print:hidden">
            <AppSidebar session={session.context} />
          </aside>
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:h-auto print:block">
            {/* Global Top Platform Header */}
            <header className="h-14 border-b border-ui-border-base bg-ui-bg-base px-6 flex items-center justify-between shrink-0 z-30 print:hidden">
              <ModuleHeaderAndDrawer />
              <div className="flex items-center gap-4">
                {canUseStudioMode ? <StudioModeToggle /> : null}
                <UserNav session={session.context} />
              </div>
            </header>

            <main
              className="flex-1 overflow-y-auto print:overflow-visible print:h-auto print:p-0"
              data-module-content-root
            >
              <CurrencyLocaleProvider>
                <GeospatialPlacesProvider>{children}</GeospatialPlacesProvider>
              </CurrencyLocaleProvider>
            </main>
          </div>
          <OmnichannelSoftphoneDrawer />
        </div>
      </StudioModeProvider>
    </AppI18nProvider>
  );
}
