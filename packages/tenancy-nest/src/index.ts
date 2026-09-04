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
export * from './guards/tenant-boundary.guard.js';
export * from './tenancy.controller.js';
export * from './middleware/tenant.middleware.js';
export * from './decorators/current-tenant.decorator.js';
export * from './decorators/allow-tenant-statuses.decorator.js';
