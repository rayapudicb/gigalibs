import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  CreateSopProcedureV1Schema,
  RecordSopStepV1Schema,
  ResolveSopFeedbackV1Schema,
  SOP_PHOTO_MAX_BYTES,
  SOP_STEP_IMAGE_MAX_BYTES,
  SopFeedbackInputV1Schema,
  SopLifecycleV1Schema,
  SopStepsV1Schema,
  StartSopExecutionV1Schema,
  UpdateSopProcedureV1Schema,
  UploadSopStepImageV1Schema,
  nextSopStep,
  sniffDiagramImage,
  sopOutcomeFits,
  type SopExecutionResultV1,
  type SopExecutionV1,
  type SopFeedbackV1,
  type SopProcedureV1,
  type SopStepDurationsV1,
  type SopStepV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWorkspaceWide, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import { assertUuid, iso, isoOrNull, notFound, parseInput, recordMutation, versionConflict } from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

// WI-OI-138 M-SOP. Procedures are shared maintenance reference data (authored and approved with workspace-wide access,
// like job plans); executions follow their work order's or asset's scope. The server walks each execution along its
// pinned revision's path; content never changes; a dual sign-off step waits for another user's countersign.

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

function decodeRaster(contentType: string, base64: string, maxBytes: number, label: string): { bytes: Buffer; sha256: string } {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > maxBytes || sniffDiagramImage(bytes) !== contentType)
    throw new BadRequestException({ code: 'CMMS_SOP_IMAGE_INVALID', message: `${label} must be a PNG, JPEG or WebP of at most ${Math.round(maxBytes / 1024)} KB.` });
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function mapProcedure(row: Record<string, any>, images: readonly string[]): SopProcedureV1 {
  return {
    id: row.id, code: row.code, title: row.title, revision: row.revision, status: row.status, jobPlanId: row.job_plan_id,
    safetyCritical: row.safety_critical, steps: row.steps, stepImages: [...images], authoredBy: row.authored_by,
    submittedBy: row.submitted_by, approvedBy: row.approved_by, approvedAt: isoOrNull(row.approved_at), reviewNote: row.review_note,
    version: row.version, updatedAt: iso(row.updated_at),
  };
}

function mapFeedback(row: Record<string, any>): SopFeedbackV1 {
  return {
    id: row.id, procedureId: row.procedure_id, procedureCode: row.code, revision: row.revision, stepKey: row.step_key,
    text: row.text, status: row.status, raisedBy: row.raised_by, raisedAt: iso(row.raised_at), resolvedBy: row.resolved_by,
    resolutionNote: row.resolution_note,
  };
}

