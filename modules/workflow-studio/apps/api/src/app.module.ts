import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { WorkflowsModule } from './workflows/workflows.module.js';
import { ExecutionModule } from './execution/execution.module.js';
import { RunsModule } from './runs/runs.module.js';
import { InboxModule } from './inbox/inbox.module.js';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    WorkflowsModule,
    ExecutionModule,
    RunsModule,
    InboxModule,
  ],
})
export class AppModule {}
