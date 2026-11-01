import {
  AssignRoundV1, CreateRoundRouteV1, FinalizeRoundCheckpointsV1, GenerateRoundAssignmentsV1, ReplaceRoundCheckpointsV1,
  ReplaceRoundRosterV1, StageRoundCheckpointBatchV1, UpdateRoundRouteV1,
} from '@gigalibs/contracts';
import {
  CommandContext, CurrentPrincipal, type ModuleCommandContext, type ModulePrincipal,
  RequirePermissions, moduleErrors,
} from '@gigalibs/module-sdk';
import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthorizationGuard } from '../authorization.js';
import { AssignmentsService } from './assignments.service.js';
import { RoutesService } from './routes.service.js';
import { RosterService } from './roster.service.js';

const errors = moduleErrors('OPERATOR_ROUNDS', 'Operator Inspection Rounds');
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const Publish = z.object({ version: z.number().int().positive() }).strict();

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

@Controller('v1/routes')
@UseGuards(AuthorizationGuard)
export class RoutesController {
  constructor(private readonly routes: RoutesService, private readonly assignments: AssignmentsService,
    private readonly roster:RosterService) {}

  @Get()
  @RequirePermissions('operator-rounds.routes.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Query() query: unknown) {
    return this.routes.list(principal, errors.parseInput(ListQuery, query).limit);
  }

  @Get(':id')
  @RequirePermissions('operator-rounds.routes.read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    errors.assertUuid(id, 'routeId');
    return this.routes.get(principal, id);
  }

  @Post()
  @RequirePermissions('operator-rounds.routes.manage')
  async create(@CommandContext() context: ModuleCommandContext, @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse) {
    const result = await this.routes.create(context, errors.parseInput(CreateRoundRouteV1, body));
    response.status(result.replayed ? 200 : 201);
    if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
    return result.route;
  }

  @Patch(':id')
  @RequirePermissions('operator-rounds.routes.manage')
  update(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Body() body: unknown) {
    errors.assertUuid(id, 'routeId');
    return this.routes.update(context, id, errors.parseInput(UpdateRoundRouteV1, body));
  }

  @Post(':id/checkpoints')
  @RequirePermissions('operator-rounds.routes.manage')
  replaceCheckpoints(@CommandContext() context: ModuleCommandContext, @Param('id') id: string,
    @Body() body: unknown) {
    errors.assertUuid(id, 'routeId');
    const parsed = errors.parseInput(ReplaceRoundCheckpointsV1, body);
    return this.routes.replaceCheckpoints(context, id, parsed.routeVersion, parsed.checkpoints);
  }

  // A large draft travels as bounded batches (each under the module host's body limit), then one atomic finalize.
  @Post(':id/checkpoint-batches')
  @RequirePermissions('operator-rounds.routes.manage')
  async stageCheckpoints(@CommandContext() context: ModuleCommandContext, @Param('id') id: string,
    @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    errors.assertUuid(id, 'routeId');
    const result = await this.routes.stageCheckpointBatch(context, id, errors.parseInput(StageRoundCheckpointBatchV1, body));
    response.status(result.replayed ? 200 : 201);
    if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
    return result;
  }

  @Post(':id/checkpoints/finalize')
  @RequirePermissions('operator-rounds.routes.manage')
  finalizeCheckpoints(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Body() body: unknown) {
    errors.assertUuid(id, 'routeId');
    return this.routes.finalizeCheckpoints(context, id, errors.parseInput(FinalizeRoundCheckpointsV1, body));
  }

  @Post(':id/publish')
  @RequirePermissions('operator-rounds.routes.publish')
  publish(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Body() body: unknown) {
    errors.assertUuid(id, 'routeId');
    return this.routes.publish(context, id, errors.parseInput(Publish, body).version);
  }

  @Post(':id/assignments')
  @RequirePermissions('operator-rounds.assignments.manage')
  async assign(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse) {
    errors.assertUuid(id, 'routeId');
    const result = await this.assignments.assign(context, id, errors.parseInput(AssignRoundV1, body));
    response.status(result.replayed ? 200 : 201);
    if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
    return result.assignment;
  }

  @Get(':id/roster')
  @RequirePermissions('operator-rounds.assignments.manage')
  rosterGet(@CurrentPrincipal() principal:ModulePrincipal,@Param('id') id:string) {
    errors.assertUuid(id,'routeId');
    return this.roster.get(principal,id);
  }

  @Post(':id/roster')
  @RequirePermissions('operator-rounds.assignments.manage')
  rosterReplace(@CommandContext() context:ModuleCommandContext,@Param('id') id:string,@Body() body:unknown) {
    errors.assertUuid(id,'routeId');
    return this.roster.replace(context,id,errors.parseInput(ReplaceRoundRosterV1,body));
  }

  @Post(':id/generate')
  @RequirePermissions('operator-rounds.assignments.manage')
  generate(@CommandContext() context:ModuleCommandContext,@Param('id') id:string,@Body() body:unknown) {
    errors.assertUuid(id,'routeId');
    return this.roster.generate(context,id,errors.parseInput(GenerateRoundAssignmentsV1,body));
  }

  @Post(':id/generate-current')
  @RequirePermissions('operator-rounds.assignments.manage')
  generateCurrent(@CommandContext() context:ModuleCommandContext,@Param('id') id:string) {
    errors.assertUuid(id,'routeId');
    return this.roster.generateCurrent(context,id);
  }
}
