import {
  ImportSpeedCriteriaSetInputV1Schema,
  PutSpeedCriteriaSetInForceInputV1Schema,
} from '@gigalibs/contracts';
import {
  CommandContext,
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../errors.js';
import { CriteriaService } from './criteria.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

/** Screening criteria sets, `/api/speed/v1/criteria-sets` (WI-OI-120bx; plan v1.4 §4.4). */
@Controller('v1/criteria-sets')
@UseGuards(AuthorizationGuard)
export class CriteriaController {
  constructor(private readonly criteria: CriteriaService) {}

  @Get()
  @RequirePermissions('speed.routes.read')
  list(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.criteria.list(principal);
  }

  @Get(':id')
  @RequirePermissions('speed.routes.read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.criteria.get(principal, id);
  }

  /** Imports a cited set as unreviewed. */
  @Post()
  @RequirePermissions('speed.settings.manage')
  async import(
    @CommandContext() context: ModuleCommandContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    const { set, replayed } = await this.criteria.import(
      context,
      errors.parseInput(ImportSpeedCriteriaSetInputV1Schema, body),
    );
    response.status(replayed ? 200 : 201);
    if (replayed) response.setHeader('Idempotency-Replayed', 'true');
    return set;
  }

  @Post(':id/put-in-force')
  @HttpCode(200)
  @RequirePermissions('speed.settings.manage')
  putInForce(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.criteria.putInForce(
      context,
      id,
      errors.parseInput(PutSpeedCriteriaSetInForceInputV1Schema, body),
    );
  }
}
