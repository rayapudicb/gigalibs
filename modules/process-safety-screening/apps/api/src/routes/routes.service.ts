import { randomUUID } from 'node:crypto';
import type {
  CreateSpeedRouteInputV1,
  ListSpeedRoutesQueryV1,
  SpeedArchiveInputV1,
  SpeedPageV1,
  SpeedResultV1,
  SpeedRouteDetailV1,
  SpeedRouteV1,
  UpdateSpeedRouteInputV1,
} from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  type ModulePrincipal,
  recordMutation,
} from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';
import { type Client, assertSiteWrite, readableSite, resolveAccess } from '../access.js';
import { changes, likePattern } from '../audit.js';
import { SCHEMA, TOPIC } from '../config.js';
import { CriteriaService } from '../criteria/criteria.service.js';
import { DatabaseService } from '../database.service.js';
import { errors, refuse } from '../errors.js';
import {
  ROUTE_COLUMNS,
  ROUTE_FROM,
  type RouteRow,
  readRoute,
  readSteps,
  routeForChange,
  toRoute,
} from './route-store.js';
import { computeStep, routeResults } from './screening.js';

const AUDITED: readonly (keyof SpeedRouteV1)[] = ['projectId', 'name', 'routeVersion', 'status'];
const SORT: Readonly<Record<string, string>> = { name: 'lower(r.name)', updatedAt: 'r.updated_at' };

export interface RoutePageQuery extends ListSpeedRoutesQueryV1 {
  readonly sortField?: 'name' | 'updatedAt';
  readonly sortDirection?: 'ASC' | 'DESC';
}

/**
 * SPEED routes (WI-OI-120bx; plan v1.4 §4.4). A route belongs to a project and so to the project's site; a member reads
 * and changes routes only where their organization access allows. R1 routes are drafts; archived, never deleted. Every
 * change writes its audit row (changed fields and the reason) and outbox fact in the same transaction.
 */
