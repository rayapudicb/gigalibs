import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import {
  ConnectorsService,
  CreateConnectionDto,
  OAuthInitiateDto,
  OAuthCallbackDto,
} from './connectors.service.js';

@Controller('api/connectors/v1')
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  private extractTenant(tenantHeader?: string): string {
    if (!tenantHeader || tenantHeader.trim() === '') {
      throw new BadRequestException('x-tenant-id header is required');
    }
    return tenantHeader.trim();
  }

  @Get('catalog')
  async getCatalog() {
    const catalog = await this.connectorsService.getCatalog();
    return {
      success: true,
      count: catalog.length,
      catalog,
    };
  }

  @Get('connections')
  async listConnections(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    const connections = await this.connectorsService.getConnections(tenantId, category, status);
    return {
      success: true,
      count: connections.length,
      connections,
    };
  }

  @Get('connections/:idOrSlug')
  async getConnection(
    @Param('idOrSlug') idOrSlug: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    const connection = await this.connectorsService.getConnectionById(tenantId, idOrSlug);
    return {
      success: true,
      connection,
    };
  }

  @Post('connections')
  async createConnection(
    @Body() body: CreateConnectionDto & { tenant_id?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader || body.tenant_id);
    const connection = await this.connectorsService.createConnection(tenantId, body);
    return {
      success: true,
      connection,
    };
  }

  @Post('connections/:id/test')
  async testConnection(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    return this.connectorsService.testConnection(tenantId, id);
  }

  @Post('oauth/initiate')
  async initiateOAuth(
    @Body() body: OAuthInitiateDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    return this.connectorsService.initiateOAuthFlow(tenantId, body);
  }

  @Post('connections/:id/oauth/callback')
  async exchangeOAuth(
    @Param('id') id: string,
    @Body() body: OAuthCallbackDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    return this.connectorsService.exchangeOAuthCode(tenantId, id, body);
  }
}
