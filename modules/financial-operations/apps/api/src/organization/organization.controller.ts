import { OrgReplicaCompletionV1Schema, OrgReplicaPageV1Schema, type OrgReplicaResultV1 } from '@gigalibs/contracts';
import {
  CurrentPrincipal,
  type ModulePrincipal,
  OrganizationReplica,
  OrganizationReplicaConflictError,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { BadRequestException, Body, ConflictException, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';

@Controller('v1/organization/versions')
@UseGuards(AuthorizationGuard)
export class OrganizationController {
  private readonly replica = new OrganizationReplica(SCHEMA);
  constructor(private readonly database: DatabaseService) {}

  @Post(':versionId/units')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  async page(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ): Promise<OrgReplicaResultV1> {
    const { units, page: _page, ...header } = parse(OrgReplicaPageV1Schema, body);
    return this.held(() =>
      this.database.withTenantTransaction(principal.tenantId, (client) =>
        this.replica.receivePage(client, principal.tenantId, versionId, header, units),
      ),
    );
  }

  @Post(':versionId/complete')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  async complete(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ): Promise<OrgReplicaResultV1> {
    const { unit_count, ...header } = parse(OrgReplicaCompletionV1Schema, body);
    return this.held(() =>
      this.database.withTenantTransaction(principal.tenantId, (client) =>
        this.replica.complete(client, principal.tenantId, versionId, header, unit_count),
      ),
    );
  }

  private async held<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof OrganizationReplicaConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }
}

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException(
      `Invalid organization version: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    );
  }
  return parsed.data;
}
