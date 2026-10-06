import { canonicalPermission, permissionParts } from './permission-match.js';
import { modulePermissionCatalogue } from './permission-catalogue.generated.js';

// WI-OI-120q (R1): the permissions the control plane itself checks (its route decorators and the web pages in front of
// them), written in the colon spelling. `permission-catalogue.test.ts` fails when a decorator names a code that is not
// here, so the list cannot drift. Module permissions come from `permission-catalogue.generated.ts`.
export const CONTROL_PLANE_PERMISSIONS = [
  'actions:approve',
  'actions:read',
  'ap:configure',
  'ap:evaluate',
  'ap:read',
  'audit:read',
  'configuration-apps:read',
  'configuration-apps:write',
  'configuration-runtime:read',
  'configuration-values:read',
  'configuration-values:update',
  'configuration:activate',
  'configuration:approve',
  'configuration:draft',
  'configuration:export',
  'configuration:import',
  'configuration:publish',
  'configuration:read',
  'configuration:rollback',
  'configuration:submit',
  'connections:create',
  'connections:credentials',
  'connections:profile',
  'connections:read',
  'connections:test',
  'contracts:create',
  'contracts:publish',
  'contracts:read',
  'events:ingest',
  'events:read',
  'exceptions:assign',
  'exceptions:read',
  'exceptions:recover',
  'exceptions:resolve',
  'invites:create',
  'invites:delete',
  'invites:read',
  'organization:activate',
  'organization:approve',
  'organization:draft',
  'organization:grant',
  'organization:read',
  'parties:archive',
  'parties:create',
  'parties:identifiers:manage',
  'parties:merge',
  'parties:read',
  'parties:update',
  'retention:manage',
  'retention:read',
  'roles:assign',
  'roles:create',
  'roles:delete',
  'roles:read',
  'roles:update',
  'runs:read',
  'settings:read',
  'settings:update',
  'tenant:export',
  'tenant:read',
  'tenant:update',
  'users:create',
  'users:delete',
  'users:read',
  'users:update',
  'value:configure',
  'value:read',
  'value:verify',
  'workflows:create',
  'workflows:execute',
  'workflows:publish',
  'workflows:read',
  'workflows:update',
] as const;

/**
 * Permissions no custom role may hold on its own: they are held only through a whole-area grant (`workforce:*`, which
 * workspace administrators have), because holding them alongside ordinary permissions reopens a path a review closed.
 * They are not offered, and saving a role that adds one is refused.
 */
export const NOT_DELEGABLE_PERMISSIONS: Readonly<Record<string, string>> = {
  // WI-OI-120n security review (High): with punch and timesheet approval, a login link lets a person link their own
  // login to a worker, punch as them and approve the week.
  'workforce:resources:link': 'Linking a person to a login stays with workspace administrators.',
};

export interface PermissionCatalogueEntry {
  /** As the owner writes it (modules keep their spelling; `cmms.work-orders.read` and `finance:journals:post`). */
  readonly code: string;
  /** The code's family, the part before the first separator. */
  readonly family: string;
  /** `control-plane`, or the catalogue entries whose module checks or grants it. */
  readonly owners: readonly string[];
}

/**
 * The spelling a role can store: as written when it uses one separator throughout; otherwise colons for up to three
 * parts and dots for four (the tenant permission grammar). Either spelling matches the same checks.
 */
function saveableSpelling(code: string): string {
  if (!(code.includes(':') && code.includes('.'))) return code;
  const parts = permissionParts(code)!;
  return parts.length <= 3 ? parts.join(':') : parts.join('.');
}

function catalogue(): readonly PermissionCatalogueEntry[] {
  const byCanonical = new Map<string, PermissionCatalogueEntry>();
  const add = (code: string, owners: readonly string[]) => {
    const canonical = canonicalPermission(code)!;
    const existing = byCanonical.get(canonical);
    const family = permissionParts(code)![0]!;
    byCanonical.set(canonical, {
      code: existing?.code ?? saveableSpelling(code),
      family,
      owners: [...new Set([...(existing?.owners ?? []), ...owners])].sort(),
    });
  };
  for (const code of CONTROL_PLANE_PERMISSIONS) add(code, ['control-plane']);
  for (const entry of modulePermissionCatalogue) add(entry.code, entry.entries);
  for (const code of Object.keys(NOT_DELEGABLE_PERMISSIONS)) byCanonical.delete(code);
  return Object.freeze([...byCanonical.values()].sort((a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code)));
}

/** Every permission a workspace role may hold: what some screen, route or service checks. */
export const PERMISSION_CATALOGUE: readonly PermissionCatalogueEntry[] = catalogue();

const cataloguedCodes = new Set(PERMISSION_CATALOGUE.map((entry) => canonicalPermission(entry.code)));
const cataloguedFamilies = new Set(PERMISSION_CATALOGUE.map((entry) => entry.family));

/**
 * The codes a role update adds that no screen or service checks. Codes the role already held are kept, in either
 * spelling, so a role saved before the catalogue can still be renamed or trimmed.
 */
export function uncataloguedAdditions(previous: readonly unknown[], next: readonly string[]): string[] {
  const held = new Set(previous.map((code) => canonicalPermission(code)).filter((code): code is string => code !== null));
  return next.filter((code) => {
    const canonical = canonicalPermission(code) ?? code;
    // A permission that is never delegable is refused even when the role held it before the list existed.
    if (canonical in NOT_DELEGABLE_PERMISSIONS) return true;
    return !isCataloguedPermission(code) && !held.has(canonical);
  });
}

/** A catalogued code in either spelling, or the wildcard of a catalogued family (`cmms:*`). */
export function isCataloguedPermission(code: unknown): boolean {
  const parts = permissionParts(code);
  if (!parts || parts.length === 1) return false;
  if (parts.length === 2 && parts[1] === '*') return cataloguedFamilies.has(parts[0]!);
  return cataloguedCodes.has(parts.join(':'));
}
