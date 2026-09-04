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
export * from './auth.controller.js';
export * from './guards/jwt-auth.guard.js';
export * from './decorators/current-user.decorator.js';
export * from './decorators/public.decorator.js';
