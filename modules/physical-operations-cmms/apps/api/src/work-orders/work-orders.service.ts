import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  AddCmmsWorkOrderNoteV1Schema,
  AddCmmsWorkOrderTaskV1Schema,
  CMMS_WORK_ORDER_TRANSITIONS,
  CancelCmmsStaffingV1Schema,
  ChangeCmmsWorkOrderStatusV1Schema,
  CreateCmmsWorkOrderV1Schema,
  IssueCmmsPartV1Schema,
  LogCmmsLabourV1Schema,
  RecordCmmsWorkOrderTaskV1Schema,
  RequestCmmsStaffingV1Schema,
  SearchCmmsWorkOrdersV1Schema,
  UpdateCmmsWorkOrderV1Schema,
  type CmmsCostTotalV1,
  type CmmsPageV1,
  type CmmsStaffingV1,
  type CmmsStaffingRequestedV1,
  type CmmsWorkOrderBookingV1,
  type CmmsWorkOrderDetailV1,
  type CmmsWorkOrderEventV1,
  type CmmsWorkOrderStatusV1,
  type CmmsWorkOrderV1,
  type CreateCmmsWorkOrderV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import {
  assertUuid,
  dateOnlyOrNull,
  iso,
  isoOrNull,
  notFound,
  numberOrNull,
  parseInput,
  recordMutation,
  translateConstraint,
  versionConflict,
  chosenOrder,
} from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';
import { PartsService } from '../parts/parts.service.js';

// WI-OI-120be: the columns a chosen sort may use; nothing else reaches ORDER BY.
const WO_SORT = { woNumber: 'w.wo_number', title: 'w.title', dueAt: 'w.due_at', createdAt: 'w.created_at' } as const;

