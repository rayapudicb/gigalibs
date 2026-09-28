import { Controller, Get, Post, Query } from '@nestjs/common';
import { OidcDevService } from './oidc-dev.service.js';

@Controller('oidc/dev')
export class OidcDevController {
  constructor(private readonly oidcDevService: OidcDevService) {}

  @Get('.well-known/openid-configuration')
  getDiscoveryDocument() {
    return this.oidcDevService.getDiscoveryDocument();
  }

  @Get('.well-known/jwks.json')
  getJwks() {
    return this.oidcDevService.getJwks();
  }

  @Post('token')
  async issueToken(
    @Query('tenantId') tenantId?: string,
    @Query('sub') subject?: string,
  ) {
    return this.oidcDevService.issueToken(tenantId, subject);
  }
}
