import {
  type PlatformModuleDefinition,
  platformModuleCatalog,
} from '@gigalibs/contracts';

export interface ModuleAccessContext {
  readonly tenant: { readonly features: readonly string[] } | null;
  readonly permissions: readonly string[];
  readonly platformRoles: readonly string[];
}

export const tenantModulePermission: Readonly<Record<string, string>> = Object.fromEntries(
  platformModuleCatalog.flatMap((module) =>
    module.requiredPermission ? [[module.key, module.requiredPermission]] : [],
  ),
);

const platformInspectionPaths = new Set<string>(
  platformModuleCatalog.filter((module) => module.platformInspection).map((module) => module.route),
);

export function canInspectPlatformModule(path: string, platformRoles: readonly string[]): boolean {
  return platformRoles.length > 0 && platformInspectionPaths.has(path);
}

export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes('*') || granted.includes(required)) return true;
  // A resource wildcard covers `resource:action` and granular `resource.entity.action`
  // permissions alike (workforce:* → workforce.resources.read), matching the module APIs.
  const separator = required.search(/[:.]/);
  if (separator <= 0) return false;
  return granted.includes(`${required.slice(0, separator)}:*`);
}

// A frozen or planned entry is locked (ADR-0016 F6; WI-OI-102e/f): its APIs refuse as well as its screens, whatever
// the tenant's features and the user's permissions.
const lockedModuleKeys = new Set<string>(
  platformModuleCatalog
    .filter((module) => module.readiness === 'CONTAINED' || module.readiness === 'PLANNED')
    .map((module) => module.key),
);

export function canUseTenantModule(
  moduleKey: string,
  enabledModules: ReadonlySet<string>,
  permissions: readonly string[],
): boolean {
  const requiredPermission = tenantModulePermission[moduleKey];
  return (
    !lockedModuleKeys.has(moduleKey) &&
    enabledModules.has(moduleKey) &&
    typeof requiredPermission === 'string' &&
    hasPermission(permissions, requiredPermission)
  );
}

/**
 * Canonical navigation/access decision for a module entry.
 *
 * Platform authority grants access to the platform control plane and to an
 * explicitly declared inspection surface. It does not turn every tenant
 * module into an entitlement. Inspection still requires an active tenant
 * context so a global operator cannot open an unscoped tenant workload.
 */
export function canOpenPlatformModule(
  module: PlatformModuleDefinition,
  context: ModuleAccessContext,
): boolean {
  const hasPlatformAuthority = context.platformRoles.length > 0;
  if (module.key === 'platform-control') return hasPlatformAuthority;
  if (!context.tenant) return false;
  if (module.readiness !== 'AVAILABLE' && module.readiness !== 'REVIEW') return false;
  if (module.platformInspection && hasPlatformAuthority) return true;
  return canUseTenantModule(
    module.key,
    new Set(context.tenant.features),
    context.permissions,
  );
}

export function isNavigationPathActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

/**
 * Nested module routes can overlap (for example /connections and
 * /connections/oauth-studio). Only the most-specific visible module should
 * receive the primary active state.
 */
export function mostSpecificActiveModuleKey(
  modules: readonly PlatformModuleDefinition[],
  pathname: string,
): string | null {
  const matches = modules.filter((module) => isNavigationPathActive(pathname, module.route));
  matches.sort((left, right) => right.route.length - left.route.length);
  return matches[0]?.key ?? null;
}
