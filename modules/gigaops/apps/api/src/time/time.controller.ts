import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import {
  CurrentWorkforcePrincipal,
  GigaOpsAuthorizationGuard,
  RequireAnyPermission,
  RequirePermissions,
  type GigaOpsPrincipal,
} from '../auth/authorization.js';
import { commandContext } from '../common/commands.js';
import { TimeService } from './time.service.js';

interface PunchResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

/** Time and attendance routes (WI-OI-069). */
@Controller('v1/punches')
@UseGuards(GigaOpsAuthorizationGuard)
export class PunchesController {
  constructor(private readonly time: TimeService) {}

  /** 201 for a new punch; 200 with `Idempotency-Replayed: true` for a resend; 429 with `Retry-After` when busy. */
  @Post()
  @RequirePermissions('workforce.time.punch')
  async record(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: PunchResponse,
  ) {
    try {
      const { replayed, ...punch } = await this.time.recordPunch(commandContext(principal, correlationId), body);
      if (replayed) {
        response.status(HttpStatus.OK);
        response.setHeader('Idempotency-Replayed', 'true');
      }
      return punch;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) response.setHeader('Retry-After', '1');
      throw error;
    }
  }

  @Get()
  @RequireAnyPermission('workforce.time.punch', 'workforce.time.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.time.listPunches(principal, query);
  }
}

@Controller('v1/timesheets')
@UseGuards(GigaOpsAuthorizationGuard)
export class TimesheetsController {
  constructor(private readonly time: TimeService) {}

  @Get('preview')
  @RequireAnyPermission('workforce.time.punch', 'workforce.time.read')
  preview(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.time.preview(principal, query);
  }

  @Get()
  @RequireAnyPermission('workforce.time.punch', 'workforce.time.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.time.listTimesheets(principal, query);
  }

  @Get(':timesheetId')
  @RequireAnyPermission('workforce.time.punch', 'workforce.time.read')
  get(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('timesheetId') timesheetId: string) {
    return this.time.timesheet(principal, timesheetId);
  }

  @Post()
  @RequireAnyPermission('workforce.time.punch', 'workforce.time.manage')
  submit(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.time.submit(commandContext(principal, correlationId), body);
  }

  @Post(':timesheetId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.timesheets.approve')
  approve(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('timesheetId') timesheetId: string,
    @Body() body: unknown,
  ) {
    return this.time.approve(commandContext(principal, correlationId), timesheetId, body);
  }

  @Post(':timesheetId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.timesheets.approve')
  reject(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('timesheetId') timesheetId: string,
    @Body() body: unknown,
  ) {
    return this.time.reject(commandContext(principal, correlationId), timesheetId, body);
  }
}

@Controller('v1/time-corrections')
@UseGuards(GigaOpsAuthorizationGuard)
export class TimeCorrectionsController {
  constructor(private readonly time: TimeService) {}

  @Post()
  @RequirePermissions('workforce.time.manage')
  correct(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.time.correct(commandContext(principal, correlationId), body);
  }
}

@Controller('v1/time-exceptions')
@UseGuards(GigaOpsAuthorizationGuard)
export class TimeExceptionsController {
  constructor(private readonly time: TimeService) {}

  @Get()
  @RequireAnyPermission('workforce.time.punch', 'workforce.time.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.time.listExceptions(principal, query);
  }

  @Post(':exceptionId/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.time.manage')
  resolve(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('exceptionId') exceptionId: string,
    @Body() body: unknown,
  ) {
    return this.time.resolveException(commandContext(principal, correlationId), exceptionId, body);
  }
}
