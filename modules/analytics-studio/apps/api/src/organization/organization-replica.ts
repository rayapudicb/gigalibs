import {
  OrgReplicaCompletionV1Schema,
  OrgReplicaPageV1Schema,
  type OrgReplicaResultV1,
} from '@gigalibs/contracts';
import { OrganizationReplica, OrganizationReplicaConflictError } from '@gigalibs/module-sdk';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Injectable,
  Module,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { type AnalyticsPrincipal, PlatformContextAuthorizationGuard, PlatformPrincipal, RequirePermissions } from '../auth/authorization.js';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { DatabaseService } from '../database/database.service.js';

/**
 * WI-OI-109e2 (ADR-0018 §3): Analytics' copy of the organization versions the control plane activates, sent page by
 * page by the kernel's `analytics.organization-sync` job and held once checked. Answers and reports expand a member's
 * grant roots from it (109e3).
 */
@Injectable()
export class AnalyticsOrganizationReplicaService {
  readonly replica = new OrganizationReplica('gigalibs_analytics');

  constructor(private readonly database: DatabaseService) {}

  receivePage(principal: AnalyticsPrincipal, versionId: string, body: unknown): Promise<OrgReplicaResultV1> {
    const { units, page: _page, ...header } = parse(OrgReplicaPageV1Schema, body);
    return held(() => this.database.withTenantTransaction(principal.tenantId, (client) => this.replica.receivePage(client, principal.tenantId, versionId, header, units)));
  }

  complete(principal: AnalyticsPrincipal, versionId: string, body: unknown): Promise<OrgReplicaResultV1> {
    const { unit_count, ...header } = parse(OrgReplicaCompletionV1Schema, body);
    return held(() => this.database.withTenantTransaction(principal.tenantId, (client) => this.replica.complete(client, principal.tenantId, versionId, header, unit_count)));
  }
}

@Controller('v1/organization/versions')
@UseGuards(PlatformContextAuthorizationGuard)
export class AnalyticsOrganizationReplicaController {
  constructor(private readonly replica: AnalyticsOrganizationReplicaService) {}

  @Post(':versionId/units')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  receivePage(@PlatformPrincipal() principal: AnalyticsPrincipal, @Param('versionId') versionId: string, @Body() body: unknown) {
    return this.replica.receivePage(principal, versionId, body);
  }

  @Post(':versionId/complete')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  complete(@PlatformPrincipal() principal: AnalyticsPrincipal, @Param('versionId') versionId: string, @Body() body: unknown) {
    return this.replica.complete(principal, versionId, body);
  }
}

@Module({
  controllers: [AnalyticsOrganizationReplicaController],
  providers: [AnalyticsOrganizationReplicaService],
  exports: [AnalyticsOrganizationReplicaService],
})
export class AnalyticsOrganizationReplicaModule {}

async function held<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OrganizationReplicaConflictError) throw new ConflictException(error.message);
    throw error;
  }
}

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException(`Invalid organization version: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim());
  }
  return parsed.data;
}
