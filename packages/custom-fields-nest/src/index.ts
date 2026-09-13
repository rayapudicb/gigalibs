/**
 * @gigalibs/custom-fields-nest
 *
 * NestJS integration for per-tenant custom field definitions.
 * Persists CustomFieldDefinition objects in gigalibs_ar.custom_field_definitions.
 *
 * Usage:
 *   CustomFieldsNestModule.forRoot({ pool: myPgPool, schema: 'gigalibs_ar' })
 *
 * @module
 */

export * from './custom-fields-nest.service.js';
export * from './custom-fields-nest.module.js';
