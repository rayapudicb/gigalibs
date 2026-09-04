import { Controller, Get } from '@nestjs/common'
import { CurrentUser } from '@gigalibs/auth-nest'
import { RbacService } from '@gigalibs/rbac-nest'
import { CurrentTenant } from '@gigalibs/tenancy-nest'

@Controller('authorization')
export class AuthorizationController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('context')
  async getContext(
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: string[] | undefined,
    @CurrentTenant('tenantId') tenantId: string,
  ) {
    const effectiveRoles = roles ?? []
    const permissions = await this.rbacService.getUserPermissions(
      userId,
      tenantId,
      effectiveRoles,
    )

    return {
      user: { id: userId },
      tenant: { id: tenantId },
      roles: effectiveRoles,
      permissions,
    }
  }
}
