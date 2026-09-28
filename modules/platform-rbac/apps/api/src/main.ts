import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.use(helmet());
  const allowedOrigins = (process.env.PLATFORM_RBAC_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length > 0) {
    app.enableCors({
      origin: allowedOrigins,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    });
  }

  const port = process.env.PLATFORM_RBAC_API_PORT ?? 4300;
  const host = process.env.PLATFORM_RBAC_API_HOST ?? '0.0.0.0';

  await app.listen(port, host);
  logger.log(`Platform RBAC & Central Control Tower API listening on ${host}:${port}`);
}

bootstrap();
