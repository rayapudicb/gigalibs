import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { RulesModule } from './rules/rules.module.js';
import { EvaluatorModule } from './evaluator/evaluator.module.js';
import { DecisionTablesModule } from './decision-tables/decision-tables.module.js';
import { LogsModule } from './logs/logs.module.js';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    RulesModule,
    EvaluatorModule,
    DecisionTablesModule,
    LogsModule,
  ],
})
export class AppModule {}
