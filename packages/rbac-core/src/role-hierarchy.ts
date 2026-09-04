import type { RoleNode } from './types.js';

export class RoleHierarchy {
  private roles = new Map<string, RoleNode>();

  registerRole(role: RoleNode): void {
    this.roles.set(role.name, role);
  }

  registerRoles(roles: RoleNode[]): void {
    for (const r of roles) {
      this.registerRole(r);
    }
  }

  /**
   * Resolve all permissions for a given role, including inherited ones.
   */
  resolvePermissions(roleName: string, visited = new Set<string>()): string[] {
    if (visited.has(roleName)) return [];
    visited.add(roleName);

    const role = this.roles.get(roleName);
    if (!role) return [];

    const perms = new Set<string>(role.permissions);

    if (role.inherits && role.inherits.length > 0) {
      for (const parentRole of role.inherits) {
        const parentPerms = this.resolvePermissions(parentRole, visited);
        for (const p of parentPerms) {
          perms.add(p);
        }
      }
    }

    return Array.from(perms);
  }

  /**
   * Resolve permissions for multiple roles assigned to a user.
   */
  resolveUserPermissions(roleNames: string[]): string[] {
    const allPerms = new Set<string>();
    for (const role of roleNames) {
      const perms = this.resolvePermissions(role);
      for (const p of perms) {
        allPerms.add(p);
      }
    }
    return Array.from(allPerms);
  }
}
