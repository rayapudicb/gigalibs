import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { SCANNER_CONFIG } from './config.provider.js';
import type { ScannerRuntimeConfig } from './runtime-config.js';

async function bootstrap() {
  const logger = new Logger('ScannerBootstrap');
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  const config = app.get<ScannerRuntimeConfig>(SCANNER_CONFIG);
  app.use(helmet());

  await app.listen(config.apiPort, config.apiHost);
  logger.log(`Document Scanner API running on http://${config.apiHost}:${config.apiPort}`);
}

bootstrap().catch((err) => {
  console.error('Document Scanner API failed to bootstrap:', err);
  process.exit(1);
});
