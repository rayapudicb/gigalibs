import type { PlatformContextPersona } from '@gigalibs/contracts';

/**
 * Pure, browser-safe persona resolution.
 * Takes role strings and platform role strings and determines the appropriate persona lens.
 */
export function determinePersona(
  roles: string[],
  platformRoles: string[],
): PlatformContextPersona {
  const upperPlatformRoles = new Set(platformRoles.map((r) => r.toUpperCase()));
  if (
    upperPlatformRoles.has('PLATFORM_OWNER') ||
    upperPlatformRoles.has('PLATFORM_ADMIN') ||
    upperPlatformRoles.has('PLATFORM_OPERATOR') ||
    upperPlatformRoles.has('PLATFORM_AUDITOR') ||
    upperPlatformRoles.has('PLATFORM_SUPPORT')
  ) {
    return 'PLATFORM_OPERATOR';
  }

  const upperRoles = new Set(roles.map((r) => r.toUpperCase()));
  if (
    upperRoles.has('OWNER') ||
    upperRoles.has('C_LEVEL') ||
    upperRoles.has('EXECUTIVE') ||
    upperRoles.has('CEO') ||
    upperRoles.has('CFO') ||
    upperRoles.has('CTO') ||
    upperRoles.has('COO')
  ) {
    return 'C_LEVEL';
  }

  if (
    upperRoles.has('SUPER_ADMIN') ||
    upperRoles.has('ADMIN') ||
    upperRoles.has('TENANT_ADMIN')
  ) {
    return 'TENANT_ADMIN';
  }

  if (
    upperRoles.has('SUPERVISOR') ||
    upperRoles.has('MANAGER') ||
    upperRoles.has('DISPATCHER') ||
    upperRoles.has('OPERATIONS_SUPERVISOR')
  ) {
    return 'OPERATIONS_SUPERVISOR';
  }

  if (
    upperRoles.has('WORKFORCE_MEMBER') ||
    upperRoles.has('MEMBER') ||
    upperRoles.has('WORKER') ||
    upperRoles.has('OPERATOR') ||
    upperRoles.has('TECHNICIAN')
  ) {
    return 'WORKFORCE_MEMBER';
  }

  return 'CUSTOMER_GUEST';
}
