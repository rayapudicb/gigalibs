/**
 * @gigalibs/forms-engine-nest
 *
 * NestJS integration for the universal runtime form system.
 *
 * Usage in a NestJS app module:
 *
 *   FormsEngineNestModule.forRoot({
 *     pool: myPgPool,
 *     schema: 'gigalibs_ar',
 *     lockedKeys: new Set(['invoice-number', 'customer-id', ...]),
 *   })
 *
 * REST endpoints registered when exposeController !== false:
 *   GET  /forms             — list all published platform form keys
 *   GET  /forms/:key        — get effective definition (merged platform+tenant)
 *   GET  /forms/:key/draft  — get draft for Form Builder UI
 *   PUT  /forms/:key        — save draft
 *   POST /forms/:key/publish — publish draft → live for all users instantly
 *
 * @module
 */

export * from './types.js';
export * from './form-definitions.service.js';
export * from './form-definitions.controller.js';
export * from './forms-engine-nest.module.js';
