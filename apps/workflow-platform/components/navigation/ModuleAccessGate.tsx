'use client';

import { platformModuleCatalog, type PlatformModuleDefinition } from '@gigalibs/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type React from 'react';
import { canOpenPlatformModule, type ModuleAccessContext } from '@/lib/module-access';

// WI-OI-120n (owner, 2026-10-06): a module the workspace has not bought is hidden from the menu (canOpenPlatformModule)
// and, when opened by link, says so instead of showing its screens to a workspace that cannot use them. The page
// itself is not mounted, so it makes no data calls. A module the workspace has but this person may not open says who
// to ask. The decision is the menu's own, so the menu and the pages always agree; each module's API still decides.

/** The catalogue entry whose route is the most specific match for this path; none for pages outside modules. */
export function moduleForPath(pathname: string, modules: readonly PlatformModuleDefinition[] = platformModuleCatalog): PlatformModuleDefinition | null {
  let best: PlatformModuleDefinition | null = null;
  for (const module of modules) {
    const route = module.route;
    if (!route || route === '/') continue;
    if (pathname !== route && !pathname.startsWith(`${route}/`)) continue;
    if (!best || route.length > best.route.length) best = module;
  }
  return best;
}

export function ModuleAccessGate({ access, children }: { access: ModuleAccessContext; children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const module = moduleForPath(pathname);
  if (!module || canOpenPlatformModule(module, access)) return <>{children}</>;
  const bought = Boolean(access.tenant?.features.includes(module.key));
  // WI-OI-120ak (S5b): a module that is not released (CONTAINED, or PLANNED outside the UAT preview) cannot be opened in
  // any workspace; saying "not in your plan" or "your role" would be untrue.
  const unreleased = module.readiness !== 'AVAILABLE' && module.readiness !== 'REVIEW';
  if (unreleased) {
    return (
      <section className="mx-auto max-w-xl p-8" aria-labelledby="module-access-title">
        <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-6">
          <h1 id="module-access-title" className="text-lg font-semibold text-ui-fg-base">
            {`${module.navigationLabel} is not available yet`}
          </h1>
          <p className="mt-2 text-sm text-ui-fg-subtle">
            This module is not released, so it cannot be opened in any workspace. It becomes available when it is.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link className="rounded-md border border-ui-border-base px-3 py-1.5 text-ui-fg-base hover:bg-ui-bg-base-hover" href="/modules">
              All modules
            </Link>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-xl p-8" aria-labelledby="module-access-title">
      <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-6">
        <h1 id="module-access-title" className="text-lg font-semibold text-ui-fg-base">
          {bought ? `You don't have access to ${module.navigationLabel}` : `${module.navigationLabel} is not in your plan`}
        </h1>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          {bought
            ? 'Your workspace has this module, but your role does not include it. Ask your workspace administrator for a role that does.'
            : 'Your workspace does not include this module. A workspace administrator can see what your plan includes and how to add modules.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {bought ? null : (
            <Link className="rounded-md bg-ui-button-inverted px-3 py-1.5 font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover" href="/settings?tab=plan">
              Plan & Entitlements
            </Link>
          )}
          <Link className="rounded-md border border-ui-border-base px-3 py-1.5 text-ui-fg-base hover:bg-ui-bg-base-hover" href="/modules">
            All modules
          </Link>
        </div>
      </div>
    </section>
  );
}
