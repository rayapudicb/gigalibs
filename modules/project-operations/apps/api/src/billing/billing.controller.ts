import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { AuthorizationGuard } from '../authorization.js';
import {
  BillingService,
  BillMilestoneInputV1Schema,
  BillTimeMaterialsInputV1Schema,
} from './billing.service.js';

function commandContext(principal: ModulePrincipal, body: { requestKey?: string }): ModuleCommandContext {
  return {
    principal,
    correlationId: body.requestKey ?? principal.sessionId,
  };
}

@Controller('v1/projects')
@UseGuards(AuthorizationGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post(':id/bill-time-materials')
  @RequirePermissions('project-operations.billing.post')
  billTimeMaterials(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    const parsed = BillTimeMaterialsInputV1Schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    return this.billing.billTimeMaterials(commandContext(principal, parsed.data), projectId, parsed.data);
  }

  @Post(':id/bill-milestone')
  @RequirePermissions('project-operations.billing.post')
  billMilestone(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') projectId: string,
    @Body() body: unknown,
  ) {
    const parsed = BillMilestoneInputV1Schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    return this.billing.billMilestone(commandContext(principal, parsed.data), projectId, parsed.data);
  }
}
