import { generatedModuleMenus } from '@/lib/generated/module-navigation';
import { isNavigationPathActive } from '@/lib/module-access';
import { holdsPermission, platformModuleCatalog } from '@gigalibs/contracts';

export interface ModuleTab {
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
}

// Shell pages outside the catalogue: one tab each, so every page has the same bar.
const SHELL_PAGES: Readonly<Record<string, string>> = {
  '/modules': 'Home',
  '/dashboard': 'Executive Control Tower',
  '/setup': 'Set-up guide',
};

/**
 * WI-OI-145 (owner, 2026-11-02): the horizontal screen tabs under the top bar, the same on every module. They are the
 * module's manifest menu (the sidebar's sub-entries) filtered by the person's permissions; a module with one screen
 * shows one tab with its name. Nothing here is written per module.
 */
export function moduleTabsFor(pathname: string, permissions: readonly string[]): readonly ModuleTab[] {
  const shell = SHELL_PAGES[pathname];
  if (shell) return [{ label: shell, href: pathname, active: true }];
  const module = platformModuleCatalog
    .filter((entry) => entry.route !== '/' && isNavigationPathActive(pathname, entry.route))
    .sort((left, right) => right.route.length - left.route.length)[0];
  if (!module) return [];
  const items = (generatedModuleMenus[module.key] ?? []).filter(
    (item) => !item.permissions?.length || item.permissions.every((code) => holdsPermission(permissions, code)),
  );
  if (items.length === 0) return [{ label: module.navigationLabel, href: module.route, active: true }];
  // The active screen: the most specific entry whose route this is; an entry at the module's own route counts only on
  // that route, and on the module's route itself the first entry is active when none matches it exactly.
  const active =
    items
      .filter((item) => (item.path === module.route ? pathname === item.path : isNavigationPathActive(pathname, item.path)))
      .sort((left, right) => right.path.length - left.path.length)[0] ??
    (pathname === module.route ? items[0] : undefined);
  return items.map((item) => ({ label: item.label, href: item.path, active: item === active }));
}
