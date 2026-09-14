import { CurrentUser } from '@gigalibs/auth-nest';
import {
  type PlatformCreateTenantDto,
  PlatformCreateTenantSchema,
  type PlatformEntitlementUpdateDto,
  PlatformEntitlementUpdateSchema,
  type PlatformExternalIdentityMutationDto,
  PlatformExternalIdentityMutationSchema,
  type PlatformIsolationRequestDto,
  PlatformIsolationRequestSchema,
  type PlatformIssuePasswordResetDto,
  PlatformIssuePasswordResetSchema,
  type PlatformRoleMutationDto,
  PlatformRoleMutationSchema,
  type PlatformTenantStatusChangeDto,
  PlatformTenantStatusChangeSchema,
  type PlatformTrialExtensionDto,
  PlatformTrialExtensionSchema,
  type PlatformUserQueryDto,
  PlatformUserQuerySchema,
  type PlatformUserStatusChangeDto,
  PlatformUserStatusChangeSchema,
} from '@gigalibs/contracts';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { RequirePlatformRoles } from './decorators/require-platform-roles.decorator.js';
import { PlatformAuthorityGuard } from './guards/platform-authority.guard.js';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { PlatformAdministrationService } from './platform-administration.service.js';

@Controller('platform')
@SetMetadata('skipTenantBoundary', true)
@UseGuards(PlatformAuthorityGuard)
export class PlatformAdministrationController {
  constructor(private readonly platformAdministration: PlatformAdministrationService) {}

  @Get('catalog')
  getCatalog() {
    return this.platformAdministration.getCatalog();
  }

  @Get('tenants')
  listTenants() {
    return this.platformAdministration.listTenants();
  }

  @Get('users')
  listUsers(
    @Query(new ZodValidationPipe(PlatformUserQuerySchema)) query: PlatformUserQueryDto,
  ) {
    return this.platformAdministration.listUsers(query);
  }

  @Get('users/:userId')
  getUser(@Param('userId') userId: string) {
    return this.platformAdministration.getUser(userId);
  }

  @Patch('users/:userId/status')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  changeUserStatus(
    @Param('userId') userId: string,
    @CurrentUser('sub') actorUserId: string,
    @Body(new ZodValidationPipe(PlatformUserStatusChangeSchema))
    dto: PlatformUserStatusChangeDto,
  ) {
    return this.platformAdministration.changeUserStatus(userId, dto, actorUserId);
  }

  @Put('users/:userId/platform-role')
  @RequirePlatformRoles('PLATFORM_OWNER')
  mutatePlatformRole(
    @Param('userId') userId: string,
    @CurrentUser('sub') actorUserId: string,
    @Body(new ZodValidationPipe(PlatformRoleMutationSchema)) dto: PlatformRoleMutationDto,
  ) {
    return this.platformAdministration.mutatePlatformRole(userId, dto, actorUserId);
  }

  @Post('users/:userId/password-reset')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  issuePasswordReset(
    @Param('userId') userId: string,
    @CurrentUser('sub') actorUserId: string,
    @Body(new ZodValidationPipe(PlatformIssuePasswordResetSchema))
    dto: PlatformIssuePasswordResetDto,
  ) {
    return this.platformAdministration.issuePasswordReset(userId, dto, actorUserId);
  }

  @Put('users/:userId/external-identities/:identityId')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  mutateExternalIdentity(
    @Param('userId') userId: string,
    @Param('identityId') identityId: string,
    @CurrentUser('sub') actorUserId: string,
    @Body(new ZodValidationPipe(PlatformExternalIdentityMutationSchema))
    dto: PlatformExternalIdentityMutationDto,
  ) {
    return this.platformAdministration.mutateExternalIdentity(
      userId,
      identityId,
      dto,
      actorUserId,
    );
  }

  @Get('tenants/:tenantId')
  getTenant(@Param('tenantId') tenantId: string) {
    return this.platformAdministration.getTenant(tenantId);
  }

  @Post('tenants')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  createTenant(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(PlatformCreateTenantSchema)) dto: PlatformCreateTenantDto,
  ) {
    return this.platformAdministration.createTenant(dto, userId);
  }

  @Patch('tenants/:tenantId/status')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  changeStatus(
    @Param('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(PlatformTenantStatusChangeSchema))
    dto: PlatformTenantStatusChangeDto,
  ) {
    return this.platformAdministration.changeStatus(tenantId, dto, userId);
  }

  @Post('tenants/:tenantId/trial-extension')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  extendTrial(
    @Param('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(PlatformTrialExtensionSchema)) dto: PlatformTrialExtensionDto,
  ) {
    return this.platformAdministration.extendTrial(tenantId, dto, userId);
  }

  @Put('tenants/:tenantId/entitlements')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  updateEntitlements(
    @Param('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(PlatformEntitlementUpdateSchema))
    dto: PlatformEntitlementUpdateDto,
  ) {
    return this.platformAdministration.updateEntitlements(tenantId, dto, userId);
  }

  @Post('tenants/:tenantId/isolation-requests')
  @RequirePlatformRoles('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  requestIsolation(
    @Param('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(PlatformIsolationRequestSchema))
    dto: PlatformIsolationRequestDto,
  ) {
    return this.platformAdministration.requestIsolation(tenantId, dto, userId);
  }
}
