import {
  AddSpeedMaterialInputV1Schema,
  AddSpeedStepInputV1Schema,
  AddSpeedThermalDataInputV1Schema,
  CreateSpeedRouteInputV1Schema,
  ListSpeedRoutesQueryV1Schema,
  MoveSpeedStepInputV1Schema,
  RemoveSpeedRecordInputV1Schema,
  ReplaceSpeedConditionsInputV1Schema,
  ReplaceSpeedMitigationInputV1Schema,
  SetSpeedEnergeticGroupsInputV1Schema,
  SpeedArchiveInputV1Schema,
  UpdateSpeedMaterialInputV1Schema,
  UpdateSpeedRouteInputV1Schema,
  UpdateSpeedStepInputV1Schema,
} from '@gigalibs/contracts';
import {
  CommandContext,
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../errors.js';
import { RoutesService } from './routes.service.js';
import { StepsService } from './steps.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

const ResultsQuery = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();

/** Routes, `/api/speed/v1/routes` (WI-OI-120bx; plan v1.4 §4.4). */
@Controller('v1/routes')
@UseGuards(AuthorizationGuard)
export class RoutesController {
  constructor(
    private readonly routes: RoutesService,
    private readonly steps: StepsService,
  ) {}

  @Get()
  @RequirePermissions('speed.routes.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Query() query: unknown) {
    return this.routes.list(principal, errors.parseInput(ListSpeedRoutesQueryV1Schema, query));
  }

  @Get(':id')
  @RequirePermissions('speed.routes.read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.routes.get(principal, id);
  }

  @Post()
  @RequirePermissions('speed.routes.write')
  async create(
    @CommandContext() context: ModuleCommandContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    const { route, replayed } = await this.routes.create(
      context,
      errors.parseInput(CreateSpeedRouteInputV1Schema, body),
    );
    response.status(replayed ? 200 : 201);
    if (replayed) response.setHeader('Idempotency-Replayed', 'true');
    return route;
  }

  @Patch(':id')
  @RequirePermissions('speed.routes.write')
  update(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.routes.update(context, id, errors.parseInput(UpdateSpeedRouteInputV1Schema, body));
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('speed.routes.write')
  archive(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.routes.archive(context, id, errors.parseInput(SpeedArchiveInputV1Schema, body));
  }

  @Post(':id/recompute')
  @HttpCode(200)
  @RequirePermissions('speed.engines.run')
  recompute(@CommandContext() context: ModuleCommandContext, @Param('id') id: string) {
    return this.routes.recompute(context, id);
  }

  @Get(':id/results')
  @RequirePermissions('speed.routes.read')
  results(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.routes.results(principal, id, errors.parseInput(ResultsQuery, query).limit);
  }

  @Post(':id/steps')
  @RequirePermissions('speed.routes.write')
  addStep(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.addStep(context, id, errors.parseInput(AddSpeedStepInputV1Schema, body));
  }
}

/** Steps, `/api/speed/v1/steps/{id}`: content of a draft route. */
@Controller('v1/steps')
@UseGuards(AuthorizationGuard)
export class StepsController {
  constructor(private readonly steps: StepsService) {}

  @Patch(':id')
  @RequirePermissions('speed.routes.write')
  update(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.updateStep(
      context,
      id,
      errors.parseInput(UpdateSpeedStepInputV1Schema, body),
    );
  }

  @Post(':id/move')
  @HttpCode(200)
  @RequirePermissions('speed.routes.write')
  move(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.moveStep(context, id, errors.parseInput(MoveSpeedStepInputV1Schema, body));
  }

  @Post(':id/remove')
  @HttpCode(200)
  @RequirePermissions('speed.routes.write')
  remove(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.removeStep(
      context,
      id,
      errors.parseInput(RemoveSpeedRecordInputV1Schema, body),
    );
  }

  @Post(':id/materials')
  @RequirePermissions('speed.routes.write')
  addMaterial(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.addMaterial(
      context,
      id,
      errors.parseInput(AddSpeedMaterialInputV1Schema, body),
    );
  }

  @Put(':id/conditions')
  @RequirePermissions('speed.routes.write')
  replaceConditions(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.replaceConditions(
      context,
      id,
      errors.parseInput(ReplaceSpeedConditionsInputV1Schema, body),
    );
  }

  /** Cited thermal data of the step's mixture: measured or literature values (`speed.thermal-data.write`). */
  @Post(':id/thermal-data')
  @RequirePermissions('speed.thermal-data.write')
  addThermalData(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.addThermalData(
      context,
      id,
      errors.parseInput(AddSpeedThermalDataInputV1Schema, body),
    );
  }

  @Put(':id/mitigation')
  @RequirePermissions('speed.routes.write')
  replaceMitigation(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.replaceMitigation(
      context,
      id,
      errors.parseInput(ReplaceSpeedMitigationInputV1Schema, body),
    );
  }
}

/** Materials, `/api/speed/v1/materials/{id}`: a step's materials. */
@Controller('v1/materials')
@UseGuards(AuthorizationGuard)
export class MaterialsController {
  constructor(private readonly steps: StepsService) {}

  @Patch(':id')
  @RequirePermissions('speed.routes.write')
  update(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.updateMaterial(
      context,
      id,
      errors.parseInput(UpdateSpeedMaterialInputV1Schema, body),
    );
  }

  @Post(':id/remove')
  @HttpCode(200)
  @RequirePermissions('speed.routes.write')
  remove(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.removeMaterial(
      context,
      id,
      errors.parseInput(RemoveSpeedRecordInputV1Schema, body),
    );
  }

  @Put(':id/energetic-groups')
  @RequirePermissions('speed.routes.write')
  setEnergeticGroups(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.steps.setEnergeticGroups(
      context,
      id,
      errors.parseInput(SetSpeedEnergeticGroupsInputV1Schema, body),
    );
  }
}
