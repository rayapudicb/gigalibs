import { Module } from '@nestjs/common';
import { configProvider } from './config.provider.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { OntologyController } from './ontology/ontology.controller.js';
import { OntologyService } from './ontology/ontology.service.js';

@Module({
  imports: [],
  controllers: [HealthController, OntologyController],
  providers: [configProvider, DatabaseService, OntologyService],
  exports: [DatabaseService, OntologyService],
})
export class AppModule {}
