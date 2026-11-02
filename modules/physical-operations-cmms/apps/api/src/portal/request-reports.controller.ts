import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { RequestReportsService } from './request-reports.service.js';

/** WI-OI-140 M-REQ: signed-in problem reports (mobile) and the caller's own reports. */
@Controller('v1/request-reports')
@UseGuards(CmmsAuthorizationGuard)
export class RequestReportsController {
  constructor(private readonly reports: RequestReportsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.requests.report')
  report(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.reports.report(context, body);
  }

  @Get('mine')
  @RequirePermissions('cmms.requests.report')
  mine(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.reports.mine(principal);
  }
}
