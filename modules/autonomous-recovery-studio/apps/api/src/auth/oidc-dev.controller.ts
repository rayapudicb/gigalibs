import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { OidcDevService } from './oidc-dev.service.js';

@Controller('oidc')
export class OidcDevController {
  constructor(private readonly oidcDevService: OidcDevService) {}

  @Get('.well-known/openid-configuration')
  getDiscoveryDocument() {
    return this.oidcDevService.getDiscoveryDocument();
  }

  @Get('jwks.json')
  getJwks() {
    return this.oidcDevService.getJwks();
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  async issueToken(@Body() body: { tenant_id?: string; sub?: string }) {
    return this.oidcDevService.issueToken(body.tenant_id, body.sub);
  }
}
