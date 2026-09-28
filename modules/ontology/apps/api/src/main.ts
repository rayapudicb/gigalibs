import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ONTOLOGY_CONFIG } from './config.provider.js';
import type { OntologyRuntimeConfig } from './runtime-config.js';

async function bootstrap() {
  const logger = new Logger('OntologyBootstrap');
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  const config = app.get<OntologyRuntimeConfig>(ONTOLOGY_CONFIG);
  app.use(helmet());

  await app.listen(config.apiPort, config.apiHost);
  logger.log(`Ontology API running on http://${config.apiHost}:${config.apiPort}`);
}

bootstrap().catch((err) => {
  console.error('Ontology API failed to bootstrap:', err);
  process.exit(1);
});
