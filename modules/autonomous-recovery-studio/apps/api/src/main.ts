import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { RECOVERY_CONFIG } from './config.provider.js';
import type { RecoveryRuntimeConfig } from './runtime-config.js';

async function bootstrap(): Promise<void> {
  try {
    process.loadEnvFile?.('.env');
  } catch {
    // Environment injection remains authoritative; absence of .env is expected in containers.
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<RecoveryRuntimeConfig>(RECOVERY_CONFIG);

  app.use(helmet());
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'If-Match',
      'X-Correlation-Id',
    ],
    exposedHeaders: ['ETag', 'Idempotency-Replayed', 'X-Correlation-Id'],
  });

  app.enableShutdownHooks();
  await app.listen(config.apiPort, config.apiHost);
  Logger.log(`Autonomous Recovery API is accepting connections on ${config.apiHost}:${config.apiPort}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Autonomous Recovery API failed to start.', error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
