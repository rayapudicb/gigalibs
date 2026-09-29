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
import { FormulaMeasureController } from './formula-measure.controller.js';
import { FormulaMeasureService } from './formula-measure.service.js';

@Module({
  imports: [DatasetModule],
  controllers: [QueryEngineController, ChartsController, DashboardsController, FormulaMeasureController],
  providers: [QueryEngineService, ChartService, DashboardService, FormulaMeasureService],
  exports: [QueryEngineService, ChartService, DashboardService, FormulaMeasureService],
})
export class QueryEngineModule {}
