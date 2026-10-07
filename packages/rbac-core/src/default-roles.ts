import { BASE_ROLE_DEFINITIONS } from '@gigalibs/contracts';
import { RoleHierarchy } from './role-hierarchy.js';

// WI-OI-120x: the base roles are defined once in @gigalibs/contracts (BASE_ROLE_DEFINITIONS), shared with the web.
export function createDefaultRoleHierarchy(): RoleHierarchy {
  const hierarchy = new RoleHierarchy();
  hierarchy.registerRoles(
    BASE_ROLE_DEFINITIONS.map((role) => ({
      name: role.name,
      permissions: [...role.permissions],
      ...(role.inherits ? { inherits: [...role.inherits] } : {}),
    })),
  );
  return hierarchy;
}
