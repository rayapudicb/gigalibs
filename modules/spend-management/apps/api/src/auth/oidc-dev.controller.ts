import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { OidcDevService } from './oidc-dev.service.js';

@Controller('oidc')
export class OidcDevController {
  constructor(private readonly oidcService: OidcDevService) {}

  @Get('.well-known/openid-configuration')
  getDiscovery() {
    return this.oidcService.getDiscoveryDocument();
  }

  @Get('jwks.json')
  getJwks() {
    return this.oidcService.getJwks();
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  async issueToken(@Body() body: { tenant_id?: string; sub?: string }) {
    return this.oidcService.issueToken(body?.tenant_id, body?.sub);
  }
}
