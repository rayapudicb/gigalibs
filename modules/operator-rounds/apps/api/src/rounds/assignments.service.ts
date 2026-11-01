import { createHash, randomUUID } from 'node:crypto';
import { RoundCheckpointHistoryV1, type AssignRoundV1 } from '@gigalibs/contracts';
import { type ModuleCommandContext, type ModulePrincipal, recordMutation } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { scopeEvaluator } from '../organization.js';
import { checkpointView, ROUTE_COLUMNS, type RouteRow, routeView } from './routes.service.js';
import { CmmsMeterContextService } from '../cmms-meter-context.js';
import { WorkforceEligibilityService } from '../workforce-eligibility.js';

interface AssignmentRow {
  id: string; route_id: string; route_revision: number; workforce_resource_ref: string;
  operator_subject: string; owning_unit_id: string | null; site_ref: string | null;
  scheduled_start: Date; due_at: Date; state: string; version: number; request_sha256: string;
  route_code?: string; route_title?: string; checkpoint_count?: number; reading_count?: number; exception_count?: number;
  grace_minutes?: number;
  skip_requested_count?: number; skip_approved_count?: number; skip_rejected_count?: number;
}
const COLUMNS = `id,route_id,route_revision,workforce_resource_ref,operator_subject,owning_unit_id,site_ref,
  scheduled_start,due_at,state,version,request_sha256`;
/** Board and operator-list progress: readings, exceptions (threshold and defect) and skips by decision. */
const PROGRESS = `(SELECT count(*) FROM ${SCHEMA}.checkpoints c WHERE c.tenant_id=a.tenant_id AND c.route_id=a.route_id)::int AS checkpoint_count,
          (SELECT count(*) FROM ${SCHEMA}.readings rd JOIN ${SCHEMA}.round_runs rr
             ON rr.tenant_id=rd.tenant_id AND rr.id=rd.run_id
             WHERE rr.tenant_id=a.tenant_id AND rr.assignment_id=a.id)::int AS reading_count,
          (SELECT count(*) FROM ${SCHEMA}.exceptions e LEFT JOIN ${SCHEMA}.readings rd
             ON rd.tenant_id=e.tenant_id AND rd.id=e.reading_id JOIN ${SCHEMA}.round_runs rr
             ON rr.tenant_id=e.tenant_id AND rr.id=coalesce(rd.run_id,e.run_id)
             WHERE rr.tenant_id=a.tenant_id AND rr.assignment_id=a.id)::int AS exception_count,
          sk.skip_requested_count,sk.skip_approved_count,sk.skip_rejected_count
         FROM ${SCHEMA}.assignments a JOIN ${SCHEMA}.route_templates r
           ON r.tenant_id=a.tenant_id AND r.id=a.route_id
         LEFT JOIN LATERAL (
           SELECT count(*) FILTER (WHERE s.state='REQUESTED')::int AS skip_requested_count,
                  count(*) FILTER (WHERE s.state='APPROVED')::int AS skip_approved_count,
                  count(*) FILTER (WHERE s.state='REJECTED')::int AS skip_rejected_count
             FROM ${SCHEMA}.checkpoint_skips s JOIN ${SCHEMA}.round_runs sr ON sr.tenant_id=s.tenant_id AND sr.id=s.run_id
            WHERE sr.tenant_id=a.tenant_id AND sr.assignment_id=a.id) sk ON true`;
const checksum = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function isRoundAssignmentOverdue(state:string,dueAt:Date,graceMinutes:number,now=new Date()):boolean {
  return (state==='ASSIGNED' || state==='STARTED') &&
    now.getTime()>dueAt.getTime()+graceMinutes*60_000;
}
const view = (row: AssignmentRow) => ({
  id: row.id, routeId: row.route_id, routeRevision: Number(row.route_revision),
  workforceResourceRef: row.workforce_resource_ref, operatorSubject: row.operator_subject,
  owningUnitId: row.owning_unit_id, placeRef: row.site_ref,
  scheduledStart: row.scheduled_start.toISOString(), dueAt: row.due_at.toISOString(),
  state: row.state, version: Number(row.version),
  ...(row.route_code === undefined ? {} : { routeCode: row.route_code, routeTitle: row.route_title,
    checkpointCount: Number(row.checkpoint_count), readingCount: Number(row.reading_count),
    exceptionCount: Number(row.exception_count),
    skips: { requested: Number(row.skip_requested_count ?? 0), approved: Number(row.skip_approved_count ?? 0),
      rejected: Number(row.skip_rejected_count ?? 0) } }),
  ...(row.grace_minutes === undefined ? {} : {
    overdue:isRoundAssignmentOverdue(row.state,row.due_at,Number(row.grace_minutes)),
  }),
});

