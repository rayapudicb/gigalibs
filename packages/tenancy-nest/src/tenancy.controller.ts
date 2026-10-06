import { AllowMfaPending, CurrentUser } from '@gigalibs/auth-nest';
import {
  type AcceptTenantInviteDto,
  AcceptTenantInviteSchema,
  type AssignMemberRoleDto,
  AssignMemberRoleSchema,
  type RevokeMemberRoleDto,
  RevokeMemberRoleSchema,
  type ChangeTenantStatusDto,
  ChangeTenantStatusSchema,
  type CreateCustomRoleDto,
  CreateCustomRoleSchema,
  type CreateDepartmentDto,
  CreateDepartmentSchema,
  type CreateTenantDomainChallengeDto,
  CreateTenantDomainChallengeSchema,
  type CreateTenantDto,
  type CreateTenantInviteDto,
  CreateTenantInviteSchema,
  CreateTenantSchema,
  type DeleteCustomRoleDto,
  DeleteCustomRoleSchema,
  type RevokeTenantDomainDto,
  RevokeTenantDomainSchema,
  type UpdateCustomRoleDto,
  UpdateCustomRoleSchema,
  type UpdateDepartmentDto,
  UpdateDepartmentSchema,
  type UpdateTenantMemberDto,
  UpdateTenantMemberSchema,
  type UpdateTenantOrganizationSettingsDto,
  UpdateTenantOrganizationSettingsSchema,
  type VerifyTenantDomainDto,
  VerifyTenantDomainSchema,
} from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  SetMetadata,
} from '@nestjs/common';
import { AllowTenantStatuses } from './decorators/allow-tenant-statuses.decorator.js';
import { CurrentTenant } from './decorators/current-tenant.decorator.js';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { TenancyService } from './tenancy.service.js';

