import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { loadConnectorHubRuntimeConfig } from './runtime-config.js';

async function bootstrap() {
  try {
    process.loadEnvFile?.('.env');
  } catch {
    // Environment injection remains authoritative
  }
  const logger = new Logger('Bootstrap');
  const config = loadConnectorHubRuntimeConfig();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.use(helmet());
  app.enableCors({
    origin: [...config.corsOrigins],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.enableShutdownHooks();
  await app.listen(config.apiPort, config.apiHost);
  logger.log(
    `Universal Enterprise Connector Hub API is accepting connections on ${config.apiHost}:${config.apiPort}`,
  );
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    'Connector Hub API failed to start.',
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
