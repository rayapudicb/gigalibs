import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignResourceCapabilityV1Schema,
  CreateCapabilityDefinitionV1Schema,
  CreateWorkforceResourceV1Schema,
  ListWorkforceResourcesV1QuerySchema,
  UpdateWorkforceResourceV1Schema,
  type AssignResourceCapabilityV1,
  type CapabilityDefinitionV1,
  type CreateCapabilityDefinitionV1,
  type CreateWorkforceResourceV1,
  type ListWorkforceResourcesV1Query,
  type ResourceQualificationV1,
  type UpdateWorkforceResourceV1,
  type WorkforceResourceDetailV1,
  type WorkforceResourcePageV1,
  type WorkforceResourceV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import { type GigaOpsPrincipal, hasWorkforcePermission } from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

interface CommandContext {
  readonly principal: GigaOpsPrincipal;
  readonly correlationId: string;
}

@Injectable()
export class WorkforceResourcesService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  async listResources(
    principal: GigaOpsPrincipal,
    rawQuery: unknown,
  ): Promise<WorkforceResourcePageV1> {
    const query = parse(ListWorkforceResourcesV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['r.tenant_id = $1'];
      if (query.q) {
        values.push(`%${query.q}%`);
        where.push(`(r.display_name ILIKE $${values.length} OR r.reference_code ILIKE $${values.length})`);
      }
      if (query.resourceType) {
        values.push(query.resourceType);
        where.push(`r.resource_type = $${values.length}`);
      }
      if (query.status) {
        values.push(query.status);
        where.push(`r.status = $${values.length}`);
      }
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const direction = query.direction === 'DESC' ? 'DESC' : 'ASC';
      const result = await client.query(
        `SELECT r.*, COUNT(*) OVER()::int AS total_count,
                (SELECT COUNT(*)::int
                   FROM gigalibs_workforce.resource_capabilities rc
                  WHERE rc.tenant_id = r.tenant_id
                    AND rc.resource_id = r.id
                    AND rc.status = 'ACTIVE'
                    AND (rc.expires_at IS NULL OR rc.expires_at > now())) AS qualification_count
           FROM gigalibs_workforce.workforce_resources r
          WHERE ${where.join(' AND ')}
          ORDER BY r.display_name ${direction}, r.id ${direction}
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return {
        items: result.rows.map(mapResource),
        total: Number(result.rows[0]?.total_count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * WI-OI-120u: the resource picker of the metadata windows. Finds resources by name or code, or by id so a window can
   * show the names of the resources it already refers to.
   */
  async lookupResources(
    principal: GigaOpsPrincipal,
    request: { readonly search?: string; readonly ids?: readonly string[]; readonly limit: number },
  ): Promise<readonly WorkforceResourceV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['r.tenant_id = $1'];
      if (request.ids?.length) {
        values.push(request.ids);
        where.push(`r.id = ANY($${values.length}::uuid[])`);
      } else if (request.search) {
        values.push(`%${request.search}%`);
        where.push(`(r.display_name ILIKE $${values.length} OR r.reference_code ILIKE $${values.length})`);
      }
      values.push(Math.min(Math.max(request.limit, 1), 100));
      const result = await client.query(
        `SELECT r.*, 0 AS qualification_count
           FROM gigalibs_workforce.workforce_resources r
          WHERE ${where.join(' AND ')}
          ORDER BY r.display_name ASC, r.id ASC
          LIMIT $${values.length}`,
        values,
      );
      return result.rows.map(mapResource);
    });
  }

  async getResource(
    principal: GigaOpsPrincipal,
    resourceId: string,
  ): Promise<WorkforceResourceDetailV1> {
    assertUuid(resourceId, 'resourceId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) =>
      this.getResourceWithClient(client, principal.tenantId, resourceId),
    );
  }

  async createResource(
    context: CommandContext,
    rawInput: unknown,
  ): Promise<WorkforceResourceDetailV1> {
    const input = parse(CreateWorkforceResourceV1Schema, rawInput);
    if (input.platformUserId) assertMayLinkLogin(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      try {
        const result = await client.query(
          `INSERT INTO gigalibs_workforce.workforce_resources
             (tenant_id, reference_code, display_name, resource_type, platform_user_id,
              created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
           RETURNING id`,
          [
            context.principal.tenantId,
            normalizeCode(input.referenceCode),
            input.displayName,
            input.resourceType,
            input.platformUserId ?? null,
            context.principal.subject,
            context.correlationId,
          ],
        );
        const id = result.rows[0]!.id as string;
        await this.recordMutation(client, context, 'WORKFORCE_RESOURCE_CREATED', 'WORKFORCE_RESOURCE', id, 1, {
          resourceType: input.resourceType,
          status: 'ACTIVE',
          ...(input.platformUserId ? { platformUserId: { before: null, after: input.platformUserId } } : {}),
        });
        return this.getResourceWithClient(client, context.principal.tenantId, id);
      } catch (error) {
        translateConstraint(error, 'A resource with this reference code or platform user already exists.');
      }
    });
  }

  async updateResource(
    context: CommandContext,
    resourceId: string,
    rawInput: unknown,
  ): Promise<WorkforceResourceDetailV1> {
    assertUuid(resourceId, 'resourceId');
    const input = parse(UpdateWorkforceResourceV1Schema, rawInput);
    const changesLink = input.platformUserId !== undefined;
    if (changesLink) assertMayLinkLogin(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      try {
        // WI-OI-120n: the link before the change, for the audit record (who was linked, and to whom it now points).
        const previousLink = changesLink
          ? ((
              await client.query(
                `SELECT platform_user_id FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
                [context.principal.tenantId, resourceId],
              )
            ).rows[0]?.platform_user_id ?? null)
          : null;
        const result = await client.query(
          `UPDATE gigalibs_workforce.workforce_resources
              SET display_name = CASE WHEN $4::boolean THEN $5 ELSE display_name END,
                  resource_type = CASE WHEN $6::boolean THEN $7 ELSE resource_type END,
                  platform_user_id = CASE WHEN $8::boolean THEN $9 ELSE platform_user_id END,
                  status = CASE WHEN $10::boolean THEN $11 ELSE status END,
                  version = version + 1,
                  updated_by = $12,
                  correlation_id = $13,
                  updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND version = $3
            RETURNING version`,
          [
            context.principal.tenantId,
            resourceId,
            input.expectedVersion,
            input.displayName !== undefined,
            input.displayName ?? null,
            input.resourceType !== undefined,
            input.resourceType ?? null,
            input.platformUserId !== undefined,
            input.platformUserId ?? null,
            input.status !== undefined,
            input.status ?? null,
            context.principal.subject,
            context.correlationId,
          ],
        );
        if (result.rowCount === 0) {
          await this.throwNotFoundOrConflict(client, context.principal.tenantId, resourceId, input.expectedVersion);
        }
        const version = Number(result.rows[0]!.version);
        await this.recordMutation(client, context, 'WORKFORCE_RESOURCE_UPDATED', 'WORKFORCE_RESOURCE', resourceId, version, {
          status: input.status,
          ...(changesLink ? { platformUserId: { before: previousLink, after: input.platformUserId ?? null } } : {}),
          ...(input.reason ? { reason: input.reason } : {}),
        });
        return this.getResourceWithClient(client, context.principal.tenantId, resourceId);
      } catch (error) {
        translateConstraint(error, 'The requested platform user is already linked to another resource.');
      }
    });
  }

  async listCapabilityDefinitions(principal: GigaOpsPrincipal): Promise<{
    readonly items: readonly CapabilityDefinitionV1[];
    readonly generatedAt: string;
  }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(
        `SELECT c.*,
                (SELECT COUNT(*)::int
                   FROM gigalibs_workforce.resource_capabilities rc
                  WHERE rc.tenant_id = c.tenant_id
                    AND rc.capability_definition_id = c.id
                    AND rc.status = 'ACTIVE'
                    AND (rc.expires_at IS NULL OR rc.expires_at > now())) AS assigned_resource_count
           FROM gigalibs_workforce.capability_definitions c
          WHERE c.tenant_id = $1
          ORDER BY c.status ASC, c.name ASC`,
        [principal.tenantId],
      );
      return { items: result.rows.map(mapCapability), generatedAt: new Date().toISOString() };
    });
  }

  async createCapabilityDefinition(
    context: CommandContext,
    rawInput: unknown,
  ): Promise<CapabilityDefinitionV1> {
    const input = parse(CreateCapabilityDefinitionV1Schema, rawInput);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      try {
        const result = await client.query(
          `INSERT INTO gigalibs_workforce.capability_definitions
             (tenant_id, code, name, description, evidence_required, default_validity_days,
              created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
           RETURNING *`,
          [
            context.principal.tenantId,
            normalizeCode(input.code),
            input.name,
            input.description ?? null,
            input.evidenceRequired ?? false,
            input.defaultValidityDays ?? null,
            context.principal.subject,
            context.correlationId,
          ],
        );
        const row = result.rows[0]!;
        await this.recordMutation(client, context, 'CAPABILITY_DEFINITION_CREATED', 'CAPABILITY_DEFINITION', row.id, 1, {
          evidenceRequired: row.evidence_required,
          status: 'ACTIVE',
        });
        return mapCapability({ ...row, assigned_resource_count: 0 });
      } catch (error) {
        translateConstraint(error, 'A capability with this code already exists.');
      }
    });
  }

  async assignCapability(
    context: CommandContext,
    resourceId: string,
    rawInput: unknown,
  ): Promise<ResourceQualificationV1> {
    assertUuid(resourceId, 'resourceId');
    const input = parse(AssignResourceCapabilityV1Schema, rawInput);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const linkedTo = await this.requireActiveResource(client, context.principal.tenantId, resourceId);
      // Security review L3 (owner, L3a): someone else records your qualifications, as someone else decides your absence;
      // otherwise a supervisor could qualify themselves for work and pass the booking check.
      if (linkedTo !== null && linkedTo === context.principal.subject) {
        throw new ForbiddenException({ code: 'WORKFORCE_FOUR_EYES', message: 'Someone else must record a qualification of your own.' });
      }
      await this.requireActiveCapability(client, context.principal.tenantId, input.capabilityDefinitionId);
      try {
        const result = await client.query(
          `INSERT INTO gigalibs_workforce.resource_capabilities
             (tenant_id, resource_id, capability_definition_id, proficiency, valid_from,
              expires_at, issuing_authority, evidence_reference, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)
           RETURNING id, version`,
          [
            context.principal.tenantId,
            resourceId,
            input.capabilityDefinitionId,
            input.proficiency ?? 'STANDARD',
            input.validFrom,
            input.expiresAt ?? null,
            input.issuingAuthority ?? null,
            input.evidenceReference ?? null,
            context.principal.subject,
            context.correlationId,
          ],
        );
        const qualificationId = result.rows[0]!.id as string;
        await this.recordMutation(client, context, 'RESOURCE_CAPABILITY_ASSIGNED', 'RESOURCE_CAPABILITY', qualificationId, 1, {
          resourceId,
          capabilityDefinitionId: input.capabilityDefinitionId,
          status: 'ACTIVE',
        });
        return this.getQualification(client, context.principal.tenantId, qualificationId);
      } catch (error) {
        translateConstraint(error, 'This capability is already assigned to the resource.');
      }
    });
  }

  private async getResourceWithClient(
    client: PoolClient,
    tenantId: string,
    resourceId: string,
  ): Promise<WorkforceResourceDetailV1> {
    const result = await client.query(
      `SELECT r.*,
              (SELECT COUNT(*)::int FROM gigalibs_workforce.resource_capabilities rc
                WHERE rc.tenant_id = r.tenant_id AND rc.resource_id = r.id
                  AND rc.status = 'ACTIVE'
                  AND (rc.expires_at IS NULL OR rc.expires_at > now())) AS qualification_count
         FROM gigalibs_workforce.workforce_resources r
        WHERE r.tenant_id = $1 AND r.id = $2`,
      [tenantId, resourceId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Workforce resource was not found.');
    const qualifications = await client.query(
      `${qualificationSelect()}
        WHERE rc.tenant_id = $1 AND rc.resource_id = $2
        ORDER BY c.name ASC`,
      [tenantId, resourceId],
    );
    return { ...mapResource(result.rows[0]), qualifications: qualifications.rows.map(mapQualification) };
  }

  private async getQualification(client: PoolClient, tenantId: string, id: string) {
    const result = await client.query(`${qualificationSelect()} WHERE rc.tenant_id = $1 AND rc.id = $2`, [tenantId, id]);
    if (result.rowCount === 0) throw new NotFoundException('Resource qualification was not found.');
    return mapQualification(result.rows[0]);
  }

  /** The active resource's linked login (null when none); not found when it is missing or inactive. */
  private async requireActiveResource(client: PoolClient, tenantId: string, id: string): Promise<string | null> {
    const result = await client.query<{ platform_user_id: string | null }>(
      `SELECT platform_user_id FROM gigalibs_workforce.workforce_resources
        WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
      [tenantId, id],
    );
    if (result.rowCount === 0) throw new NotFoundException('Active Workforce resource was not found.');
    return result.rows[0]?.platform_user_id ?? null;
  }

  private async requireActiveCapability(client: PoolClient, tenantId: string, id: string) {
    const result = await client.query(
      `SELECT 1 FROM gigalibs_workforce.capability_definitions
        WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
      [tenantId, id],
    );
    if (result.rowCount === 0) throw new NotFoundException('Active capability definition was not found.');
  }

  private async throwNotFoundOrConflict(
    client: PoolClient,
    tenantId: string,
    resourceId: string,
    expectedVersion: number,
  ): Promise<never> {
    const existing = await client.query(
      `SELECT version FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND id = $2`,
      [tenantId, resourceId],
    );
    if (existing.rowCount === 0) throw new NotFoundException('Workforce resource was not found.');
    throw new ConflictException({
      code: 'WORKFORCE_RESOURCE_VERSION_CONFLICT',
      message: 'The resource was changed by another request. Reload and try again.',
      expectedVersion,
      currentVersion: Number(existing.rows[0]!.version),
    });
  }

  private async recordMutation(
    client: PoolClient,
    context: CommandContext,
    action: string,
    entityType: string,
    entityId: string,
    aggregateVersion: number,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const eventId = randomUUID();
    await client.query(
      `INSERT INTO gigalibs_workforce.audit_events
         (id, tenant_id, actor_subject, action, entity_type, entity_id, correlation_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [eventId, context.principal.tenantId, context.principal.subject, action, entityType, entityId, context.correlationId, JSON.stringify(payload)],
    );
    await client.query(
      `INSERT INTO gigalibs_workforce.outbox_events
         (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
          correlation_id, schema_version, payload)
       VALUES ($1, $2, 'workforce.facts.v1', $3, $4, $5, $6, $7, 1, $8::jsonb)`,
      [randomUUID(), context.principal.tenantId, `${action}_V1`, entityType, entityId, aggregateVersion, context.correlationId, JSON.stringify({ entityId, aggregateVersion, ...payload })],
    );
  }
}

function qualificationSelect(): string {
  return `SELECT rc.*, c.code AS capability_code, c.name AS capability_name
            FROM gigalibs_workforce.resource_capabilities rc
            JOIN gigalibs_workforce.capability_definitions c
              ON c.tenant_id = rc.tenant_id AND c.id = rc.capability_definition_id`;
}

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new BadRequestException({
    code: 'WORKFORCE_VALIDATION_FAILED',
    message: 'The Workforce request is invalid.',
    issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

function assertUuid(value: string, field: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException({ code: 'WORKFORCE_VALIDATION_FAILED', message: `${field} must be a UUID.` });
  }
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function translateConstraint(error: unknown, message: string): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
    throw new ConflictException({ code: 'WORKFORCE_UNIQUE_CONFLICT', message });
  }
  throw error;
}

function mapResource(row: any): WorkforceResourceV1 {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    displayName: row.display_name,
    resourceType: row.resource_type,
    platformUserId: row.platform_user_id ?? null,
    status: row.status,
    version: Number(row.version),
    qualificationCount: Number(row.qualification_count ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapCapability(row: any): CapabilityDefinitionV1 {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    evidenceRequired: row.evidence_required === true,
    defaultValidityDays: row.default_validity_days === null ? null : Number(row.default_validity_days),
    status: row.status,
    version: Number(row.version),
    assignedResourceCount: Number(row.assigned_resource_count ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapQualification(row: any): ResourceQualificationV1 {
  return {
    id: row.id,
    resourceId: row.resource_id,
    capabilityDefinitionId: row.capability_definition_id,
    capabilityCode: row.capability_code,
    capabilityName: row.capability_name,
    proficiency: row.proficiency,
    status: row.status,
    validFrom: new Date(row.valid_from).toISOString(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    issuingAuthority: row.issuing_authority ?? null,
    evidenceReference: row.evidence_reference ?? null,
    version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * WI-OI-120n (security review): who a Workforce person is decides whose time they punch and whose week they submit,
 * and the "never decide your own" checks rely on it. Only holders of `workforce.resources.link` (workspace
 * administrators, through `workforce:*`) may set, change or clear it; managing people does not include it.
 */
function assertMayLinkLogin(principal: GigaOpsPrincipal): void {
  if (!hasWorkforcePermission(principal.permissions, 'workforce.resources.link')) {
    throw new ForbiddenException({
      code: 'WORKFORCE_LINK_FORBIDDEN',
      message: 'Only a workspace administrator can link a person to a login.',
    });
  }
}
