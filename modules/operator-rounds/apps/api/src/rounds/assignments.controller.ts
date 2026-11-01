import { CurrentPrincipal, type ModulePrincipal, RequirePermissions, moduleErrors } from '@gigalibs/module-sdk';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthorizationGuard } from '../authorization.js';
import { AssignmentsService } from './assignments.service.js';

const errors = moduleErrors('OPERATOR_ROUNDS', 'Operator Inspection Rounds');
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();

@Controller('v1/assignments')
@UseGuards(AuthorizationGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('mine')
  @RequirePermissions('operator-rounds.runs.execute')
  mine(@CurrentPrincipal() principal: ModulePrincipal, @Query() query: unknown) {
    return this.assignments.mine(principal,errors.parseInput(ListQuery,query).limit);
  }

  @Get('board')
  @RequirePermissions('operator-rounds.board.read')
  board(@CurrentPrincipal() principal: ModulePrincipal, @Query() query: unknown) {
    return this.assignments.board(principal,errors.parseInput(ListQuery,query).limit);
  }

  @Get(':id/bundle')
  @RequirePermissions('operator-rounds.runs.execute')
  bundle(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    errors.assertUuid(id,'assignmentId');
    return this.assignments.bundle(principal,id);
  }

  @Get(':id/history')
  @RequirePermissions('operator-rounds.runs.execute')
  history(@CurrentPrincipal() principal:ModulePrincipal,@Param('id') id:string) {
    errors.assertUuid(id,'assignmentId');
    return this.assignments.history(principal,id);
  }
}
