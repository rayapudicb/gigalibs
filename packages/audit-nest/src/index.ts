/**
 * @gigalibs/audit-nest
 *
 * NestJS Audit module providing @Audited() interceptors,
 * async DB/Queue log persistence, and compliance search controllers.
 *
 * @module
 */

export * from './audit.module.js';
export * from './audit.service.js';
export * from './audit.controller.js';
export * from './decorators/audited.decorator.js';
export * from '@gigalibs/audit-core';
