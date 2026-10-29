import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, RequirePermissions, type IotPrincipal } from '../auth/authorization.js';
import { IotAuthorizationGuard } from '../auth/authorization.js';
import { RulesService } from './rules.service.js';

@Controller('v1/rules')
@UseGuards(IotAuthorizationGuard)
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  @RequirePermissions('iot.rules.read')
  list(@CurrentPrincipal() principal: IotPrincipal) {
    return this.rules.list(principal);
  }

  @Post()
  @RequirePermissions('iot.rules.write')
  create(@CurrentPrincipal() principal: IotPrincipal, @Body() body: unknown) {
    return this.rules.create(principal, body);
  }
}
