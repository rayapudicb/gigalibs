import { Module } from '@nestjs/common';
import { LineageController } from './lineage.controller.js';
import { LineageService } from './lineage.service.js';

@Module({
  controllers: [LineageController],
  providers: [LineageService],
  exports: [LineageService],
})
export class LineageModule {}
