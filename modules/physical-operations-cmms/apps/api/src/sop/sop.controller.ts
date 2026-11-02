import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { SopService } from './sop.service.js';

/** WI-OI-138 M-SOP: visual maintenance work instructions — authoring with four-eyes approval, guided execution, feedback. */
@Controller('v1/sop')
@UseGuards(CmmsAuthorizationGuard)
export class SopController {
  constructor(private readonly sop: SopService) {}

  @Get('procedures')
  @RequirePermissions('cmms.sop.read')
  listProcedures(@CurrentPrincipal() principal: CmmsPrincipal, @Query('status') status?: string) {
    return this.sop.listProcedures(principal, status);
  }

  @Post('procedures')
  @RequirePermissions('cmms.sop.author')
  createProcedure(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.sop.createProcedure(context, body);
  }

  @Get('procedures/:procedureId')
  @RequirePermissions('cmms.sop.read')
  getProcedure(@CurrentPrincipal() principal: CmmsPrincipal, @Param('procedureId') procedureId: string) {
    return this.sop.getProcedure(principal, procedureId);
  }

  @Patch('procedures/:procedureId')
  @RequirePermissions('cmms.sop.author')
  updateProcedure(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.sop.updateProcedure(context, procedureId, body);
  }

  @Post('procedures/:procedureId/revise')
  @RequirePermissions('cmms.sop.author')
  revise(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.sop.reviseProcedure(context, procedureId, body);
  }

  @Post('procedures/:procedureId/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.sop.author')
  submit(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.sop.submit(context, procedureId, body);
  }

  @Post('procedures/:procedureId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.sop.approve')
  approve(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.sop.approve(context, procedureId, body);
  }

  @Post('procedures/:procedureId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.sop.approve')
  reject(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.sop.reject(context, procedureId, body);
  }

  @Post('procedures/:procedureId/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.sop.approve')
  withdraw(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.sop.withdraw(context, procedureId, body);
  }

  @Put('procedures/:procedureId/steps/:stepKey/image')
  @RequirePermissions('cmms.sop.author')
  uploadStepImage(
    @CommandContext() context: CmmsCommandContext,
    @Param('procedureId') procedureId: string,
    @Param('stepKey') stepKey: string,
    @Body() body: unknown,
  ) {
    return this.sop.uploadStepImage(context, procedureId, stepKey, body);
  }

  @Get('procedures/:procedureId/steps/:stepKey/image')
  @RequirePermissions('cmms.sop.read')
  stepImage(@CurrentPrincipal() principal: CmmsPrincipal, @Param('procedureId') procedureId: string, @Param('stepKey') stepKey: string) {
    return this.sop.stepImage(principal, procedureId, stepKey);
  }

  @Get('procedures/:procedureId/durations')
  @RequirePermissions('cmms.sop.read')
  durations(@CurrentPrincipal() principal: CmmsPrincipal, @Param('procedureId') procedureId: string) {
    return this.sop.durations(principal, procedureId);
  }

  @Post('procedures/:procedureId/feedback')
  @RequirePermissions('cmms.sop.execute')
  addFeedback(@CommandContext() context: CmmsCommandContext, @Param('procedureId') procedureId: string, @Body() body: unknown) {
    return this.sop.addFeedback(context, procedureId, body);
  }

  @Get('feedback')
  @RequirePermissions('cmms.sop.read')
  listFeedback(@CurrentPrincipal() principal: CmmsPrincipal, @Query('status') status?: string) {
    return this.sop.listFeedback(principal, status);
  }

  @Post('feedback/:feedbackId/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.sop.author')
  resolveFeedback(@CommandContext() context: CmmsCommandContext, @Param('feedbackId') feedbackId: string, @Body() body: unknown) {
    return this.sop.resolveFeedback(context, feedbackId, body);
  }

  @Get('executions')
  @RequirePermissions('cmms.sop.read')
  listExecutions(@CurrentPrincipal() principal: CmmsPrincipal, @Query() query: Record<string, string>) {
    return this.sop.listExecutions(principal, { procedureId: query.procedureId, awaitingCosign: query.awaitingCosign });
  }

  @Post('executions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.sop.execute')
  startExecution(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.sop.startExecution(context, body);
  }

  @Get('executions/:executionId')
  @RequirePermissions('cmms.sop.read')
  getExecution(@CurrentPrincipal() principal: CmmsPrincipal, @Param('executionId') executionId: string) {
    return this.sop.getExecution(principal, executionId);
  }

  @Post('executions/:executionId/steps')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.sop.execute')
  recordStep(@CommandContext() context: CmmsCommandContext, @Param('executionId') executionId: string, @Body() body: unknown) {
    return this.sop.recordStep(context, executionId, body);
  }

  @Post('executions/:executionId/steps/:stepKey/cosign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.sop.execute')
  cosign(@CommandContext() context: CmmsCommandContext, @Param('executionId') executionId: string, @Param('stepKey') stepKey: string) {
    return this.sop.cosign(context, executionId, stepKey);
  }

  @Post('executions/:executionId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.sop.execute')
  complete(@CommandContext() context: CmmsCommandContext, @Param('executionId') executionId: string) {
    return this.sop.complete(context, executionId);
  }

  @Get('executions/:executionId/steps/:stepKey/photo')
  @RequirePermissions('cmms.sop.read')
  resultPhoto(@CurrentPrincipal() principal: CmmsPrincipal, @Param('executionId') executionId: string, @Param('stepKey') stepKey: string) {
    return this.sop.resultPhoto(principal, executionId, stepKey);
  }
}
