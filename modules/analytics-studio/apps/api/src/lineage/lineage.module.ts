import { Module } from '@nestjs/common';
import { LineageService } from './lineage.service.js';
import { LineageController, AuditController } from './lineage.controller.js';

@Module({
  controllers: [LineageController, AuditController],
  providers: [LineageService],
  exports: [LineageService],
})
export class LineageModule {}
