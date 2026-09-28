import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  type AnalyticsPrincipal,
  PlatformContextAuthorizationGuard,
  Principal,
  RequirePermissions,
} from '../auth/authorization.js';
import { ActionsService, type ExecuteActionDto } from './actions.service.js';

@Controller('v1/actions')
@UseGuards(PlatformContextAuthorizationGuard)
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Get()
  @RequirePermissions('analytics:read')
  async listActions(@Principal() principal: AnalyticsPrincipal) {
    return this.actionsService.listRecentActions(principal.tenantId);
  }

  @Post()
  @RequirePermissions('analytics:action')
  async execute(
    @Principal() principal: AnalyticsPrincipal,
    @Body() dto: ExecuteActionDto,
  ) {
    return this.actionsService.executeAction(principal.tenantId, dto, principal);
  }
}
