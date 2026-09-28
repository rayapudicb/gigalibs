import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { requiredServiceIdentifier } from '../security/required-service-header.js';
import { RbacService } from './rbac.service.js';

@Controller('api/tenant/v1')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('me')
  async getTenantContext(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-user-id') userHeader?: string,
  ) {
    return this.rbacService.getTenantContext(
      requiredTenant(tenantHeader),
      requiredUser(userHeader),
    );
  }

  @Get('departments')
  async getDepartments(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.rbacService.getDepartments(requiredTenant(tenantHeader));
  }

  @Post('departments')
  async createDepartment(
    @Headers('x-tenant-id') tenantHeader: string,
    @Body() body: { name: string; code: string; managerName?: string; spendingLimitUsd?: number },
  ) {
    return this.rbacService.createDepartment(requiredTenant(tenantHeader), body);
  }

  @Get('groups')
  async getGroups(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.rbacService.getGroups(requiredTenant(tenantHeader));
  }

  @Post('groups')
  async createGroup(
    @Headers('x-tenant-id') tenantHeader: string,
    @Body() body: { departmentId: string; name: string; description?: string },
  ) {
    return this.rbacService.createGroup(requiredTenant(tenantHeader), body);
  }

  @Get('roles')
  async getRoles(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.rbacService.getRoles(requiredTenant(tenantHeader));
  }

  @Post('roles')
  async createRole(
    @Headers('x-tenant-id') tenantHeader: string,
    @Body() body: { name: string; code: string; description?: string; permissionCodes: string[] },
  ) {
    return this.rbacService.createRole(requiredTenant(tenantHeader), body);
  }

  @Get('permissions')
  async getPermissions(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.rbacService.getPermissions(requiredTenant(tenantHeader));
  }

  @Get('seats')
  async getSeats(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.rbacService.getSeats(requiredTenant(tenantHeader));
  }

  @Get('users')
  async getUsers(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.rbacService.getUsers(requiredTenant(tenantHeader));
  }

  @Post('users/invite')
  async inviteUser(
    @Headers('x-tenant-id') tenantHeader: string,
    @Body() body: { name: string; email: string; departmentId: string; groupId: string; roleId: string; spendingLimitUsd?: number },
  ) {
    return this.rbacService.inviteUser(requiredTenant(tenantHeader), body);
  }

  @Post('users/:userId/override')
  async setUserOverride(
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-user-id') userHeader: string,
    @Param('userId') userId: string,
    @Body() body: { permissionCode: string; effect: 'GRANT' | 'DENY'; expiresAt?: string },
  ) {
    return this.rbacService.setUserOverride(requiredTenant(tenantHeader), userId, {
      ...body,
      grantedBy: requiredUser(userHeader),
    });
  }

  @Post('users/:userId/limits')
  async updateUserLimits(
    @Headers('x-tenant-id') tenantHeader: string,
    @Param('userId') userId: string,
    @Body() body: { spendingLimitUsd?: number; allowedCostCenters?: string[] },
  ) {
    return this.rbacService.updateUserLimits(requiredTenant(tenantHeader), userId, body);
  }

  @Get('quotas')
  async getTenantQuotas(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.rbacService.getTenantQuotaAndUsage(requiredTenant(tenantHeader));
  }

  @Post('quotas/consume')
  async recordTenantUsage(
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-user-id') userHeader: string,
    @Body() body: {
      eventId: string;
      capabilityCode: string;
      moduleName: string;
      units: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.rbacService.recordTenantUsage(requiredTenant(tenantHeader), {
      ...body,
      userId: requiredUser(userHeader),
    });
  }
}

function requiredTenant(value: string | undefined): string {
  return requiredServiceIdentifier(value, 'x-tenant-id');
}

function requiredUser(value: string | undefined): string {
  return requiredServiceIdentifier(value, 'x-user-id');
}
