import { Module } from '@nestjs/common';
import { WebhookTestController, WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

@Module({
  controllers: [WebhooksController, WebhookTestController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
