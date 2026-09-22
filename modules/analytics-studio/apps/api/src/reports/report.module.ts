import { Module } from '@nestjs/common';
import { ReportService } from './report.service.js';
import { ReportController } from './report.controller.js';
import { QueryEngineModule } from '../query-engine/query-engine.module.js';

@Module({
  imports: [QueryEngineModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
