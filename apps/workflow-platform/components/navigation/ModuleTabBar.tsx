'use client';

import { moduleTabsFor } from '@/lib/module-tabs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** The id of the slot where a screen's buttons appear (filled by @gigalibs/web-sdk's ModulePage). */
export const MODULE_PAGE_ACTIONS_ID = 'module-page-actions';

/**
 * WI-OI-145 (owner, 2026-11-02): one horizontal bar of the module's screens under the top bar, underline style, the same
 * on every module, on one line that scrolls sideways. A screen's buttons sit beside its list's search, or at the bar's
 * right end when the screen has no list. Screens have no heading of their own: the breadcrumb and this bar name them.
 */
export function ModuleTabBar({ permissions }: { permissions: readonly string[] }) {
  const pathname = usePathname();
  const tabs = moduleTabsFor(pathname, permissions);
  const bar = useRef<HTMLElement>(null);
  // One line that scrolls sideways (owner, 2026-11-02: never two rows); the open screen is scrolled into view.
  useEffect(() => {
    bar.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  return (
    <div
      className="flex shrink-0 items-end justify-between gap-4 border-b border-ui-border-base bg-ui-bg-base px-6 print:hidden"
      data-module-tab-bar
    >
      <nav
        ref={bar}
        aria-label="Module screens"
        className="flex min-w-0 flex-nowrap overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
              tab.active
                ? 'border-ui-fg-interactive font-medium text-ui-fg-base'
                : 'border-transparent text-ui-fg-subtle hover:text-ui-fg-base'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div id={MODULE_PAGE_ACTIONS_ID} className="flex shrink-0 items-center gap-2 self-center py-1.5" />
    </div>
  );
}
