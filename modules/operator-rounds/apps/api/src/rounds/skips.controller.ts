import { DecideRoundSkipV1 } from '@gigalibs/contracts';
import { CommandContext, CurrentPrincipal, type ModuleCommandContext, type ModulePrincipal,
  RequirePermissions, moduleErrors } from '@gigalibs/module-sdk';
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthorizationGuard } from '../authorization.js';
import { SkipsService } from './skips.service.js';

const errors = moduleErrors('OPERATOR_ROUNDS','Operator Inspection Rounds');
const ListQuery = z.object({
  state:z.enum(['REQUESTED','APPROVED','REJECTED']).optional(),
  limit:z.coerce.number().int().min(1).max(100).default(50),
}).strict();

@Controller('v1/skips')
@UseGuards(AuthorizationGuard)
export class SkipsController {
  constructor(private readonly skips:SkipsService) {}

  @Get()
  @RequirePermissions('operator-rounds.skips.approve')
  list(@CurrentPrincipal() principal:ModulePrincipal,@Query() query:unknown) {
    const parsed = errors.parseInput(ListQuery,query);
    return this.skips.list(principal,parsed.state,parsed.limit);
  }

  @Post(':id/decision')
  @RequirePermissions('operator-rounds.skips.approve')
  decide(@CommandContext() context:ModuleCommandContext,@Param('id') id:string,@Body() body:unknown) {
    errors.assertUuid(id,'skipId');
    return this.skips.decide(context,id,errors.parseInput(DecideRoundSkipV1,body));
  }
}
