import { Module } from '@nestjs/common';
import { InboxService } from './inbox.service.js';

@Module({
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
