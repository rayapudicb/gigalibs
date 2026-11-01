import { createHash, randomUUID } from 'node:crypto';
import type {
  CaptureRoundReadingV1, CompleteRoundRunV1, ReportRoundDefectV1, RequestRoundSkipV1, RoundCheckpointDraftV1,
  RoundSyncCommandV1, RoundSyncResponseV1, StartRoundRunV1,
} from '@gigalibs/contracts';
import { type ModuleCommandContext, type ModulePrincipal, recordMutation } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { scopeEvaluator } from '../organization.js';
import { WorkforceEligibilityService } from '../workforce-eligibility.js';
import { classifyReading, RoundRuleError } from './round-rules.js';

interface RunRow {
  id: string; assignment_id: string; route_id: string; route_revision: number;
  actor_subject: string; state: string; version: number; request_sha256: string;
  started_at: Date; completed_at: Date | null;
}
interface AssignmentRow {
  id: string; route_id: string; route_revision: number; operator_subject: string;
  workforce_resource_ref: string;
  owning_unit_id: string | null; site_ref: string | null; state: string;
  scheduled_start: Date; due_at: Date;
}
interface PointRow {
  id: string; position: number; label: string; asset_ref: string; meter_ref: string | null;
  tag_code: string; proof_mode: 'NFC' | 'BARCODE' | 'EITHER';
  reading_kind: 'NUMERIC' | 'CHOICE' | 'BOOLEAN'; unit_code: string | null;
  nominal: string | null; amber_low: string | null; amber_high: string | null;
  red_low: string | null; red_high: string | null; choices: string[];
  branch_rule: RoundCheckpointDraftV1['branchRules']; instructions: string | null;
  photo_on_exception: boolean;
}
interface ReceiptRow { request_sha256: string; result: unknown; }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const runView = (row: RunRow) => ({ id:row.id, assignmentId:row.assignment_id,
  routeId:row.route_id, routeRevision:Number(row.route_revision), actorSubject:row.actor_subject,
  state:row.state, version:Number(row.version), startedAt:row.started_at.toISOString(),
  completedAt:row.completed_at?.toISOString() ?? null });
const pointForRules = (point: PointRow): RoundCheckpointDraftV1 => ({
  id:point.id,position:Number(point.position),label:point.label,assetRef:point.asset_ref,
  meterRef:point.meter_ref,tagCode:point.tag_code,proofMode:point.proof_mode,
  readingKind:point.reading_kind,unitCode:point.unit_code,nominal:point.nominal,
  amberLow:point.amber_low,amberHigh:point.amber_high,redLow:point.red_low,
  redHigh:point.red_high,choices:point.choices,branchRules:point.branch_rule,
  instructions:point.instructions,photoOnException:point.photo_on_exception,
});

/** A published branch may skip later positions but cannot move backwards. */
export function nextPosition(points: readonly Pick<PointRow,'position'|'branch_rule'>[], current: number,
  value: string, status: string): number | null {
  const point = points.find((item) => Number(item.position) === current);
  if (!point) throw new ConflictException('Checkpoint is absent from the route.');
  const rules = point.branch_rule ?? [];
  const matching = rules.find((rule) => rule.condition === 'VALUE_EQUALS' && rule.value === value)
    ?? rules.find((rule) => rule.condition === 'STATUS_IS' && rule.value === status)
    ?? rules.find((rule) => rule.condition === 'ALWAYS');
  return matching?.nextPosition ?? points.map((item) => Number(item.position)).find((position) => position > current) ?? null;
}

