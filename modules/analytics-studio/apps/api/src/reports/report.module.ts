import { Module } from '@nestjs/common';
import { ReportService } from './report.service.js';
import { ReportController } from './report.controller.js';
import { QueryEngineModule } from '../query-engine/query-engine.module.js';
import { PlaceAnalyticsModule } from '../places/place-analytics.module.js';

@Module({
  imports: [QueryEngineModule, PlaceAnalyticsModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
