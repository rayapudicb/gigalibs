import { type DynamicModule, type FactoryProvider, Module, type ModuleMetadata } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  CustomFieldsNestService,
  CUSTOM_FIELDS_POOL,
  CUSTOM_FIELDS_SCHEMA,
} from './custom-fields-nest.service.js';

export interface CustomFieldsNestOptions {
  pool: Pool;
  schema?: string;
}

export interface CustomFieldsNestAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: FactoryProvider['inject'];
  useFactory: (...args: any[]) => Promise<CustomFieldsNestOptions> | CustomFieldsNestOptions;
}

@Module({})
export class CustomFieldsNestModule {
  static forRoot(options: CustomFieldsNestOptions): DynamicModule {
    return {
      module: CustomFieldsNestModule,
      providers: [
        { provide: CUSTOM_FIELDS_POOL, useValue: options.pool },
        { provide: CUSTOM_FIELDS_SCHEMA, useValue: options.schema ?? 'gigalibs_ar' },
        CustomFieldsNestService,
      ],
      exports: [CustomFieldsNestService],
    };
  }

  static forRootAsync(options: CustomFieldsNestAsyncOptions): DynamicModule {
    const optToken = Symbol.for('CUSTOM_FIELDS_OPTIONS');
    return {
      module: CustomFieldsNestModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: optToken,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        {
          provide: CUSTOM_FIELDS_POOL,
          inject: [optToken],
          useFactory: (opts: CustomFieldsNestOptions) => opts.pool,
        },
        {
          provide: CUSTOM_FIELDS_SCHEMA,
          inject: [optToken],
          useFactory: (opts: CustomFieldsNestOptions) => opts.schema ?? 'gigalibs_ar',
        },
        CustomFieldsNestService,
      ],
      exports: [CustomFieldsNestService],
    };
  }
}
