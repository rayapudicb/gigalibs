import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentWorkforcePrincipal, GigaOpsAuthorizationGuard, RequirePermissions, type GigaOpsPrincipal } from '../auth/authorization.js';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { WorkforceOrganizationReplicaService } from './organization-replica.service.js';

/** WI-OI-109e2: called by the kernel's `workforce.organization-sync` job, as the member who activated the version. */
@Controller('v1/organization/versions')
@UseGuards(GigaOpsAuthorizationGuard)
export class WorkforceOrganizationReplicaController {
  constructor(private readonly replica: WorkforceOrganizationReplicaService) {}

  @Post(':versionId/units')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('organization:activate')
  receivePage(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('versionId') versionId: string, @Body() body: unknown) {
    return this.replica.receivePage(principal, versionId, body);
  }

  @Post(':versionId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('organization:activate')
  complete(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('versionId') versionId: string, @Body() body: unknown) {
    return this.replica.complete(principal, versionId, body);
  }
}
