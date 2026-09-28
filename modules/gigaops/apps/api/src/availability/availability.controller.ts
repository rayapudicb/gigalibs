import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentWorkforcePrincipal, GigaOpsAuthorizationGuard, RequirePermissions, type GigaOpsPrincipal } from '../auth/authorization.js';
import { commandContext } from '../common/commands.js';
import { AvailabilityService } from './availability.service.js';

@Controller('v1/availability-patterns')
@UseGuards(GigaOpsAuthorizationGuard)
export class AvailabilityPatternsController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @RequirePermissions('workforce.availability.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query('resourceId') resourceId: string) {
    return this.availability.listPatterns(principal, resourceId ?? '');
  }

  @Post()
  @RequirePermissions('workforce.availability.manage')
  create(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlationId: string | undefined, @Body() body: unknown) {
    return this.availability.createPattern(commandContext(principal, correlationId), body);
  }

  @Post(':patternId/end')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.availability.manage')
  end(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('patternId') patternId: string,
    @Body() body: unknown,
  ) {
    return this.availability.endPattern(commandContext(principal, correlationId), patternId, body);
  }
}

@Controller('v1/availability')
@UseGuards(GigaOpsAuthorizationGuard)
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @RequirePermissions('workforce.availability.read')
  get(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.availability.availability(principal, query);
  }
}

@Controller('v1/absence-types')
@UseGuards(GigaOpsAuthorizationGuard)
export class AbsenceTypesController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @RequirePermissions('workforce.absences.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal) {
    return this.availability.listAbsenceTypes(principal);
  }

  @Post()
  @RequirePermissions('workforce.calendars.manage')
  create(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlationId: string | undefined, @Body() body: unknown) {
    return this.availability.createAbsenceType(commandContext(principal, correlationId), body);
  }

  @Patch(':typeId')
  @RequirePermissions('workforce.calendars.manage')
  update(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('typeId') typeId: string,
    @Body() body: unknown,
  ) {
    return this.availability.updateAbsenceType(commandContext(principal, correlationId), typeId, body);
  }
}

@Controller('v1/absences')
@UseGuards(GigaOpsAuthorizationGuard)
export class AbsencesController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @RequirePermissions('workforce.absences.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.availability.listAbsences(principal, query);
  }

  @Post()
  @RequirePermissions('workforce.absences.request')
  request(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlationId: string | undefined, @Body() body: unknown) {
    return this.availability.requestAbsence(commandContext(principal, correlationId), body);
  }

  @Post(':absenceId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.absences.approve')
  approve(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('absenceId') absenceId: string,
    @Body() body: unknown,
  ) {
    return this.availability.decideAbsence(commandContext(principal, correlationId), absenceId, 'APPROVED', body);
  }

  @Post(':absenceId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.absences.approve')
  reject(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('absenceId') absenceId: string,
    @Body() body: unknown,
  ) {
    return this.availability.decideAbsence(commandContext(principal, correlationId), absenceId, 'REJECTED', body);
  }

  @Post(':absenceId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.absences.request')
  cancel(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('absenceId') absenceId: string,
    @Body() body: unknown,
  ) {
    return this.availability.cancelAbsence(commandContext(principal, correlationId), absenceId, body);
  }
}

@Controller('v1/working-calendars')
@UseGuards(GigaOpsAuthorizationGuard)
export class WorkingCalendarsController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @RequirePermissions('workforce.calendars.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal) {
    return this.availability.listCalendars(principal);
  }

  @Post()
  @RequirePermissions('workforce.calendars.manage')
  create(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlationId: string | undefined, @Body() body: unknown) {
    return this.availability.createCalendar(commandContext(principal, correlationId), body);
  }

  @Post(':calendarId/closures')
  @RequirePermissions('workforce.calendars.manage')
  addClosure(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('calendarId') calendarId: string,
    @Body() body: unknown,
  ) {
    return this.availability.addClosure(commandContext(principal, correlationId), calendarId, body);
  }

  @Post(':calendarId/closures/:closureId/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.calendars.manage')
  withdraw(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('calendarId') calendarId: string,
    @Param('closureId') closureId: string,
  ) {
    return this.availability.withdrawClosure(commandContext(principal, correlationId), calendarId, closureId);
  }
}
