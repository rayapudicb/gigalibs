import { Module } from '@nestjs/common';
import { QueryEngineService } from './query-engine.service.js';
import { ChartService } from './chart.service.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import {
  QueryEngineController,
  ChartsController,
} from './query-engine.controller.js';
import { DatasetModule } from '../datasets/dataset.module.js';
import { FormulaMeasureController } from './formula-measure.controller.js';
import { FormulaMeasureService } from './formula-measure.service.js';
import { ModelCatalogController } from './model-catalog.controller.js';
import { ModelCatalogService } from './model-catalog.service.js';
import { ChartViewController } from './chart-view.controller.js';
import { ChartViewService } from './chart-view.service.js';

@Module({
  imports: [DatasetModule],
  controllers: [
    QueryEngineController,
    ChartsController,
    DashboardController,
    FormulaMeasureController,
    ModelCatalogController,
    ChartViewController,
  ],
  providers: [
    QueryEngineService,
    ChartService,
    DashboardService,
    FormulaMeasureService,
    ModelCatalogService,
    ChartViewService,
  ],
  exports: [QueryEngineService, ChartService, DashboardService, FormulaMeasureService, ModelCatalogService, ChartViewService],
})
export class QueryEngineModule {}
