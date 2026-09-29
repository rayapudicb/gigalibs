import 'reflect-metadata';
import type { ModuleListenerConfig } from '@gigalibs/module-sdk';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { HostModule } from './host.module.js';
import { hostedModules } from './hosted-modules.generated.js';
import { HOST_LISTENER } from './listener.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(HostModule, { bufferLogs: true });
  const listener = app.get<ModuleListenerConfig>(HOST_LISTENER);
  app.use(helmet());
  app.enableCors({
    origin: [...listener.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'X-Correlation-Id'],
    exposedHeaders: ['Idempotency-Replayed', 'X-Correlation-Id'],
  });
  app.enableShutdownHooks();
  await app.listen(listener.apiPort, listener.apiHost);
  Logger.log(
    `Module host is accepting connections on ${listener.apiHost}:${listener.apiPort} for ${hostedModules.length} module(s): ${hostedModules.map((hosted) => hosted.name).join(', ') || 'none'}`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error('Module host failed to start.', error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
