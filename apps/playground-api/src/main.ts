import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

try {
  process.loadEnvFile?.('.env');
} catch {}
try {
  process.loadEnvFile?.('../../.env');
} catch {}
import { disconnectDb } from '@gigalibs/db';
import { GigaLogger, correlationMiddleware, logger } from '@gigalibs/logger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { runtimeConfig } from './config/runtime-config.js';
import { createHttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsService } from './metrics.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.useLogger(new GigaLogger('PlaygroundApi'));
  app.use(correlationMiddleware);
  app.use(createHttpMetricsMiddleware(app.get(MetricsService)));
  app.use(helmet());
  app.enableCors({
    origin: runtimeConfig.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'x-tenant-id', 'x-requested-with'],
  });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const { apiHost, apiPort } = runtimeConfig;
  await app.listen(apiPort, apiHost);

  logger.info({ host: apiHost, port: apiPort }, 'GigaLibs API is accepting connections');

  const shutdown = async () => {
    await app.close();
    await disconnectDb();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start Playground API');
});
