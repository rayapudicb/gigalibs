import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { CurrentWorkforcePrincipal, GigaOpsAuthorizationGuard, RequirePermissions, type GigaOpsPrincipal } from '../auth/authorization.js';
import { commandContext } from '../common/commands.js';
import { BookingsService } from './bookings.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

function replayed<T extends { replayed: boolean }>(result: T, response: ReplayResponse): Omit<T, 'replayed'> {
  const { replayed: wasReplayed, ...body } = result;
  if (wasReplayed) {
    response.status(HttpStatus.OK);
    response.setHeader('Idempotency-Replayed', 'true');
  }
  return body;
}

@Controller('v1/work-requirements')
@UseGuards(GigaOpsAuthorizationGuard)
export class WorkRequirementsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermissions('workforce.demand.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.bookings.listRequirements(principal, query);
  }

  @Get(':requirementId')
  @RequirePermissions('workforce.demand.read')
  get(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('requirementId') requirementId: string) {
    return this.bookings.getRequirement(principal, requirementId);
  }

  @Get(':requirementId/candidates')
  @RequirePermissions('workforce.bookings.read')
  candidates(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('requirementId') requirementId: string) {
    return this.bookings.candidates(principal, requirementId);
  }

  /** 201 for a new requirement; 200 with `Idempotency-Replayed: true` for a repeated request key. */
  @Post()
  @RequirePermissions('workforce.demand.manage')
  async create(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    return replayed(await this.bookings.createRequirement(commandContext(principal, correlationId), body), response);
  }

  @Post(':requirementId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.demand.manage')
  cancel(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('requirementId') requirementId: string,
    @Body() body: unknown,
  ) {
    return this.bookings.cancelRequirement(commandContext(principal, correlationId), requirementId, body);
  }
}

@Controller('v1/bookings')
@UseGuards(GigaOpsAuthorizationGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermissions('workforce.bookings.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.bookings.listBookings(principal, query);
  }

  @Post()
  @RequirePermissions('workforce.bookings.manage')
  async create(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    return replayed(await this.bookings.createBooking(commandContext(principal, correlationId), body), response);
  }

  @Post(':bookingId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.bookings.manage')
  status(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('bookingId') bookingId: string,
    @Body() body: unknown,
  ) {
    return this.bookings.changeBookingStatus(commandContext(principal, correlationId), bookingId, body);
  }
}
