import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  ApplyCmmsJobPlanV1Schema,
  CreateCmmsFailureCodeV1Schema,
  CreateCmmsJobPlanV1Schema,
  RecordCmmsFailureAttributionV1Schema,
  UpdateCmmsFailureCodeV1Schema,
  UpdateCmmsJobPlanV1Schema,
  type CmmsFailureCodeV1,
  type CmmsFailureHierarchyNodeV1,
  type CmmsJobPlanTaskV1,
  type CmmsJobPlanV1,
} from '@gigalibs/contracts';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWorkspaceWide, assertWritableScope } from '../auth/scope.js';
import {
  assertUuid,
  iso,
  notFound,
  parseInput,
  recordMutation,
  translateConstraint,
  versionConflict,
} from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';

const FAILURE_CODE_COLUMNS = `f.id, f.code, f.description, f.type, f.parent_code_id,
  f.classification_id, f.version, f.created_by, f.created_at, f.updated_at`;

const JOB_PLAN_COLUMNS = `j.id, j.code, j.title, j.description, j.classification_id,
  j.estimated_duration_minutes, j.safety_guidelines, j.version, j.created_by, j.created_at, j.updated_at`;

@Injectable()
export class ReliabilityService {
  constructor(private readonly database: DatabaseService) {}

  // ─── Failure Codes ──────────────────────────────────────────────────────────