@Injectable()
export class RoutesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly criteria: CriteriaService,
  ) {}

  list(principal: ModulePrincipal, query: RoutePageQuery): Promise<SpeedPageV1<SpeedRouteV1>> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await resolveAccess(client, principal);
      const values: unknown[] = [principal.tenantId];
      const bind = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      const conditions = ['r.tenant_id = $1'];
      const scope = readableSite(access, 'p.site_unit_id', values);
      if (scope) conditions.push(scope);
      if (query.search) conditions.push(`lower(r.name) LIKE ${bind(likePattern(query.search))}`);
      if (query.projectId) conditions.push(`r.project_id = ${bind(query.projectId)}`);
      if (query.status) conditions.push(`r.status = ${bind(query.status)}`);
      const where = conditions.join(' AND ');
      const total = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM ${ROUTE_FROM} WHERE ${where}`,
        values,
      );
      const order = SORT[query.sortField ?? 'updatedAt'] ?? 'r.updated_at';
      const direction = query.sortDirection ?? (query.sortField === 'name' ? 'ASC' : 'DESC');
      const page = await client.query<RouteRow>(
        `SELECT ${ROUTE_COLUMNS} FROM ${ROUTE_FROM} WHERE ${where} ORDER BY ${order} ${direction === 'ASC' ? 'ASC' : 'DESC'}, r.id
          LIMIT ${bind(query.pageSize)} OFFSET ${bind((query.page - 1) * query.pageSize)}`,
        values,
      );
      return {
        items: page.rows.map(toRoute),
        total: Number(total.rows[0]?.count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /** The route with its steps, materials, conditions and each step's latest result. */
  get(principal: ModulePrincipal, id: string): Promise<SpeedRouteDetailV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await resolveAccess(client, principal);
      return this.detail(
        client,
        principal.tenantId,
        await readRoute(client, principal, access, id),
      );
    });
  }

  /** Idempotent by request key. The project must be readable, active and on a site the member may write. */
  create(
    context: ModuleCommandContext,
    input: CreateSpeedRouteInputV1,
  ): Promise<{ route: SpeedRouteDetailV1; replayed: boolean }> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await resolveAccess(client, context.principal);
      const replayValues: unknown[] = [tenantId, input.requestKey];
      const replayScope = readableSite(access, 'p.site_unit_id', replayValues);
      const replay = await client.query<RouteRow>(
        `SELECT ${ROUTE_COLUMNS} FROM ${ROUTE_FROM} WHERE r.tenant_id = $1 AND r.request_key = $2${replayScope ? ` AND ${replayScope}` : ''}`,
        replayValues,
      );
      if (replay.rows[0])
        return { route: await this.detail(client, tenantId, replay.rows[0]), replayed: true };
      const projectValues: unknown[] = [tenantId, input.projectId];
      const projectScope = readableSite(access, 'site_unit_id', projectValues);
      const project = await client.query<{ site_unit_id: string; status: string }>(
        `SELECT site_unit_id, status FROM ${SCHEMA}.projects WHERE tenant_id = $1 AND id = $2${projectScope ? ` AND ${projectScope}` : ''} FOR SHARE`,
        projectValues,
      );
      const found = project.rows[0] ?? errors.notFound('The project');
      assertSiteWrite(access, found.site_unit_id);
      if (found.status !== 'ACTIVE')
        refuse('SPEED_PROJECT_ARCHIVED', 'The project is archived and takes no new routes.');
      const id = randomUUID();
      try {
        await client.query(
          `INSERT INTO ${SCHEMA}.routes (id, tenant_id, request_key, project_id, name, author_subject, created_by) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [id, tenantId, input.requestKey, input.projectId, input.name, subject],
        );
      } catch (error) {
        errors.translateConstraint(error, {
          unique: 'The project already has a route with this name.',
        });
      }
      const route = toRoute(await readRoute(client, context.principal, access, id));
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'ROUTE_CREATED',
        aggregateType: 'route',
        aggregateId: route.id,
        aggregateVersion: route.version,
        payload: { changes: changes(null, route, AUDITED), reason: null },
      });
      return { route: { ...route, steps: [] }, replayed: false };
    });
  }

  update(
    context: ModuleCommandContext,
    id: string,
    input: UpdateSpeedRouteInputV1,
  ): Promise<SpeedRouteDetailV1> {
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await resolveAccess(client, context.principal);
      const before = toRoute(await routeForChange(client, context.principal, access, id));
      if (before.version !== input.version) return errors.versionConflict('The route');
      try {
        await client.query(
          `UPDATE ${SCHEMA}.routes SET name = $3, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
          [tenantId, id, input.name],
        );
      } catch (error) {
        errors.translateConstraint(error, {
          unique: 'The project already has a route with this name.',
        });
      }
      const row = await readRoute(client, context.principal, access, id);
      const route = toRoute(row);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'ROUTE_UPDATED',
        aggregateType: 'route',
        aggregateId: route.id,
        aggregateVersion: route.version,
        payload: { changes: changes(before, route, AUDITED), reason: input.reason },
      });
      return this.detail(client, tenantId, row);
    });
  }

  archive(
    context: ModuleCommandContext,
    id: string,
    input: SpeedArchiveInputV1,
  ): Promise<SpeedRouteDetailV1> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await resolveAccess(client, context.principal);
      const before = toRoute(await routeForChange(client, context.principal, access, id));
      if (before.version !== input.version) return errors.versionConflict('The route');
      await client.query(
        `UPDATE ${SCHEMA}.routes SET status = 'ARCHIVED', archived_by = $3, archived_at = now(), version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, subject],
      );
      const row = await readRoute(client, context.principal, access, id);
      const route = toRoute(row);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'ROUTE_ARCHIVED',
        aggregateType: 'route',
        aggregateId: route.id,
        aggregateVersion: route.version,
        payload: { changes: changes(before, route, AUDITED), reason: input.reason },
      });
      return this.detail(client, tenantId, row);
    });
  }

  /**
   * Recomputes every step with the engines and the criteria in force (`speed.engines.run`). A step whose inputs and
   * versions are unchanged keeps its result; any other gets a new one.
   */
  recompute(context: ModuleCommandContext, id: string): Promise<SpeedRouteDetailV1> {
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await resolveAccess(client, context.principal);
      const route = await readRoute(client, context.principal, access, id, true);
      if (route.status !== 'DRAFT')
        refuse('SPEED_ROUTE_NOT_DRAFT', 'Only a draft route is recomputed; its results are kept.');
      const criteria = await this.criteria.inForce(client, tenantId);
      const steps = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.steps WHERE tenant_id = $1 AND route_id = $2 ORDER BY position`,
        [tenantId, id],
      );
      for (const step of steps.rows) await computeStep(client, context, id, step.id, criteria);
      return this.detail(client, tenantId, await readRoute(client, context.principal, access, id));
    });
  }

  /** The route's results, newest first. */
  results(
    principal: ModulePrincipal,
    id: string,
    limit: number,
  ): Promise<{ items: SpeedResultV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const access = await resolveAccess(client, principal);
      await readRoute(client, principal, access, id);
      return { items: await routeResults(client, principal.tenantId, id, limit) };
    });
  }

  private async detail(
    client: Client,
    tenantId: string,
    row: RouteRow,
  ): Promise<SpeedRouteDetailV1> {
    return { ...toRoute(row), steps: await readSteps(client, tenantId, row.id) };
  }
}
