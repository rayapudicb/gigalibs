import { Module } from '@nestjs/common';
import { DatasetService } from './dataset.service.js';
import { DatasetController } from './dataset.controller.js';
import { SemanticModelController } from './semantic-model.controller.js';
import { SchemaDiscoveryModule } from '../schema-discovery/schema-discovery.module.js';

@Module({
  imports: [
    // Provides SchemaDiscoveryService for field validation and mapping resolution
    SchemaDiscoveryModule,
  ],
  controllers: [DatasetController, SemanticModelController],
  providers: [DatasetService],
  exports: [DatasetService],
})
export class DatasetModule {}
