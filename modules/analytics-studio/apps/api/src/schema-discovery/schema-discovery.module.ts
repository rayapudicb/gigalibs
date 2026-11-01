import { Module } from '@nestjs/common';
import { SourceAccessModule } from '../auth/source-access.module.js';
import { SchemaDiscoveryController } from './schema-discovery.controller.js';
import { SchemaDiscoveryService } from './schema-discovery.service.js';

@Module({
  imports: [SourceAccessModule],
  controllers: [SchemaDiscoveryController],
  providers: [SchemaDiscoveryService],
  exports: [SchemaDiscoveryService],
})
export class SchemaDiscoveryModule {}
