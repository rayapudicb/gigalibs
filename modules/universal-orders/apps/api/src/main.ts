import 'reflect-metadata';
import { loadModuleListenerConfig } from '@gigalibs/module-sdk';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const listener = loadModuleListenerConfig({ prefix: 'UNIVERSAL_ORDERS' });
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  app.use(helmet());
  app.enableCors({ origin: listener.corsOrigins, credentials: true });
  await app.listen(listener.apiPort, listener.apiHost);
}

void bootstrap();
