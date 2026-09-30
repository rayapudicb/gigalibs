import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { ConnectorHubAuthorizationGuard } from '../auth/authorization.js';
import {
  ConnectorsService,
  CreateConnectionDto,
  OAuthInitiateDto,
  OAuthCallbackDto,
} from './connectors.service.js';

// WI-OI-104a: the tenant comes only from the BFF-signed context; each route names the permission it needs.
@Controller('api/connectors/v1')
@UseGuards(ConnectorHubAuthorizationGuard)
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  @Get('catalog')
  @RequirePermissions('connections:read')
  async getCatalog() {
    const catalog = await this.connectorsService.getCatalog();
    return {
      success: true,
      count: catalog.length,
      catalog,
    };
  }

  @Get('connections')
  @RequirePermissions('connections:read')
  async listConnections(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    const connections = await this.connectorsService.getConnections(principal.tenantId, category, status);
    return {
      success: true,
      count: connections.length,
      connections,
    };
  }

  @Get('connections/:idOrSlug')
  @RequirePermissions('connections:read')
  async getConnection(@CurrentPrincipal() principal: ModulePrincipal, @Param('idOrSlug') idOrSlug: string) {
    const connection = await this.connectorsService.getConnectionById(principal.tenantId, idOrSlug);
    return {
      success: true,
      connection,
    };
  }

  @Post('connections')
  @RequirePermissions('connections:write')
  async createConnection(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: CreateConnectionDto) {
    const connection = await this.connectorsService.createConnection(principal.tenantId, body);
    return {
      success: true,
      connection,
    };
  }

  @Post('connections/:id/test')
  @RequirePermissions('connections:test')
  async testConnection(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.connectorsService.testConnection(principal.tenantId, id);
  }

  // WI-OI-104d: the pull source (how the generic REST adapter reads this system) and its login secrets. Secrets are
  // stored encrypted and never returned.
  @Post('connections/:id/source')
  @RequirePermissions('connections:write')
  async configureSource(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string, @Body() body: unknown) {
    return this.connectorsService.configureSource(principal.tenantId, id, body);
  }

  @Post('connections/:id/credentials')
  @RequirePermissions('connections:write')
  async storeCredentials(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string, @Body() body: unknown) {
    return this.connectorsService.storePullCredentials(principal.tenantId, id, body);
  }

  @Post('oauth/initiate')
  @RequirePermissions('connections:write')
  async initiateOAuth(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: OAuthInitiateDto) {
    return this.connectorsService.initiateOAuthFlow(principal.tenantId, body);
  }

  @Post('connections/:id/oauth/callback')
  @RequirePermissions('connections:write')
  async exchangeOAuth(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: OAuthCallbackDto,
  ) {
    return this.connectorsService.exchangeOAuthCode(principal.tenantId, id, body);
  }
}
