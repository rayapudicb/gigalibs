import { Module } from '@nestjs/common';
import { MappingsController } from './mappings.controller.js';
import { MappingsService } from './mappings.service.js';

@Module({
  controllers: [MappingsController],
  providers: [MappingsService],
  exports: [MappingsService],
})
export class MappingsModule {}
