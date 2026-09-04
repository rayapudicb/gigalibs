import { CurrentUser } from '@gigalibs/auth-nest';
import {
  ChangeTenantStatusSchema,
  CreateTenantSchema,
  type ChangeTenantStatusDto,
  type CreateTenantDto,
} from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from './decorators/current-tenant.decorator.js';
import { AllowTenantStatuses } from './decorators/allow-tenant-statuses.decorator.js';
import { TenancyService } from './tenancy.service.js';

@Controller('tenants')
export class TenancyController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Get()
  list(@CurrentUser('sub') userId: string) {
    return this.tenancyService.listForUser(userId);
  }

  @Post()
  create(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateTenantSchema)) dto: CreateTenantDto,
  ) {
    return this.tenancyService.createTenant(dto, userId);
  }

  @Get('current')
  @RequirePermissions('tenant:read')
  getCurrent(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.tenancyService.getTenantForUser(tenantId, userId);
  }

  @Patch('current/status')
  @RequirePermissions('tenant:update')
  @AllowTenantStatuses('ACTIVE', 'PROVISIONING')
  changeStatus(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(ChangeTenantStatusSchema)) dto: ChangeTenantStatusDto,
  ) {
    return this.tenancyService.changeStatus(tenantId, userId, dto);
  }
}
