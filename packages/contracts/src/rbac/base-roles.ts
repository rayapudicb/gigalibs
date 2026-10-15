// WI-OI-120x: the base roles and their permissions, the one definition shared by the control plane (rbac-core builds
// its role hierarchy from it) and the web (which offers only the base roles a member may give). A base role holds its
// own permissions and those of the roles it inherits. GUEST is a base role with none.
import { holdsPermission } from './permission-match.js';

export interface BaseRoleDefinition {
  readonly name: string;
  readonly permissions: readonly string[];
  readonly inherits?: readonly string[];
}

export const BASE_ROLE_DEFINITIONS: readonly BaseRoleDefinition[] = [
  { name: 'SUPER_ADMIN', permissions: ['*'] },
  {
    name: 'TENANT_ADMIN',
    permissions: [
      'tenant:*',
      'users:*',
      'billing:*',
      'roles:*',
      'invites:*',
      'settings:*',
      'audit:*',
      'workflows:*',
      'runs:*',
      'connections:*',
      'contracts:*',
      'events:*',
      'ap:*',
      'ar:*',
      'spend:*',
      'currency:*',
      'recovery:*',
      'analytics:*',
      'esign:*',
      'reports:*',
      'tax:*',
      'actions:*',
      'exceptions:*',
      'value:*',
      'retention:*',
      'profile:*',
      'communications:*',
      'configuration:*',
      'configuration-apps:*',
      'configuration-runtime:*',
      'configuration-values:*',
      // WI-OI-109 (ADR-0018): Tenant Admins hold every organization permission; a steward is a custom role.
      'organization:*',
      'workforce:*',
      'maps:*',
      // WI-OI-038: Tenant Admins run the CMMS core (assets, work orders, PM, meters, parts); custom maintenance
      // roles for managers and technicians follow with custom roles (roadmap P1).
      'cmms:*',
      // WI-OI-120 (owner, 2026-10-05): module access is by role. Tenant Admins run every licensed ERP module and the
      // core parties they trade with; the module's entitlement still gates it, and other members get the module's
      // own roles (Inventory Operator, Product Catalogue Manager, ...). Where a module enforces maker-checker (Catalogue
      // versions, Inventory adjustments) an admin still cannot approve their own change.
      'parties:*',
      'products:*',
      'product-categories:*',
      'uoms:*',
      'catalogues:*',
      'pricing:*',
      'inventory:*',
      'procurement:*',
      'orders:*',
      'finance:*',
    ],
  },
  {
    name: 'MANAGER',
    permissions: [
      'users:read',
      'reports:*',
      'workflows:*',
      'runs:read',
      'comments:*',
      'connections:read',
      'connections:test',
      'connections:profile',
      'contracts:read',
      'events:read',
      'ap:read',
      'ap:evaluate',
      'ar:read',
      'spend:read',
      'spend:approve',
      'currency:read',
      'currency:convert',
      'recovery:read',
      'recovery:action',
      'analytics:read',
      'communications:read',
      'communications:action',
      'analytics:action',
      'esign:read',
      'esign:sign',
      'esign:create',
      'tax:read',
      'actions:read',
      'actions:approve',
      'exceptions:read',
      'exceptions:assign',
      'exceptions:recover',
      'exceptions:resolve',
      'value:read',
      'value:verify',
      'retention:read',
      'configuration:read',
      'configuration-apps:read',
      'configuration-runtime:read',
    ],
    inherits: ['MEMBER'],
  },
  {
    name: 'MEMBER',
    permissions: ['users:read', 'chat:*', 'comments:create', 'profile:*'],
    inherits: ['VIEWER'],
  },
  { name: 'VIEWER', permissions: ['dashboard:read', 'content:read', 'profile:*', 'configuration-runtime:read'] },
];

const BY_NAME = new Map(BASE_ROLE_DEFINITIONS.map((role) => [role.name, role]));

/** A base role's permissions, with those it inherits. An unknown name, and GUEST, hold none. */
export function baseRolePermissions(role: string, visited: Set<string> = new Set()): string[] {
  const definition = BY_NAME.get(role);
  if (!definition || visited.has(role)) return [];
  visited.add(role);
  const permissions = new Set(definition.permissions);
  for (const parent of definition.inherits ?? []) for (const code of baseRolePermissions(parent, visited)) permissions.add(code);
  return [...permissions];
}

/**
 * The permissions that moving a member from `current` (null: not yet a member) to `next` adds: those of `next` that
 * `current` does not cover. Lowering a role adds none.
 */
export function baseRoleAdditions(current: string | null, next: string): string[] {
  const held = current === null ? [] : baseRolePermissions(current);
  return baseRolePermissions(next).filter((code) => !holdsPermission(held, code));
}
