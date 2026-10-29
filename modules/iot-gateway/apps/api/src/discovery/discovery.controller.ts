import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, RequirePermissions, type IotPrincipal } from '../auth/authorization.js';
import { IotAuthorizationGuard } from '../auth/authorization.js';
import { DiscoveryService } from './discovery.service.js';

@Controller('v1/discovery')
@UseGuards(IotAuthorizationGuard)
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get()
  @RequirePermissions('iot.discovery.read')
  latest(@CurrentPrincipal() principal: IotPrincipal) {
    return this.discovery.latest(principal);
  }

  @Post('scan')
  @RequirePermissions('iot.discovery.write')
  scan(@CurrentPrincipal() principal: IotPrincipal, @Body() body: unknown) {
    return this.discovery.scan(principal, body);
  }
}
