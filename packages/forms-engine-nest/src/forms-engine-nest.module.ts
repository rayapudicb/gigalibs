import { type DynamicModule, type FactoryProvider, Module, type ModuleMetadata } from '@nestjs/common';
import type { Pool } from 'pg';
import { FormDefinitionsController } from './form-definitions.controller.js';
import { FORMS_LOCKED_KEYS } from './form-definitions.controller.js';
import { FormDefinitionsService, FORMS_ENGINE_POOL, FORMS_ENGINE_SCHEMA } from './form-definitions.service.js';

export interface FormsEngineOptions {
  pool: Pool;
  schema?: string;
  lockedKeys?: ReadonlySet<string>;
  exposeController?: boolean;
}

export interface FormsEngineAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: FactoryProvider['inject'];
  useFactory: (...args: any[]) => Promise<FormsEngineOptions> | FormsEngineOptions;
  exposeController?: boolean;
}

@Module({})
export class FormsEngineNestModule {
  /** Synchronous registration — use when you already have a Pool reference. */
  static forRoot(options: FormsEngineOptions): DynamicModule {
    return FormsEngineNestModule._build(
      [
        { provide: FORMS_ENGINE_POOL, useValue: options.pool },
        { provide: FORMS_ENGINE_SCHEMA, useValue: options.schema ?? 'gigalibs_ar' },
        { provide: FORMS_LOCKED_KEYS, useValue: options.lockedKeys ?? new Set<string>() },
        FormDefinitionsService,
      ],
      options.exposeController,
    );
  }

  /**
   * Async registration — use when the Pool comes from the NestJS DI container
   * (e.g. from DatabaseService).
   *
   * @example
   *   FormsEngineNestModule.forRootAsync({
   *     inject: [DatabaseService],
   *     useFactory: (db: DatabaseService) => ({
   *       pool: db.pool,
   *       schema: 'gigalibs_ar',
   *       lockedKeys: new Set([...AR_RESERVED_KEYS]),
   *     }),
   *   })
   */
  static forRootAsync(options: FormsEngineAsyncOptions): DynamicModule {
    const providers = [
      {
        provide: Symbol.for('FORMS_ENGINE_OPTIONS'),
        inject: options.inject ?? [],
        useFactory: options.useFactory,
      },
      {
        provide: FORMS_ENGINE_POOL,
        inject: [Symbol.for('FORMS_ENGINE_OPTIONS')],
        useFactory: (opts: FormsEngineOptions) => opts.pool,
      },
      {
        provide: FORMS_ENGINE_SCHEMA,
        inject: [Symbol.for('FORMS_ENGINE_OPTIONS')],
        useFactory: (opts: FormsEngineOptions) => opts.schema ?? 'gigalibs_ar',
      },
      {
        provide: FORMS_LOCKED_KEYS,
        inject: [Symbol.for('FORMS_ENGINE_OPTIONS')],
        useFactory: (opts: FormsEngineOptions) => opts.lockedKeys ?? new Set<string>(),
      },
      FormDefinitionsService,
    ];

    return FormsEngineNestModule._build(providers, options.exposeController, options.imports);
  }

  private static _build(
    providers: any[],
    exposeController?: boolean,
    imports?: ModuleMetadata['imports'],
  ): DynamicModule {
    return {
      module: FormsEngineNestModule,
      imports: imports ?? [],
      providers,
      controllers: exposeController !== false ? [FormDefinitionsController] : [],
      exports: [FormDefinitionsService],
    };
  }
}
