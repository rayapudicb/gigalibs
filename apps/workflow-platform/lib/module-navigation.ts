import {
  generatedModuleMenus,
  generatedModulePersonas,
} from '@/lib/generated/module-navigation';
import { moduleIcons } from '@/lib/module-icons';
import type { PlatformContextPersona } from '@gigalibs/contracts';
import type { LucideIcon } from 'lucide-react';

// WI-OI-083c: sidebar sub-menus and persona lenses come from `menu` and `personas` of each catalogue entry's
// manifest; the shell holds no per-module navigation.

export interface ModuleMenuItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
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
    })),
  ]),
);

/** The entry's sidebar sub-menu, empty when its manifest declares none. */
export function moduleMenu(moduleKey: string): readonly ModuleMenuItem[] {
  return menus[moduleKey] ?? [];
}