@Injectable()
export class SopService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  // ─── Procedures ───────────────────────────────────────────────────────────────────────────────────────

  async listProcedures(principal: CmmsPrincipal, status?: string): Promise<{ readonly items: readonly SopProcedureV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      let filter = "AND p.status <> 'SUPERSEDED'";
      if (status && ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN'].includes(status)) {
        values.push(status);
        filter = `AND p.status = $${values.length}`;
      }
      const rows = await client.query(
        `SELECT p.*, coalesce((SELECT array_agg(i.step_key) FROM gigalibs_cmms.sop_step_images i
                  WHERE i.tenant_id = p.tenant_id AND i.procedure_id = p.id), '{}') AS images
           FROM gigalibs_cmms.sop_procedures p WHERE p.tenant_id = $1 ${filter} ORDER BY p.code, p.revision DESC LIMIT 500`, values);
      return { items: rows.rows.map((row) => mapProcedure(row, row.images)) };
    });
  }

  async getProcedure(principal: CmmsPrincipal, procedureId: string): Promise<SopProcedureV1> {
    assertUuid(procedureId, 'procedureId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.procedureRow(client, principal.tenantId, procedureId, false));
  }

  async createProcedure(context: CmmsCommandContext, raw: unknown): Promise<SopProcedureV1> {
    const input = parseInput(CreateSopProcedureV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      if (input.jobPlanId) {
        const found = await client.query('SELECT 1 FROM gigalibs_cmms.cmms_job_plans WHERE tenant_id = $1 AND id = $2', [context.principal.tenantId, input.jobPlanId]);
        if (!found.rows[0]) notFound('The job plan');
      }
      const next = (await client.query<{ next: number }>(
        'SELECT coalesce(max(revision), 0) + 1 AS next FROM gigalibs_cmms.sop_procedures WHERE tenant_id = $1 AND code = $2',
        [context.principal.tenantId, input.code])).rows[0]!.next;
      try {
        const id = (await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.sop_procedures (tenant_id, code, title, revision, job_plan_id, safety_critical, steps,
             authored_by, last_edited_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8, $8, $9) RETURNING id`,
          [context.principal.tenantId, input.code, input.title, next, input.jobPlanId ?? null, input.safetyCritical,
            JSON.stringify(input.steps), context.principal.subject, context.correlationId])).rows[0]!.id;
        await this.audit(client, context, 'CMMS_SOP_DRAFTED', id, 1, { code: input.code, revision: next });
        return this.procedureRow(client, context.principal.tenantId, id, false);
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
        if (code === '23505') conflict('CMMS_SOP_DRAFT_EXISTS', 'This procedure already has a draft or a revision in review.');
        throw error;
      }
    });
  }

  async updateProcedure(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<SopProcedureV1> {
    assertUuid(procedureId, 'procedureId');
    const input = parseInput(UpdateSopProcedureV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockStatus(client, context, procedureId, 'DRAFT', input.expectedVersion);
      await client.query(
        `UPDATE gigalibs_cmms.sop_procedures SET title = $3, safety_critical = $4, steps = $5::jsonb, last_edited_by = $6,
                updated_by = $6, correlation_id = $7, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, procedureId, input.title ?? current.title, input.safetyCritical ?? current.safetyCritical,
          JSON.stringify(input.steps ?? current.steps), context.principal.subject, context.correlationId]);
      if (input.steps) {
        const keys = input.steps.map((step) => step.key);
        await client.query('DELETE FROM gigalibs_cmms.sop_step_images WHERE tenant_id = $1 AND procedure_id = $2 AND NOT (step_key = ANY($3::text[]))',
          [context.principal.tenantId, procedureId, keys]);
      }
      await this.audit(client, context, 'CMMS_SOP_EDITED', procedureId, current.version + 1, {});
      return this.procedureRow(client, context.principal.tenantId, procedureId, false);
    });
  }

  async reviseProcedure(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<SopProcedureV1> {
    assertUuid(procedureId, 'procedureId');
    const input = parseInput(SopLifecycleV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const source = await this.lockStatus(client, context, procedureId, 'PUBLISHED', input.expectedVersion);
      const next = (await client.query<{ next: number }>(
        'SELECT coalesce(max(revision), 0) + 1 AS next FROM gigalibs_cmms.sop_procedures WHERE tenant_id = $1 AND code = $2',
        [context.principal.tenantId, source.code])).rows[0]!.next;
      try {
        const id = (await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.sop_procedures (tenant_id, code, title, revision, job_plan_id, safety_critical, steps,
             authored_by, last_edited_by, updated_by, correlation_id)
           SELECT tenant_id, code, title, $3, job_plan_id, safety_critical, steps, $4, $4, $4, $5
             FROM gigalibs_cmms.sop_procedures WHERE tenant_id = $1 AND id = $2 RETURNING id`,
          [context.principal.tenantId, procedureId, next, context.principal.subject, context.correlationId])).rows[0]!.id;
        await client.query(
          `INSERT INTO gigalibs_cmms.sop_step_images (tenant_id, procedure_id, step_key, content_type, bytes, sha256)
           SELECT tenant_id, $3, step_key, content_type, bytes, sha256 FROM gigalibs_cmms.sop_step_images
            WHERE tenant_id = $1 AND procedure_id = $2`, [context.principal.tenantId, procedureId, id]);
        await this.audit(client, context, 'CMMS_SOP_DRAFTED', id, 1, { code: source.code, revision: next, from: procedureId });
        return this.procedureRow(client, context.principal.tenantId, id, false);
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
        if (code === '23505') conflict('CMMS_SOP_DRAFT_EXISTS', 'This procedure already has a draft or a revision in review.');
        throw error;
      }
    });
  }

  async submit(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<SopProcedureV1> {
    return this.transition(context, procedureId, raw, 'DRAFT', async (client, current) => {
      await client.query(
        `UPDATE gigalibs_cmms.sop_procedures SET status = 'IN_REVIEW', submitted_by = $3, review_note = NULL, updated_by = $3,
                correlation_id = $4, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, current.id, context.principal.subject, context.correlationId]);
      return 'CMMS_SOP_SUBMITTED';
    });
  }

  async approve(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<SopProcedureV1> {
    return this.transition(context, procedureId, raw, 'IN_REVIEW', async (client, current, row, note) => {
      if (context.principal.subject === row.authored_by || context.principal.subject === row.last_edited_by)
        throw new ForbiddenException({ code: 'CMMS_SOP_FOUR_EYES', message: 'A procedure is approved by someone who did not write it.' });
      await client.query(
        `UPDATE gigalibs_cmms.sop_procedures SET status = 'SUPERSEDED', version = version + 1, updated_by = $3, correlation_id = $4,
                updated_at = now() WHERE tenant_id = $1 AND code = $2 AND status = 'PUBLISHED'`,
        [context.principal.tenantId, current.code, context.principal.subject, context.correlationId]);
      await client.query(
        `UPDATE gigalibs_cmms.sop_procedures SET status = 'PUBLISHED', approved_by = $3, approved_at = now(), review_note = $4,
                updated_by = $3, correlation_id = $5, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, current.id, context.principal.subject, note ?? null, context.correlationId]);
      return 'CMMS_SOP_PUBLISHED';
    });
  }

  async reject(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<SopProcedureV1> {
    return this.transition(context, procedureId, raw, 'IN_REVIEW', async (client, current, _row, note) => {
      if (!note) throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'Say why the revision goes back to its author.' });
      await client.query(
        `UPDATE gigalibs_cmms.sop_procedures SET status = 'DRAFT', submitted_by = NULL, review_note = $3, updated_by = $4,
                correlation_id = $5, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, current.id, note, context.principal.subject, context.correlationId]);
      return 'CMMS_SOP_RETURNED';
    });
  }

  async withdraw(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<SopProcedureV1> {
    return this.transition(context, procedureId, raw, 'PUBLISHED', async (client, current, _row, note) => {
      await client.query(
        `UPDATE gigalibs_cmms.sop_procedures SET status = 'WITHDRAWN', review_note = coalesce($3, review_note), updated_by = $4,
                correlation_id = $5, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, current.id, note ?? null, context.principal.subject, context.correlationId]);
      return 'CMMS_SOP_WITHDRAWN';
    });
  }

  async uploadStepImage(context: CmmsCommandContext, procedureId: string, stepKey: string, raw: unknown): Promise<SopProcedureV1> {
    assertUuid(procedureId, 'procedureId');
    const input = parseInput(UploadSopStepImageV1Schema, raw);
    const image = decodeRaster(input.contentType, input.base64, SOP_STEP_IMAGE_MAX_BYTES, 'A step image');
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockStatus(client, context, procedureId, 'DRAFT', input.expectedVersion);
      if (!current.steps.some((step) => step.key === stepKey)) notFound('The step');
      await client.query(
        `INSERT INTO gigalibs_cmms.sop_step_images (tenant_id, procedure_id, step_key, content_type, bytes, sha256)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, procedure_id, step_key) DO UPDATE SET content_type = EXCLUDED.content_type, bytes = EXCLUDED.bytes, sha256 = EXCLUDED.sha256`,
        [context.principal.tenantId, procedureId, stepKey, input.contentType, image.bytes, image.sha256]);
      await client.query(
        `UPDATE gigalibs_cmms.sop_procedures SET last_edited_by = $3, updated_by = $3, correlation_id = $4, version = version + 1,
                updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, procedureId, context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_SOP_STEP_IMAGE_SET', procedureId, current.version + 1, { stepKey });
      return this.procedureRow(client, context.principal.tenantId, procedureId, false);
    });
  }

  async stepImage(principal: CmmsPrincipal, procedureId: string, stepKey: string): Promise<{ contentType: string; base64: string; sha256: string }> {
    assertUuid(procedureId, 'procedureId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = (await client.query<{ content_type: string; bytes: Buffer; sha256: string }>(
        'SELECT content_type, bytes, sha256 FROM gigalibs_cmms.sop_step_images WHERE tenant_id = $1 AND procedure_id = $2 AND step_key = $3',
        [principal.tenantId, procedureId, stepKey])).rows[0];
      if (!row) notFound('The step image');
      return { contentType: row.content_type, base64: row.bytes.toString('base64'), sha256: row.sha256 };
    });
  }

  // ─── Executions ───────────────────────────────────────────────────────────────────────────────────────

  async startExecution(context: CmmsCommandContext, raw: unknown): Promise<SopExecutionResultV1> {
    const input = parseInput(StartSopExecutionV1Schema, raw);
    const principal = context.principal;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const existing = (await client.query<{ id: string; procedure_id: string; executed_by: string }>(
        'SELECT id, procedure_id, executed_by FROM gigalibs_cmms.sop_executions WHERE tenant_id = $1 AND client_operation_id = $2',
        [principal.tenantId, input.clientOperationId])).rows[0];
      if (existing) {
        if (existing.procedure_id !== input.procedureId || existing.executed_by !== principal.subject)
          conflict('CMMS_SOP_OPERATION_REUSED', 'This capture id was already used for a different execution.');
        return { replayed: true, execution: await this.executionRow(client, principal, existing.id) };
      }
      const procedure = await this.procedureRow(client, principal.tenantId, input.procedureId, false);
      if (procedure.status !== 'PUBLISHED') conflict('CMMS_SOP_NOT_PUBLISHED', 'Only a published procedure can be performed.');
      let siteRef: string | null = null;
      let departmentId: string | null = null;
      if (input.workOrderId) {
        const workOrder = await this.workOrders.detailWithClient(client, principal, input.workOrderId);
        if (workOrder.status === 'COMPLETED' || workOrder.status === 'CANCELLED') conflict('CMMS_WO_CLOSED', 'The work order is closed.');
        siteRef = workOrder.siteRef ?? null;
        departmentId = workOrder.departmentId ?? null;
      }
      if (input.assetId) {
        const asset = await this.assets.visibleAsset(client, principal, input.assetId, false);
        siteRef ??= asset.siteRef;
        departmentId ??= asset.departmentId;
      }
      const id = (await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.sop_executions (tenant_id, procedure_id, client_operation_id, work_order_id, asset_id, site_ref,
           department_id, executed_by, correlation_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [principal.tenantId, input.procedureId, input.clientOperationId, input.workOrderId ?? null, input.assetId ?? null, siteRef,
          departmentId, principal.subject, context.correlationId])).rows[0]!.id;
      await recordMutation(client, context, { action: 'CMMS_SOP_EXECUTION_STARTED', aggregateType: 'CMMS_SOP_EXECUTION', aggregateId: id,
        aggregateVersion: 1, payload: { procedureId: input.procedureId, workOrderId: input.workOrderId ?? null } });
      return { replayed: false, execution: await this.executionRow(client, principal, id) };
    });
  }

  async recordStep(context: CmmsCommandContext, executionId: string, raw: unknown, now = new Date()): Promise<SopExecutionResultV1> {
    assertUuid(executionId, 'executionId');
    const input = parseInput(RecordSopStepV1Schema, raw);
    const principal = context.principal;
    if (Date.parse(input.recordedAt) > now.getTime() + MAX_FUTURE_SKEW_MS)
      conflict('CMMS_SOP_CLOCK', 'The step time is in the future; check the device clock.');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const replay = (await client.query<{ execution_id: string; step_key: string; outcome: string; recorded_by: string }>(
        'SELECT execution_id, step_key, outcome, recorded_by FROM gigalibs_cmms.sop_step_results WHERE tenant_id = $1 AND client_operation_id = $2',
        [principal.tenantId, input.clientOperationId])).rows[0];
      if (replay) {
        if (replay.execution_id !== executionId || replay.step_key !== input.stepKey || replay.outcome !== input.outcome || replay.recorded_by !== principal.subject)
          conflict('CMMS_SOP_OPERATION_REUSED', 'This capture id was already used for a different step.');
        return { replayed: true, execution: await this.executionRow(client, principal, executionId) };
      }
      const execution = await this.lockExecution(client, principal, executionId);
      if (execution.executed_by !== principal.subject)
        throw new ForbiddenException({ code: 'CMMS_SOP_EXECUTOR_ONLY', message: 'Only the person performing the procedure records its steps.' });
      if (execution.status !== 'IN_PROGRESS') conflict('CMMS_SOP_COMPLETED', 'This execution is complete.');
      const procedure = await this.procedureRow(client, principal.tenantId, execution.procedure_id, false);
      if (procedure.status === 'WITHDRAWN' && procedure.safetyCritical)
        conflict('CMMS_SOP_WITHDRAWN', 'This safety-critical revision was withdrawn; stop and use the current procedure.');
      const current = await this.executionRow(client, principal, executionId);
      if (current.progress.state !== 'NEXT' || current.progress.stepKey !== input.stepKey)
        conflict('CMMS_SOP_OFF_PATH', current.progress.state === 'AWAITING_COSIGN'
          ? 'The previous step waits for a second person’s countersign.' : 'That is not the next step of this procedure.');
      const step = procedure.steps.find((item) => item.key === input.stepKey) as SopStepV1;
      if (!sopOutcomeFits(step.gate, input.outcome)) conflict('CMMS_SOP_GATE', 'The step needs a different kind of answer.');
      const withinLimits = step.gate.type === 'READING' && input.reading !== undefined
        ? (step.gate.min === undefined || input.reading >= step.gate.min) && (step.gate.max === undefined || input.reading <= step.gate.max)
        : null;
      const photo = input.outcome === 'PHOTO' ? decodeRaster(input.photoContentType!, input.photoBase64!, SOP_PHOTO_MAX_BYTES, 'A step photo') : null;
      const sequence = current.results.length + 1;
      await client.query(
        `INSERT INTO gigalibs_cmms.sop_step_results (tenant_id, execution_id, sequence, client_operation_id, step_key, outcome,
           reading, within_limits, recorded_by, recorded_at, cosign_required)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [principal.tenantId, executionId, sequence, input.clientOperationId, input.stepKey, input.outcome, input.reading ?? null,
          withinLimits, principal.subject, input.recordedAt, step.dualSignoff]);
      if (photo)
        await client.query(
          'INSERT INTO gigalibs_cmms.sop_result_photos (tenant_id, execution_id, sequence, content_type, bytes, sha256) VALUES ($1, $2, $3, $4, $5, $6)',
          [principal.tenantId, executionId, sequence, input.photoContentType, photo.bytes, photo.sha256]);
      await client.query('UPDATE gigalibs_cmms.sop_executions SET version = version + 1, correlation_id = $3 WHERE tenant_id = $1 AND id = $2',
        [principal.tenantId, executionId, context.correlationId]);
      return { replayed: false, execution: await this.executionRow(client, principal, executionId) };
    });
  }

  async cosign(context: CmmsCommandContext, executionId: string, stepKey: string): Promise<SopExecutionV1> {
    assertUuid(executionId, 'executionId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      await this.lockExecution(client, context.principal, executionId);
      const row = (await client.query<{ sequence: number; recorded_by: string }>(
        `SELECT sequence, recorded_by FROM gigalibs_cmms.sop_step_results WHERE tenant_id = $1 AND execution_id = $2 AND step_key = $3
            AND cosign_required AND cosigned_by IS NULL ORDER BY sequence DESC LIMIT 1 FOR UPDATE`,
        [context.principal.tenantId, executionId, stepKey])).rows[0];
      if (!row) conflict('CMMS_SOP_NOTHING_TO_COSIGN', 'No step here waits for a countersign.');
      if (row.recorded_by === context.principal.subject)
        throw new ForbiddenException({ code: 'CMMS_SOP_TWO_PERSON', message: 'A second person countersigns a dual sign-off step.' });
      await client.query(
        'UPDATE gigalibs_cmms.sop_step_results SET cosigned_by = $4, cosigned_at = now() WHERE tenant_id = $1 AND execution_id = $2 AND sequence = $3',
        [context.principal.tenantId, executionId, row.sequence, context.principal.subject]);
      await recordMutation(client, context, { action: 'CMMS_SOP_STEP_COSIGNED', aggregateType: 'CMMS_SOP_STEP_RESULT',
        aggregateId: `${executionId}:${row.sequence}`, aggregateVersion: 1, payload: { stepKey } });
      return this.executionRow(client, context.principal, executionId);
    });
  }

  async complete(context: CmmsCommandContext, executionId: string): Promise<SopExecutionV1> {
    assertUuid(executionId, 'executionId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const execution = await this.lockExecution(client, context.principal, executionId);
      if (execution.executed_by !== context.principal.subject)
        throw new ForbiddenException({ code: 'CMMS_SOP_EXECUTOR_ONLY', message: 'Only the person performing the procedure completes it.' });
      if (execution.status === 'COMPLETED') return this.executionRow(client, context.principal, executionId);
      const current = await this.executionRow(client, context.principal, executionId);
      if (current.progress.state !== 'END') conflict('CMMS_SOP_INCOMPLETE', 'Finish every step on the path, with its countersigns, first.');
      await client.query(
        `UPDATE gigalibs_cmms.sop_executions SET status = 'COMPLETED', completed_at = now(), version = version + 1, correlation_id = $3
          WHERE tenant_id = $1 AND id = $2`, [context.principal.tenantId, executionId, context.correlationId]);
      await recordMutation(client, context, { action: 'CMMS_SOP_EXECUTION_COMPLETED', aggregateType: 'CMMS_SOP_EXECUTION',
        aggregateId: executionId, aggregateVersion: current.version + 1, payload: { steps: current.results.length } });
      return this.executionRow(client, context.principal, executionId);
    });
  }

  async getExecution(principal: CmmsPrincipal, executionId: string): Promise<SopExecutionV1> {
    assertUuid(executionId, 'executionId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.executionRow(client, principal, executionId));
  }

  /** Executions the caller can see; `awaitingCosign` lists those waiting for someone other than the caller. */
  async listExecutions(principal: CmmsPrincipal, query: { procedureId?: string; awaitingCosign?: string }): Promise<{ readonly items: readonly SopExecutionV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['e.tenant_id = $1', ...scopePredicates(principal, values, 'e.')];
      if (query.procedureId) {
        assertUuid(query.procedureId, 'procedureId');
        values.push(query.procedureId);
        where.push(`e.procedure_id = $${values.length}`);
      }
      if (query.awaitingCosign === 'true') {
        values.push(principal.subject);
        where.push(`e.status = 'IN_PROGRESS' AND EXISTS (SELECT 1 FROM gigalibs_cmms.sop_step_results r WHERE r.tenant_id = e.tenant_id
          AND r.execution_id = e.id AND r.cosign_required AND r.cosigned_by IS NULL AND r.recorded_by <> $${values.length})`);
      }
      const ids = await client.query<{ id: string }>(
        `SELECT e.id FROM gigalibs_cmms.sop_executions e WHERE ${where.join(' AND ')} ORDER BY e.started_at DESC LIMIT 100`, values);
      const items: SopExecutionV1[] = [];
      for (const row of ids.rows) items.push(await this.executionRow(client, principal, row.id));
      return { items };
    });
  }

  /** A step appears at most once on an execution's path (definitions have no cycles), so its key names its photo. */
  async resultPhoto(principal: CmmsPrincipal, executionId: string, stepKey: string): Promise<{ contentType: string; base64: string; sha256: string }> {
    assertUuid(executionId, 'executionId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.executionRow(client, principal, executionId);
      const row = (await client.query<{ content_type: string; bytes: Buffer; sha256: string }>(
        `SELECT f.content_type, f.bytes, f.sha256 FROM gigalibs_cmms.sop_result_photos f
           JOIN gigalibs_cmms.sop_step_results r ON r.tenant_id = f.tenant_id AND r.execution_id = f.execution_id AND r.sequence = f.sequence
          WHERE f.tenant_id = $1 AND f.execution_id = $2 AND r.step_key = $3`,
        [principal.tenantId, executionId, stepKey])).rows[0];
      if (!row) notFound('The photo');
      return { contentType: row.content_type, base64: row.bytes.toString('base64'), sha256: row.sha256 };
    });
  }

  // ─── Feedback and analytics ───────────────────────────────────────────────────────────────────────────

  async addFeedback(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<SopFeedbackV1> {
    assertUuid(procedureId, 'procedureId');
    const input = parseInput(SopFeedbackInputV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const procedure = await this.procedureRow(client, context.principal.tenantId, procedureId, false);
      if (!procedure.steps.some((step) => step.key === input.stepKey)) notFound('The step');
      const id = (await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.sop_feedback (tenant_id, procedure_id, step_key, text, raised_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [context.principal.tenantId, procedureId, input.stepKey, input.text, context.principal.subject, context.correlationId])).rows[0]!.id;
      await recordMutation(client, context, { action: 'CMMS_SOP_FEEDBACK_RAISED', aggregateType: 'CMMS_SOP_FEEDBACK', aggregateId: id,
        aggregateVersion: 1, payload: { procedureId, stepKey: input.stepKey } });
      return this.feedbackRow(client, context.principal.tenantId, id);
    });
  }

  async resolveFeedback(context: CmmsCommandContext, feedbackId: string, raw: unknown): Promise<SopFeedbackV1> {
    assertUuid(feedbackId, 'feedbackId');
    const input = parseInput(ResolveSopFeedbackV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.feedbackRow(client, context.principal.tenantId, feedbackId);
      if (current.status !== 'OPEN') conflict('CMMS_SOP_FEEDBACK_RESOLVED', 'This feedback is already resolved.');
      await client.query(
        `UPDATE gigalibs_cmms.sop_feedback SET status = 'RESOLVED', resolved_by = $3, resolved_at = now(), resolution_note = $4,
                correlation_id = $5 WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, feedbackId, context.principal.subject, input.note, context.correlationId]);
      await recordMutation(client, context, { action: 'CMMS_SOP_FEEDBACK_RESOLVED', aggregateType: 'CMMS_SOP_FEEDBACK',
        aggregateId: feedbackId, aggregateVersion: 2, payload: {} });
      return this.feedbackRow(client, context.principal.tenantId, feedbackId);
    });
  }

  async listFeedback(principal: CmmsPrincipal, status?: string): Promise<{ readonly items: readonly SopFeedbackV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId, status === 'RESOLVED' ? 'RESOLVED' : 'OPEN'];
      const rows = await client.query(
        `SELECT f.*, p.code, p.revision FROM gigalibs_cmms.sop_feedback f
           JOIN gigalibs_cmms.sop_procedures p ON p.tenant_id = f.tenant_id AND p.id = f.procedure_id
          WHERE f.tenant_id = $1 AND f.status = $2 ORDER BY f.raised_at DESC LIMIT 500`, values);
      return { items: rows.rows.map(mapFeedback) };
    });
  }

  /** Average seconds per step (from the previous result, or the start) over completed executions of a procedure. */
  async durations(principal: CmmsPrincipal, procedureId: string): Promise<SopStepDurationsV1> {
    assertUuid(procedureId, 'procedureId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.procedureRow(client, principal.tenantId, procedureId, false);
      const values: unknown[] = [principal.tenantId, procedureId];
      const scope = scopePredicates(principal, values, 'e.');
      const rows = await client.query(
        `WITH timed AS (
           SELECT r.step_key, r.within_limits,
                  extract(epoch FROM r.recorded_at - coalesce(lag(r.recorded_at) OVER (PARTITION BY r.execution_id ORDER BY r.sequence), e.started_at)) AS seconds
             FROM gigalibs_cmms.sop_step_results r
             JOIN gigalibs_cmms.sop_executions e ON e.tenant_id = r.tenant_id AND e.id = r.execution_id
            WHERE r.tenant_id = $1 AND e.procedure_id = $2 AND e.status = 'COMPLETED' ${scope.length ? `AND ${scope.join(' AND ')}` : ''})
         SELECT step_key, count(*)::int AS samples, round(avg(greatest(seconds, 0))::numeric, 1) AS average,
                count(*) FILTER (WHERE within_limits = false)::int AS out_of_limits
           FROM timed GROUP BY step_key ORDER BY step_key`, values);
      const executions = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM gigalibs_cmms.sop_executions e WHERE e.tenant_id = $1 AND e.procedure_id = $2 AND e.status = 'COMPLETED'
          ${scope.length ? `AND ${scope.join(' AND ')}` : ''}`, values);
      return {
        procedureId, executions: executions.rows[0]?.n ?? 0,
        steps: rows.rows.map((row) => ({ stepKey: row.step_key, samples: row.samples, averageSeconds: Number(row.average), outOfLimits: row.out_of_limits })),
      };
    });
  }

  // ─── Rows ─────────────────────────────────────────────────────────────────────────────────────────────

  private async transition(
    context: CmmsCommandContext, procedureId: string, raw: unknown, from: SopProcedureV1['status'],
    apply: (client: PoolClient, current: SopProcedureV1, row: Record<string, any>, note: string | undefined) => Promise<string>,
  ): Promise<SopProcedureV1> {
    assertUuid(procedureId, 'procedureId');
    const input = parseInput(SopLifecycleV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockStatus(client, context, procedureId, from, input.expectedVersion);
      const row = (await client.query('SELECT authored_by, last_edited_by FROM gigalibs_cmms.sop_procedures WHERE tenant_id = $1 AND id = $2',
        [context.principal.tenantId, procedureId])).rows[0];
      const action = await apply(client, current, row, input.note);
      await this.audit(client, context, action, procedureId, current.version + 1, { code: current.code, revision: current.revision });
      return this.procedureRow(client, context.principal.tenantId, procedureId, false);
    });
  }

  private async lockStatus(client: PoolClient, context: CmmsCommandContext, procedureId: string, status: SopProcedureV1['status'], expectedVersion: number) {
    const current = await this.procedureRow(client, context.principal.tenantId, procedureId, true);
    if (current.status !== status) conflict('CMMS_SOP_STATE', `This revision is ${current.status.toLowerCase().replace('_', ' ')}.`);
    if (current.version !== expectedVersion) versionConflict('The procedure');
    return current;
  }

  private async procedureRow(client: PoolClient, tenantId: string, procedureId: string, lock: boolean): Promise<SopProcedureV1> {
    const row = (await client.query(`SELECT * FROM gigalibs_cmms.sop_procedures WHERE tenant_id = $1 AND id = $2${lock ? ' FOR UPDATE' : ''}`,
      [tenantId, procedureId])).rows[0];
    if (!row) notFound('The procedure');
    const images = await client.query<{ step_key: string }>('SELECT step_key FROM gigalibs_cmms.sop_step_images WHERE tenant_id = $1 AND procedure_id = $2',
      [tenantId, procedureId]);
    return mapProcedure({ ...row, steps: SopStepsV1Schema.parse(row.steps) }, images.rows.map((image) => image.step_key));
  }

  private async lockExecution(client: PoolClient, principal: CmmsPrincipal, executionId: string): Promise<Record<string, any>> {
    const values: unknown[] = [principal.tenantId, executionId];
    const where = ['e.tenant_id = $1', 'e.id = $2', ...scopePredicates(principal, values, 'e.')];
    const row = (await client.query(`SELECT e.* FROM gigalibs_cmms.sop_executions e WHERE ${where.join(' AND ')} FOR UPDATE OF e`, values)).rows[0];
    if (!row) notFound('The execution');
    return row;
  }

  private async executionRow(client: PoolClient, principal: CmmsPrincipal, executionId: string): Promise<SopExecutionV1> {
    const values: unknown[] = [principal.tenantId, executionId];
    const where = ['e.tenant_id = $1', 'e.id = $2', ...scopePredicates(principal, values, 'e.')];
    const row = (await client.query(
      `SELECT e.*, p.code, p.revision, p.steps FROM gigalibs_cmms.sop_executions e
         JOIN gigalibs_cmms.sop_procedures p ON p.tenant_id = e.tenant_id AND p.id = e.procedure_id
        WHERE ${where.join(' AND ')}`, values)).rows[0];
    if (!row) notFound('The execution');
    const results = await client.query(
      `SELECT r.*, EXISTS (SELECT 1 FROM gigalibs_cmms.sop_result_photos f WHERE f.tenant_id = r.tenant_id AND f.execution_id = r.execution_id
                AND f.sequence = r.sequence) AS has_photo
         FROM gigalibs_cmms.sop_step_results r WHERE r.tenant_id = $1 AND r.execution_id = $2 ORDER BY r.sequence`,
      [principal.tenantId, executionId]);
    const mapped = results.rows.map((result) => ({
      sequence: result.sequence, stepKey: result.step_key, outcome: result.outcome,
      reading: result.reading === null ? null : Number(result.reading), withinLimits: result.within_limits, hasPhoto: result.has_photo,
      recordedBy: result.recorded_by, recordedAt: iso(result.recorded_at), cosignRequired: result.cosign_required,
      cosignedBy: result.cosigned_by, cosignedAt: isoOrNull(result.cosigned_at),
    }));
    return {
      id: row.id, procedureId: row.procedure_id, procedureCode: row.code, revision: row.revision, workOrderId: row.work_order_id,
      assetId: row.asset_id, executedBy: row.executed_by, status: row.status, startedAt: iso(row.started_at),
      completedAt: isoOrNull(row.completed_at), results: mapped,
      progress: nextSopStep(SopStepsV1Schema.parse(row.steps), mapped), version: row.version,
    };
  }

  private async feedbackRow(client: PoolClient, tenantId: string, feedbackId: string): Promise<SopFeedbackV1> {
    const row = (await client.query(
      `SELECT f.*, p.code, p.revision FROM gigalibs_cmms.sop_feedback f
         JOIN gigalibs_cmms.sop_procedures p ON p.tenant_id = f.tenant_id AND p.id = f.procedure_id WHERE f.tenant_id = $1 AND f.id = $2`,
      [tenantId, feedbackId])).rows[0];
    if (!row) notFound('The feedback');
    return mapFeedback(row);
  }

  private audit(client: PoolClient, context: CmmsCommandContext, action: string, procedureId: string, version: number, payload: Record<string, unknown>) {
    return recordMutation(client, context, { action, aggregateType: 'CMMS_SOP_PROCEDURE', aggregateId: procedureId, aggregateVersion: version, payload });
  }
}
