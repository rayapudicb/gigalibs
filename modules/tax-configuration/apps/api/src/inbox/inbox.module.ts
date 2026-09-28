import { Module } from '@nestjs/common';
import { TaxInboxService } from './inbox.service.js';

@Module({
  providers: [TaxInboxService],
  exports: [TaxInboxService],
})
export class InboxModule {}
