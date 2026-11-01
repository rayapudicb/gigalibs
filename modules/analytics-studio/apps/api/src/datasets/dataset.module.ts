import { Module } from '@nestjs/common';
import { DatasetService } from './dataset.service.js';
import { ModuleMeasureCompilerService } from './module-measure-compiler.service.js';
import { DatasetController } from './dataset.controller.js';
import { SemanticModelController } from './semantic-model.controller.js';
import { ModuleSourceCatalogController } from './module-source-catalog.controller.js';
import { SourceAccessModule } from '../auth/source-access.module.js';
import { SchemaDiscoveryModule } from '../schema-discovery/schema-discovery.module.js';

@Module({
  imports: [
    SourceAccessModule,
    // Provides SchemaDiscoveryService for field validation and mapping resolution
    SchemaDiscoveryModule,
  ],
  controllers: [DatasetController, SemanticModelController, ModuleSourceCatalogController],
  providers: [DatasetService, ModuleMeasureCompilerService],
  exports: [DatasetService, ModuleMeasureCompilerService],
})
export class DatasetModule {}
