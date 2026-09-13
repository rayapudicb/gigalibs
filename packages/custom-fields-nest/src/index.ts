/**
 * @gigalibs/custom-fields-nest
 * NestJS dynamic module for per-tenant custom field definitions.
 * Persists field schemas to gigalibs_ar.custom_field_definitions (or the
 * schema supplied via options) and validates custom field values at runtime.
 *
 * TODO: full implementation. This is a stub that satisfies the module graph.
 */
import { DynamicModule, Module } from '@nestjs/common';
import type { Pool } from 'pg';

export interface CustomFieldsOptions {
  pool: Pool;
  /** Database schema that owns the custom_field_definitions table. */
  schema: string;
}

export type CustomFieldsAsyncOptions<Deps extends object[] = object[]> = {
  inject: { new (...args: never[]): Deps[number] }[];
  useFactory: (...deps: Deps) => CustomFieldsOptions;
};

@Module({})
export class CustomFieldsNestModule {
  static forRootAsync<Deps extends object[]>(
    _options: CustomFieldsAsyncOptions<Deps>,
  ): DynamicModule {
    return {
      module: CustomFieldsNestModule,
      global: true,
      controllers: [],
      providers: [],
      exports: [],
    };
  }
}