/** The caller holds the run row lock; the unique readings index is the database backstop. */
export async function assertRoundEvidenceAvailable(client: PoolClient, tenantId: string,
  evidenceId: string, subject: string, assignmentId: string, checkpointId: string): Promise<void> {
  const media = (await client.query<{ actor_subject:string; state:string;
    assignment_id:string|null; checkpoint_id:string|null }>(
    `SELECT actor_subject,state,assignment_id,checkpoint_id
     FROM ${SCHEMA}.media_evidence WHERE tenant_id=$1 AND id=$2`,
    [tenantId,evidenceId],
  )).rows[0];
  if (!media || media.actor_subject !== subject || media.state !== 'COMMITTED' ||
      media.assignment_id !== assignmentId || media.checkpoint_id !== checkpointId)
    throw new BadRequestException('Evidence is not committed for this assignment and checkpoint.');
  const used = (await client.query<{id:string}>(
    `SELECT id FROM ${SCHEMA}.readings WHERE tenant_id=$1 AND evidence_id=$2
     UNION ALL SELECT id FROM ${SCHEMA}.exceptions WHERE tenant_id=$1 AND evidence_id=$2 LIMIT 1`,
    [tenantId,evidenceId],
  )).rows[0];
  if (used) throw new ConflictException('Evidence is already attached to a reading or defect.');
}

/** A run's route path: accepted readings and requested skips, in the order the server received them. */
interface StepRow { position:number; status:string; numeric_value:string|null; choice_value:string|null }
async function routeSteps(client: PoolClient, tenantId: string, runId: string, latestOnly = false): Promise<StepRow[]> {
  return (await client.query<StepRow>(
    `SELECT position,status,numeric_value,choice_value FROM (
       SELECT c.position,rd.status,rd.numeric_value::text AS numeric_value,rd.choice_value,rd.received_at,rd.id::text AS step_id
         FROM ${SCHEMA}.readings rd JOIN ${SCHEMA}.checkpoints c ON c.tenant_id=rd.tenant_id AND c.id=rd.checkpoint_id
        WHERE rd.tenant_id=$1 AND rd.run_id=$2
       UNION ALL
       SELECT c.position,'SKIPPED',NULL,NULL,sk.received_at,sk.id::text
         FROM ${SCHEMA}.checkpoint_skips sk JOIN ${SCHEMA}.checkpoints c ON c.tenant_id=sk.tenant_id AND c.id=sk.checkpoint_id
        WHERE sk.tenant_id=$1 AND sk.run_id=$2
     ) steps ORDER BY received_at ${latestOnly ? 'DESC' : 'ASC'},step_id ${latestOnly ? 'DESC LIMIT 1' : 'ASC'}`,
    [tenantId,runId],
  )).rows;
}

/** The checkpoint a step must be at: the first position, or where the previous step's branch leads. */
function expectedPosition(points: readonly Pick<PointRow,'position'|'branch_rule'>[], previous: StepRow | undefined): number | null {
  return previous
    ? nextPosition(points,Number(previous.position),previous.choice_value ?? previous.numeric_value ?? '',previous.status)
    : Number(points[0]?.position);
}

function assertOfflineWindow(at: string, label: string): void {
  const time = new Date(at).getTime();
  if (time > Date.now() + 5 * 60_000 || time < Date.now() - 7 * 24 * 60 * 60_000)
    throw new BadRequestException(`${label} is outside the offline window.`);
}

@Injectable()
export class RunsService {
  constructor(private readonly database: DatabaseService,
    private readonly workforce: WorkforceEligibilityService) {}

