import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CurrentWorkforcePrincipal,
  GigaOpsAuthorizationGuard,
  RequirePermissions,
  type GigaOpsPrincipal,
} from '../auth/authorization.js';
import { commandContext } from '../common/commands.js';
import { JobsService } from './jobs.service.js';

const context = commandContext;

@Controller('v1/job-profiles')
@UseGuards(GigaOpsAuthorizationGuard)
export class JobProfilesController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @RequirePermissions('workforce.jobs.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.jobs.listProfiles(principal, query);
  }

  @Get(':profileId')
  @RequirePermissions('workforce.jobs.read')
  get(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('profileId') profileId: string) {
    return this.jobs.getProfile(principal, profileId);
  }

  @Post()
  @RequirePermissions('workforce.jobs.manage')
  create(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlationId: string | undefined, @Body() body: unknown) {
    return this.jobs.createProfile(context(principal, correlationId), body);
  }

  @Post(':profileId/revisions')
  @RequirePermissions('workforce.jobs.manage')
  revise(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
  ) {
    return this.jobs.reviseProfile(context(principal, correlationId), profileId, body);
  }

  @Patch(':profileId')
  @RequirePermissions('workforce.jobs.manage')
  status(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
  ) {
    return this.jobs.setProfileStatus(context(principal, correlationId), profileId, body);
  }
}

@Controller('v1/positions')
@UseGuards(GigaOpsAuthorizationGuard)
export class PositionsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @RequirePermissions('workforce.positions.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.jobs.listPositions(principal, query);
  }

  @Get(':positionId')
  @RequirePermissions('workforce.positions.read')
  get(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('positionId') positionId: string) {
    return this.jobs.getPosition(principal, positionId);
  }

  @Post()
  @RequirePermissions('workforce.positions.manage')
  create(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlationId: string | undefined, @Body() body: unknown) {
    return this.jobs.createPosition(context(principal, correlationId), body);
  }

  @Patch(':positionId')
  @RequirePermissions('workforce.positions.manage')
  update(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('positionId') positionId: string,
    @Body() body: unknown,
  ) {
    return this.jobs.updatePosition(context(principal, correlationId), positionId, body);
  }
}

@Controller('v1/engagements')
@UseGuards(GigaOpsAuthorizationGuard)
export class EngagementsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @RequirePermissions('workforce.engagements.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.jobs.listEngagements(principal, query);
  }

  @Post()
  @RequirePermissions('workforce.engagements.manage')
  create(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Headers('x-correlation-id') correlationId: string | undefined, @Body() body: unknown) {
    return this.jobs.createEngagement(context(principal, correlationId), body);
  }

  @Post(':engagementId/end')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.engagements.manage')
  end(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('engagementId') engagementId: string,
    @Body() body: unknown,
  ) {
    return this.jobs.endEngagement(context(principal, correlationId), engagementId, body);
  }

  @Post(':engagementId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.engagements.manage')
  cancel(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('engagementId') engagementId: string,
    @Body() body: unknown,
  ) {
    return this.jobs.cancelEngagement(context(principal, correlationId), engagementId, body);
  }
}
