import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { OutcomesService } from './outcomes.service.js';

/** The business outcomes, `/api/speed/v1/outcomes` (WI-OI-120cc; plan v1.4 §4.4). */
@Controller('v1/outcomes')
@UseGuards(AuthorizationGuard)
export class OutcomesController {
  constructor(private readonly outcomes: OutcomesService) {}

  @Get()
  @RequirePermissions('speed.routes.read')
  get(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.outcomes.get(principal);
  }
}
