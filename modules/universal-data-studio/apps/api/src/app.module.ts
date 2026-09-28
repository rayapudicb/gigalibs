import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { ValidationModule } from './validation/validation.module.js';
import { MappingsModule } from './mappings/mappings.module.js';
import { DriftModule } from './drift/drift.module.js';
import { LineageModule } from './lineage/lineage.module.js';
import { InboxModule } from './inbox/inbox.module.js';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    ContractsModule,
    ValidationModule,
    MappingsModule,
    DriftModule,
    LineageModule,
    InboxModule,
  ],
})
export class AppModule {}
