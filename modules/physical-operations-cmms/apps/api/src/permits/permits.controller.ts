import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { PermitsService } from './permits.service.js';

/** WI-OI-142 M-LOTO: isolation procedures, permits, isolation points, gas tests and personal locks. */
@Controller('v1')
@UseGuards(CmmsAuthorizationGuard)
export class PermitsController {
  constructor(private readonly permits: PermitsService) {}

  @Get('isolation-procedures')
  @RequirePermissions('cmms.permits.read')
  listProcedures(@CurrentPrincipal() principal: CmmsPrincipal, @Query('status') status?: string) {
    return this.permits.listProcedures(principal, status);
  }

  @Post('isolation-procedures')
  @RequirePermissions('cmms.isolations.manage')
  createProcedure(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.permits.createProcedure(context, body);
  }

  @Patch('isolation-procedures/:procedureId')
  @RequirePermissions('cmms.isolations.manage')
  updateProcedure(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.permits.updateProcedure(context, procedureId, body);
  }

  @Post('isolation-procedures/:procedureId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.isolations.manage')
  publishProcedure(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.permits.publishProcedure(context, procedureId, body);
  }

  @Post('isolation-procedures/:procedureId/revise')
  @RequirePermissions('cmms.isolations.manage')
  reviseProcedure(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.permits.reviseProcedure(context, procedureId, body);
  }

  @Get('permits')
  @RequirePermissions('cmms.permits.read')
  list(@CurrentPrincipal() principal: CmmsPrincipal, @Query() query: Record<string, string>) {
    return this.permits.list(principal, { status: query.status, mine: query.mine });
  }

  @Post('permits')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.request')
  request(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.permits.request(context, body);
  }

  @Get('permits/:permitId')
  @RequirePermissions('cmms.permits.read')
  get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('permitId') permitId: string) {
    return this.permits.get(principal, permitId);
  }

  @Post('permits/:permitId/points/:pointKey/lock')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.request')
  lockPoint(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Param('pointKey') pointKey: string, @Body() body: unknown) {
    return this.permits.lockPoint(context, permitId, pointKey, body);
  }

  @Post('permits/:permitId/points/:pointKey/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.request')
  verifyPoint(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Param('pointKey') pointKey: string, @Body() body: unknown) {
    return this.permits.verifyPoint(context, permitId, pointKey, body);
  }

  @Post('permits/:permitId/points/:pointKey/witness')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.authorize')
  witnessPoint(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Param('pointKey') pointKey: string, @Body() body: unknown) {
    return this.permits.witnessPoint(context, permitId, pointKey, body);
  }

  @Post('permits/:permitId/points/:pointKey/remove')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.request')
  removeLock(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Param('pointKey') pointKey: string, @Body() body: unknown) {
    return this.permits.removeLock(context, permitId, pointKey, body);
  }

  @Get('permits/:permitId/points/:pointKey/photo')
  @RequirePermissions('cmms.permits.read')
  lockPhoto(@CurrentPrincipal() principal: CmmsPrincipal, @Param('permitId') permitId: string, @Param('pointKey') pointKey: string) {
    return this.permits.lockPhoto(principal, permitId, pointKey);
  }

  @Post('permits/:permitId/gas-tests')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.request')
  gasTest(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Body() body: unknown) {
    return this.permits.gasTest(context, permitId, body);
  }

  @Post('permits/:permitId/authorize')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.authorize')
  authorize(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Body() body: unknown) {
    return this.permits.authorize(context, permitId, body);
  }

  @Post('permits/:permitId/countersign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.countersign')
  countersign(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Body() body: unknown) {
    return this.permits.countersign(context, permitId, body);
  }

  @Post('permits/:permitId/lock-on')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.lock')
  lockOn(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string) {
    return this.permits.lockOn(context, permitId);
  }

  @Post('permits/:permitId/lock-off')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.lock')
  lockOff(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string) {
    return this.permits.lockOff(context, permitId);
  }

  @Post('permits/:permitId/de-isolate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.request')
  deIsolate(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Body() body: unknown) {
    return this.permits.startDeIsolation(context, permitId, body);
  }

  @Post('permits/:permitId/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.authorize')
  close(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Body() body: unknown) {
    return this.permits.close(context, permitId, body);
  }

  @Post('permits/:permitId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.permits.request')
  cancel(@CommandContext() context: CmmsCommandContext, @Param('permitId') permitId: string, @Body() body: unknown) {
    return this.permits.cancel(context, permitId, body);
  }
}
