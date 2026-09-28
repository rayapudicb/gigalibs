import { ConflictException, Injectable } from '@nestjs/common';
import {
  CreateCmmsPmScheduleV1Schema,
  GenerateCmmsPmWorkOrderV1Schema,
  UpdateCmmsPmScheduleV1Schema,
  type CmmsPmScheduleV1,
  type CmmsWorkOrderDetailV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import {
  assertUuid,
  iso,
  isoOrNull,
  notFound,
  numberOrNull,
  parseInput,
  recordMutation,
  versionConflict,
} from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

const SCHEDULE_COLUMNS = `s.*, a.name AS asset_name, (s.is_active AND s.next_due_at < now()) AS overdue`;
const SCHEDULE_FROM = `gigalibs_cmms.pm_schedules s
  JOIN gigalibs_cmms.assets a ON a.tenant_id = s.tenant_id AND a.id = s.asset_id`;

/**
 * Next occurrence in the schedule's own time zone, so a 09:00 local schedule stays at 09:00 across daylight
 * saving changes; month steps clamp to the month end (Jan 31 + 1 month = Feb 28/29).
 */
const ADVANCE_SQL = `((s.next_due_at AT TIME ZONE s.time_zone) + make_interval(
    years => CASE WHEN s.interval_unit = 'YEAR' THEN s.interval_count ELSE 0 END,
    months => CASE WHEN s.interval_unit = 'MONTH' THEN s.interval_count ELSE 0 END,
    weeks => CASE WHEN s.interval_unit = 'WEEK' THEN s.interval_count ELSE 0 END,
    days => CASE WHEN s.interval_unit = 'DAY' THEN s.interval_count ELSE 0 END)) AT TIME ZONE s.time_zone`;

@Injectable()
export class PmSchedulesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async list(principal: CmmsPrincipal, assetId?: string): Promise<{ readonly items: readonly CmmsPmScheduleV1[] }> {
    if (assetId !== undefined) assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['s.tenant_id = $1', ...scopePredicates(principal, values, 's.')];
      if (assetId) {
        values.push(assetId);
        where.push(`s.asset_id = $${values.length}`);
      }
      const result = await client.query(
        `SELECT ${SCHEDULE_COLUMNS} FROM ${SCHEDULE_FROM}
          WHERE ${where.join(' AND ')}
          ORDER BY s.is_active DESC, s.next_due_at ASC, s.name ASC
          LIMIT 500`,
        values,
      );
      return { items: result.rows.map(mapSchedule) };
    });
  }

  async get(principal: CmmsPrincipal, scheduleId: string): Promise<CmmsPmScheduleV1> {
    assertUuid(scheduleId, 'scheduleId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.visible(client, principal, scheduleId, false));
  }

  async create(context: CmmsCommandContext, raw: unknown): Promise<CmmsPmScheduleV1> {
    const input = parseInput(CreateCmmsPmScheduleV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const asset = await this.assets.visibleAsset(client, context.principal, input.assetId, false);
      const siteRef = input.siteRef ?? asset.siteRef;
      const departmentId = input.departmentId ?? asset.departmentId;
      assertWritableScope(context.principal, { departmentId, siteRef });
      const result = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.pm_schedules
           (tenant_id, name, description, asset_id, site_ref, department_id, interval_count, interval_unit, time_zone,
            next_due_at, wo_title, wo_description, wo_priority, estimated_hours, requires_signature, task_labels,
            created_by, updated_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $17, $18)
         RETURNING id`,
        [
          context.principal.tenantId,
          input.name,
          input.description ?? null,
          input.assetId,
          siteRef,
          departmentId,
          input.intervalCount,
          input.intervalUnit,
          input.timeZone,
          input.firstDueAt,
          input.woTitle,
          input.woDescription ?? null,
          input.woPriority,
          input.estimatedHours ?? null,
          input.requiresSignature,
          JSON.stringify(input.taskLabels),
          context.principal.subject,
          context.correlationId,
        ],
      );
      const id = result.rows[0]!.id;
      await recordMutation(client, context, {
        action: 'CMMS_PM_SCHEDULE_CREATED',
        aggregateType: 'CMMS_PM_SCHEDULE',
        aggregateId: id,
        aggregateVersion: 1,
        payload: { assetId: input.assetId, intervalCount: input.intervalCount, intervalUnit: input.intervalUnit },
      });
      return this.visible(client, context.principal, id, false);
    });
  }

  async update(context: CmmsCommandContext, scheduleId: string, raw: unknown): Promise<CmmsPmScheduleV1> {
    assertUuid(scheduleId, 'scheduleId');
    const input = parseInput(UpdateCmmsPmScheduleV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lock(client, context, scheduleId, input.expectedVersion);
      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.pm_schedules
            SET name = $4, description = $5, interval_count = $6, interval_unit = $7, time_zone = $8,
                next_due_at = $9, wo_title = $10, wo_description = $11, wo_priority = $12, estimated_hours = $13,
                requires_signature = $14, task_labels = $15::jsonb, is_active = $16,
                version = version + 1, updated_by = $17, correlation_id = $18, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          scheduleId,
          input.expectedVersion,
          input.name ?? current.name,
          input.description === undefined ? current.description : input.description,
          input.intervalCount ?? current.interval_count,
          input.intervalUnit ?? current.interval_unit,
          input.timeZone ?? current.time_zone,
          input.nextDueAt ?? current.next_due_at,
          input.woTitle ?? current.wo_title,
          input.woDescription === undefined ? current.wo_description : input.woDescription,
          input.woPriority ?? current.wo_priority,
          input.estimatedHours === undefined ? current.estimated_hours : input.estimatedHours,
          input.requiresSignature ?? current.requires_signature,
          JSON.stringify(input.taskLabels ?? current.task_labels ?? []),
          input.isActive ?? current.is_active,
          context.principal.subject,
          context.correlationId,
        ],
      );
      if (result.rowCount === 0) versionConflict('The schedule');
      await recordMutation(client, context, {
        action: 'CMMS_PM_SCHEDULE_UPDATED',
        aggregateType: 'CMMS_PM_SCHEDULE',
        aggregateId: scheduleId,
        aggregateVersion: Number(result.rows[0]!.version),
        payload: { changed: Object.keys(input).filter((key) => key !== 'expectedVersion') },
      });
      return this.visible(client, context.principal, scheduleId, false);
    });
  }

  /**
   * Generates the work order for the current due occurrence and advances the schedule in one transaction. The
   * (schedule, occurrence) key is unique, so a retry or a second operator can never create a duplicate.
   */
  async generate(
    context: CmmsCommandContext,
    scheduleId: string,
    raw: unknown,
  ): Promise<{ readonly schedule: CmmsPmScheduleV1; readonly workOrder: CmmsWorkOrderDetailV1 }> {
    assertUuid(scheduleId, 'scheduleId');
    const input = parseInput(GenerateCmmsPmWorkOrderV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lock(client, context, scheduleId, input.expectedVersion);
      if (!current.is_active) {
        throw new ConflictException({ code: 'CMMS_SCHEDULE_INACTIVE', message: 'Activate the schedule before generating work.' });
      }
      const occurrence = iso(current.next_due_at);
      const workOrderId = await this.workOrders.createWithClient(
        client,
        context,
        {
          type: 'PREVENTIVE',
          priority: current.wo_priority,
          title: current.wo_title,
          description: current.wo_description ?? undefined,
          assetId: current.asset_id,
          siteRef: current.site_ref ?? undefined,
          departmentId: current.department_id ?? undefined,
          dueAt: occurrence,
          requiresSignature: current.requires_signature === true,
          estimatedHours: numberOrNull(current.estimated_hours) ?? undefined,
          tasks: ((current.task_labels ?? []) as string[]).map((label) => ({ label, required: true })),
        },
        { triggerSource: 'PM_SCHEDULE', pmScheduleId: scheduleId, pmOccurrenceAt: occurrence },
      );
      const advanced = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.pm_schedules s
            SET next_due_at = ${ADVANCE_SQL}, last_generated_at = now(), version = s.version + 1,
                updated_by = $3, correlation_id = $4, updated_at = now()
          WHERE s.tenant_id = $1 AND s.id = $2
          RETURNING s.version`,
        [context.principal.tenantId, scheduleId, context.principal.subject, context.correlationId],
      );
      await recordMutation(client, context, {
        action: 'CMMS_PM_WORK_ORDER_GENERATED',
        aggregateType: 'CMMS_PM_SCHEDULE',
        aggregateId: scheduleId,
        aggregateVersion: Number(advanced.rows[0]!.version),
        payload: { occurrence, workOrderId },
      });
      return {
        schedule: await this.visible(client, context.principal, scheduleId, false),
        workOrder: await this.workOrders.detailWithClient(client, context.principal, workOrderId),
      };
    });
  }

  private async lock(client: PoolClient, context: CmmsCommandContext, scheduleId: string, expectedVersion: number): Promise<any> {
    const values: unknown[] = [context.principal.tenantId, scheduleId];
    const where = ['s.tenant_id = $1', 's.id = $2', ...scopePredicates(context.principal, values, 's.')];
    const result = await client.query(`SELECT s.* FROM gigalibs_cmms.pm_schedules s WHERE ${where.join(' AND ')} FOR UPDATE`, values);
    const current = result.rows[0];
    if (!current) notFound('The schedule');
    if (Number(current.version) !== expectedVersion) versionConflict('The schedule');
    assertWritableScope(context.principal, { departmentId: current.department_id, siteRef: current.site_ref });
    return current;
  }

  private async visible(client: PoolClient, principal: CmmsPrincipal, scheduleId: string, lock: boolean): Promise<CmmsPmScheduleV1> {
    const values: unknown[] = [principal.tenantId, scheduleId];
    const where = ['s.tenant_id = $1', 's.id = $2', ...scopePredicates(principal, values, 's.')];
    const result = await client.query(
      `SELECT ${SCHEDULE_COLUMNS} FROM ${SCHEDULE_FROM} WHERE ${where.join(' AND ')}${lock ? ' FOR UPDATE OF s' : ''}`,
      values,
    );
    if (!result.rows[0]) notFound('The schedule');
    return mapSchedule(result.rows[0]);
  }
}

function mapSchedule(row: any): CmmsPmScheduleV1 {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    assetId: row.asset_id,
    assetName: row.asset_name ?? null,
    siteRef: row.site_ref ?? null,
    departmentId: row.department_id ?? null,
    intervalCount: Number(row.interval_count),
    intervalUnit: row.interval_unit,
    timeZone: row.time_zone,
    nextDueAt: iso(row.next_due_at),
    lastGeneratedAt: isoOrNull(row.last_generated_at),
    overdue: row.overdue === true,
    woTitle: row.wo_title,
    woDescription: row.wo_description ?? null,
    woPriority: row.wo_priority,
    estimatedHours: numberOrNull(row.estimated_hours),
    requiresSignature: row.requires_signature === true,
    taskLabels: Array.isArray(row.task_labels) ? row.task_labels : [],
    isActive: row.is_active === true,
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