  async getReceipt(principal: ModulePrincipal, operationId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = (await client.query<{actor_subject:string;result:Record<string,unknown>;state:string}>(
        `SELECT actor_subject,result,state FROM ${SCHEMA}.sync_receipts
         WHERE tenant_id=$1 AND client_operation_id=$2`,[principal.tenantId,operationId],
      )).rows[0];
      if (!row || row.actor_subject !== principal.subject) throw new NotFoundException('Receipt not found.');
      return { ...row.result,state:row.state };
    });
  }

  async sync(context: ModuleCommandContext, commands: readonly RoundSyncCommandV1[]): Promise<RoundSyncResponseV1> {
    const results: RoundSyncResponseV1['results'][number][] = [];
    let stopped = false;
    for (const command of commands) {
      const operationId = command.type === 'START' ? command.payload.requestKey : command.payload.clientOperationId;
      if (stopped) {
        results.push({ accepted:false,type:command.type,operationId,state:'NOT_APPLIED',
          code:'EARLIER_COMMAND_FAILED',retryable:false });
        continue;
      }
      try {
        // Each accepted command commits before the next starts. Its persisted receipt handles replay.
        const result = command.type === 'START' ? await this.start(context,command.payload)
          : command.type === 'READING' ? await this.capture(context,command.payload)
            : command.type === 'DEFECT' ? await this.defect(context,command.payload)
              : command.type === 'SKIP' ? await this.skip(context,command.payload)
                : await this.complete(context,command.payload);
        results.push({ accepted:true,type:command.type,operationId,replayed:result.replayed,
          result:result as Record<string,unknown> });
      } catch (error) {
        // Permission and infrastructure failures keep their HTTP status; callers must refresh or retry.
        if (!(error instanceof HttpException) || ![400,404,409].includes(error.getStatus())) throw error;
        const status = error.getStatus();
        const response=error.getResponse();
        const workforceChanged=command.type==='START' && status===409 &&
          typeof response==='object' && response!==null && 'code' in response &&
          typeof response.code==='string' && response.code.startsWith('ROUNDS_');
        results.push({ accepted:false,type:command.type,operationId,
          state:status === 409 ? 'CONFLICT' : 'REJECTED',
          code:workforceChanged?'WORKFORCE_CHANGED'
            :status === 409 ? 'VERSION_CONFLICT' : status === 404 ? 'NOT_FOUND' : 'INVALID_COMMAND',
          retryable:false });
        stopped = true;
      }
    }
    return { results, stopped };
  }

  async start(context: ModuleCommandContext, input: StartRoundRunV1) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const assignment = await this.assignment(client,tenantId,input.assignmentId,true);
      if (assignment.operator_subject !== subject ||
          !(await scope.allows('operator-rounds.runs.execute',assignment,true)))
        throw new NotFoundException('Assignment not found.');
      if (assignment.route_revision !== input.routeRevision)
        throw new ConflictException('The downloaded route revision is stale.');
      const hash = digest(input);
      const existing = (await client.query<RunRow>(
        `SELECT * FROM ${SCHEMA}.round_runs WHERE tenant_id=$1 AND request_key=$2`,
        [tenantId,input.requestKey],
      )).rows[0];
      if (existing) {
        if (existing.request_sha256 !== hash || existing.actor_subject !== subject)
          throw new ConflictException('Idempotency key was reused with different content.');
        return { type:'START', accepted:true, replayed:true, run:runView(existing) };
      }
      if (assignment.state !== 'ASSIGNED') throw new ConflictException('Assignment is already started or closed.');
      const route = (await client.query<{ state:string;schedule:{timeZone:string} }>(
        `SELECT state,schedule FROM ${SCHEMA}.route_templates WHERE tenant_id=$1 AND id=$2`,
        [tenantId,assignment.route_id],
      )).rows[0];
      if (!route || route.state === 'DRAFT') throw new ConflictException('Route is not published.');
      await this.workforce.assertEligible(tenantId,assignment.workforce_resource_ref,subject,{
        owningUnitId:assignment.owning_unit_id,placeRef:assignment.site_ref,
        timeZone:route.schedule.timeZone,
        scheduledStart:assignment.scheduled_start.toISOString(),
        dueAt:assignment.due_at.toISOString(),
      });
      const inserted = (await client.query<RunRow>(
        `INSERT INTO ${SCHEMA}.round_runs
          (id,tenant_id,request_key,request_sha256,assignment_id,route_id,route_revision,actor_subject)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [input.runId,tenantId,input.requestKey,hash,assignment.id,assignment.route_id,
         assignment.route_revision,subject],
      )).rows[0]!;
      await client.query(
        `UPDATE ${SCHEMA}.assignments SET state='STARTED',version=version+1,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,[tenantId,assignment.id],
      );
      await recordMutation(client,{schema:SCHEMA,topic:TOPIC},context,{
        action:'RUN_STARTED',aggregateType:'run',aggregateId:inserted.id,aggregateVersion:1,
        payload:{assignmentId:assignment.id,routeId:assignment.route_id,routeRevision:assignment.route_revision},
      });
      const result = { type:'START', accepted:true, replayed:false, run:runView(inserted) };
      await this.saveReceipt(client,tenantId,input.requestKey,subject,hash,result);
      return result;
    });
  }

  async capture(context: ModuleCommandContext, input: CaptureRoundReadingV1) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const hash = digest(input);
      const replay = await this.receipt(client,tenantId,input.clientOperationId,hash,subject);
      if (replay) return { ...replay, replayed:true };
      const run = await this.run(client,tenantId,input.runId,true);
      const assignment = await this.assignment(client,tenantId,run.assignment_id,false);
      await this.assertOperator(context.principal,run,assignment,scope);
      if (run.state !== 'IN_PROGRESS') throw new ConflictException('Run is no longer in progress.');
      if (run.route_revision !== input.routeRevision || Number(run.version) !== input.expectedRunVersion)
        throw new ConflictException('The route or run version changed; reconcile before resending.');
      assertOfflineWindow(input.capturedAt,'Capture time');
      const points = (await client.query<PointRow>(
        `SELECT * FROM ${SCHEMA}.checkpoints WHERE tenant_id=$1 AND route_id=$2 ORDER BY position`,
        [tenantId,run.route_id],
      )).rows;
      const point = points.find((entry) => entry.id === input.checkpointId);
      if (!point) throw new NotFoundException('Checkpoint not found in this route.');
      const [previous] = await routeSteps(client,tenantId,run.id,true);
      if (expectedPosition(points,previous) !== Number(point.position)) throw new ConflictException('Checkpoint is out of route order.');
      if (point.proof_mode !== 'EITHER' && point.proof_mode !== input.proofMethod)
        throw new BadRequestException('This checkpoint requires another scan method.');
      let status: 'NORMAL' | 'AMBER' | 'RED';
      try { status = classifyReading(pointForRules(point),input); }
      catch (error) {
        if (error instanceof RoundRuleError) throw new BadRequestException({code:error.code,message:error.message});
        throw error;
      }
      if (status !== 'NORMAL' && point.photo_on_exception && !input.evidenceId)
        throw new BadRequestException('An exception photo is required.');
      if (input.evidenceId) await assertRoundEvidenceAvailable(client,tenantId,input.evidenceId,
        subject,assignment.id,point.id);
      const readingId = randomUUID();
      await client.query(
        `INSERT INTO ${SCHEMA}.readings
          (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,source,proof_method,
           scanned_tag,numeric_value,choice_value,status,evidence_id,actor_subject)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [readingId,tenantId,run.id,point.id,input.clientOperationId,input.capturedAt,input.source,
         input.proofMethod,input.scannedTag,input.numericValue,
         input.choiceValue,status,input.evidenceId,subject],
      );
      const updated = (await client.query<RunRow>(
        `UPDATE ${SCHEMA}.round_runs SET version=version+1 WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [tenantId,run.id],
      )).rows[0]!;
      const exceptionId = status === 'NORMAL' ? null : randomUUID();
      const cmmsRequestKey = exceptionId ? randomUUID() : null;
      if (exceptionId) await client.query(
        `INSERT INTO ${SCHEMA}.exceptions
          (id,tenant_id,reading_id,severity,state,cmms_request_key)
         VALUES ($1,$2,$3,$4,'ACTION_PENDING',$5)`,
        [exceptionId,tenantId,readingId,status,cmmsRequestKey],
      );
      if (exceptionId) await recordMutation(client,{schema:SCHEMA,topic:'operator-rounds.cmms.v1'},context,{
        action:'ROUND_CORRECTIVE_ACTION_REQUESTED',aggregateType:'exception',
        aggregateId:exceptionId,aggregateVersion:1,
        payload:{requestKey:cmmsRequestKey,exceptionId,readingId,runId:run.id,
          routeId:run.route_id,checkpointId:point.id,assetId:point.asset_ref,
          placeRef:assignment.site_ref,
          severity:status,checkpointLabel:point.label,observedAt:input.capturedAt,
          reading:{numericValue:input.numericValue,choiceValue:input.choiceValue,unitCode:point.unit_code}},
      });
      await recordMutation(client,{schema:SCHEMA,topic:TOPIC},context,{
        action:exceptionId ? 'EXCEPTION_RAISED' : 'READING_ACCEPTED',aggregateType:'reading',
        aggregateId:readingId,aggregateVersion:1,
        payload:{runId:run.id,assignmentId:assignment.id,routeId:run.route_id,
          routeRevision:run.route_revision,checkpointId:point.id,assetRef:point.asset_ref,
          meterRef:point.meter_ref,owningUnitId:assignment.owning_unit_id,
          placeRef:assignment.site_ref,numericValue:input.numericValue,choiceValue:input.choiceValue,
          unitCode:point.unit_code,status,source:input.source,proofMethod:input.proofMethod,
          evidenceId:input.evidenceId,exceptionId,capturedAt:input.capturedAt},
      });
      const result = { type:'READING', accepted:true, replayed:false, clientOperationId:input.clientOperationId,
        readingId,status,exceptionId,runVersion:Number(updated.version) };
      await this.saveReceipt(client,tenantId,input.clientOperationId,subject,hash,result);
      return result;
    });
  }

  /** Records an ad-hoc defect on any checkpoint of the run's route; the route path and run version do not change. */
  async defect(context: ModuleCommandContext, input: ReportRoundDefectV1) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const hash = digest(input);
      const replay = await this.receipt(client,tenantId,input.clientOperationId,hash,subject);
      if (replay) return { ...replay, replayed:true };
      const run = await this.run(client,tenantId,input.runId,true);
      const assignment = await this.assignment(client,tenantId,run.assignment_id,false);
      await this.assertOperator(context.principal,run,assignment,scope);
      if (run.state !== 'IN_PROGRESS') throw new ConflictException('Run is no longer in progress.');
      if (run.route_revision !== input.routeRevision)
        throw new ConflictException('The route changed; reconcile before resending.');
      assertOfflineWindow(input.observedAt,'Observation time');
      const point = (await client.query<PointRow>(
        `SELECT * FROM ${SCHEMA}.checkpoints WHERE tenant_id=$1 AND route_id=$2 AND id=$3`,
        [tenantId,run.route_id,input.checkpointId],
      )).rows[0];
      if (!point) throw new NotFoundException('Checkpoint not found in this route.');
      if (input.evidenceId) await assertRoundEvidenceAvailable(client,tenantId,input.evidenceId,
        subject,assignment.id,point.id);
      const exceptionId = randomUUID();
      const cmmsRequestKey = input.requestWorkOrder ? randomUUID() : null;
      const state = input.requestWorkOrder ? 'ACTION_PENDING' : 'OPEN';
      await client.query(
        `INSERT INTO ${SCHEMA}.exceptions
          (id,tenant_id,origin,severity,state,cmms_request_key,run_id,checkpoint_id,description,evidence_id,
           client_operation_id,reported_by,observed_at)
         VALUES ($1,$2,'DEFECT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [exceptionId,tenantId,input.severity,state,cmmsRequestKey,run.id,point.id,input.description,
         input.evidenceId,input.clientOperationId,subject,input.observedAt],
      );
      if (cmmsRequestKey) await recordMutation(client,{schema:SCHEMA,topic:'operator-rounds.cmms.v1'},context,{
        action:'ROUND_CORRECTIVE_ACTION_REQUESTED',aggregateType:'exception',
        aggregateId:exceptionId,aggregateVersion:1,
        payload:{requestKey:cmmsRequestKey,exceptionId,origin:'DEFECT',readingId:null,runId:run.id,
          routeId:run.route_id,checkpointId:point.id,assetId:point.asset_ref,placeRef:assignment.site_ref,
          severity:input.severity,checkpointLabel:point.label,observedAt:input.observedAt,
          reading:null,defectDescription:input.description},
      });
      await recordMutation(client,{schema:SCHEMA,topic:TOPIC},context,{
        action:'DEFECT_REPORTED',aggregateType:'exception',aggregateId:exceptionId,aggregateVersion:1,
        payload:{runId:run.id,assignmentId:assignment.id,routeId:run.route_id,checkpointId:point.id,
          assetRef:point.asset_ref,owningUnitId:assignment.owning_unit_id,placeRef:assignment.site_ref,
          severity:input.severity,requestWorkOrder:input.requestWorkOrder,evidenceId:input.evidenceId,
          observedAt:input.observedAt},
      });
      // The receipt lookup adds its own `state` (ACCEPTED); the exception's state travels as exceptionState.
      const result = { type:'DEFECT', accepted:true, replayed:false, clientOperationId:input.clientOperationId,
        exceptionId,exceptionState:state,runVersion:Number(run.version) };
      await this.saveReceipt(client,tenantId,input.clientOperationId,subject,hash,result);
      return result;
    });
  }

  /** Passes the expected checkpoint without a reading, pending a different authorized person's decision. */
  async skip(context: ModuleCommandContext, input: RequestRoundSkipV1) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const hash = digest(input);
      const replay = await this.receipt(client,tenantId,input.clientOperationId,hash,subject);
      if (replay) return { ...replay, replayed:true };
      const run = await this.run(client,tenantId,input.runId,true);
      const assignment = await this.assignment(client,tenantId,run.assignment_id,false);
      await this.assertOperator(context.principal,run,assignment,scope);
      if (run.state !== 'IN_PROGRESS') throw new ConflictException('Run is no longer in progress.');
      if (run.route_revision !== input.routeRevision || Number(run.version) !== input.expectedRunVersion)
        throw new ConflictException('The route or run version changed; reconcile before resending.');
      assertOfflineWindow(input.capturedAt,'Skip time');
      const points = (await client.query<PointRow>(
        `SELECT * FROM ${SCHEMA}.checkpoints WHERE tenant_id=$1 AND route_id=$2 ORDER BY position`,
        [tenantId,run.route_id],
      )).rows;
      const point = points.find((entry) => entry.id === input.checkpointId);
      if (!point) throw new NotFoundException('Checkpoint not found in this route.');
      const [previous] = await routeSteps(client,tenantId,run.id,true);
      if (expectedPosition(points,previous) !== Number(point.position)) throw new ConflictException('Checkpoint is out of route order.');
      const skipId = randomUUID();
      await client.query(
        `INSERT INTO ${SCHEMA}.checkpoint_skips
          (id,tenant_id,run_id,checkpoint_id,client_operation_id,captured_at,reason_code,note,requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [skipId,tenantId,run.id,point.id,input.clientOperationId,input.capturedAt,input.reasonCode,input.note,subject],
      );
      const updated = (await client.query<RunRow>(
        `UPDATE ${SCHEMA}.round_runs SET version=version+1 WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [tenantId,run.id],
      )).rows[0]!;
      await recordMutation(client,{schema:SCHEMA,topic:TOPIC},context,{
        action:'SKIP_REQUESTED',aggregateType:'skip',aggregateId:skipId,aggregateVersion:1,
        payload:{runId:run.id,assignmentId:assignment.id,routeId:run.route_id,checkpointId:point.id,
          assetRef:point.asset_ref,owningUnitId:assignment.owning_unit_id,placeRef:assignment.site_ref,
          reasonCode:input.reasonCode,capturedAt:input.capturedAt},
      });
      const result = { type:'SKIP', accepted:true, replayed:false, clientOperationId:input.clientOperationId,
        skipId,skipState:'REQUESTED',runVersion:Number(updated.version) };
      await this.saveReceipt(client,tenantId,input.clientOperationId,subject,hash,result);
      return result;
    });
  }

  async complete(context: ModuleCommandContext, input: CompleteRoundRunV1) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const hash = digest(input);
      const replay = await this.receipt(client,tenantId,input.clientOperationId,hash,subject);
      if (replay) return { ...replay, replayed:true };
      const run = await this.run(client,tenantId,input.runId,true);
      const assignment = await this.assignment(client,tenantId,run.assignment_id,false);
      await this.assertOperator(context.principal,run,assignment,scope);
      if (run.state !== 'IN_PROGRESS' || Number(run.version) !== input.expectedRunVersion)
        throw new ConflictException('Run is closed or its version changed.');
      const points = (await client.query<PointRow>(
        `SELECT position,branch_rule FROM ${SCHEMA}.checkpoints WHERE tenant_id=$1 AND route_id=$2 ORDER BY position`,
        [tenantId,run.route_id],
      )).rows;
      // A skip awaiting its supervisor decision still completes the path: the operator may have no signal, and the
      // decision is reported on the board, not by holding the run open.
      const steps = await routeSteps(client,tenantId,run.id);
      if (steps.length === 0) throw new ConflictException('Run has no accepted readings.');
      let next: number | null = Number(points[0]?.position);
      for (const step of steps) {
        if (next !== Number(step.position)) throw new ConflictException('Run has an incomplete route path.');
        next = nextPosition(points,Number(step.position),step.choice_value ?? step.numeric_value ?? '',step.status);
      }
      if (next !== null) throw new ConflictException('Route still has required checkpoints.');
      const skipCount = steps.filter((step) => step.status === 'SKIPPED').length;
      const updated = (await client.query<RunRow>(
        `UPDATE ${SCHEMA}.round_runs SET state='COMPLETE',version=version+1,completed_at=now()
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,[tenantId,run.id],
      )).rows[0]!;
      await client.query(
        `UPDATE ${SCHEMA}.assignments SET state='COMPLETED',version=version+1,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,[tenantId,assignment.id],
      );
      await recordMutation(client,{schema:SCHEMA,topic:TOPIC},context,{
        action:'RUN_COMPLETED',aggregateType:'run',aggregateId:run.id,
        aggregateVersion:Number(updated.version),payload:{assignmentId:assignment.id,routeId:run.route_id,
          routeRevision:run.route_revision,readingCount:steps.length - skipCount,skipCount},
      });
      const result = { type:'COMPLETE',accepted:true,replayed:false,
        clientOperationId:input.clientOperationId,run:runView(updated) };
      await this.saveReceipt(client,tenantId,input.clientOperationId,subject,hash,result);
      return result;
    });
  }

  private async assertOperator(principal: ModulePrincipal, run: RunRow, assignment: AssignmentRow,
    scope: Awaited<ReturnType<typeof scopeEvaluator>>): Promise<void> {
    if (run.actor_subject !== principal.subject || assignment.operator_subject !== principal.subject ||
        !(await scope.allows('operator-rounds.runs.execute',assignment,true)))
      throw new ForbiddenException('Run is outside your assigned scope.');
  }
  private async assignment(client: PoolClient, tenantId: string, id: string, lock: boolean): Promise<AssignmentRow> {
    const row = (await client.query<AssignmentRow>(
      `SELECT * FROM ${SCHEMA}.assignments WHERE tenant_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : ''}`,
      [tenantId,id],
    )).rows[0];
    if (!row) throw new NotFoundException('Assignment not found.');
    return row;
  }
  private async run(client: PoolClient, tenantId: string, id: string, lock: boolean): Promise<RunRow> {
    const row = (await client.query<RunRow>(
      `SELECT * FROM ${SCHEMA}.round_runs WHERE tenant_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : ''}`,
      [tenantId,id],
    )).rows[0];
    if (!row) throw new NotFoundException('Run not found.');
    return row;
  }
  private async receipt(client: PoolClient, tenantId: string, operationId: string,
    hash: string, subject: string): Promise<Record<string,unknown> | null> {
    const row = (await client.query<ReceiptRow & {actor_subject:string}>(
      `SELECT request_sha256,result,actor_subject FROM ${SCHEMA}.sync_receipts
       WHERE tenant_id=$1 AND client_operation_id=$2`,[tenantId,operationId],
    )).rows[0];
    if (!row) return null;
    if (row.request_sha256 !== hash || row.actor_subject !== subject)
      throw new ConflictException('Offline operation ID was reused with different content.');
    return row.result as Record<string,unknown>;
  }
  private async saveReceipt(client: PoolClient, tenantId: string, operationId: string,
    subject: string, hash: string, result: unknown): Promise<void> {
    await client.query(
      `INSERT INTO ${SCHEMA}.sync_receipts
        (tenant_id,client_operation_id,actor_subject,request_sha256,result,state)
       VALUES ($1,$2,$3,$4,$5,'ACCEPTED')`,
      [tenantId,operationId,subject,hash,JSON.stringify(result)],
    );
  }
}