@Controller('tenants')
export class TenancyController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Get()
  @SetMetadata('skipTenantBoundary', true)
  @AllowMfaPending()
  list(@CurrentUser('sub') userId: string) {
    return this.tenancyService.listForUser(userId);
  }

  @Post()
  @SetMetadata('skipTenantBoundary', true)
  create(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateTenantSchema)) dto: CreateTenantDto,
  ) {
    return this.tenancyService.createTenant(dto, userId);
  }

  @Get('current')
  @RequirePermissions('tenant:read')
  getCurrent(@CurrentTenant('tenantId') tenantId: string, @CurrentUser('sub') userId: string) {
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

  @Get('current/domain')
  @RequirePermissions('tenant:read')
  getDomainStatus(@CurrentTenant('tenantId') tenantId: string) {
    return this.tenancyService.getDomainStatus(tenantId);
  }

  @Post('current/domain/challenge')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('tenant:update')
  createDomainChallenge(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateTenantDomainChallengeSchema))
    dto: CreateTenantDomainChallengeDto,
  ) {
    return this.tenancyService.createDomainChallenge(tenantId, userId, dto);
  }

  @Post('current/domain/verify')
  @RequirePermissions('tenant:update')
  verifyDomain(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(VerifyTenantDomainSchema)) dto: VerifyTenantDomainDto,
  ) {
    return this.tenancyService.verifyDomain(tenantId, userId, dto.reason);
  }

  @Delete('current/domain')
  @RequirePermissions('tenant:update')
  revokeDomain(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Query(new ZodValidationPipe(RevokeTenantDomainSchema)) query: RevokeTenantDomainDto,
  ) {
    return this.tenancyService.revokeDomain(tenantId, userId, query.reason);
  }

  @Get('current/members')
  @RequirePermissions('users:read')
  listMembers(@CurrentTenant('tenantId') tenantId: string) {
    return this.tenancyService.listMembers(tenantId);
  }

  @Get('current/roles')
  @RequirePermissions('roles:read')
  listCustomRoles(@CurrentTenant('tenantId') tenantId: string) {
    return this.tenancyService.listCustomRoles(tenantId);
  }

  @Post('current/roles')
  @RequirePermissions('roles:create')
  createCustomRole(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateCustomRoleSchema)) dto: CreateCustomRoleDto,
  ) {
    return this.tenancyService.createCustomRole(tenantId, userId, dto);
  }

  @Patch('current/roles/:roleId')
  @RequirePermissions('roles:update')
  updateCustomRole(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('roleId') roleId: string,
    @Body(new ZodValidationPipe(UpdateCustomRoleSchema)) dto: UpdateCustomRoleDto,
  ) {
    return this.tenancyService.updateCustomRole(tenantId, roleId, userId, dto);
  }

  @Delete('current/roles/:roleId')
  @RequirePermissions('roles:delete')
  deleteCustomRole(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('roleId') roleId: string,
    @Query(new ZodValidationPipe(DeleteCustomRoleSchema)) query: DeleteCustomRoleDto,
  ) {
    return this.tenancyService.deleteCustomRole(tenantId, roleId, userId, query.reason);
  }

  @Get('current/invitations')
  @RequirePermissions('invites:read')
  listInvites(@CurrentTenant('tenantId') tenantId: string) {
    return this.tenancyService.listInvites(tenantId);
  }

  @Post('current/invitations')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('invites:create')
  createInvite(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateTenantInviteSchema)) dto: CreateTenantInviteDto,
  ) {
    return this.tenancyService.createInvite(tenantId, userId, dto);
  }

  @Delete('current/invitations/:inviteId')
  @RequirePermissions('invites:delete')
  revokeInvite(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.tenancyService.revokeInvite(tenantId, inviteId, userId);
  }

  @Post('invitations/accept')
  @Header('Cache-Control', 'no-store')
  @SetMetadata('skipTenantBoundary', true)
  acceptInvite(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(AcceptTenantInviteSchema)) dto: AcceptTenantInviteDto,
  ) {
    return this.tenancyService.acceptInvite(userId, dto);
  }

  @Patch('current/members/:memberId')
  @RequirePermissions('users:update')
  updateMember(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(UpdateTenantMemberSchema)) dto: UpdateTenantMemberDto,
  ) {
    return this.tenancyService.updateMember(tenantId, memberId, userId, dto);
  }

  // WI-OI-120w (R2 slice 2a): a member may hold several roles; each is given and taken away on its own, with a reason.
  @Post('current/members/:memberId/role-assignments')
  @RequirePermissions('roles:assign')
  assignMemberRole(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(AssignMemberRoleSchema)) dto: AssignMemberRoleDto,
  ) {
    return this.tenancyService.assignMemberRole(tenantId, memberId, userId, dto);
  }

  @Post('current/members/:memberId/role-assignments/:assignmentId/revoke')
  @RequirePermissions('roles:assign')
  revokeMemberRole(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('memberId') memberId: string,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodValidationPipe(RevokeMemberRoleSchema)) dto: RevokeMemberRoleDto,
  ) {
    return this.tenancyService.revokeMemberRole(tenantId, memberId, assignmentId, userId, dto);
  }

  @Get('current/departments')
  @RequirePermissions('users:read')
  listDepartments(@CurrentTenant('tenantId') tenantId: string) {
    return this.tenancyService.listDepartments(tenantId);
  }

  @Post('current/departments')
  @RequirePermissions('tenant:update')
  createDepartment(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateDepartmentSchema)) dto: CreateDepartmentDto,
  ) {
    return this.tenancyService.createDepartment(tenantId, userId, dto);
  }

  @Patch('current/departments/:departmentId')
  @RequirePermissions('tenant:update')
  updateDepartment(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('departmentId') departmentId: string,
    @Body(new ZodValidationPipe(UpdateDepartmentSchema)) dto: UpdateDepartmentDto,
  ) {
    return this.tenancyService.updateDepartment(tenantId, departmentId, userId, dto);
  }

  @Delete('current/departments/:departmentId')
  @RequirePermissions('tenant:update')
  deleteDepartment(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('departmentId') departmentId: string,
  ) {
    return this.tenancyService.deleteDepartment(tenantId, departmentId, userId);
  }

  @Get('current/organization/settings')
  @RequirePermissions('tenant:read')
  getOrganizationSettings(@CurrentTenant('tenantId') tenantId: string) {
    return this.tenancyService.getOrganizationSettings(tenantId);
  }

  @Patch('current/organization/settings')
  @RequirePermissions('tenant:update')
  updateOrganizationSettings(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(UpdateTenantOrganizationSettingsSchema))
    dto: UpdateTenantOrganizationSettingsDto,
  ) {
    return this.tenancyService.updateOrganizationSettings(tenantId, userId, dto);
  }
}