@Injectable()
export class AssignmentsService {
  constructor(private readonly database: DatabaseService,private readonly meterContext:CmmsMeterContextService,
    private readonly workforce:WorkforceEligibilityService) {}

  async assign(context: ModuleCommandContext, routeId: string, input: AssignRoundV1,
    rosterVersion?: number):Promise<{assignment:ReturnType<typeof view>;replayed:boolean}> {
    const { tenantId, subject } = context.principal;
    const start = new Date(input.scheduledStart);
    const due = new Date(input.dueAt);
    if (due.getTime() <= start.getTime() || due.getTime()-start.getTime()>24*60*60*1000)
      throw new BadRequestException('Assignment window must be positive and no longer than 24 hours.');
    const hash = checksum({ routeId, ...input });
    // Check local route visibility before disclosing any Workforce eligibility result.
    const replay = await this.database.withTenantTransaction(tenantId,async (client) => {
      const scope=await scopeEvaluator(client,context.principal);
      const existing=(await client.query<AssignmentRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.assignments WHERE tenant_id=$1 AND request_key=$2`,
        [tenantId,input.requestKey],
      )).rows[0];
      if (existing) {
        if (!(await scope.allows('operator-rounds.assignments.manage',existing,true)))
          throw new NotFoundException('Assignment not found.');
        if (existing.request_sha256!==hash)
          throw new ConflictException('Idempotency key was reused with different content.');
        return {assignment:view(existing),replayed:true};
      }
      const route=(await client.query<{id:string;state:string;owning_unit_id:string|null;site_ref:string|null;
        schedule:{timeZone:string}}>(
        `SELECT id,state,owning_unit_id,site_ref,schedule FROM ${SCHEMA}.route_templates WHERE tenant_id=$1 AND id=$2`,
        [tenantId,routeId],
      )).rows[0];
      if (!route || !(await scope.allows('operator-rounds.assignments.manage',route,true)))
        throw new NotFoundException('Route not found.');
      if (route.state!=='PUBLISHED') throw new ConflictException('Only published routes can be assigned.');
      return {owningUnitId:route.owning_unit_id,placeRef:route.site_ref,timeZone:route.schedule.timeZone};
    });
    if (replay.assignment) return {assignment:replay.assignment,replayed:true};
    await this.workforce.assertEligible(tenantId,input.workforceResourceRef,input.operatorSubject,
      {...replay,scheduledStart:input.scheduledStart,dueAt:input.dueAt});
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const existing=(await client.query<AssignmentRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.assignments WHERE tenant_id=$1 AND request_key=$2`,
        [tenantId,input.requestKey],
      )).rows[0];
      if (existing) {
        if (!(await scope.allows('operator-rounds.assignments.manage',existing,true)))
          throw new NotFoundException('Assignment not found.');
        if (existing.request_sha256!==hash)
          throw new ConflictException('Idempotency key was reused with different content.');
        return {assignment:view(existing),replayed:true};
      }
      const route = (await client.query<{ id: string; revision: number; state: string; owning_unit_id: string | null; site_ref: string | null }>(
        `SELECT id,revision,state,owning_unit_id,site_ref FROM ${SCHEMA}.route_templates WHERE tenant_id=$1 AND id=$2`,
        [tenantId,routeId],
      )).rows[0];
      if (!route) throw new NotFoundException('Route not found.');
      await scope.assert('operator-rounds.assignments.manage', route);
      if (route.state !== 'PUBLISHED') throw new ConflictException('Only published routes can be assigned.');
      if (rosterVersion !== undefined) {
        const roster=(await client.query<{version:number}>(
          `SELECT version FROM ${SCHEMA}.route_rosters WHERE tenant_id=$1 AND route_id=$2 FOR SHARE`,
          [tenantId,routeId],
        )).rows[0];
        if (!roster || Number(roster.version)!==rosterVersion)
          throw new ConflictException('The route roster changed during generation.');
      }
      const inserted = await client.query<AssignmentRow>(
        `INSERT INTO ${SCHEMA}.assignments
           (id,tenant_id,request_key,request_sha256,route_id,route_revision,workforce_resource_ref,
            operator_subject,owning_unit_id,site_ref,scheduled_start,due_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (tenant_id,request_key) DO NOTHING RETURNING ${COLUMNS}`,
        [randomUUID(),tenantId,input.requestKey,hash,routeId,route.revision,input.workforceResourceRef,
         input.operatorSubject,route.owning_unit_id,route.site_ref,start,due,subject],
      );
      let row = inserted.rows[0];
      if (!row) {
        row = (await client.query<AssignmentRow>(
          `SELECT ${COLUMNS} FROM ${SCHEMA}.assignments WHERE tenant_id=$1 AND request_key=$2`,
          [tenantId,input.requestKey],
        )).rows[0];
        if (!row || row.request_sha256 !== hash) throw new ConflictException('Idempotency key was reused with different content.');
        return { assignment: view(row), replayed: true };
      }
      await recordMutation(client,{schema:SCHEMA,topic:TOPIC},context,{
        action:'ASSIGNMENT_CREATED',aggregateType:'assignment',aggregateId:row.id,aggregateVersion:row.version,
        payload:{routeId,routeRevision:route.revision,operatorSubject:input.operatorSubject,
          workforceResourceRef:input.workforceResourceRef,scheduledStart:input.scheduledStart,dueAt:input.dueAt},
      });
      return { assignment: view(row), replayed: false };
    });
  }

  async mine(principal: ModulePrincipal, limit: number) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const scope = await scopeEvaluator(client, principal);
      const rows = await client.query<AssignmentRow>(
        `SELECT a.${COLUMNS.replaceAll(',', ',a.')},r.route_code,r.title AS route_title,
          COALESCE((r.schedule->>'graceMinutes')::int,0) AS grace_minutes,
${PROGRESS}
         WHERE a.tenant_id=$1 AND a.operator_subject=$2 AND a.state IN ('ASSIGNED','STARTED')
         ORDER BY a.scheduled_start,a.id LIMIT $3`,
        [principal.tenantId,principal.subject,Math.min(limit * 5,500)],
      );
      return { items: (await scope.filter('operator-rounds.runs.execute',rows.rows,limit)).map(view) };
    });
  }

  async board(principal: ModulePrincipal, limit: number) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const scope = await scopeEvaluator(client, principal);
      const rows = await client.query<AssignmentRow>(
        `SELECT a.${COLUMNS.replaceAll(',', ',a.')},r.route_code,r.title AS route_title,
          COALESCE((r.schedule->>'graceMinutes')::int,0) AS grace_minutes,
${PROGRESS}
         WHERE a.tenant_id=$1 AND a.state IN ('ASSIGNED','STARTED','COMPLETED','MISSED')
         ORDER BY a.due_at DESC,a.id LIMIT $2`,
        [principal.tenantId,Math.min(limit * 5,500)],
      );
      return { items: (await scope.filter('operator-rounds.board.read',rows.rows,limit)).map(view) };
    });
  }

  async bundle(principal: ModulePrincipal, assignmentId: string) {
    const bundle = await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const scope = await scopeEvaluator(client, principal);
      const assignment = (await client.query<AssignmentRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.assignments WHERE tenant_id=$1 AND id=$2`,
        [principal.tenantId,assignmentId],
      )).rows[0];
      if (!assignment || assignment.operator_subject !== principal.subject ||
          !(await scope.allows('operator-rounds.runs.execute',assignment,false)))
        throw new NotFoundException('Assignment not found.');
      if (!['ASSIGNED','STARTED'].includes(assignment.state)) throw new ConflictException('Assignment is no longer active.');
      const route = (await client.query<RouteRow>(
        `SELECT ${ROUTE_COLUMNS}
         FROM ${SCHEMA}.route_templates WHERE tenant_id=$1 AND id=$2`,
        [principal.tenantId,assignment.route_id],
      )).rows[0];
      const checkpoints = await client.query(
        `SELECT id,position,label,asset_ref,meter_ref,tag_code,proof_mode,reading_kind,
                unit_code,nominal,amber_low,amber_high,red_low,red_high,choices,branch_rule,
                instructions,photo_on_exception
         FROM ${SCHEMA}.checkpoints WHERE tenant_id=$1 AND route_id=$2 ORDER BY position`,
        [principal.tenantId,assignment.route_id],
      );
      if (!route) throw new NotFoundException('Route not found.');
      return { assignment: view(assignment), route:routeView(route),
        checkpoints:checkpoints.rows.map(checkpointView), downloadedAt: new Date().toISOString() };
    });
    const meterContext = await this.meterContext.forAssignment(principal.tenantId,assignmentId,
      bundle.assignment.routeRevision,bundle.checkpoints,bundle.assignment.placeRef);
    return {...bundle,meterContext};
  }

  async history(principal:ModulePrincipal,assignmentId:string) {
    return this.database.withTenantTransaction(principal.tenantId,async (client) => {
      const scope=await scopeEvaluator(client,principal);
      const assignment=(await client.query<AssignmentRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.assignments WHERE tenant_id=$1 AND id=$2`,
        [principal.tenantId,assignmentId],
      )).rows[0];
      if (!assignment || assignment.operator_subject!==principal.subject ||
          !(await scope.allows('operator-rounds.runs.execute',assignment,false)))
        throw new NotFoundException('Assignment not found.');
      if (!['ASSIGNED','STARTED'].includes(assignment.state))
        throw new ConflictException('Assignment is no longer active.');
      type HistoryRow={checkpoint_id:string;reading_id:string|null;captured_at:Date|null;
        numeric_value:string|null;choice_value:string|null;status:'NORMAL'|'AMBER'|'RED'|null};
      const rows=await client.query<HistoryRow>(
        `SELECT c.id AS checkpoint_id,h.id AS reading_id,h.captured_at,h.numeric_value,
                h.choice_value,h.status
         FROM ${SCHEMA}.checkpoints c
         LEFT JOIN LATERAL (
           SELECT rd.id,rd.captured_at,rd.numeric_value,rd.choice_value,rd.status
           FROM ${SCHEMA}.readings rd JOIN ${SCHEMA}.round_runs rr
             ON rr.tenant_id=rd.tenant_id AND rr.id=rd.run_id
           WHERE rd.tenant_id=c.tenant_id AND rd.checkpoint_id=c.id
             AND rr.assignment_id<>$3 AND rd.captured_at<=now()
           ORDER BY rd.captured_at DESC,rd.id DESC LIMIT 5
         ) h ON true
         WHERE c.tenant_id=$1 AND c.route_id=$2
         ORDER BY c.position,h.captured_at DESC NULLS LAST,h.id DESC NULLS LAST`,
        [principal.tenantId,assignment.route_id,assignmentId],
      );
      const items:Array<{checkpointId:string;readings:Array<{readingId:string;capturedAt:string;
        numericValue:string|null;choiceValue:string|null;status:'NORMAL'|'AMBER'|'RED';source:'MANUAL'}>}>=[];
      for (const row of rows.rows) {
        let item=items[items.length-1];
        if (!item || item.checkpointId!==row.checkpoint_id) {
          item={checkpointId:row.checkpoint_id,readings:[]};items.push(item);
        }
        if (row.reading_id && row.captured_at && row.status) item.readings.push({
          readingId:row.reading_id,capturedAt:row.captured_at.toISOString(),
          numericValue:row.numeric_value,choiceValue:row.choice_value,
          status:row.status,source:'MANUAL',
        });
      }
      return RoundCheckpointHistoryV1.parse({contractVersion:'round-checkpoint-history.v1',
        assignmentId,routeRevision:Number(assignment.route_revision),items});
    });
  }
}
