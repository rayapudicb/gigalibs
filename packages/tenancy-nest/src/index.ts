/**
 * @gigalibs/tenancy-nest
 *
 * Multi-tenancy NestJS module. Middleware for header/subdomain tenant context
 * extraction, @CurrentTenant() decorators, and tenant provisioning service.
 *
 * @module
 */

export * from './tenancy.module.js';
export * from './tenancy.service.js';
export * from './tenant-member-safety.js';
export * from './grant-bound.js';
export * from './guards/tenant-boundary.guard.js';
export * from './tenancy.controller.js';
export * from './middleware/tenant.middleware.js';
export * from './decorators/current-tenant.decorator.js';
export * from './decorators/allow-tenant-statuses.decorator.js';
export * from './decorators/require-platform-roles.decorator.js';
export * from './domain-verification.js';
export * from './guards/platform-authority.guard.js';
export * from './platform-administration.controller.js';
export * from './platform-administration.service.js';
export * from './platform-module-catalog.js';
export * from './organization.controller.js';
export * from './organization.service.js';
