import {
  OrgReplicaCompletionV1Schema,
  OrgReplicaPageV1Schema,
  type OrgReplicaResultV1,
} from '@gigalibs/contracts';
import { OrganizationReplica, OrganizationReplicaConflictError } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { WorkforceDatabaseService } from '../database/database.service.js';

/**
 * WI-OI-109e2 (ADR-0018 §3): Workforce's copy of the organization versions the control plane activates. The kernel's
 * `workforce.organization-sync` job sends a version page by page, then completes it; Workforce checks it and holds it.
 * A version is immutable once held. Expansion of grant roots (109e3) reads only held versions.
 */
@Injectable()
export class WorkforceOrganizationReplicaService {
  readonly replica = new OrganizationReplica('gigalibs_workforce');

  constructor(private readonly database: WorkforceDatabaseService) {}

  receivePage(principal: GigaOpsPrincipal, versionId: string, body: unknown): Promise<OrgReplicaResultV1> {
    const page = parse(OrgReplicaPageV1Schema, body);
    const { units, page: _page, ...header } = page;
    return this.held(() =>
      this.database.withTenantTransaction(principal.tenantId, (client) => this.replica.receivePage(client, principal.tenantId, versionId, header, units)),
    );
  }

  complete(principal: GigaOpsPrincipal, versionId: string, body: unknown): Promise<OrgReplicaResultV1> {
    const { unit_count, ...header } = parse(OrgReplicaCompletionV1Schema, body);
    return this.held(() =>
      this.database.withTenantTransaction(principal.tenantId, (client) => this.replica.complete(client, principal.tenantId, versionId, header, unit_count)),
    );
  }

  private async held<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof OrganizationReplicaConflictError) throw new ConflictException(error.message);
      throw error;
    }
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
