import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { GIGAOPS_CONFIG } from './config.provider.js';
import { GigaOpsModule } from './gigaops.module.js';
import type { GigaOpsRuntimeConfig } from './runtime-config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(GigaOpsModule, { bufferLogs: true, rawBody: true });
  const config = app.get<GigaOpsRuntimeConfig>(GIGAOPS_CONFIG);

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
    `Canonical Workforce runtime is accepting connections on ${config.apiHost}:${config.apiPort}`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    'Workforce runtime failed to start.',
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
