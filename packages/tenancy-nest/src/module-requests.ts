/**
 * WI-OI-147 (QA-035): a workspace administrator asks for a module the workspace does not have, and a platform operator
 * sees the request on the workspace. A request is an append-only audit entry (resource `tenant-module-request`, the
 * module key as resource id); it is open while the module is not enabled, so enabling the module answers it.
 */
export const MODULE_REQUEST_RESOURCE = 'tenant-module-request';

export interface ModuleRequestAuditRow {
  readonly resourceId: string | null;
  readonly createdAt: Date;
  readonly user: { readonly email: string; readonly name: string | null } | null;
}

export interface OpenModuleRequest {
  readonly moduleKey: string;
  readonly requestedAt: string;
  readonly requestedBy: string | null;
}

/** The latest request per module, for modules that are still not enabled; newest first. */
export function openModuleRequests(
  rows: readonly ModuleRequestAuditRow[],
  enabledModuleKeys: Iterable<string>,
): OpenModuleRequest[] {
  const enabled = new Set(enabledModuleKeys);
  const seen = new Set<string>();
  const open: OpenModuleRequest[] = [];
  for (const row of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const moduleKey = row.resourceId;
    if (!moduleKey || seen.has(moduleKey) || enabled.has(moduleKey)) continue;
    seen.add(moduleKey);
    open.push({
      moduleKey,
      requestedAt: row.createdAt.toISOString(),
      requestedBy: row.user ? row.user.name?.trim() || row.user.email : null,
    });
  }
  return open;
}
