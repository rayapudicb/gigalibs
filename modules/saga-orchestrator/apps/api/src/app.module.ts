import { Module } from '@nestjs/common';
import { configProvider } from './config.provider.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { SagaController } from './saga/saga.controller.js';
import { SagaService } from './saga/saga.service.js';

@Module({
  imports: [],
  controllers: [HealthController, SagaController],
  providers: [configProvider, DatabaseService, SagaService],
  exports: [DatabaseService, SagaService],
})
export class AppModule {}
