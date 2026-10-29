import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { IOT_CONFIG } from './config.provider.js';
import type { IotRuntimeConfig } from './runtime-config.js';

async function bootstrap(): Promise<void> {
  try {
    process.loadEnvFile?.('.env');
  } catch {
    // Environment injection is authoritative in containers.
  }
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get<IotRuntimeConfig>(IOT_CONFIG);
  app.use(helmet());
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'X-Correlation-Id', 'X-Iot-Credential', 'X-Iot-Signature'],
  });
  app.enableShutdownHooks();
  await app.listen(config.apiPort, config.apiHost);
  Logger.log(`IoT Gateway API is accepting connections on ${config.apiHost}:${config.apiPort}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('IoT Gateway API failed to start.', error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
