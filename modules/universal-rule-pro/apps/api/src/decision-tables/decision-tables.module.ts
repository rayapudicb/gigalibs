import { Module } from '@nestjs/common';
import { DecisionTablesController } from './decision-tables.controller.js';
import { DecisionTablesService } from './decision-tables.service.js';

@Module({
  controllers: [DecisionTablesController],
  providers: [DecisionTablesService],
  exports: [DecisionTablesService],
})
export class DecisionTablesModule {}
