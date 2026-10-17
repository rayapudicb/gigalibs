import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CancelCmmsRequestV1Schema,
  CreateCmmsRequestV1Schema,
  SearchCmmsRequestsV1Schema,
  TriageCmmsRequestV1Schema,
  holdsPermission,
  type CancelCmmsRequestV1,
  type CmmsMaintenanceRequestV1,
  type CmmsPageV1,
  type CreateCmmsRequestV1,
  type TriageCmmsRequestV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import {
  assertUuid,
  iso,
  isoOrNull,
  notFound,
  parseInput,
  recordMutation,
  versionConflict,
  chosenOrder,
} from '../common/command.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import { DatabaseService } from '../database/database.service.js';
import { AssetsService } from '../assets/assets.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

// WI-OI-120be: the columns a chosen sort may use; nothing else reaches ORDER BY.
const REQ_SORT = { requestNumber: 'r.request_number', title: 'r.title', createdAt: 'r.created_at' } as const;

const REQ_COLUMNS = `r.*, a.name AS asset_name, w.wo_number AS converted_wo_number`;
const REQ_FROM = `gigalibs_cmms.maintenance_requests r
  LEFT JOIN gigalibs_cmms.assets a ON a.tenant_id = r.tenant_id AND a.id = r.asset_id
  LEFT JOIN gigalibs_cmms.work_orders w ON w.tenant_id = r.tenant_id AND w.id = r.converted_wo_id`;

