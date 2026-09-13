/**
 * @gigalibs/forms-engine-nest
 * NestJS dynamic module for the universal runtime form definitions engine.
 * Exposes form schema CRUD endpoints and caches compiled schemas per tenant.
 *
 * TODO: full implementation backed by gigalibs_ar.form_definitions table.
 * This is a stub that satisfies the module graph while the feature is built out.
 */
import { DynamicModule, Module } from '@nestjs/common';
import type { Pool } from 'pg';

export interface FormsEngineOptions {
  pool: Pool;
  /** Database schema that owns the form_definitions table. */
  schema: string;
  /** Field keys that tenants may never remove or retype. */
  lockedKeys?: ReadonlySet<string>;
}

export type FormsEngineAsyncOptions<Deps extends object[] = object[]> = {
  inject: { new (...args: never[]): Deps[number] }[];
  useFactory: (...deps: Deps) => FormsEngineOptions;
};

@Module({})
export class FormsEngineNestModule {
  static forRootAsync<Deps extends object[]>(
    _options: FormsEngineAsyncOptions<Deps>,
  ): DynamicModule {
    return {
      module: FormsEngineNestModule,
      global: true,
      controllers: [],
      providers: [],
      exports: [],
    };
  }
}
