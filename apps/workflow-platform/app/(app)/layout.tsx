import AppSidebar from '@/components/AppSidebar';
import { UserNav } from '@/components/auth/UserNav';
import { StudioModeProvider, StudioModeToggle } from '@/components/configuration/StudioMode';
import { CurrencyLocaleProvider } from '@/components/currency/CurrencyLocaleContext';
import { GeospatialPlacesProvider } from '@/components/geospatial/GeospatialPlacesProvider';
import { AppI18nProvider } from '@/components/i18n/AppI18nProvider';
import { ModuleAccessGate } from '@/components/navigation/ModuleAccessGate';
import { ModuleHeaderAndDrawer } from '@/components/navigation/ModuleHeaderAndDrawer';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { uatPreviewEnabled } from '@/lib/uat-module-status';
import { verifiedSession } from '@/lib/verified-session';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type React from 'react';
import { holdsAnyPermission } from '@gigalibs/contracts';

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
  const canUseStudioMode = holdsAnyPermission(session.context.permissions, ['configuration:draft']);
  // UAT instance only (WI-OI-120a): every module is listed. The owner removed the UAT labels on 2026-10-05 (WI-OI-120b).
  const uatPreview = uatPreviewEnabled();
  // WI-OI-120n: what this person may open, for the page gate (the same decision as the menu's).
  const access = {
    tenant: session.context.tenant ? { features: [...(session.context.tenant.features ?? [])] } : null,
    permissions: [...session.context.permissions],
    platformRoles: [...session.context.platformRoles],
    uatPreview,
  };
  // WI-OI-120n: the shell asks Currency for rates and preferences only when the workspace has it and the person may read
  // it (a trial workspace otherwise sent two refused calls from every page). WI-OI-120ak (S5b): and only while the module
  // may be used at all; Currency is CONTAINED, so it stays locked even on UAT.
  const currencyEnabled =
    canUseTenantModule('multi-currency', new Set(session.context.tenant?.features ?? []), session.context.permissions, { uatPreview }) &&
    hasPermission(session.context.permissions, 'currency:read');

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
            <AppSidebar session={session.context} uatPreview={uatPreview} />
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
              className="flex-1 overflow-y-auto pb-24 print:overflow-visible print:h-auto print:p-0 print:pb-0"
              data-module-content-root
            >
              <CurrencyLocaleProvider enabled={currencyEnabled}>
                <GeospatialPlacesProvider>
                  <ModuleAccessGate access={access}>{children}</ModuleAccessGate>
                </GeospatialPlacesProvider>
              </CurrencyLocaleProvider>
            </main>
          </div>
          {/* WI-OI-120ak (S4, owner decision D4a): the Softphone & WhatsApp button is off every page until Communications is
              connected; it showed an invented chat. */}
        </div>
      </StudioModeProvider>
    </AppI18nProvider>
  );
}
