import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { AuthorizationGuard } from '../authorization.js';
import { InsightsService } from './insights.service.js';

@Controller('v1/projects')
@UseGuards(AuthorizationGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  @RequirePermissions('project-operations.insights.read')
  listProjects(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.insights.listProjects(principal.tenantId);
  }

  @Get(':id/gantt')
  @RequirePermissions('project-operations.insights.read')
  gantt(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') projectId: string) {
    return this.insights.getGantt(principal.tenantId, projectId);
  }

  @Get(':id/burn-matrix')
  @RequirePermissions('project-operations.insights.read')
  burnMatrix(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') projectId: string) {
    return this.insights.getBurnMatrix(principal.tenantId, projectId);
  }
}
