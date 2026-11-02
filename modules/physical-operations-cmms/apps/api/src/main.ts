import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get<CmmsRuntimeConfig>(CMMS_CONFIG);
  // Matches the web BFF's 1 MiB request cap: diagram images (WI-OI-136), step images and step photos (WI-OI-138) are
  // bounded rasters sent as base64 JSON, beyond the 100 KB default.
  app.useBodyParser('json', { limit: '1mb' });

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
