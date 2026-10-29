import {
  CreateSpeedSubstanceInputV1Schema,
  ListSpeedSubstancesQueryV1Schema,
  SpeedArchiveInputV1Schema,
  UpdateSpeedSubstanceInputV1Schema,
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
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../errors.js';
import { SubstancesService } from './substances.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

/** Substances, `/api/speed/v1/substances` (WI-OI-120bx; plan v1.4 §4.4). */
@Controller('v1/substances')
@UseGuards(AuthorizationGuard)
export class SubstancesController {
  constructor(private readonly substances: SubstancesService) {}

  @Get()
  @RequirePermissions('speed.routes.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Query() query: unknown) {
    return this.substances.list(
      principal,
      errors.parseInput(ListSpeedSubstancesQueryV1Schema, query),
    );
  }

  @Get(':id')
  @RequirePermissions('speed.routes.read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.substances.get(principal, id);
  }

  @Post()
  @RequirePermissions('speed.substances.write')
  async create(
    @CommandContext() context: ModuleCommandContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    const { substance, replayed } = await this.substances.create(
      context,
      errors.parseInput(CreateSpeedSubstanceInputV1Schema, body),
    );
    response.status(replayed ? 200 : 201);
    if (replayed) response.setHeader('Idempotency-Replayed', 'true');
    return substance;
  }

  @Patch(':id')
  @RequirePermissions('speed.substances.write')
  update(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.substances.update(
      context,
      id,
      errors.parseInput(UpdateSpeedSubstanceInputV1Schema, body),
    );
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('speed.substances.write')
  archive(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.substances.archive(context, id, errors.parseInput(SpeedArchiveInputV1Schema, body));
  }
}
