import { generatedModuleMenus } from '@/lib/generated/module-navigation';
import { isNavigationPathActive } from '@/lib/module-access';
import { groupLabels } from '@/lib/module-navigation';
import { platformModuleCatalog } from '@gigalibs/contracts';

export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

// Shell pages outside the catalogue.
const SHELL_PAGES: Readonly<Record<string, readonly Crumb[]>> = {
  '/modules': [{ label: 'Home' }],
  '/dashboard': [{ label: 'Executive Control Tower' }],
  '/setup': [{ label: 'Settings' }, { label: 'Set-up guide' }],
};

/**
 * WI-OI-145 (S2): the top bar's trail, Group › Module › Screen, from the catalogue and its manifest menus only. So the
 * sidebar entry, the trail and the page title always use the same words; nothing here is written per module.
 */
export function breadcrumbFor(pathname: string): readonly Crumb[] {
  const shell = SHELL_PAGES[pathname];
  if (shell) return shell;
  const module = platformModuleCatalog
    .filter((entry) => entry.route !== '/' && isNavigationPathActive(pathname, entry.route))
    .sort((left, right) => right.route.length - left.route.length)[0];
  if (!module) return [];
  const crumbs: Crumb[] = [
    { label: groupLabels[module.navigationGroup] },
    { label: module.navigationLabel, href: module.route },
  ];
  // The screen whose route this is; a menu entry at the module's own route counts only on that route itself.
  const screen = (generatedModuleMenus[module.key] ?? [])
    .filter((item) => (item.path === module.route ? pathname === item.path : isNavigationPathActive(pathname, item.path)))
    .sort((left, right) => right.path.length - left.path.length)[0];
  if (screen) crumbs.push({ label: screen.label, href: screen.path });
  return crumbs;
}
