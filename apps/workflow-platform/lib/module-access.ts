import { platformModuleCatalog } from '@gigalibs/contracts';

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
  const separator = required.indexOf(':');
  if (separator <= 0) return false;
  return granted.includes(`${required.slice(0, separator)}:*`);
}

export function canUseTenantModule(
  moduleKey: string,
  enabledModules: ReadonlySet<string>,
  permissions: readonly string[],
): boolean {
  const requiredPermission = tenantModulePermission[moduleKey];
  return (
    enabledModules.has(moduleKey) &&
    typeof requiredPermission === 'string' &&
    hasPermission(permissions, requiredPermission)
  );
}
