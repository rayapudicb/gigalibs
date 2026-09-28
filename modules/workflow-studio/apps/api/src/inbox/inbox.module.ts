import { Module } from '@nestjs/common';
import { WorkflowInboxService } from './inbox.service.js';

@Module({
  providers: [WorkflowInboxService],
  exports: [WorkflowInboxService],
})
export class InboxModule {}
