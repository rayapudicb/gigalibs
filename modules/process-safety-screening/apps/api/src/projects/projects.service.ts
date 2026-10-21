import { randomUUID } from 'node:crypto';
import type {
  ArchiveSpeedProjectInputV1,
  CreateSpeedProjectInputV1,
  SpeedProjectPageV1,
  SpeedProjectStatus,
  SpeedProjectV1,
  UpdateSpeedProjectInputV1,
} from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  type ModulePrincipal,
  type OrganizationAccess,
  OrganizationReplica,
  OrganizationScopeRefusal,
  OrganizationVersionPendingError,
  assertOrganizationWrite,
  assertOwningUnit,
  moduleErrors,
  organizationAccess,
  organizationReadCondition,
  recordMutation,
} from '@gigalibs/module-sdk';
import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type pg from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';

export const errors = moduleErrors('SPEED', 'SPEED');

type Client = pg.PoolClient;

const COLUMNS = `id, code, name, site_unit_id, owner_subject, notes, status, version, created_by, created_at, updated_at,
  archived_by, archived_at`;

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  site_unit_id: string;
  owner_subject: string;
  notes: string | null;
  status: SpeedProjectStatus;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  archived_by: string | null;
  archived_at: Date | null;
}

function toProject(row: ProjectRow): SpeedProjectV1 {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    siteUnitId: row.site_unit_id,
    ownerSubject: row.owner_subject,
    notes: row.notes,
    status: row.status,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    archivedBy: row.archived_by,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
  };
}

/** The fields a change may touch, as they are audited. */
const AUDITED: readonly (keyof SpeedProjectV1)[] = [
  'code',
  'name',
  'siteUnitId',
  'ownerSubject',
  'notes',
  'status',
];

/** Field by field, what a change did: `{ name: { from, to } }` (FR-AUD-01). */
function changes(
  before: SpeedProjectV1 | null,
  after: SpeedProjectV1,
): Record<string, { from: unknown; to: unknown }> {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of AUDITED) {
    const from = before ? before[field] : null;
    if (from !== after[field]) changed[field] = { from, to: after[field] };
  }
  return changed;
}

/** Sortable columns, by the name the list query uses; nothing else reaches ORDER BY. */
const SORT: Readonly<Record<string, string>> = {
  code: 'lower(p.code)',
  name: 'lower(p.name)',
  updatedAt: 'p.updated_at',
};

export interface ProjectPageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly status?: SpeedProjectStatus;
  readonly siteUnitId?: string;
  readonly sortField?: keyof typeof SORT;
  readonly sortDirection?: 'ASC' | 'DESC';
}

/**
 * SPEED projects (WI-OI-120bw). Every statement runs in a transaction bound to the verified tenant (forced RLS). A
 * project belongs to one site: a member reads the projects of the units their organization access covers and changes
 * those of the units they may write (ADR-0018). Every change writes the state, its audit evidence (old and new values
 * and the reason) and its outbox fact in the same transaction. Projects are archived, never deleted.
 */
@Injectable()
export class ProjectsService {
  private readonly organization = new OrganizationReplica(SCHEMA);

  constructor(private readonly database: DatabaseService) {}

