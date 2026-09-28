import { Module } from '@nestjs/common';
import { CurrencyInboxService } from './inbox.service.js';

@Module({
  providers: [CurrencyInboxService],
  exports: [CurrencyInboxService],
})
export class InboxModule {}
