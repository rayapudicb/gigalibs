import 'reflect-metadata';
import { loadModuleListenerConfig } from '@gigalibs/module-sdk';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  // Standalone service only (`hosting: service`); inside the module host, the host listens instead.
  const config = loadModuleListenerConfig({ prefix: 'BUSINESS_PARTNERS' });
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.use(helmet());
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'X-Correlation-Id'],
    exposedHeaders: ['Idempotency-Replayed', 'X-Correlation-Id'],
  });
  app.enableShutdownHooks();
  await app.listen(config.apiPort, config.apiHost);
  Logger.log(`Universal Business Partner API is accepting connections on ${config.apiHost}:${config.apiPort}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error('Universal Business Partner API failed to start.', error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
