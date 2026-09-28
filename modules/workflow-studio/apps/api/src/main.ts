import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  try {
    process.loadEnvFile?.('.env');
  } catch {
    // Environment injection remains authoritative
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const port = Number(process.env.WORKFLOW_STUDIO_API_PORT || 4000);
  const host = process.env.WORKFLOW_STUDIO_API_HOST ?? '0.0.0.0';

  app.use(helmet());
  app.enableCors({
    origin: ['http://localhost:5180', 'http://127.0.0.1:5180'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Tenant-Id',
      'X-Correlation-Id',
    ],
    exposedHeaders: ['ETag', 'Idempotency-Replayed', 'X-Correlation-Id'],
  });

  app.enableShutdownHooks();
  await app.listen(port, host);
  Logger.log(`Workflow Studio API is accepting connections on ${host}:${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Workflow Studio API failed to start.', error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
