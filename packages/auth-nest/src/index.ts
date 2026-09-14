/**
 * @gigalibs/auth-nest
 *
 * NestJS Authentication module. Provides JWT guards, strategies,
 * decorators, and complete login/register/refresh/otp endpoints.
 *
 * @module
 */

export * from './auth.module.js';
export * from './auth.service.js';
export * from './oidc.service.js';
export * from './mfa-assisted-recovery.service.js';
export * from './oidc-network-policy.js';
export * from './auth.controller.js';
export * from './guards/jwt-auth.guard.js';
export * from './decorators/current-user.decorator.js';
export * from './decorators/allow-mfa-pending.decorator.js';
export * from './decorators/public.decorator.js';
