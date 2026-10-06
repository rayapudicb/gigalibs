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

export interface PermissionCatalogueEntry {
  /** As the owner writes it (modules keep their spelling; `cmms.work-orders.read` and `finance:journals:post`). */
  readonly code: string;
  /** The code's family, the part before the first separator. */
  readonly family: string;
  /** `control-plane`, or the catalogue entries whose module checks or grants it. */
  readonly owners: readonly string[];
}

function catalogue(): readonly PermissionCatalogueEntry[] {
  const byCanonical = new Map<string, PermissionCatalogueEntry>();
  const add = (code: string, owners: readonly string[]) => {
    const canonical = canonicalPermission(code)!;
    const existing = byCanonical.get(canonical);
    const family = permissionParts(code)![0]!;
    byCanonical.set(canonical, {
      code: existing?.code ?? code,
      family,
      owners: [...new Set([...(existing?.owners ?? []), ...owners])].sort(),
    });
  };
  for (const code of CONTROL_PLANE_PERMISSIONS) add(code, ['control-plane']);
  for (const entry of modulePermissionCatalogue) add(entry.code, entry.entries);
  return Object.freeze([...byCanonical.values()].sort((a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code)));
}

/** Every permission a workspace role may hold: what some screen, route or service checks. */
export const PERMISSION_CATALOGUE: readonly PermissionCatalogueEntry[] = catalogue();

const cataloguedCodes = new Set(PERMISSION_CATALOGUE.map((entry) => canonicalPermission(entry.code)));
const cataloguedFamilies = new Set(PERMISSION_CATALOGUE.map((entry) => entry.family));

/** A catalogued code in either spelling, or the wildcard of a catalogued family (`cmms:*`). */
export function isCataloguedPermission(code: unknown): boolean {
  const parts = permissionParts(code);
  if (!parts || parts.length === 1) return false;
  if (parts.length === 2 && parts[1] === '*') return cataloguedFamilies.has(parts[0]!);
  return cataloguedCodes.has(parts.join(':'));
}
