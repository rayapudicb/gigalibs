import {
  ImportSpeedLibrarySetInputV1Schema,
  PutSpeedLibrarySetInForceInputV1Schema,
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
import { LibraryService } from './library.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

/**
 * Screening library sets, `/api/speed/v1/library-sets` (WI-OI-120by; plan v1.4 §4.4). R1: the SPEED Administrator
 * imports a cited pack and puts it in force; the R2 governance permissions (`speed.libraries.*`) take these over.
 */
@Controller('v1/library-sets')
@UseGuards(AuthorizationGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @RequirePermissions('speed.routes.read')
  list(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.library.list(principal);
  }

  @Get(':id')
  @RequirePermissions('speed.routes.read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.library.get(principal, id);
  }

  @Post()
  @RequirePermissions('speed.settings.manage')
  async import(
    @CommandContext() context: ModuleCommandContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    const { set, replayed } = await this.library.import(
      context,
      errors.parseInput(ImportSpeedLibrarySetInputV1Schema, body),
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
    return this.library.putInForce(
      context,
      id,
      errors.parseInput(PutSpeedLibrarySetInForceInputV1Schema, body),
    );
  }
}
