import { ReviewRoundExceptionV1, RetryRoundCorrectiveActionV1 } from '@gigalibs/contracts';
import { CommandContext, CurrentPrincipal, type ModuleCommandContext, type ModulePrincipal,
  RequirePermissions, moduleErrors } from '@gigalibs/module-sdk';
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthorizationGuard } from '../authorization.js';
import { ExceptionsService } from './exceptions.service.js';

const errors = moduleErrors('OPERATOR_ROUNDS','Operator Inspection Rounds');
const ListQuery = z.object({ limit:z.coerce.number().int().min(1).max(100).default(50) }).strict();

@Controller('v1/exceptions')
@UseGuards(AuthorizationGuard)
export class ExceptionsController {
  constructor(private readonly exceptions:ExceptionsService) {}

  @Get()
  @RequirePermissions('operator-rounds.exceptions.read')
  list(@CurrentPrincipal() principal:ModulePrincipal,@Query() query:unknown) {
    return this.exceptions.list(principal,errors.parseInput(ListQuery,query).limit);
  }

  @Patch(':id')
  @RequirePermissions('operator-rounds.exceptions.review')
  review(@CommandContext() context:ModuleCommandContext,@Param('id') id:string,@Body() body:unknown) {
    errors.assertUuid(id,'exceptionId');
    return this.exceptions.review(context,id,errors.parseInput(ReviewRoundExceptionV1,body));
  }

  @Post(':id/retry')
  @RequirePermissions('operator-rounds.exceptions.review')
  retry(@CommandContext() context:ModuleCommandContext,@Param('id') id:string,@Body() body:unknown) {
    errors.assertUuid(id,'exceptionId');
    return this.exceptions.retry(context,id,errors.parseInput(RetryRoundCorrectiveActionV1,body));
  }
}
