import { Module } from '@nestjs/common';
import { EvaluatorController } from './evaluator.controller.js';
import { EvaluatorService } from './evaluator.service.js';

@Module({
  controllers: [EvaluatorController],
  providers: [EvaluatorService],
  exports: [EvaluatorService],
})
export class EvaluatorModule {}
