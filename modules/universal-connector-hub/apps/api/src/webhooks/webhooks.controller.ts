import { Controller, Post, Body, Param, Headers, Req } from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';

@Controller('api/connectors/v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':slug')
  async handleWebhook(
    @Param('slug') slug: string,
    @Body() payload: any,
    @Headers() headers: Record<string, any>,
    @Req() req: any,
  ) {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const tenantHeader = headers['x-tenant-id'];
    return this.webhooksService.handleInboundWebhook(
      slug,
      payload,
      headers,
      clientIp,
      tenantHeader,
    );
  }
}
