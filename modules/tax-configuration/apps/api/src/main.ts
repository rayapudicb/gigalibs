import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { TAX_CONFIG } from './config.provider.js';
import type { TaxRuntimeConfig } from './runtime-config.js';

async function bootstrap(): Promise<void> {
  try {
    process.loadEnvFile?.('.env');
  } catch {
    // Environment injection remains authoritative
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<TaxRuntimeConfig>(TAX_CONFIG);

  app.use(helmet());
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Correlation-Id',
    ],
    exposedHeaders: ['ETag', 'Idempotency-Replayed', 'X-Correlation-Id'],
  });

  app.enableShutdownHooks();
  await app.listen(config.apiPort, config.apiHost);
  Logger.log(`Tax API is accepting connections on ${config.apiHost}:${config.apiPort}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Tax API failed to start.', error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
