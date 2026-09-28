import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { SAGA_CONFIG } from './config.provider.js';
import type { SagaRuntimeConfig } from './runtime-config.js';

async function bootstrap() {
  const logger = new Logger('SagaBootstrap');
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  const config = app.get<SagaRuntimeConfig>(SAGA_CONFIG);
  app.use(helmet());

  await app.listen(config.apiPort, config.apiHost);
  logger.log(`Saga Orchestrator API running on http://${config.apiHost}:${config.apiPort}`);
}

bootstrap().catch((err) => {
  console.error('Saga Orchestrator API failed to bootstrap:', err);
  process.exit(1);
});
