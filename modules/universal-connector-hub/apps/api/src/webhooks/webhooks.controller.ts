import { BadRequestException, Body, Controller, Headers, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { ConnectorHubAuthorizationGuard } from '../auth/authorization.js';
import { WebhooksService } from './webhooks.service.js';

const ENDPOINT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// WI-OI-120e (U3.2, P0-08): an outside sender reaches its connection only through the unguessable endpoint ID in the
// URL, and must sign the exact bytes it sends. A tenant header is never read.
@Controller('api/connectors/v1/webhooks')
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly webhooksService: WebhooksService) {}

  @Post(':endpointId')
  async handleWebhook(
    @Param('endpointId') endpointId: string,
    @Body() payload: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RawBodyRequest<{ ip?: string }>,
  ) {
    if (!ENDPOINT_ID.test(endpointId)) throw new BadRequestException('Webhook endpoint ID must be a UUID.');
    if (!req.rawBody) throw new BadRequestException('Webhook body must be JSON.');
    const clientIp = req.ip || 'unknown';
    return this.webhooksService.handleInboundWebhook(endpointId.toLowerCase(), req.rawBody, payload, headers, clientIp);
  }
}

// A signed-in user with connections:test sends a test delivery to one of their tenant's connections. The hub signs it
// with the connection's secret and ingests it through the same checks as an outside delivery.
@Controller('api/connectors/v1/connections')
@UseGuards(ConnectorHubAuthorizationGuard)
export class WebhookTestController {
  constructor(@Inject(WebhooksService) private readonly webhooksService: WebhooksService) {}

  @Post(':idOrSlug/test-webhook')
  @RequirePermissions('connections:test')
  async sendTestWebhook(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('idOrSlug') idOrSlug: string,
    @Body() payload: unknown,
  ) {
    return this.webhooksService.sendTestWebhook(principal.tenantId, idOrSlug, payload);
  }
}
