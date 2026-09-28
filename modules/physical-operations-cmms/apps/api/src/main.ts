import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { CMMS_CONFIG } from './config.provider.js';
import type { CmmsRuntimeConfig } from './runtime-config.js';

async function bootstrap(): Promise<void> {
  try {
    process.loadEnvFile?.(new URL('../.env', import.meta.url));
  } catch {
    try {
      process.loadEnvFile?.('.env');
    } catch {
      // Environment injection is authoritative; absence of .env is expected in containers.
    }
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get<CmmsRuntimeConfig>(CMMS_CONFIG);

  app.use(helmet());
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'X-Correlation-Id'],
    exposedHeaders: ['ETag', 'Idempotency-Replayed', 'X-Correlation-Id'],
  });

  app.enableShutdownHooks();
  await app.listen(config.apiPort, config.apiHost);
  Logger.log(
    `CMMS API is accepting connections on ${config.apiHost}:${config.apiPort}`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    'CMMS API failed to start.',
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
