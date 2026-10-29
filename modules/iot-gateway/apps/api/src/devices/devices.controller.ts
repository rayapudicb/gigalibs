import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, IotAuthorizationGuard, RequirePermissions, type IotPrincipal } from '../auth/authorization.js';
import { DevicesService } from './devices.service.js';

@Controller('v1/devices')
@UseGuards(IotAuthorizationGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermissions('iot.devices.read')
  list(@CurrentPrincipal() principal: IotPrincipal) {
    return this.devices.list(principal);
  }

  @Get(':deviceId')
  @RequirePermissions('iot.devices.read')
  get(@CurrentPrincipal() principal: IotPrincipal, @Param('deviceId') deviceId: string) {
    return this.devices.get(principal, deviceId);
  }

  @Post()
  @RequirePermissions('iot.devices.write')
  create(@CurrentPrincipal() principal: IotPrincipal, @Body() body: unknown) {
    return this.devices.create(principal, body);
  }

  @Post(':deviceId/bind-asset')
  @RequirePermissions('iot.devices.write')
  bindAsset(@CurrentPrincipal() principal: IotPrincipal, @Param('deviceId') deviceId: string, @Body() body: unknown) {
    return this.devices.bindAsset(principal, deviceId, body);
  }

  @Post(':deviceId/bind-meter')
  @RequirePermissions('iot.devices.write')
  bindMeter(@CurrentPrincipal() principal: IotPrincipal, @Param('deviceId') deviceId: string, @Body() body: unknown) {
    return this.devices.bindMeter(principal, deviceId, body);
  }

  @Post(':deviceId/unbind-asset')
  @RequirePermissions('iot.devices.write')
  unbindAsset(@CurrentPrincipal() principal: IotPrincipal, @Param('deviceId') deviceId: string) {
    return this.devices.unbindAsset(principal, deviceId);
  }

  @Post(':deviceId/regenerate-credential')
  @RequirePermissions('iot.devices.write')
  regenerate(@CurrentPrincipal() principal: IotPrincipal, @Param('deviceId') deviceId: string) {
    return this.devices.regenerateKey(principal, deviceId);
  }
}
