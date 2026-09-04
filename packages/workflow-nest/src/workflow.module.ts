import { Module, type DynamicModule } from '@nestjs/common';
import { WorkflowService } from './workflow.service.js';
import { WorkflowController } from './workflow.controller.js';

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {
  static forRoot(): DynamicModule {
    return {
      module: WorkflowModule,
      controllers: [WorkflowController],
      providers: [WorkflowService],
      exports: [WorkflowService],
    };
  }
}
