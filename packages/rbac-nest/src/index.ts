/**
 * @gigalibs/rbac-nest
 *
 * NestJS RBAC module with @RequirePermissions() decorators,
 * guards, role hierarchy management, and permission seeders.
 *
 * @module
 */

export * from './rbac.module.js';
export * from './rbac.service.js';
export * from './guards/rbac.guard.js';
export * from './decorators/require-permissions.decorator.js';
export * from './decorators/require-roles.decorator.js';
