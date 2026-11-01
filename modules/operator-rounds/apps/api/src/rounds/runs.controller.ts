import { RoundSyncBatchV1 } from '@gigalibs/contracts';
import { CommandContext, CurrentPrincipal, type ModuleCommandContext, type ModulePrincipal, RequirePermissions, moduleErrors } from '@gigalibs/module-sdk';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { RunsService } from './runs.service.js';

const errors = moduleErrors('OPERATOR_ROUNDS', 'Operator Inspection Rounds');

@Controller('v1/sync')
@UseGuards(AuthorizationGuard)
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post()
  @RequirePermissions('operator-rounds.runs.execute')
  sync(@CommandContext() context: ModuleCommandContext, @Body() body: unknown) {
    return this.runs.sync(context,errors.parseInput(RoundSyncBatchV1,body).commands);
  }
}

@Controller('v1/receipts')
@UseGuards(AuthorizationGuard)
export class ReceiptsController {
  constructor(private readonly runs: RunsService) {}

  @Get(':id')
  @RequirePermissions('operator-rounds.runs.execute')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    errors.assertUuid(id,'operationId');
    return this.runs.getReceipt(principal,id);
  }
}
