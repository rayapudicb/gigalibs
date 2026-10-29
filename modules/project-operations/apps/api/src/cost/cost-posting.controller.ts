import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { AuthorizationGuard } from '../authorization.js';
import { CostPostingService, PostProjectWipAccrualInputV1Schema } from './cost-posting.service.js';

function commandContext(principal: ModulePrincipal, body: { requestKey?: string }): ModuleCommandContext {
  return {
    principal,
    correlationId: body.requestKey ?? principal.sessionId,
  };
}

@Controller('v1/projects')
@UseGuards(AuthorizationGuard)
export class CostPostingController {
  constructor(private readonly costPosting: CostPostingService) {}

  @Post(':id/wip-accrual')
  @RequirePermissions('project-operations.cost.post')
  postWipAccrual(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    const parsed = PostProjectWipAccrualInputV1Schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    return this.costPosting.postWipAccrual(commandContext(principal, parsed.data), projectId, parsed.data);
  }
}
