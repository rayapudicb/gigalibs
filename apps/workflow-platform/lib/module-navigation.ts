import {
  generatedModuleMenus,
  generatedModulePersonas,
} from '@/lib/generated/module-navigation';
import { moduleIcons } from '@/lib/module-icons';
import { type PlatformContextPersona, type PlatformModuleArea, platformModuleCatalog } from '@gigalibs/contracts';
import type { LucideIcon } from 'lucide-react';

// WI-OI-083c: sidebar sub-menus and persona lenses come from `menu` and `personas` of each catalogue entry's
// manifest; the shell holds no per-module navigation.

/** Daily sidebar and Home group order. `Settings` entries appear in the Settings sidebar instead (WI-OI-145). */
export const dailyGroupOrder: readonly PlatformModuleArea[] = [
  'Studio & Build',
  'Automate & Run',
  'Workforce & Operations',
  'Financial Operations',
  'Intelligence',
  'Data & Documents',
  'Platform',
];

export const groupLabels: Readonly<Record<PlatformModuleArea, string>> = {
  'Studio & Build': 'Studio & Build',
  'Automate & Run': 'Automate & Run',
  'Workforce & Operations': 'Operations',
  'Financial Operations': 'Finance',
  Intelligence: 'Intelligence',
  'Data & Documents': 'Data & Documents',
  Platform: 'Platform',
  Settings: 'Settings',
};

/**
 * Entries shown nowhere: Solution Packs is intentionally disabled (WI-OI-013); WI-OI-145 corrects the key, which was
 * the route segment `solutions` and so never hid it. Modules & plan only redirects to Settings, Plan & entitlements.
 */
export const hiddenModuleKeys: ReadonlySet<string> = new Set(['solution-packs', 'module-marketplace']);

/** Entries left out of the daily sidebar and Home: the profile is in the avatar menu and the Settings sidebar. */
export const dailyHiddenModuleKeys: ReadonlySet<string> = new Set([...hiddenModuleKeys, 'personal-security']);

export interface ModuleMenuItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly permissions?: readonly string[];
}

/** Platform Operators and Tenant Admins see every entry; other personas see the entries whose manifest lists them. */
export function personaSeesModule(persona: PlatformContextPersona, moduleKey: string): boolean {
  if (persona === 'PLATFORM_OPERATOR' || persona === 'TENANT_ADMIN') return true;
  return generatedModulePersonas[moduleKey]?.includes(persona) ?? false;
}

const menus: Readonly<Record<string, readonly ModuleMenuItem[]>> = Object.fromEntries(
  Object.entries(generatedModuleMenus).map(([moduleKey, items]) => [
    moduleKey,
    items.map((item) => ({
      key: item.key,
      label: item.label,
      href: item.path,
      icon: moduleIcons[item.icon],
      ...(item.permissions ? { permissions: item.permissions } : {}),
    })),
  ]),
);

/** The entry's sidebar sub-menu, empty when its manifest declares none. */
export function moduleMenu(moduleKey: string): readonly ModuleMenuItem[] {
  return menus[moduleKey] ?? [];
}

/** Whether the built solution has a catalogue entry at this route, so a cross-link to it cannot dead-end (WI-OI-083d). */
export function solutionHasRoute(route: string): boolean {
  return platformModuleCatalog.some((module) => module.route === route);
}
