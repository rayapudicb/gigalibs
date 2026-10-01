import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { GEOSPATIAL_CONFIG } from './config.provider.js';
import { GeospatialModule } from './geospatial.module.js';
import type { GeospatialRuntimeConfig } from './runtime-config.js';

async function bootstrap(): Promise<void> {
  // rawBody: the relay inbox verifies its token against the exact request body (WI-OI-105e).
  const app = await NestFactory.create<NestExpressApplication>(GeospatialModule, { bufferLogs: true, rawBody: true });
  const config = app.get<GeospatialRuntimeConfig>(GEOSPATIAL_CONFIG);
  // Matches the web BFF's 1 MiB request cap so a full place import (2,000 rows) is accepted.
  app.useBodyParser('json', { limit: '1mb' });

  app.use(helmet());
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'X-Correlation-Id'],
    exposedHeaders: ['X-Correlation-Id'],
  });

  app.enableShutdownHooks();
  await app.listen(config.apiPort, config.apiHost);
  Logger.log(
    `Canonical Geospatial runtime is accepting connections on ${config.apiHost}:${config.apiPort}`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(
    'Geospatial runtime failed to start.',
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
