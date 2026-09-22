import { Module } from '@nestjs/common';
import { QueryEngineService } from './query-engine.service.js';
import { ChartService } from './chart.service.js';
import { DashboardService } from './dashboard.service.js';
import {
  QueryEngineController,
  ChartsController,
  DashboardsController,
} from './query-engine.controller.js';
import { DatasetModule } from '../datasets/dataset.module.js';

@Module({
  imports: [DatasetModule],
  controllers: [QueryEngineController, ChartsController, DashboardsController],
  providers: [QueryEngineService, ChartService, DashboardService],
  exports: [QueryEngineService, ChartService, DashboardService],
})
export class QueryEngineModule {}