  async listFailureCodes(principal: CmmsPrincipal, type?: string): Promise<readonly CmmsFailureCodeV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      let sql = `SELECT ${FAILURE_CODE_COLUMNS}
                   FROM gigalibs_cmms.cmms_failure_codes f
                  WHERE f.tenant_id = $1`;
      if (type) {
        values.push(type);
        sql += ` AND f.type = $${values.length}`;
      }
      sql += ` ORDER BY f.type, f.code, f.id`;
      const result = await client.query(sql, values);
      return result.rows.map(mapFailureCode);
    });
  }

  async getFailureHierarchyTree(
    principal: CmmsPrincipal,
    type?: string,
  ): Promise<readonly CmmsFailureHierarchyNodeV1[]> {
    const flat = await this.listFailureCodes(principal, type);
    return buildFailureTree(flat);
  }

  async createFailureCode(context: CmmsCommandContext, raw: unknown): Promise<CmmsFailureCodeV1> {
    assertWorkspaceWide(context.principal);
    const input = parseInput(CreateCmmsFailureCodeV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      if (input.parentCodeId) {
        const parent = await client.query(
          `SELECT id FROM gigalibs_cmms.cmms_failure_codes WHERE tenant_id = $1 AND id = $2`,
          [context.principal.tenantId, input.parentCodeId],
        );
        if (!parent.rows[0]) notFound('Parent failure code');
      }
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.cmms_failure_codes
             (tenant_id, type, code, description, parent_code_id, classification_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            context.principal.tenantId,
            input.type,
            input.code,
            input.description,
            input.parentCodeId ?? null,
            input.classificationId ?? null,
            context.principal.subject,
          ],
        );
        const id = result.rows[0]!.id;
        await recordMutation(client, context, {
          action: 'CMMS_FAILURE_CODE_CREATED',
          aggregateType: 'CMMS_FAILURE_CODE',
          aggregateId: id,
          aggregateVersion: 1,
          payload: { code: input.code, type: input.type },
        });
        return this.visibleFailureCode(client, context.principal.tenantId, id);
      } catch (error) {
        translateConstraint(error, {
          unique: 'A failure code with this code already exists for this type.',
          reference: 'The referenced classification does not exist.',
        });
      }
    });
  }

  async updateFailureCode(context: CmmsCommandContext, id: string, raw: unknown): Promise<CmmsFailureCodeV1> {
    assertWorkspaceWide(context.principal);
    assertUuid(id, 'failureCodeId');
    const input = parseInput(UpdateCmmsFailureCodeV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.visibleFailureCode(client, context.principal.tenantId, id);
      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.cmms_failure_codes
            SET description = $4, parent_code_id = $5, classification_id = $6,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          id,
          input.expectedVersion,
          input.description ?? current.description,
          input.parentCodeId === undefined ? current.parentCodeId : (input.parentCodeId ?? null),
          input.classificationId === undefined ? current.classificationId : (input.classificationId ?? null),
        ],
      );
      if (result.rowCount === 0) versionConflict('The failure code');
      await recordMutation(client, context, {
        action: 'CMMS_FAILURE_CODE_UPDATED',
        aggregateType: 'CMMS_FAILURE_CODE',
        aggregateId: id,
        aggregateVersion: Number(result.rows[0]!.version),
        payload: {},
      });
      return this.visibleFailureCode(client, context.principal.tenantId, id);
    });
  }

  async deleteFailureCode(context: CmmsCommandContext, id: string): Promise<void> {
    assertWorkspaceWide(context.principal);
    assertUuid(id, 'failureCodeId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const inUse = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM gigalibs_cmms.work_orders
          WHERE tenant_id = $1 AND (failure_problem_id = $2 OR failure_cause_id = $2 OR failure_remedy_id = $2)`,
        [context.principal.tenantId, id],
      );
      if (Number(inUse.rows[0]!.n) > 0) {
        throw new ConflictException({
          code: 'CMMS_FAILURE_CODE_IN_USE',
          message: 'This failure code is referenced by one or more work orders and cannot be deleted.',
        });
      }
      const result = await client.query<{ version: number }>(
        `DELETE FROM gigalibs_cmms.cmms_failure_codes WHERE tenant_id = $1 AND id = $2 RETURNING version`,
        [context.principal.tenantId, id],
      );
      if (result.rowCount === 0) notFound('Failure code');
      // WI-OI-120h: the deletion is the code's next version (outbox events need a positive version).
      await recordMutation(client, context, {
        action: 'CMMS_FAILURE_CODE_DELETED',
        aggregateType: 'CMMS_FAILURE_CODE',
        aggregateId: id,
        aggregateVersion: result.rows[0]!.version + 1,
        payload: {},
      });
    });
  }

  // ─── Job Plans ───────────────────────────────────────────────────────────────

  async listJobPlans(principal: CmmsPrincipal, classificationId?: string): Promise<readonly CmmsJobPlanV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      let sql = `SELECT ${JOB_PLAN_COLUMNS}
                   FROM gigalibs_cmms.cmms_job_plans j
                  WHERE j.tenant_id = $1`;
      if (classificationId) {
        values.push(classificationId);
        sql += ` AND j.classification_id = $${values.length}`;
      }
      sql += ` ORDER BY j.code, j.id`;
      const result = await client.query(sql, values);
      const plans = result.rows.map((row) => mapJobPlan(row, []));
      if (plans.length === 0) return [];
      const ids = plans.map((p) => p.id);
      const taskResult = await client.query(
        `SELECT * FROM gigalibs_cmms.cmms_job_plan_tasks
          WHERE tenant_id = $1 AND job_plan_id = ANY($2::uuid[])
          ORDER BY sequence ASC`,
        [principal.tenantId, ids],
      );
      const tasksByPlan = new Map<string, typeof taskResult.rows>();
      for (const row of taskResult.rows) {
        const arr = tasksByPlan.get(row.job_plan_id) ?? [];
        arr.push(row);
        tasksByPlan.set(row.job_plan_id, arr);
      }
      return plans.map((p) => ({
        ...p,
        tasks: (tasksByPlan.get(p.id) ?? []).map(mapJobPlanTask),
      }));
    });
  }

  async getJobPlan(principal: CmmsPrincipal, id: string): Promise<CmmsJobPlanV1> {
    assertUuid(id, 'jobPlanId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return this.fetchJobPlanWithTasks(client, principal.tenantId, id);
    });
  }

  async createJobPlan(context: CmmsCommandContext, raw: unknown): Promise<CmmsJobPlanV1> {
    assertWorkspaceWide(context.principal);
    const input = parseInput(CreateCmmsJobPlanV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.cmms_job_plans
             (tenant_id, code, title, description, classification_id, estimated_duration_minutes,
              safety_guidelines, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            context.principal.tenantId,
            input.code,
            input.title,
            input.description ?? null,
            input.classificationId ?? null,
            input.estimatedDurationMinutes,
            input.safetyGuidelines ?? null,
            context.principal.subject,
          ],
        );
        const id = result.rows[0]!.id;
        for (const task of input.tasks) {
          await client.query(
            `INSERT INTO gigalibs_cmms.cmms_job_plan_tasks
               (tenant_id, job_plan_id, sequence, label, task_type, required, estimated_minutes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              context.principal.tenantId,
              id,
              task.sequence,
              task.label,
              task.taskType,
              task.required,
              task.estimatedMinutes,
            ],
          );
        }
        await recordMutation(client, context, {
          action: 'CMMS_JOB_PLAN_CREATED',
          aggregateType: 'CMMS_JOB_PLAN',
          aggregateId: id,
          aggregateVersion: 1,
          payload: { code: input.code, taskCount: input.tasks.length },
        });
        return this.fetchJobPlanWithTasks(client, context.principal.tenantId, id);
      } catch (error) {
        translateConstraint(error, {
          unique: 'A job plan with this code already exists.',
          reference: 'The referenced classification does not exist.',
        });
      }
    });
  }

  async updateJobPlan(context: CmmsCommandContext, id: string, raw: unknown): Promise<CmmsJobPlanV1> {
    assertWorkspaceWide(context.principal);
    assertUuid(id, 'jobPlanId');
    const input = parseInput(UpdateCmmsJobPlanV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.fetchJobPlanWithTasks(client, context.principal.tenantId, id);
      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.cmms_job_plans
            SET title = $4, description = $5, estimated_duration_minutes = $6, safety_guidelines = $7,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          id,
          input.expectedVersion,
          input.title ?? current.title,
          input.description === undefined ? current.description : (input.description ?? null),
          input.estimatedDurationMinutes ?? current.estimatedDurationMinutes,
          input.safetyGuidelines === undefined ? current.safetyGuidelines : (input.safetyGuidelines ?? null),
        ],
      );
      if (result.rowCount === 0) versionConflict('The job plan');
      // Replace tasks atomically if provided
      if (input.tasks !== undefined) {
        await client.query(
          `DELETE FROM gigalibs_cmms.cmms_job_plan_tasks WHERE tenant_id = $1 AND job_plan_id = $2`,
          [context.principal.tenantId, id],
        );
        for (const task of input.tasks) {
          await client.query(
            `INSERT INTO gigalibs_cmms.cmms_job_plan_tasks
               (tenant_id, job_plan_id, sequence, label, task_type, required, estimated_minutes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              context.principal.tenantId,
              id,
              task.sequence,
              task.label,
              task.taskType,
              task.required,
              task.estimatedMinutes,
            ],
          );
        }
      }
      await recordMutation(client, context, {
        action: 'CMMS_JOB_PLAN_UPDATED',
        aggregateType: 'CMMS_JOB_PLAN',
        aggregateId: id,
        aggregateVersion: Number(result.rows[0]!.version),
        payload: {},
      });
      return this.fetchJobPlanWithTasks(client, context.principal.tenantId, id);
    });
  }

  // ─── Apply Job Plan to Work Order ────────────────────────────────────────────

  async applyJobPlanToWorkOrder(
    context: CmmsCommandContext,
    jobPlanId: string,
    workOrderId: string,
    raw: unknown,
  ): Promise<void> {
    assertUuid(jobPlanId, 'jobPlanId');
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(ApplyCmmsJobPlanV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const plan = await this.fetchJobPlanWithTasks(client, context.principal.tenantId, jobPlanId);

      const woRow = await client.query<{ id: string; status: string; version: number; department_id: string | null; site_ref: string | null }>(
        `SELECT id, status, version, department_id, site_ref
           FROM gigalibs_cmms.work_orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [context.principal.tenantId, workOrderId],
      );
      if (!woRow.rows[0]) notFound('Work order');
      assertWritableScope(context.principal, {
        departmentId: woRow.rows[0]!.department_id,
        siteRef: woRow.rows[0]!.site_ref,
      });
      // WI-OI-120h: the work order's version is checked and advanced, like every other work-order command.
      if (woRow.rows[0].version !== input.expectedVersion) versionConflict('The work order');
      if (!['OPEN', 'IN_PROGRESS', 'ON_HOLD'].includes(woRow.rows[0].status)) {
        throw new ConflictException({
          code: 'CMMS_WORK_ORDER_NOT_ACTIVE',
          message: 'Job plans can only be applied to active (Open, In Progress, On Hold) work orders.',
        });
      }

      const posRow = await client.query<{ max_pos: number }>(
        `SELECT COALESCE(MAX(position), 0)::int AS max_pos FROM gigalibs_cmms.work_order_tasks
          WHERE tenant_id = $1 AND work_order_id = $2`,
        [context.principal.tenantId, workOrderId],
      );
      let nextPos = posRow.rows[0]!.max_pos + 1;

      for (const task of plan.tasks) {
        await client.query(
          `INSERT INTO gigalibs_cmms.work_order_tasks (tenant_id, work_order_id, position, label, required)
           VALUES ($1, $2, $3, $4, $5)`,
          [context.principal.tenantId, workOrderId, nextPos++, task.label, task.required],
        );
      }

      // Set job_plan_id on work order
      const updated = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.work_orders
            SET job_plan_id = $4, version = version + 1, updated_by = $5, correlation_id = $6, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [context.principal.tenantId, workOrderId, input.expectedVersion, jobPlanId, context.principal.subject, context.correlationId],
      );
      if (updated.rowCount === 0) versionConflict('The work order');

      await recordMutation(client, context, {
        action: 'CMMS_JOB_PLAN_APPLIED',
        aggregateType: 'CMMS_WORK_ORDER',
        aggregateId: workOrderId,
        aggregateVersion: updated.rows[0]!.version,
        payload: { jobPlanId, tasksAdded: plan.tasks.length },
      });
    });
  }

  // ─── Failure Attribution ─────────────────────────────────────────────────────

  async recordFailureAttribution(
    context: CmmsCommandContext,
    workOrderId: string,
    raw: unknown,
  ): Promise<void> {
    assertUuid(workOrderId, 'workOrderId');
    const input = parseInput(RecordCmmsFailureAttributionV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const woRow = await client.query<{
        id: string;
        version: number;
        department_id: string | null;
        site_ref: string | null;
        signed_off_at: Date | null;
      }>(
        `SELECT id, version, department_id, site_ref, signed_off_at
           FROM gigalibs_cmms.work_orders WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [context.principal.tenantId, workOrderId],
      );
      if (!woRow.rows[0]) notFound('Work order');
      assertWritableScope(context.principal, {
        departmentId: woRow.rows[0]!.department_id,
        siteRef: woRow.rows[0]!.site_ref,
      });
      // WI-OI-120h: the work order's version is checked and advanced, like every other work-order command.
      if (woRow.rows[0].version !== input.expectedVersion) versionConflict('The work order');
      if (woRow.rows[0]!.signed_off_at) {
        throw new ConflictException({
          code: 'CMMS_WORK_ORDER_SIGNED_OFF',
          message: 'This work order is closed and cannot be changed.',
        });
      }

      for (const [fieldId, label] of [
        [input.failureProblemId, 'Problem'],
        [input.failureCauseId, 'Cause'],
        [input.failureRemedyId, 'Remedy'],
      ] as const) {
        if (fieldId) {
          const check = await client.query(
            `SELECT id FROM gigalibs_cmms.cmms_failure_codes WHERE tenant_id = $1 AND id = $2`,
            [context.principal.tenantId, fieldId],
          );
          if (!check.rows[0]) {
            throw new BadRequestException({
              code: 'CMMS_FAILURE_CODE_NOT_FOUND',
              message: `Failure ${label} code not found.`,
            });
          }
        }
      }

      const updated = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.work_orders
            SET failure_problem_id = $4, failure_cause_id = $5, failure_remedy_id = $6,
                version = version + 1, updated_by = $7, correlation_id = $8, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          workOrderId,
          input.expectedVersion,
          input.failureProblemId ?? null,
          input.failureCauseId ?? null,
          input.failureRemedyId ?? null,
          context.principal.subject,
          context.correlationId,
        ],
      );
      if (updated.rowCount === 0) versionConflict('The work order');

      await recordMutation(client, context, {
        action: 'CMMS_FAILURE_ATTRIBUTION_RECORDED',
        aggregateType: 'CMMS_WORK_ORDER',
        aggregateId: workOrderId,
        aggregateVersion: updated.rows[0]!.version,
        payload: {
          failureProblemId: input.failureProblemId ?? null,
          failureCauseId: input.failureCauseId ?? null,
          failureRemedyId: input.failureRemedyId ?? null,
        },
      });
    });
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private async visibleFailureCode(
    client: import('pg').PoolClient,
    tenantId: string,
    id: string,
  ): Promise<CmmsFailureCodeV1> {
    const result = await client.query(
      `SELECT ${FAILURE_CODE_COLUMNS} FROM gigalibs_cmms.cmms_failure_codes f
        WHERE f.tenant_id = $1 AND f.id = $2`,
      [tenantId, id],
    );
    if (!result.rows[0]) notFound('Failure code');
    return mapFailureCode(result.rows[0]);
  }

  private async fetchJobPlanWithTasks(
    client: import('pg').PoolClient,
    tenantId: string,
    id: string,
  ): Promise<CmmsJobPlanV1> {
    const row = await client.query(
      `SELECT ${JOB_PLAN_COLUMNS} FROM gigalibs_cmms.cmms_job_plans j WHERE j.tenant_id = $1 AND j.id = $2`,
      [tenantId, id],
    );
    if (!row.rows[0]) notFound('Job plan');
    const taskResult = await client.query(
      `SELECT * FROM gigalibs_cmms.cmms_job_plan_tasks WHERE tenant_id = $1 AND job_plan_id = $2 ORDER BY sequence`,
      [tenantId, id],
    );
    return mapJobPlan(row.rows[0], taskResult.rows.map(mapJobPlanTask));
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapFailureCode(row: any): CmmsFailureCodeV1 {
  return {
    id: row.id,
    type: row.type,
    code: row.code,
    description: row.description,
    parentCodeId: row.parent_code_id ?? null,
    classificationId: row.classification_id ?? null,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapJobPlanTask(row: any): CmmsJobPlanTaskV1 {
  return {
    id: row.id,
    jobPlanId: row.job_plan_id,
    sequence: Number(row.sequence),
    label: row.label,
    taskType: row.task_type,
    required: row.required === true,
    estimatedMinutes: Number(row.estimated_minutes),
    createdAt: iso(row.created_at),
  };
}

function mapJobPlan(row: any, tasks: readonly CmmsJobPlanTaskV1[]): CmmsJobPlanV1 {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description ?? null,
    classificationId: row.classification_id ?? null,
    estimatedDurationMinutes: Number(row.estimated_duration_minutes),
    safetyGuidelines: row.safety_guidelines ?? null,
    tasks,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function buildFailureTree(flat: readonly CmmsFailureCodeV1[]): CmmsFailureHierarchyNodeV1[] {
  const byId = new Map<string, CmmsFailureHierarchyNodeV1>(
    flat.map((f) => [f.id, { ...f, children: [] }]),
  );
  const roots: CmmsFailureHierarchyNodeV1[] = [];
  for (const node of byId.values()) {
    if (node.parentCodeId && byId.has(node.parentCodeId)) {
      (byId.get(node.parentCodeId)!.children as CmmsFailureHierarchyNodeV1[]).push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
