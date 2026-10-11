import { Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { runtimeConfigProvider } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { ThreadsController } from './threads.controller.js';
import { ThreadsService } from './threads.service.js';

@Module({
  controllers: [HealthController, ThreadsController],
  providers: [runtimeConfigProvider, DatabaseService, AuthorizationGuard, ThreadsService],
})
export class AppModule {}
