import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentWorkforcePrincipal, GigaOpsAuthorizationGuard, RequirePermissions, type GigaOpsPrincipal } from '../auth/authorization.js';
import { commandContext } from '../common/commands.js';
import { LogbookService } from './logbook.service.js';

type Correlation = string | undefined;

/** WI-OI-137 M-LOG: shift logbooks, entries, the bypass register and two-person handovers. */
@Controller('v1')
@UseGuards(GigaOpsAuthorizationGuard)
export class LogbookController {
  constructor(private readonly logbook: LogbookService) {}

  @Get('logbooks')
  @RequirePermissions('workforce.logbook.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal) {
    return this.logbook.listLogbooks(principal);
  }

  @Post('logbooks')
  @RequirePermissions('workforce.logbook.manage')
  create(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation, @Body() body: unknown) {
    return this.logbook.createLogbook(commandContext(principal, correlation), body);
  }

  @Patch('logbooks/:logbookId')
  @RequirePermissions('workforce.logbook.manage')
  update(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation,
    @Param('logbookId') logbookId: string, @Body() body: unknown) {
    return this.logbook.updateLogbook(commandContext(principal, correlation), logbookId, body);
  }

  @Get('logbooks/:logbookId/board')
  @RequirePermissions('workforce.logbook.read')
  board(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('logbookId') logbookId: string) {
    return this.logbook.board(principal, logbookId);
  }

  @Get('logbooks/:logbookId/entries')
  @RequirePermissions('workforce.logbook.read')
  entries(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('logbookId') logbookId: string,
    @Query('shiftDate') shiftDate?: string, @Query('category') category?: string) {
    return this.logbook.listEntries(principal, logbookId, { ...(shiftDate ? { shiftDate } : {}), ...(category ? { category } : {}) });
  }

  @Post('logbooks/:logbookId/entries')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.logbook.write')
  addEntry(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation,
    @Param('logbookId') logbookId: string, @Body() body: unknown) {
    return this.logbook.addEntry(commandContext(principal, correlation), logbookId, body);
  }

  @Post('logbooks/:logbookId/bypasses')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.logbook.write')
  requestBypass(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation,
    @Param('logbookId') logbookId: string, @Body() body: unknown) {
    return this.logbook.requestBypass(commandContext(principal, correlation), logbookId, body);
  }

  @Get('logbooks/:logbookId/handovers')
  @RequirePermissions('workforce.logbook.read')
  handovers(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('logbookId') logbookId: string) {
    return this.logbook.listHandovers(principal, logbookId);
  }

  @Post('logbooks/:logbookId/handovers')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.logbook.write')
  submitHandover(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation,
    @Param('logbookId') logbookId: string, @Body() body: unknown) {
    return this.logbook.submitHandover(commandContext(principal, correlation), logbookId, body);
  }

  @Get('logbook-bypasses')
  @RequirePermissions('workforce.logbook.read')
  bypasses(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query('status') status?: string) {
    return this.logbook.listBypasses(principal, status);
  }

  @Post('logbook-bypasses/:bypassId/decision')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.logbook.authorize')
  decideBypass(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation,
    @Param('bypassId') bypassId: string, @Body() body: unknown) {
    return this.logbook.decideBypass(commandContext(principal, correlation), bypassId, body);
  }

  @Post('logbook-bypasses/:bypassId/clear')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.logbook.write')
  clearBypass(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation,
    @Param('bypassId') bypassId: string, @Body() body: unknown) {
    return this.logbook.clearBypass(commandContext(principal, correlation), bypassId, body);
  }

  @Post('logbook-handovers/:handoverId/refreeze')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.logbook.write')
  refreeze(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation,
    @Param('handoverId') handoverId: string, @Body() body: unknown) {
    return this.logbook.refreezeHandover(commandContext(principal, correlation), handoverId, body);
  }

  @Post('logbook-handovers/:handoverId/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.logbook.write')
  accept(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation,
    @Param('handoverId') handoverId: string, @Body() body: unknown) {
    return this.logbook.acceptHandover(commandContext(principal, correlation), handoverId, body);
  }

  @Post('logbook-handovers/:handoverId/countersign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.logbook.authorize')
  countersign(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlation: Correlation,
    @Param('handoverId') handoverId: string, @Body() body: unknown) {
    return this.logbook.countersignHandover(commandContext(principal, correlation), handoverId, body);
  }
}
