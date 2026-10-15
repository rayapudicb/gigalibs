import {
  holdsPermission,
  type PlatformModuleDefinition,
  platformModuleCatalog,
} from '@gigalibs/contracts';
import { uatPreviewEnabled } from './uat-module-status';

export interface ModuleAccessContext {
  readonly tenant: { readonly features: readonly string[] } | null;
  readonly permissions: readonly string[];
  readonly platformRoles: readonly string[];
  /** UAT instance only. Client components pass the server's answer; server code may omit it. */
  readonly uatPreview?: boolean;
}

export interface ModuleAccessOptions {
  /** UAT instance only. When omitted, the server reads the deployment setting; in the browser it is false. */
  readonly uatPreview?: boolean;
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

/** The one permission rule (WI-OI-120q, `permissionMatches` in `@gigalibs/contracts`). */
export function hasPermission(granted: readonly string[], required: string): boolean {
  return holdsPermission(granted, required);
}

// A frozen or planned entry is locked (ADR-0016 F6; WI-OI-102e/f): its APIs refuse as well as its screens, whatever
// the tenant's features and the user's permissions. On the UAT instance (WI-OI-120a) the lock is lifted so testers
// can reach every module; readiness, entitlements and permissions still apply.
const lockedModuleKeys = new Set<string>(
  platformModuleCatalog
    .filter((module) => module.readiness === 'CONTAINED' || module.readiness === 'PLANNED')
    .map((module) => module.key),
);

export function isLockedModule(moduleKey: string): boolean {
  return lockedModuleKeys.has(moduleKey);
}

// WI-OI-120ak (S5, owner decision D1b): the UAT preview lifts the lock only for PLANNED modules (real modules on metadata,
// tested on UAT before release). CONTAINED modules are prototypes, many backed by invented data, and stay locked everywhere.
const containedModuleKeys = new Set<string>(
  platformModuleCatalog.filter((module) => module.readiness === 'CONTAINED').map((module) => module.key),
);

function previewActive(uatPreview: boolean | undefined): boolean {
  return uatPreview ?? uatPreviewEnabled();
}

export function canUseTenantModule(
  moduleKey: string,
  enabledModules: ReadonlySet<string>,
  permissions: readonly string[],
  options: ModuleAccessOptions = {},
): boolean {
  const requiredPermission = tenantModulePermission[moduleKey];
  return (
    (!lockedModuleKeys.has(moduleKey) || (!containedModuleKeys.has(moduleKey) && previewActive(options.uatPreview))) &&
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
  const uatPreview = previewActive(context.uatPreview);
  // D1b: the preview opens a PLANNED module; nothing opens a CONTAINED one, not even platform inspection.
  const openable =
    module.readiness === 'AVAILABLE' || module.readiness === 'REVIEW' || (uatPreview && module.readiness === 'PLANNED');
  if (!openable) return false;
  if (module.platformInspection && hasPlatformAuthority) return true;
  return canUseTenantModule(
    module.key,
    new Set(context.tenant.features),
    context.permissions,
    { uatPreview },
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
