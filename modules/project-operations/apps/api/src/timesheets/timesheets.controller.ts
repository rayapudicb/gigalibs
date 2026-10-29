import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { z } from 'zod';
import { AuthorizationGuard } from '../authorization.js';
import { TimesheetsService } from './timesheets.service.js';

const SubmitInputV1Schema = z
  .object({
    requestKey: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

function commandContext(principal: ModulePrincipal, requestKey: string): ModuleCommandContext {
  return { principal, correlationId: requestKey };
}

@Controller('v1/timesheets')
@UseGuards(AuthorizationGuard)
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Get('approval-queue')
  @RequirePermissions('project-operations.timesheets.read')
  approvalQueue(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.timesheets.listApprovalQueue(principal.tenantId);
  }

  @Post(':id/submit')
  @RequirePermissions('project-operations.timesheets.manage')
  submit(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') timesheetId: string,
    @Body() body: unknown,
  ) {
    const parsed = SubmitInputV1Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
    return this.timesheets.submitForApproval(commandContext(principal, parsed.data.requestKey), timesheetId, parsed.data);
  }

  @Post(':id/approve')
  @RequirePermissions('project-operations.timesheets.approve')
  approve(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') timesheetId: string,
    @Body() body: unknown,
  ) {
    const requestKey =
      typeof body === 'object' && body !== null && 'requestKey' in body && typeof body.requestKey === 'string'
        ? body.requestKey
        : randomUUID();
    return this.timesheets.approve(commandContext(principal, requestKey), timesheetId, body);
  }

  @Post(':id/reject')
  @RequirePermissions('project-operations.timesheets.approve')
  reject(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') timesheetId: string,
    @Body() body: unknown,
  ) {
    const requestKey =
      typeof body === 'object' && body !== null && 'requestKey' in body && typeof body.requestKey === 'string'
        ? body.requestKey
        : randomUUID();
    return this.timesheets.reject(commandContext(principal, requestKey), timesheetId, body);
  }
}
