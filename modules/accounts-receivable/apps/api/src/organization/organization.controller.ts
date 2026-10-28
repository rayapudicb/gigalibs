import { OrgReplicaCompletionV1Schema, OrgReplicaPageV1Schema, type OrgReplicaResultV1 } from '@gigalibs/contracts';
import { OrganizationReplica, OrganizationReplicaConflictError } from '@gigalibs/module-sdk';
import { BadRequestException, Body, CanActivate, ConflictException, Controller, ExecutionContext, HttpCode, Injectable, Optional, Param, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { PlatformArAuthorizationGuard, type AuthenticatedRequest, RequirePermissions } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

const replica = new OrganizationReplica('gigalibs_ar');

/** Kernel version delivery must never fall back to a direct OIDC user token. */
@Injectable()
export class ArOrganizationSyncGuard implements CanActivate {
  constructor(@Optional() private readonly signed: PlatformArAuthorizationGuard | null) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.signed) throw new ServiceUnavailableException('Signed AR organization sync is not configured.');
    return this.signed.canActivate(context);
  }
}

@Controller('v1/organization/versions')
@UseGuards(ArOrganizationSyncGuard)
export class OrganizationController {
  constructor(private readonly database: DatabaseService) {}

  @Post(':versionId/units')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  async page(@Req() request: AuthenticatedRequest, @Param('versionId') versionId: string, @Body() body: unknown): Promise<OrgReplicaResultV1> {
    const parsed = OrgReplicaPageV1Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid organization page.');
    const { units, page: _page, ...header } = parsed.data;
    return this.held(() => this.database.withTenantTransaction(requireTenant(request), (client) =>
      replica.receivePage(client, requireTenant(request), versionId, header, units),
    ));
  }

  @Post(':versionId/complete')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  async complete(@Req() request: AuthenticatedRequest, @Param('versionId') versionId: string, @Body() body: unknown): Promise<OrgReplicaResultV1> {
    const parsed = OrgReplicaCompletionV1Schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid organization completion.');
    const { unit_count, ...header } = parsed.data;
    return this.held(() => this.database.withTenantTransaction(requireTenant(request), (client) =>
      replica.complete(client, requireTenant(request), versionId, header, unit_count),
    ));
  }

  private async held<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof OrganizationReplicaConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }
}

function requireTenant(request: AuthenticatedRequest): string {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal.tenantId;
}