const ACTIVE_STATUSES: readonly CmmsWorkOrderStatusV1[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'];
const EXECUTION_STATUSES: readonly CmmsWorkOrderStatusV1[] = ['IN_PROGRESS', 'ON_HOLD'];
const WO_COLUMNS = `w.*, a.name AS asset_name,
  jp.title AS job_plan_title,
  prob.code AS failure_problem_code,
  cause.code AS failure_cause_code,
  rem.code AS failure_remedy_code,
  trig.work_order_title AS meter_trigger_title`;
const WO_FROM = `gigalibs_cmms.work_orders w
  LEFT JOIN gigalibs_cmms.assets a ON a.tenant_id = w.tenant_id AND a.id = w.asset_id
  LEFT JOIN gigalibs_cmms.cmms_job_plans jp ON jp.tenant_id = w.tenant_id AND jp.id = w.job_plan_id
  LEFT JOIN gigalibs_cmms.cmms_failure_codes prob ON prob.tenant_id = w.tenant_id AND prob.id = w.failure_problem_id
  LEFT JOIN gigalibs_cmms.cmms_failure_codes cause ON cause.tenant_id = w.tenant_id AND cause.id = w.failure_cause_id
  LEFT JOIN gigalibs_cmms.cmms_failure_codes rem ON rem.tenant_id = w.tenant_id AND rem.id = w.failure_remedy_id
  LEFT JOIN gigalibs_cmms.cmms_meter_triggers trig ON trig.tenant_id = w.tenant_id AND trig.id = w.meter_trigger_id`;

/** Work-order provenance set by the service, never by the caller. */
export interface WorkOrderOrigin {
  readonly triggerSource: 'MANUAL' | 'PM_SCHEDULE' | 'METER_TRIGGER';
  readonly pmScheduleId: string | null;
  readonly pmOccurrenceAt: string | null;
  readonly meterTriggerId?: string | null;
}

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly parts: PartsService,
  ) {}

  async search(principal: CmmsPrincipal, raw: unknown): Promise<CmmsPageV1<CmmsWorkOrderV1>> {
    const query = parseInput(SearchCmmsWorkOrdersV1Schema, raw);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['w.tenant_id = $1', ...scopePredicates(principal, values, 'w.')];
      if (query.openOnly) where.push(`w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')`);
      for (const [column, value] of [
        ['status', query.status],
        ['priority', query.priority],
        ['asset_id', query.assetId],
        ['site_ref', query.siteRef],
        ['assigned_to', query.assignedTo],
      ] as const) {
        if (value !== undefined) {
          values.push(value);
          where.push(`w.${column} = $${values.length}`);
        }
      }
      if (query.dueBefore) {
        values.push(query.dueBefore);
        where.push(`w.due_at < $${values.length}`);
      }
      if (query.q) {
        values.push(`%${query.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
        where.push(`(w.title ILIKE $${values.length} OR w.wo_number ILIKE $${values.length})`);
      }
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const result = await client.query(
        `SELECT ${WO_COLUMNS}, COUNT(*) OVER()::int AS total_count
           FROM ${WO_FROM}
          WHERE ${where.join(' AND ')}
          ORDER BY ${
            chosenOrder(WO_SORT, query.sortField, query.sortDirection, 'w.id') ??
            `CASE w.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'OPEN' THEN 1 WHEN 'ON_HOLD' THEN 2 ELSE 3 END,
                   CASE w.priority WHEN 'EMERGENCY' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                   w.due_at ASC NULLS LAST, w.created_at DESC, w.id`
          }
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return {
        items: result.rows.map(mapWorkOrder),
        total: Number(result.rows[0]?.total_count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  async get(principal: CmmsPrincipal, workOrderId: string): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.detailWithClient(client, principal, workOrderId));
  }

  async history(principal: CmmsPrincipal, workOrderId: string): Promise<{ readonly items: readonly CmmsWorkOrderEventV1[] }> {
    assertUuid(workOrderId, 'workOrderId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.visibleRow(client, principal, workOrderId, false);
      const result = await client.query(
        `SELECT * FROM gigalibs_cmms.work_order_events WHERE tenant_id = $1 AND work_order_id = $2
          ORDER BY occurred_at DESC, id DESC LIMIT 500`,
        [principal.tenantId, workOrderId],
      );
      return { items: result.rows.map(mapEvent) };
    });
  }

  /** A repeated request key returns the work order it created instead of creating another. */
  async create(context: CmmsCommandContext, raw: unknown): Promise<CmmsWorkOrderDetailV1 & { readonly replayed: boolean }> {
    const input = parseInput(CreateCmmsWorkOrderV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM gigalibs_cmms.work_orders WHERE tenant_id = $1 AND request_key = $2`,
        [context.principal.tenantId, input.requestKey],
      );
      if (existing.rows[0]) {
        return { ...(await this.detailWithClient(client, context.principal, existing.rows[0].id)), replayed: true };
      }
      const id = await this.createWithClient(client, context, input, {
        triggerSource: 'MANUAL',
        pmScheduleId: null,
        pmOccurrenceAt: null,
      });
      return { ...(await this.detailWithClient(client, context.principal, id)), replayed: false };
    });
  }

  /** Creates a work order inside the caller's transaction (also used by preventive schedules). */
  async createWithClient(
    client: PoolClient,
    context: CmmsCommandContext,
    input: CreateCmmsWorkOrderV1 | Omit<CreateCmmsWorkOrderV1, 'requestKey'>,
    origin: WorkOrderOrigin,
  ): Promise<string> {
    let siteRef = input.siteRef ?? null;
    let departmentId = input.departmentId ?? null;
    if (input.assetId) {
      const asset = await this.assets.visibleAsset(client, context.principal, input.assetId, false);
      siteRef ??= asset.siteRef;
      departmentId ??= asset.departmentId;
    }
    assertWritableScope(context.principal, { departmentId, siteRef });

    const counter = await client.query<{ last_value: string }>(
      `INSERT INTO gigalibs_cmms.work_order_counters AS c (tenant_id, last_value) VALUES ($1, 1)
       ON CONFLICT (tenant_id) DO UPDATE SET last_value = c.last_value + 1
       RETURNING last_value`,
      [context.principal.tenantId],
    );
    const woNumber = `WO-${String(counter.rows[0]!.last_value).padStart(6, '0')}`;
    let id: string;
    try {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.work_orders
           (tenant_id, wo_number, request_key, type, priority, title, description, asset_id, site_ref,
            department_id, assigned_to, due_at, requires_signature, estimated_hours, trigger_source,
            pm_schedule_id, pm_occurrence_at, job_plan_id, failure_problem_id, failure_cause_id,
            failure_remedy_id, meter_trigger_id, created_by, updated_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $23, $24)
         RETURNING id`,
        [
          context.principal.tenantId,
          woNumber,
          'requestKey' in input ? input.requestKey : null,
          input.type,
          input.priority,
          input.title,
          input.description ?? null,
          input.assetId ?? null,
          siteRef,
          departmentId,
          input.assignedTo ?? null,
          input.dueAt ?? null,
          input.requiresSignature,
          input.estimatedHours ?? null,
          origin.triggerSource,
          origin.pmScheduleId,
          origin.pmOccurrenceAt,
          input.jobPlanId ?? null,
          input.failureProblemId ?? null,
          input.failureCauseId ?? null,
          input.failureRemedyId ?? null,
          ('meterTriggerId' in input ? input.meterTriggerId : null) ?? origin.meterTriggerId ?? null,
          context.principal.subject,
          context.correlationId,
        ],
      );

      id = inserted.rows[0]!.id;
    } catch (error) {
      translateConstraint(error, {
        unique: 'This work order request is already being processed; retry to receive it.',
        reference: 'The referenced asset or schedule does not exist.',
      });
    }
    for (const [index, task] of input.tasks.entries()) {
      await client.query(
        `INSERT INTO gigalibs_cmms.work_order_tasks (tenant_id, work_order_id, position, label, required)
         VALUES ($1, $2, $3, $4, $5)`,
        [context.principal.tenantId, id, index + 1, task.label, task.required],
      );
    }
    await this.appendEvent(client, context, id, 'CREATED', null, 'OPEN', {
      woNumber,
      triggerSource: origin.triggerSource,
      tasks: input.tasks.length,
    });
    await recordMutation(client, context, {
      action: 'CMMS_WORK_ORDER_CREATED',
      aggregateType: 'CMMS_WORK_ORDER',
      aggregateId: id,
      aggregateVersion: 1,
      payload: {
        woNumber,
        type: input.type,
        priority: input.priority,
        assetId: input.assetId ?? null,
        siteRef,
        triggerSource: origin.triggerSource,
        pmScheduleId: origin.pmScheduleId,
      },
    });
    return id;
  }

  async update(context: CmmsCommandContext, workOrderId: string, raw: unknown): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(UpdateCmmsWorkOrderV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockForChange(client, context, workOrderId, input.expectedVersion, ACTIVE_STATUSES);
      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.work_orders
            SET title = $4, description = $5, priority = $6, assigned_to = $7, due_at = $8, estimated_hours = $9,
                version = version + 1, updated_by = $10, correlation_id = $11, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          workOrderId,
          input.expectedVersion,
          input.title ?? current.title,
          input.description === undefined ? current.description : input.description,
          input.priority ?? current.priority,
          input.assignedTo === undefined ? current.assigned_to : input.assignedTo,
          input.dueAt === undefined ? current.due_at : input.dueAt,
          input.estimatedHours === undefined ? current.estimated_hours : input.estimatedHours,
          context.principal.subject,
          context.correlationId,
        ],
      );
      if (result.rowCount === 0) versionConflict('The work order');
      const changed = Object.keys(input).filter((key) => key !== 'expectedVersion');
      await this.appendEvent(client, context, workOrderId, 'UPDATED', null, null, { changed });
      await recordMutation(client, context, {
        action: 'CMMS_WORK_ORDER_UPDATED',
        aggregateType: 'CMMS_WORK_ORDER',
        aggregateId: workOrderId,
        aggregateVersion: Number(result.rows[0]!.version),
        payload: { changed, assignedTo: input.assignedTo === undefined ? current.assigned_to : input.assignedTo },
      });
      return this.detailWithClient(client, context.principal, workOrderId);
    });
  }

  /**
   * Lifecycle transition. Completion needs every required task recorded (not PENDING) and, when required, a
   * signature from the completing user; terminal states are final.
   */
  async changeStatus(context: CmmsCommandContext, workOrderId: string, raw: unknown): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(ChangeCmmsWorkOrderStatusV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockForChange(client, context, workOrderId, input.expectedVersion, null);
      const from = current.status as CmmsWorkOrderStatusV1;
      if (!CMMS_WORK_ORDER_TRANSITIONS[from].includes(input.status)) {
        throw new ConflictException({
          code: 'CMMS_INVALID_TRANSITION',
          message: `A ${from} work order cannot move to ${input.status}.`,
        });
      }
      if (input.status === 'COMPLETED') {
        const pending = await client.query<{ pending: number }>(
          `SELECT COUNT(*)::int AS pending FROM gigalibs_cmms.work_order_tasks
            WHERE tenant_id = $1 AND work_order_id = $2 AND required AND status = 'PENDING'`,
          [context.principal.tenantId, workOrderId],
        );
        if (pending.rows[0]!.pending > 0) {
          throw new ConflictException({
            code: 'CMMS_REQUIRED_TASKS_PENDING',
            message: `${pending.rows[0]!.pending} required task(s) must be recorded before completion.`,
          });
        }
        if (current.requires_signature && !input.signatureData) {
          throw new BadRequestException({ code: 'CMMS_SIGNATURE_REQUIRED', message: 'This work order requires a signature to complete.' });
        }
      }
      if (input.signatureData && input.status !== 'COMPLETED') {
        throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'A signature is only captured on completion.' });
      }
      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.work_orders
            SET status = $4,
                started_at = CASE WHEN $4 = 'IN_PROGRESS' THEN COALESCE(started_at, now()) ELSE started_at END,
                completed_at = CASE WHEN $4 = 'COMPLETED' THEN now() ELSE completed_at END,
                cancelled_at = CASE WHEN $4 = 'CANCELLED' THEN now() ELSE cancelled_at END,
                completion_notes = CASE WHEN $4 = 'COMPLETED' THEN $5 ELSE completion_notes END,
                signature_data = CASE WHEN $4 = 'COMPLETED' THEN $6 ELSE signature_data END,
                signed_by = CASE WHEN $4 = 'COMPLETED' AND $6::text IS NOT NULL THEN $7 ELSE signed_by END,
                version = version + 1, updated_by = $7, correlation_id = $8, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          workOrderId,
          input.expectedVersion,
          input.status,
          input.notes ?? null,
          input.signatureData ?? null,
          context.principal.subject,
          context.correlationId,
        ],
      );
      if (result.rowCount === 0) versionConflict('The work order');
      await this.appendEvent(client, context, workOrderId, 'STATUS_CHANGED', from, input.status, {
        notes: input.notes ?? null,
        signed: Boolean(input.signatureData),
      });
      if (input.status === 'CANCELLED') {
        await this.withdrawStaffing(client, context, workOrderId, `Work order ${current.wo_number} was cancelled.`);
      }
      await recordMutation(client, context, {
        action: 'CMMS_WORK_ORDER_STATUS_CHANGED',
        aggregateType: 'CMMS_WORK_ORDER',
        aggregateId: workOrderId,
        aggregateVersion: Number(result.rows[0]!.version),
        payload: { from, to: input.status, assetId: current.asset_id, siteRef: current.site_ref },
      });
      return this.detailWithClient(client, context.principal, workOrderId);
    });
  }

  async addTask(context: CmmsCommandContext, workOrderId: string, raw: unknown): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(AddCmmsWorkOrderTaskV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      await this.lockForChange(client, context, workOrderId, null, ACTIVE_STATUSES);
      const position = await client.query<{ next: number; count: number }>(
        `SELECT COALESCE(MAX(position), 0)::int + 1 AS next, COUNT(*)::int AS count
           FROM gigalibs_cmms.work_order_tasks WHERE tenant_id = $1 AND work_order_id = $2`,
        [context.principal.tenantId, workOrderId],
      );
      if (position.rows[0]!.count >= 50) {
        throw new BadRequestException({ code: 'CMMS_TOO_MANY_TASKS', message: 'A work order holds at most 50 tasks.' });
      }
      await client.query(
        `INSERT INTO gigalibs_cmms.work_order_tasks (tenant_id, work_order_id, position, label, required)
         VALUES ($1, $2, $3, $4, $5)`,
        [context.principal.tenantId, workOrderId, position.rows[0]!.next, input.label, input.required],
      );
      await this.touch(client, context, workOrderId, 'TASK_RECORDED', { added: input.label, required: input.required });
      return this.detailWithClient(client, context.principal, workOrderId);
    });
  }

  /** Records a task result; evidence is captured only while the work is being executed. */
  async recordTask(
    context: CmmsCommandContext,
    workOrderId: string,
    taskId: string,
    raw: unknown,
  ): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    assertUuid(taskId, 'taskId');
    const input = parseInput(RecordCmmsWorkOrderTaskV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      await this.lockForChange(client, context, workOrderId, null, EXECUTION_STATUSES);
      const result = await client.query(
        `UPDATE gigalibs_cmms.work_order_tasks
            SET status = $5, result_value = $6, notes = $7,
                completed_by = CASE WHEN $5 = 'PENDING' THEN NULL ELSE $8 END,
                completed_at = CASE WHEN $5 = 'PENDING' THEN NULL ELSE now() END,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND work_order_id = $2 AND id = $3 AND version = $4
          RETURNING label`,
        [
          context.principal.tenantId,
          workOrderId,
          taskId,
          input.expectedVersion,
          input.status,
          input.resultValue ?? null,
          input.notes ?? null,
          context.principal.subject,
        ],
      );
      if (result.rowCount === 0) {
        const exists = await client.query(
          `SELECT 1 FROM gigalibs_cmms.work_order_tasks WHERE tenant_id = $1 AND work_order_id = $2 AND id = $3`,
          [context.principal.tenantId, workOrderId, taskId],
        );
        if (!exists.rows[0]) notFound('The task');
        versionConflict('The task');
      }
      await this.touch(client, context, workOrderId, 'TASK_RECORDED', {
        taskId,
        label: result.rows[0].label,
        status: input.status,
        resultValue: input.resultValue ?? null,
      });
      return this.detailWithClient(client, context.principal, workOrderId);
    });
  }

  async logLabour(context: CmmsCommandContext, workOrderId: string, raw: unknown): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(LogCmmsLabourV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      await this.lockForChange(client, context, workOrderId, null, EXECUTION_STATUSES);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.work_order_labour
           (tenant_id, work_order_id, worker_ref, hours, hourly_rate, currency_code, time_category, performed_on,
            notes, created_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          context.principal.tenantId,
          workOrderId,
          input.workerRef,
          input.hours,
          input.hourlyRate ?? null,
          input.currencyCode ?? null,
          input.timeCategory,
          input.performedOn,
          input.notes ?? null,
          context.principal.subject,
          context.correlationId,
        ],
      );
      await this.touch(client, context, workOrderId, 'LABOUR_LOGGED', {
        labourId: inserted.rows[0]!.id,
        workerRef: input.workerRef,
        hours: input.hours,
        timeCategory: input.timeCategory,
      });
      return this.detailWithClient(client, context.principal, workOrderId);
    });
  }

  /** Issues stock to the work order through the part ledger; a repeated idempotency key is a no-op. */
  async issuePart(context: CmmsCommandContext, workOrderId: string, raw: unknown): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(IssueCmmsPartV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      await this.lockForChange(client, context, workOrderId, null, EXECUTION_STATUSES);
      const part = await this.parts.visiblePartRow(client, context.principal, input.partId, { lock: false });
      assertWritableScope(context.principal, { departmentId: part.department_id, siteRef: part.site_ref });
      if (input.storeroomId) await this.parts.assertWritableStoreroom(client, context.principal, input.storeroomId);
      const replay = await this.parts.replayedMovement(client, context.principal.tenantId, input.idempotencyKey, input.partId);
      if (replay) {
        if (
          replay.workOrderId !== workOrderId || replay.movementType !== 'ISSUE' ||
          replay.quantityDelta !== -input.quantity || replay.storeroomId !== (input.storeroomId ?? null) ||
          replay.binLocation !== (input.binLocation ?? null)
        ) {
          throw new ConflictException({ code: 'CMMS_IDEMPOTENCY_KEY_REUSED', message: 'This request key was used for a different stock movement.' });
        }
        return this.detailWithClient(client, context.principal, workOrderId);
      }
      const movement = await this.parts.applyMovement(client, context, {
        partId: input.partId,
        movementType: 'ISSUE',
        quantityDelta: -input.quantity,
        idempotencyKey: input.idempotencyKey,
        workOrderId,
        storeroomId: input.storeroomId ?? null,
        binLocation: input.binLocation ?? null,
        reason: input.notes ?? null,
      });
      await this.touch(client, context, workOrderId, 'PART_ISSUED', {
        movementId: movement.id,
        partId: input.partId,
        partNumber: part.part_number,
        quantity: input.quantity,
        unitCost: movement.unitCost,
        currencyCode: movement.currencyCode,
      });
      return this.detailWithClient(client, context.principal, workOrderId);
    });
  }

  async addNote(context: CmmsCommandContext, workOrderId: string, raw: unknown): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(AddCmmsWorkOrderNoteV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      await this.lockForChange(client, context, workOrderId, null, null);
      await this.touch(client, context, workOrderId, 'NOTE_ADDED', { body: input.body });
      return this.detailWithClient(client, context.principal, workOrderId);
    });
  }

  /**
   * Asks Workforce to staff an active work order (WI-OI-068). The request and its outbox fact commit together;
   * the relay delivers it and Workforce's answer arrives through the inbox. One live request per work order.
   */
  async requestStaffing(context: CmmsCommandContext, workOrderId: string, raw: unknown): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(RequestCmmsStaffingV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockForChange(client, context, workOrderId, null, ACTIVE_STATUSES);
      const staffingId = randomUUID();
      const requestKey = randomUUID();
      const capabilityCodes = [...new Set(input.capabilityCodes.map((code) => code.toUpperCase()))];
      try {
        await client.query(
          `INSERT INTO gigalibs_cmms.work_order_staffing
             (tenant_id, id, work_order_id, request_key, starts_at, ends_at, headcount, capability_codes, created_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
          [context.principal.tenantId, staffingId, workOrderId, requestKey, input.startsAt, input.endsAt, input.headcount,
            JSON.stringify(capabilityCodes), context.principal.subject, context.correlationId],
        );
      } catch (error) {
        translateConstraint(error, { unique: 'This work order already has a live staffing request; cancel it first.' });
      }
      await this.appendEvent(client, context, workOrderId, 'STAFFING_REQUESTED', null, null, {
        staffingId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        headcount: input.headcount,
        capabilityCodes,
      });
      const payload: CmmsStaffingRequestedV1 = {
        staffingId,
        workOrderId,
        woNumber: current.wo_number,
        title: current.title,
        siteRef: current.site_ref ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        headcount: input.headcount,
        capabilityCodes,
        requestKey,
      };
      await recordMutation(client, context, {
        action: 'CMMS_STAFFING_REQUESTED',
        aggregateType: 'CMMS_STAFFING_REQUEST',
        aggregateId: staffingId,
        aggregateVersion: 1,
        payload,
      });
      return this.detailWithClient(client, context.principal, workOrderId);
    });
  }

  async cancelStaffing(context: CmmsCommandContext, workOrderId: string, raw: unknown): Promise<CmmsWorkOrderDetailV1> {
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(CancelCmmsStaffingV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      await this.lockForChange(client, context, workOrderId, null, null);
      if (!(await this.withdrawStaffing(client, context, workOrderId, input.reason))) {
        throw new ConflictException({ code: 'CMMS_STAFFING_NOT_LIVE', message: 'This work order has no live staffing request.' });
      }
      return this.detailWithClient(client, context.principal, workOrderId);
    });
  }

  /** Withdraws the live staffing request, if any, and tells Workforce; returns whether there was one. */
  private async withdrawStaffing(client: PoolClient, context: CmmsCommandContext, workOrderId: string, reason: string): Promise<boolean> {
    const live = await client.query<{ id: string; version: number }>(
      `UPDATE gigalibs_cmms.work_order_staffing
          SET status = 'CANCELLED', version = version + 1, updated_at = now()
        WHERE tenant_id = $1 AND work_order_id = $2 AND status IN ('REQUESTED', 'ACCEPTED')
        RETURNING id, version`,
      [context.principal.tenantId, workOrderId],
    );
    const row = live.rows[0];
    if (!row) return false;
    await this.appendEvent(client, context, workOrderId, 'STAFFING_UPDATED', null, null, { staffingId: row.id, staffing: 'CANCELLED', reason });
    await recordMutation(client, context, {
      action: 'CMMS_STAFFING_CANCELLED',
      aggregateType: 'CMMS_STAFFING_REQUEST',
      aggregateId: row.id,
      aggregateVersion: Number(row.version),
      payload: { staffingId: row.id, workOrderId, reason: reason.slice(0, 500) },
    });
    return true;
  }

  /** Locks a visible work order for a command, checking scope, optional version and allowed statuses. */
  private async lockForChange(
    client: PoolClient,
    context: CmmsCommandContext,
    workOrderId: string,
    expectedVersion: number | null,
    allowedStatuses: readonly CmmsWorkOrderStatusV1[] | null,
  ): Promise<any> {
    const current = await this.visibleRow(client, context.principal, workOrderId, true);
    if (expectedVersion !== null && Number(current.version) !== expectedVersion) versionConflict('The work order');
    assertWritableScope(context.principal, { departmentId: current.department_id, siteRef: current.site_ref });
    if (allowedStatuses && !allowedStatuses.includes(current.status)) {
      throw new ConflictException({
        code: 'CMMS_WORK_ORDER_STATE',
        message: `This is not possible while the work order is ${current.status}.`,
      });
    }
    return current;
  }

  /** Bumps the aggregate version for a child change and records its event, audit and outbox fact. */
  private async touch(
    client: PoolClient,
    context: CmmsCommandContext,
    workOrderId: string,
    eventType: 'TASK_RECORDED' | 'LABOUR_LOGGED' | 'PART_ISSUED' | 'NOTE_ADDED',
    details: Record<string, unknown>,
  ): Promise<void> {
    const result = await client.query<{ version: number }>(
      `UPDATE gigalibs_cmms.work_orders
          SET version = version + 1, updated_by = $3, correlation_id = $4, updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING version`,
      [context.principal.tenantId, workOrderId, context.principal.subject, context.correlationId],
    );
    await this.appendEvent(client, context, workOrderId, eventType, null, null, details);
    await recordMutation(client, context, {
      action: `CMMS_WORK_ORDER_${eventType}`,
      aggregateType: 'CMMS_WORK_ORDER',
      aggregateId: workOrderId,
      aggregateVersion: Number(result.rows[0]!.version),
      payload: eventType === 'NOTE_ADDED' ? { noted: true } : details,
    });
  }

  private async appendEvent(
    client: PoolClient,
    context: CmmsCommandContext,
    workOrderId: string,
    eventType: string,
    fromStatus: string | null,
    toStatus: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO gigalibs_cmms.work_order_events
         (tenant_id, work_order_id, event_type, from_status, to_status, actor_subject, details, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        context.principal.tenantId,
        workOrderId,
        eventType,
        fromStatus,
        toStatus,
        context.principal.subject,
        JSON.stringify(details),
        context.correlationId,
      ],
    );
  }

  private async visibleRow(client: PoolClient, principal: CmmsPrincipal, workOrderId: string, lock: boolean): Promise<any> {
    const values: unknown[] = [principal.tenantId, workOrderId];
    const where = ['w.tenant_id = $1', 'w.id = $2', ...scopePredicates(principal, values, 'w.')];
    const result = await client.query(
      `SELECT w.* FROM gigalibs_cmms.work_orders w WHERE ${where.join(' AND ')}${lock ? ' FOR UPDATE' : ''}`,
      values,
    );
    if (!result.rows[0]) notFound('The work order');
    return result.rows[0];
  }

  /** The full work order read inside the caller's transaction. */
  async detailWithClient(client: PoolClient, principal: CmmsPrincipal, workOrderId: string): Promise<CmmsWorkOrderDetailV1> {
    const values: unknown[] = [principal.tenantId, workOrderId];
    const where = ['w.tenant_id = $1', 'w.id = $2', ...scopePredicates(principal, values, 'w.')];
    const header = await client.query(`SELECT ${WO_COLUMNS} FROM ${WO_FROM} WHERE ${where.join(' AND ')}`, values);
    if (!header.rows[0]) notFound('The work order');
    const [tasks, labour, parts, notes, staffing, bookings] = await Promise.all([
      client.query(
        `SELECT * FROM gigalibs_cmms.work_order_tasks WHERE tenant_id = $1 AND work_order_id = $2 ORDER BY position`,
        [principal.tenantId, workOrderId],
      ),
      client.query(
        `SELECT * FROM gigalibs_cmms.work_order_labour WHERE tenant_id = $1 AND work_order_id = $2
          ORDER BY performed_on DESC, created_at DESC`,
        [principal.tenantId, workOrderId],
      ),
      client.query(
        `SELECT m.id, m.part_id, m.quantity_delta, m.unit_cost, m.currency_code, m.created_at,
                m.storeroom_id, m.bin_location, s.name AS storeroom_name, p.part_number, p.name
           FROM gigalibs_cmms.stock_movements m
           JOIN gigalibs_cmms.parts p ON p.tenant_id = m.tenant_id AND p.id = m.part_id
           LEFT JOIN gigalibs_cmms.cmms_storerooms s ON s.tenant_id = m.tenant_id AND s.id = m.storeroom_id
          WHERE m.tenant_id = $1 AND m.work_order_id = $2 AND m.movement_type IN ('ISSUE', 'RETURN')
          ORDER BY m.created_at DESC`,
        [principal.tenantId, workOrderId],
      ),
      client.query(
        `SELECT * FROM gigalibs_cmms.work_order_events
          WHERE tenant_id = $1 AND work_order_id = $2 AND event_type = 'NOTE_ADDED'
          ORDER BY occurred_at DESC LIMIT 200`,
        [principal.tenantId, workOrderId],
      ),
      client.query(
        `SELECT * FROM gigalibs_cmms.work_order_staffing WHERE tenant_id = $1 AND work_order_id = $2
          ORDER BY created_at DESC, id LIMIT 1`,
        [principal.tenantId, workOrderId],
      ),
      client.query(
        `SELECT * FROM gigalibs_cmms.work_order_bookings WHERE tenant_id = $1 AND work_order_id = $2
          ORDER BY starts_at, booking_ref LIMIT 200`,
        [principal.tenantId, workOrderId],
      ),
    ]);

    const costs = new Map<string, number>();
    const addCost = (currency: string | null, amount: number) => {
      if (!currency || !Number.isFinite(amount) || amount === 0) return;
      costs.set(currency, (costs.get(currency) ?? 0) + amount);
    };
    let labourHours = 0;
    let labourCost = 0;
    let partsCost = 0;
    for (const row of labour.rows) {
      labourHours += Number(row.hours);
      if (row.hourly_rate !== null) {
        const amt = Number(row.hours) * Number(row.hourly_rate);
        labourCost += amt;
        addCost(row.currency_code, amt);
      }
    }
    for (const row of parts.rows) {
      if (row.unit_cost !== null) {
        const amt = -Number(row.quantity_delta) * Number(row.unit_cost);
        partsCost += amt;
        addCost(row.currency_code, amt);
      }
    }
    const costTotals: CmmsCostTotalV1[] = [...costs.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currencyCode, amount]) => ({ currencyCode, amount: Math.round(amount * 100) / 100 }));

    const tcoCurrency = costTotals[0]?.currencyCode ?? 'USD';

    return {
      ...mapWorkOrder(header.rows[0]),
      ...mapWorkOrderDetailExtras(header.rows[0]),
      tasks: tasks.rows.map((row) => ({
        id: row.id,
        position: Number(row.position),
        label: row.label,
        required: row.required === true,
        status: row.status,
        resultValue: numberOrNull(row.result_value),
        notes: row.notes ?? null,
        completedBy: row.completed_by ?? null,
        completedAt: isoOrNull(row.completed_at),
        version: Number(row.version),
      })),
      labour: labour.rows.map((row) => ({
        id: row.id,
        workerRef: row.worker_ref,
        hours: Number(row.hours),
        hourlyRate: numberOrNull(row.hourly_rate),
        currencyCode: row.currency_code ?? null,
        timeCategory: row.time_category,
        performedOn: dateOnlyOrNull(row.performed_on)!,
        notes: row.notes ?? null,
        createdBy: row.created_by,
        createdAt: iso(row.created_at),
      })),
      parts: parts.rows.map((row) => ({
        movementId: row.id,
        partId: row.part_id,
        partNumber: row.part_number,
        partName: row.name,
        quantity: -Number(row.quantity_delta),
        unitCost: numberOrNull(row.unit_cost),
        currencyCode: row.currency_code,
        storeroomId: row.storeroom_id ?? null,
        storeroomName: row.storeroom_name ?? null,
        binLocation: row.bin_location ?? null,
        createdAt: iso(row.created_at),
      })),
      notes: notes.rows.map(mapEvent),
      labourHours: Math.round(labourHours * 100) / 100,
      costs: costTotals,
      staffing: staffing.rows[0] ? mapStaffing(staffing.rows[0]) : null,
      bookings: bookings.rows.map(mapBooking),
      tco: {
        workOrderId,
        woNumber: header.rows[0].wo_number,
        labourHours: Math.round(labourHours * 10) / 10,
        labourCost: Math.round(labourCost * 100) / 100,
        partsCost: Math.round(partsCost * 100) / 100,
        totalCost: Math.round((labourCost + partsCost) * 100) / 100,
        currencyCode: tcoCurrency,
        partsCount: parts.rows.length,
        labourEntriesCount: labour.rows.length,
      },
    };
  }
}

function mapStaffing(row: any): CmmsStaffingV1 {
  return {
    id: row.id,
    status: row.status,
    requirementRef: row.requirement_ref ?? null,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    headcount: Number(row.headcount),
    capabilityCodes: Array.isArray(row.capability_codes) ? row.capability_codes : [],
    rejectionReason: row.rejection_reason ?? null,
    updatedAt: iso(row.updated_at),
  };
}

function mapBooking(row: any): CmmsWorkOrderBookingV1 {
  return {
    bookingRef: row.booking_ref,
    resourceRef: row.resource_ref,
    resourceName: row.resource_name ?? null,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    status: row.status,
    updatedAt: iso(row.updated_at),
  };
}

export function mapWorkOrder(row: any): CmmsWorkOrderV1 {
  return {
    id: row.id,
    woNumber: row.wo_number,
    type: row.type,
    priority: row.priority,
    status: row.status,
    title: row.title,
    description: row.description ?? null,
    assetId: row.asset_id ?? null,
    assetName: row.asset_name ?? null,
    siteRef: row.site_ref ?? null,
    departmentId: row.department_id ?? null,
    assignedTo: row.assigned_to ?? null,
    dueAt: isoOrNull(row.due_at),
    startedAt: isoOrNull(row.started_at),
    completedAt: isoOrNull(row.completed_at),
    cancelledAt: isoOrNull(row.cancelled_at),
    requiresSignature: row.requires_signature === true,
    signed: row.signature_data !== null && row.signature_data !== undefined,
    completionNotes: row.completion_notes ?? null,
    estimatedHours: numberOrNull(row.estimated_hours),
    triggerSource: row.trigger_source,
    pmScheduleId: row.pm_schedule_id ?? null,
    jobPlanId: row.job_plan_id ?? null,
    failureProblemId: row.failure_problem_id ?? null,
    failureCauseId: row.failure_cause_id ?? null,
    failureRemedyId: row.failure_remedy_id ?? null,
    meterTriggerId: row.meter_trigger_id ?? null,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Extended detail fields populated from JOIN aliases when available. */
export function mapWorkOrderDetailExtras(row: any): {
  jobPlanTitle?: string;
  failureProblemCode?: string;
  failureCauseCode?: string;
  failureRemedyCode?: string;
  meterTriggerTitle?: string;
} {
  return {
    jobPlanTitle: row.job_plan_title ?? undefined,
    failureProblemCode: row.failure_problem_code ?? undefined,
    failureCauseCode: row.failure_cause_code ?? undefined,
    failureRemedyCode: row.failure_remedy_code ?? undefined,
    meterTriggerTitle: row.meter_trigger_title ?? undefined,
  };
}

function mapEvent(row: any): CmmsWorkOrderEventV1 {
  return {
    id: row.id,
    eventType: row.event_type,
    fromStatus: row.from_status ?? null,
    toStatus: row.to_status ?? null,
    actorSubject: row.actor_subject,
    details: row.details ?? {},
    occurredAt: iso(row.occurred_at),
  };
}
