import { CurrentUser } from '@gigalibs/auth-nest';
import {
  CreateDemoLabTenantSchema,
  DeleteDemoLabTenantSchema,
  type CreateDemoLabTenantDto,
  type DeleteDemoLabTenantDto,
} from '@gigalibs/contracts';
import { PlatformAuthorityGuard, RequirePlatformRoles } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { DemoLabService } from './demo-lab.service.js';

@Controller('platform/demo-lab')
@UseGuards(PlatformAuthorityGuard)
export class DemoLabController {
  constructor(private readonly demoLab: DemoLabService) {}

  @Get('catalogues')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  catalogues() {
    return this.demoLab.catalogues();
  }

  @Get('tenants')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  list() {
    return this.demoLab.list();
  }

  @Post('tenants')
  @HttpCode(201)
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  create(
    @CurrentUser('sub') actorId: string,
    @Body(new ZodValidationPipe(CreateDemoLabTenantSchema)) dto: CreateDemoLabTenantDto,
  ) {
    return this.demoLab.create(actorId, dto);
  }

  // An explicit action rather than DELETE, so the web BFF's control-plane proxy stays read/create/update only.
  @Post('tenants/:tenantId/delete')
  @HttpCode(200)
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  remove(
    @CurrentUser('sub') actorId: string,
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(DeleteDemoLabTenantSchema)) dto: DeleteDemoLabTenantDto,
  ) {
    return this.demoLab.remove(actorId, tenantId, dto);
  }
}
