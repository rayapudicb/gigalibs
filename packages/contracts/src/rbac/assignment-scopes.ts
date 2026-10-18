import { modulePermissionCatalogue } from './permission-catalogue.generated.js';
import { holdsPermission } from './permission-match.js';

// WI-OI-120w (R2 slice 2b, ADR-0034 §6): a role may be held at an explicit scope. Until a module decides access per
// assignment (its R5 card adds it below), a member may not hold that module's permissions at two different scopes: the
// module still reads one organization and one place scope per request, and two scopes cannot be expressed in them
// without widening one assignment by the other's scope.

/** The modules that decide access per assignment through `scopeFor` (each R5 card adds its module key). */
export const PER_ASSIGNMENT_SCOPE_MODULES: readonly string[] = ['asset-maintenance'];

/** An assignment as the rule sees it: what it grants and a key naming where (`assignmentScopeKey`). */
export interface ScopedGrant {
  readonly permissions: readonly string[];
  readonly scopeKey: string;
}

/** One stable key per scope: `MEMBER`, `WORKSPACE`, `UNITS:<sorted ids>` or `PLACES:<sorted ids>`. */
export function assignmentScopeKey(scope: {
  readonly kind: 'MEMBER' | 'WORKSPACE' | 'TENANT' | 'UNITS' | 'PLACES';
  readonly unitIds?: readonly string[];
  readonly placeIds?: readonly string[];
}): string {
  if (scope.kind === 'UNITS') return `UNITS:${[...new Set(scope.unitIds ?? [])].sort().join(',')}`;
  if (scope.kind === 'PLACES') return `PLACES:${[...new Set(scope.placeIds ?? [])].sort().join(',')}`;
  return scope.kind === 'TENANT' ? 'WORKSPACE' : scope.kind;
}

const CODES_BY_MODULE: ReadonlyMap<string, readonly string[]> = (() => {
  const byModule = new Map<string, string[]>();
  for (const entry of modulePermissionCatalogue)
    for (const owner of entry.entries) if (owner !== 'platform') (byModule.get(owner) ?? byModule.set(owner, []).get(owner)!).push(entry.code);
  return byModule;
})();

/** The permission codes a module checks (its routes, guards and windows), from the generated catalogue. */
export function moduleCheckedCodes(moduleKey: string): readonly string[] {
  return CODES_BY_MODULE.get(moduleKey) ?? [];
}

/** Whether `permissions` grant any code `moduleKey` checks. */
export function grantsModule(permissions: readonly string[], moduleKey: string): boolean {
  return moduleCheckedCodes(moduleKey).some((code) => holdsPermission(permissions, code));
}

/**
 * The modules (not yet deciding per assignment) whose permissions these assignments grant at more than one scope.
 * Empty when the combination is allowed.
 */
export function assignmentScopeConflicts(grants: readonly ScopedGrant[]): string[] {
  const conflicts: string[] = [];
  for (const moduleKey of [...CODES_BY_MODULE.keys()].sort()) {
    if (PER_ASSIGNMENT_SCOPE_MODULES.includes(moduleKey)) continue;
    const scopes = new Set(grants.filter((grant) => grantsModule(grant.permissions, moduleKey)).map((grant) => grant.scopeKey));
    if (scopes.size > 1) conflicts.push(moduleKey);
  }
  return conflicts;
}

/**
 * The one scope at which `grants` give `moduleKey`'s permissions: the index of an assignment holding it, null when none
 * does, or `CONFLICT` when they do at several scopes (never expected: the rule refuses it; callers fail closed).
 */
export function moduleGrantScope(grants: readonly ScopedGrant[], moduleKey: string): number | null | 'CONFLICT' {
  let found: number | null = null;
  for (const [index, grant] of grants.entries()) {
    if (!grantsModule(grant.permissions, moduleKey)) continue;
    if (found === null) found = index;
    else if (grants[found]!.scopeKey !== grant.scopeKey) return 'CONFLICT';
  }
  return found;
}

/** Which dimensions a module limits its records by, from the claims it receives (proven by its R5 card). */
export interface ScopeEnforcement {
  readonly units: boolean;
  readonly places: boolean;
}

/**
 * WI-OI-120w (Security review of slice 2b, H1 and H2): the modules proven to limit their records by the units or places
 * of the claims they receive, keyed as the permission catalogue files their codes. Empty: no module is proven yet, so a
 * role cannot be given at units or places. Each module's R5 card adds its entry, with the test that its minted context
 * key covers the codes its API checks.
 */
export const SCOPE_ENFORCING_MODULES: Readonly<Record<string, ScopeEnforcement>> = {
  'asset-maintenance': { units: true, places: true },
};

/**
 * Why `permissions` cannot be limited to units or places, or null when they can. A code checked by the platform (which
 * has no units or places), or by any module not proven to enforce that dimension, would act everywhere while the screen
 * said otherwise, so the scope is refused.
 */
export function explicitScopeRefusal(
  permissions: readonly string[],
  dimension: keyof ScopeEnforcement,
  enforcing: Readonly<Record<string, ScopeEnforcement>> = SCOPE_ENFORCING_MODULES,
): { readonly code: string; readonly owners: readonly string[] } | null {
  for (const entry of modulePermissionCatalogue) {
    if (!holdsPermission(permissions, entry.code)) continue;
    if (entry.entries.some((owner) => owner === 'platform' || !enforcing[owner]?.[dimension])) return { code: entry.code, owners: entry.entries };
  }
  // An allow-list, not a deny-list (re-check of 2b): a code the catalogue does not know is checked by nothing proven.
  for (const code of permissions)
    if (!modulePermissionCatalogue.some((entry) => holdsPermission([code], entry.code))) return { code, owners: [] };
  return null;
}