  list(principal: ModulePrincipal, query: ProjectPageQuery): Promise<SpeedProjectPageV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.access(client, principal);
      const values: unknown[] = [principal.tenantId];
      const bind = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      const conditions = ['p.tenant_id = $1'];
      const scope = organizationReadCondition(access, 'p.site_unit_id', bind);
      if (scope) conditions.push(scope);
      if (query.search) {
        const slot = bind(
          `%${query.search.toLocaleLowerCase('en-US').replace(/[\\%_]/g, (character) => `\\${character}`)}%`,
        );
        conditions.push(`(lower(p.code) LIKE ${slot} OR lower(p.name) LIKE ${slot})`);
      }
      if (query.status) conditions.push(`p.status = ${bind(query.status)}`);
      if (query.siteUnitId) conditions.push(`p.site_unit_id = ${bind(query.siteUnitId)}`);
      const where = conditions.join(' AND ');
      const total = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM ${SCHEMA}.projects p WHERE ${where}`,
        values,
      );
      const order = SORT[query.sortField ?? 'updatedAt'] ?? 'p.updated_at';
      const direction = query.sortDirection ?? (query.sortField ? 'ASC' : 'DESC');
      const page = await client.query<ProjectRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.projects p WHERE ${where}
          ORDER BY ${order} ${direction === 'ASC' ? 'ASC' : 'DESC'}, p.id
          LIMIT ${bind(query.pageSize)} OFFSET ${bind((query.page - 1) * query.pageSize)}`,
        values,
      );
      return {
        items: page.rows.map(toProject),
        total: Number(total.rows[0]?.count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /** A project outside the member's organization access answers "not found", as one in another tenant does. */
  get(principal: ModulePrincipal, id: string): Promise<SpeedProjectV1> {
    errors.assertUuid(id, 'id');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await this.access(client, principal);
      return toProject(await this.readable(client, principal, access, id));
    });
  }

  /** Idempotent by request key: a repeated request returns the project it created, with `replayed`. */
  create(
    context: ModuleCommandContext,
    input: CreateSpeedProjectInputV1,
  ): Promise<{ project: SpeedProjectV1; replayed: boolean }> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await this.access(client, context.principal);
      const values: unknown[] = [tenantId, input.requestKey];
      const scope = organizationReadCondition(access, 'site_unit_id', (value) => {
        values.push(value);
        return `$${values.length}`;
      });
      const replay = await client.query<ProjectRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.projects WHERE tenant_id = $1 AND request_key = $2${scope ? ` AND ${scope}` : ''}`,
        values,
      );
      if (replay.rows[0]) return { project: toProject(replay.rows[0]), replayed: true };
      await this.assertSite(client, context.principal, access, input.siteUnitId);
      let row: ProjectRow | undefined;
      try {
        const inserted = await client.query<ProjectRow>(
          `INSERT INTO ${SCHEMA}.projects (id, tenant_id, request_key, code, name, site_unit_id, owner_subject, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING ${COLUMNS}`,
          [
            randomUUID(),
            tenantId,
            input.requestKey,
            input.code,
            input.name,
            input.siteUnitId,
            input.ownerSubject ?? subject,
            input.notes ?? null,
            subject,
          ],
        );
        row = inserted.rows[0];
      } catch (error) {
        errors.translateConstraint(error, { unique: 'A project with this code already exists.' });
      }
      if (!row) throw new Error('The project insert returned no row.');
      const project = toProject(row);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'PROJECT_CREATED',
        aggregateType: 'project',
        aggregateId: project.id,
        aggregateVersion: project.version,
        payload: { changes: changes(null, project), reason: null },
      });
      return { project, replayed: false };
    });
  }

  update(
    context: ModuleCommandContext,
    id: string,
    input: UpdateSpeedProjectInputV1,
  ): Promise<SpeedProjectV1> {
    errors.assertUuid(id, 'id');
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await this.access(client, context.principal);
      const before = toProject(await this.readable(client, context.principal, access, id, true));
      this.assertWrite(access, before.siteUnitId);
      if (before.status === 'ARCHIVED') this.refuseArchived();
      if (before.version !== input.version) return errors.versionConflict('The project');
      if (input.siteUnitId !== undefined && input.siteUnitId !== before.siteUnitId) {
        await this.assertSite(client, context.principal, access, input.siteUnitId);
      }
      const updated = await client.query<ProjectRow>(
        `UPDATE ${SCHEMA}.projects
            SET name = COALESCE($4, name), site_unit_id = COALESCE($5, site_unit_id), owner_subject = COALESCE($6, owner_subject),
                notes = CASE WHEN $7::boolean THEN $8 ELSE notes END, version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING ${COLUMNS}`,
        [
          tenantId,
          id,
          input.version,
          input.name ?? null,
          input.siteUnitId ?? null,
          input.ownerSubject ?? null,
          input.notes !== undefined,
          input.notes ?? null,
        ],
      );
      const row = updated.rows[0];
      if (!row) return errors.versionConflict('The project');
      const project = toProject(row);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'PROJECT_UPDATED',
        aggregateType: 'project',
        aggregateId: project.id,
        aggregateVersion: project.version,
        payload: { changes: changes(before, project), reason: input.reason },
      });
      return project;
    });
  }

  archive(
    context: ModuleCommandContext,
    id: string,
    input: ArchiveSpeedProjectInputV1,
  ): Promise<SpeedProjectV1> {
    errors.assertUuid(id, 'id');
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await this.access(client, context.principal);
      const before = toProject(await this.readable(client, context.principal, access, id, true));
      this.assertWrite(access, before.siteUnitId);
      if (before.status === 'ARCHIVED') this.refuseArchived();
      if (before.version !== input.version) return errors.versionConflict('The project');
      const archived = await client.query<ProjectRow>(
        `UPDATE ${SCHEMA}.projects
            SET status = 'ARCHIVED', archived_by = $4, archived_at = now(), version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING ${COLUMNS}`,
        [tenantId, id, input.version, subject],
      );
      const row = archived.rows[0];
      if (!row) return errors.versionConflict('The project');
      const project = toProject(row);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'PROJECT_ARCHIVED',
        aggregateType: 'project',
        aggregateId: project.id,
        aggregateVersion: project.version,
        payload: { changes: changes(before, project), reason: input.reason },
      });
      return project;
    });
  }

  /** The row when the member may read it; locked for the rest of the transaction when it is about to change. */
  private async readable(
    client: Client,
    principal: ModulePrincipal,
    access: OrganizationAccess,
    id: string,
    lock = false,
  ): Promise<ProjectRow> {
    const values: unknown[] = [principal.tenantId, id];
    const scope = organizationReadCondition(access, 'site_unit_id', (value) => {
      values.push(value);
      return `$${values.length}`;
    });
    const result = await client.query<ProjectRow>(
      `SELECT ${COLUMNS} FROM ${SCHEMA}.projects WHERE tenant_id = $1 AND id = $2${scope ? ` AND ${scope}` : ''}${lock ? ' FOR UPDATE' : ''}`,
      values,
    );
    return result.rows[0] ?? errors.notFound('The project');
  }

  private async access(client: Client, principal: ModulePrincipal): Promise<OrganizationAccess> {
    try {
      return await organizationAccess(
        this.organization,
        client,
        principal.tenantId,
        principal.organization ?? { mode: 'TENANT' },
      );
    } catch (error) {
      if (error instanceof OrganizationVersionPendingError)
        throw new ServiceUnavailableException({ code: error.code, message: error.message });
      throw error;
    }
  }

  /** The site must be a unit that holds records in the organization in force, and one the member may write. */
  private async assertSite(
    client: Client,
    principal: ModulePrincipal,
    access: OrganizationAccess,
    siteUnitId: string,
  ): Promise<void> {
    try {
      await assertOwningUnit(
        this.organization,
        client,
        principal.tenantId,
        access,
        'UNIT',
        siteUnitId,
      );
    } catch (error) {
      if (error instanceof OrganizationScopeRefusal)
        throw new ForbiddenException({ code: error.code, message: error.message });
      throw error;
    }
    this.assertWrite(access, siteUnitId);
  }

  private assertWrite(access: OrganizationAccess, siteUnitId: string): void {
    try {
      assertOrganizationWrite(access, siteUnitId);
    } catch (error) {
      if (error instanceof OrganizationScopeRefusal)
        throw new ForbiddenException({ code: error.code, message: error.message });
      throw error;
    }
  }

  private refuseArchived(): never {
    throw new ForbiddenException({
      code: 'SPEED_PROJECT_ARCHIVED',
      message: 'The project is archived and can no longer change.',
    });
  }
}