function mapRequest(row: any): CmmsMaintenanceRequestV1 {
  return {
    id: row.id,
    requestNumber: row.request_number,
    title: row.title,
    description: row.description ?? null,
    priority: row.priority,
    status: row.status,
    assetId: row.asset_id ?? null,
    assetName: row.asset_name ?? null,
    siteRef: row.site_ref ?? null,
    departmentId: row.department_id ?? null,
    requesterSubject: row.requester_subject,
    requesterName: row.requester_name ?? null,
    requesterEmail: row.requester_email ?? null,
    requesterPhone: row.requester_phone ?? null,
    rejectionReason: row.rejection_reason ?? null,
    convertedWoId: row.converted_wo_id ?? null,
    convertedWoNumber: row.converted_wo_number ?? null,
    triagedBy: row.triaged_by ?? null,
    triagedAt: isoOrNull(row.triaged_at),
    cancelledAt: isoOrNull(row.cancelled_at),
    version: row.version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/**
 * WI-OI-120be (W1 reviews; owner decision D2a): planners (cmms.requests.write) see the requests in their units and
 * sites (R5, from the request's own unit and site); everyone sees the requests they raised. A request with no unit, or
 * no site for a planner held to places, is seen by workspace-wide planners only (W1-A review, Medium 1). So requester
 * contact details reach planners in scope and the requester only. A request that is not visible is "not found".
 */
function visibleRequests(principal: CmmsPrincipal, values: unknown[]): string[] {
  values.push(principal.subject);
  const own = `r.requester_subject = $${values.length}`;
  if (!holdsPermission(principal.permissions, 'cmms.requests.write')) return [own];
  const inScope = scopePredicates(principal, values, 'r.', undefined, undefined, { shared: false });
  return inScope.length === 0 ? [] : [`(${own} OR (${inScope.join(' AND ')}))`];
}

/** Changing someone else's request needs write access to its unit and site. */
function assertMayChange(principal: CmmsPrincipal, request: CmmsMaintenanceRequestV1): void {
  if (holdsPermission(principal.permissions, 'cmms.requests.write')) {
    assertWritableScope(principal, { departmentId: request.departmentId, siteRef: request.siteRef });
  }
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  /** Submit a maintenance request (any member holding cmms.requests.create). */
  async submit(context: CmmsCommandContext, raw: unknown): Promise<CmmsMaintenanceRequestV1> {
    const input = parseInput(CreateCmmsRequestV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      // The request takes its asset's unit and site, so R5 scopes it like the asset's own work.
      const asset = input.assetId ? await this.assets.visibleAsset(client, context.principal, input.assetId, false) : null;

      const counter = await client.query<{ last_value: string }>(
        `INSERT INTO gigalibs_cmms.request_counters AS c (tenant_id, last_value) VALUES ($1, 1)
         ON CONFLICT (tenant_id) DO UPDATE SET last_value = c.last_value + 1
         RETURNING last_value`,
        [context.principal.tenantId],
      );
      const requestNumber = `REQ-${String(counter.rows[0]!.last_value).padStart(6, '0')}`;
      const id = randomUUID();

      const inserted = await client.query(
        `INSERT INTO gigalibs_cmms.maintenance_requests
           (tenant_id, id, request_number, title, description, priority, status,
            asset_id, site_ref, department_id, requester_subject, requester_name, requester_email, requester_phone,
            correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          context.principal.tenantId,
          id,
          requestNumber,
          input.title,
          input.description ?? null,
          input.priority,
          input.assetId ?? null,
          asset?.siteRef ?? null,
          asset?.departmentId ?? null,
          context.principal.subject,
          input.requesterName ?? null,
          input.requesterEmail ?? null,
          input.requesterPhone ?? null,
          context.correlationId,
        ],
      );

      await recordMutation(client, context, {
        action: 'REQUEST_SUBMITTED',
        aggregateType: 'MAINTENANCE_REQUEST',
        aggregateId: id,
        aggregateVersion: 1,
        payload: {
          requestNumber,
          title: input.title,
          priority: input.priority,
          requesterSubject: context.principal.subject,
        },
      });

      return mapRequest(inserted.rows[0]);
    });
  }

  /** Read a maintenance request by id. Requesters without planner rights can only see their own. */
  async get(principal: CmmsPrincipal, id: string): Promise<CmmsMaintenanceRequestV1> {
    assertUuid(id, 'Maintenance request');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId, id];
      const where = ['r.tenant_id = $1', 'r.id = $2', ...visibleRequests(principal, values)];
      const result = await client.query(`SELECT ${REQ_COLUMNS} FROM ${REQ_FROM} WHERE ${where.join(' AND ')}`, values);
      if (!result.rows[0]) throw notFound('Maintenance request');
      return mapRequest(result.rows[0]);
    });
  }

  /** Search maintenance requests with pagination and status/priority filters. */
  async search(principal: CmmsPrincipal, raw: unknown): Promise<CmmsPageV1<CmmsMaintenanceRequestV1>> {
    const query = parseInput(SearchCmmsRequestsV1Schema, raw);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['r.tenant_id = $1', ...visibleRequests(principal, values)];

      if (query.requesterSubject && holdsPermission(principal.permissions, 'cmms.requests.write')) {
        values.push(query.requesterSubject);
        where.push(`r.requester_subject = $${values.length}`);
      }

      if (query.openOnly) {
        where.push(`r.status = 'PENDING'`);
      }
      if (query.status) {
        values.push(query.status);
        where.push(`r.status = $${values.length}`);
      }
      if (query.priority) {
        values.push(query.priority);
        where.push(`r.priority = $${values.length}`);
      }
      if (query.assetId) {
        values.push(query.assetId);
        where.push(`r.asset_id = $${values.length}`);
      }
      if (query.q) {
        values.push(`%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
        where.push(`(r.title ILIKE $${values.length} OR r.request_number ILIKE $${values.length})`);
      }

      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const result = await client.query(
        `SELECT ${REQ_COLUMNS}, COUNT(*) OVER()::int AS total_count
           FROM ${REQ_FROM}
          WHERE ${where.join(' AND ')}
          ORDER BY ${
            chosenOrder(REQ_SORT, query.sortField, query.sortDirection, 'r.id') ??
            `CASE r.status WHEN 'PENDING' THEN 0 WHEN 'ACCEPTED' THEN 1 ELSE 2 END,
                   CASE r.priority WHEN 'EMERGENCY' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                   r.created_at DESC, r.id`
          }
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );

      return {
        items: result.rows.map(mapRequest),
        total: Number(result.rows[0]?.total_count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /** Triage a request (accept into work order or reject with reason). Requires cmms.requests.write. */
  async triage(
    context: CmmsCommandContext,
    id: string,
    raw: unknown,
  ): Promise<{ readonly request: CmmsMaintenanceRequestV1; readonly workOrderId?: string }> {
    assertUuid(id, 'Maintenance request');
    const input = parseInput(TriageCmmsRequestV1Schema, raw);
    // W1-A review, Low 3: accepting creates a work order, which needs work-order write, as creating one directly does.
    if (input.action === 'ACCEPT' && !holdsPermission(context.principal.permissions, 'cmms.work-orders.write')) {
      throw new ForbiddenException({
        code: 'CMMS_PERMISSION_DENIED',
        message: 'Permission cmms.work-orders.write is required to accept a request into a work order.',
      });
    }

    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const values: unknown[] = [context.principal.tenantId, id];
      const where = ['r.tenant_id = $1', 'r.id = $2', ...visibleRequests(context.principal, values)];
      const existingResult = await client.query(
        `SELECT ${REQ_COLUMNS} FROM ${REQ_FROM} WHERE ${where.join(' AND ')} FOR UPDATE OF r`,
        values,
      );
      if (!existingResult.rows[0]) throw notFound('Maintenance request');
      const req = mapRequest(existingResult.rows[0]);
      assertMayChange(context.principal, req);

      if (req.status !== 'PENDING') {
        throw new ConflictException({
          code: 'CMMS_REQUEST_ALREADY_TRIAGED',
          message: `This request is already ${req.status.toLowerCase()} and cannot be triaged again.`,
        });
      }
      if (input.expectedVersion && req.version !== input.expectedVersion) {
        throw versionConflict('Maintenance request');
      }

      if (input.action === 'ACCEPT') {
        const woId = await this.workOrders.createWithClient(
          client,
          context,
          {
            type: input.workOrderType ?? 'REACTIVE',
            priority: input.priority ?? req.priority,
            title: req.title,
            description: req.description ?? undefined,
            assetId: req.assetId ?? undefined,
            assignedTo: input.assignedTo ?? undefined,
            requestKey: req.id,
            requiresSignature: false,
            tasks: [],
          },
          { triggerSource: 'MANUAL', pmScheduleId: null, pmOccurrenceAt: null },
        );

        const updated = await client.query(
          `UPDATE gigalibs_cmms.maintenance_requests
              SET status = 'ACCEPTED',
                  converted_wo_id = $1,
                  triaged_by = $2,
                  triaged_at = now(),
                  version = version + 1,
                  updated_at = now()
            WHERE tenant_id = $3 AND id = $4
            RETURNING *`,
          [woId, context.principal.subject, context.principal.tenantId, id],
        );

        await recordMutation(client, context, {
          action: 'REQUEST_ACCEPTED',
          aggregateType: 'MAINTENANCE_REQUEST',
          aggregateId: id,
          aggregateVersion: req.version + 1,
          payload: { workOrderId: woId, triagedBy: context.principal.subject },
        });

        const reloaded = await client.query(
          `SELECT ${REQ_COLUMNS} FROM ${REQ_FROM} WHERE r.tenant_id = $1 AND r.id = $2`,
          [context.principal.tenantId, id],
        );
        return { request: mapRequest(reloaded.rows[0]), workOrderId: woId };
      }

      // Action === 'REJECT'
      if (!input.reason || input.reason.trim().length === 0) {
        throw new BadRequestException({
          code: 'CMMS_REASON_REQUIRED',
          message: 'A rejection reason is required when rejecting a request.',
        });
      }

      await client.query(
        `UPDATE gigalibs_cmms.maintenance_requests
            SET status = 'REJECTED',
                rejection_reason = $1,
                triaged_by = $2,
                triaged_at = now(),
                version = version + 1,
                updated_at = now()
          WHERE tenant_id = $3 AND id = $4`,
        [input.reason.trim(), context.principal.subject, context.principal.tenantId, id],
      );

      await recordMutation(client, context, {
        action: 'REQUEST_REJECTED',
        aggregateType: 'MAINTENANCE_REQUEST',
        aggregateId: id,
        aggregateVersion: req.version + 1,
        payload: { reason: input.reason.trim(), triagedBy: context.principal.subject },
      });

      const reloaded = await client.query(
        `SELECT ${REQ_COLUMNS} FROM ${REQ_FROM} WHERE r.tenant_id = $1 AND r.id = $2`,
        [context.principal.tenantId, id],
      );
      return { request: mapRequest(reloaded.rows[0]) };
    });
  }

  /** Cancel own maintenance request while it is still pending. */
  async cancel(context: CmmsCommandContext, id: string, raw: unknown): Promise<CmmsMaintenanceRequestV1> {
    assertUuid(id, 'Maintenance request');
    const input = parseInput(CancelCmmsRequestV1Schema, raw);

    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const values: unknown[] = [context.principal.tenantId, id];
      const where = ['r.tenant_id = $1', 'r.id = $2', ...visibleRequests(context.principal, values)];
      const existingResult = await client.query(
        `SELECT ${REQ_COLUMNS} FROM ${REQ_FROM} WHERE ${where.join(' AND ')} FOR UPDATE OF r`,
        values,
      );
      if (!existingResult.rows[0]) throw notFound('Maintenance request');
      const req = mapRequest(existingResult.rows[0]);
      // One's own pending request may always be cancelled (W1-A review, Low 1); someone else's needs write scope.
      if (req.requesterSubject !== context.principal.subject) assertMayChange(context.principal, req);

      if (req.status !== 'PENDING') {
        throw new ConflictException({
          code: 'CMMS_REQUEST_NOT_PENDING',
          message: `Only pending requests can be cancelled; this request is ${req.status.toLowerCase()}.`,
        });
      }

      if (input.expectedVersion && req.version !== input.expectedVersion) {
        throw versionConflict('Maintenance request');
      }

      await client.query(
        `UPDATE gigalibs_cmms.maintenance_requests
            SET status = 'CANCELLED',
                cancelled_at = now(),
                version = version + 1,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, id],
      );

      await recordMutation(client, context, {
        action: 'REQUEST_CANCELLED',
        aggregateType: 'MAINTENANCE_REQUEST',
        aggregateId: id,
        aggregateVersion: req.version + 1,
        payload: { cancelledBy: context.principal.subject, reason: input.reason ?? null },
      });

      const reloaded = await client.query(
        `SELECT ${REQ_COLUMNS} FROM ${REQ_FROM} WHERE r.tenant_id = $1 AND r.id = $2`,
        [context.principal.tenantId, id],
      );
      return mapRequest(reloaded.rows[0]);
    });
  }
}
