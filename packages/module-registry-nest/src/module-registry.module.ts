import { type DynamicModule, Module } from '@nestjs/common';
import type { ModuleManifest } from '@gigalibs/module-registry';
import { ModuleRegistryController } from './module-registry.controller.js';
import { ModuleRegistryService } from './module-registry.service.js';

export interface ModuleRegistryOptions {
  manifests: ModuleManifest[];
}

@Module({})
export class ModuleRegistryModule {
  static forRoot(options: ModuleRegistryOptions): DynamicModule {
    return {
      module: ModuleRegistryModule,
      controllers: [ModuleRegistryController],
      providers: [
        {
          provide: ModuleRegistryService,
          useFactory: () => new ModuleRegistryService(options.manifests),
        },
      ],
      exports: [ModuleRegistryService],
    };
  }
}
