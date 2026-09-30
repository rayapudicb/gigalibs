import { Module } from '@nestjs/common';
import { SchemaDiscoveryController } from './schema-discovery.controller.js';
import { SchemaDiscoveryService } from './schema-discovery.service.js';

@Module({
  controllers: [SchemaDiscoveryController],
  providers: [SchemaDiscoveryService],
  exports: [SchemaDiscoveryService],
})
export class SchemaDiscoveryModule {}
