import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentWorkforcePrincipal,
  GigaOpsAuthorizationGuard,
  RequirePermissions,
  type GigaOpsPrincipal,
} from '../auth/authorization.js';
import { WorkforceResourcesService } from './workforce-resources.service.js';

@Controller('v1/resources')
@UseGuards(GigaOpsAuthorizationGuard)
export class WorkforceResourcesController {
  constructor(private readonly resources: WorkforceResourcesService) {}

  @Get()
  @RequirePermissions('workforce.resources.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.resources.listResources(principal, query);
  }

  @Get(':resourceId')
  @RequirePermissions('workforce.resources.read')
  get(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Param('resourceId') resourceId: string,
  ) {
    return this.resources.getResource(principal, resourceId);
  }

  @Post()
  @RequirePermissions('workforce.resources.manage')
  create(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.resources.createResource({ principal, correlationId: safeCorrelationId(correlationId) }, body);
  }

  @Patch(':resourceId')
  @RequirePermissions('workforce.resources.manage')
  update(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('resourceId') resourceId: string,
    @Body() body: unknown,
  ) {
    return this.resources.updateResource(
      { principal, correlationId: safeCorrelationId(correlationId) },
      resourceId,
      body,
    );
  }

  @Post(':resourceId/capabilities')
  @RequirePermissions('workforce.capabilities.manage')
  assignCapability(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('resourceId') resourceId: string,
    @Body() body: unknown,
  ) {
    return this.resources.assignCapability(
      { principal, correlationId: safeCorrelationId(correlationId) },
      resourceId,
      body,
    );
  }
}

@Controller('v1/capabilities')
@UseGuards(GigaOpsAuthorizationGuard)
export class WorkforceCapabilitiesController {
  constructor(private readonly resources: WorkforceResourcesService) {}

  @Get()
  @RequirePermissions('workforce.capabilities.read')
  list(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal) {
    return this.resources.listCapabilityDefinitions(principal);
  }

  @Post()
  @RequirePermissions('workforce.capabilities.manage')
  create(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.resources.createCapabilityDefinition(
      { principal, correlationId: safeCorrelationId(correlationId) },
      body,
    );
  }
}

function safeCorrelationId(value: string | undefined): string {
  return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : randomUUID();
}
