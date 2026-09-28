import { Module } from '@nestjs/common';
import { DemoLabController, PlaceAnalyticsController } from './place-analytics.controller.js';
import { DemoLabService } from './demo-lab.service.js';
import { PlaceAnalyticsService } from './place-analytics.service.js';

@Module({
  controllers: [PlaceAnalyticsController, DemoLabController],
  providers: [PlaceAnalyticsService, DemoLabService],
})
export class PlaceAnalyticsModule {}
