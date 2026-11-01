import type { ReviewRoundExceptionV1, RetryRoundCorrectiveActionV1 } from '@gigalibs/contracts';
import { type ModuleCommandContext, type ModulePrincipal, recordMutation } from '@gigalibs/module-sdk';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { scopeEvaluator } from '../organization.js';

interface ExceptionRow {
  id:string; reading_id:string; severity:string; state:string; version:number;
  cmms_work_order_ref:string|null; refusal_code:string|null; review_note:string|null;
  reviewed_by:string|null; created_at:Date; updated_at:Date;
  owning_unit_id:string|null; site_ref:string|null; route_id:string; route_code:string;
  checkpoint_id:string; checkpoint_label:string; asset_ref:string; actor_subject:string;
  numeric_value:string|null; choice_value:string|null; unit_code:string|null;
}
const SELECT = `SELECT e.id,e.reading_id,e.severity,e.state,e.version,e.cmms_work_order_ref,
  e.refusal_code,e.review_note,e.reviewed_by,e.created_at,e.updated_at,
  a.owning_unit_id,a.site_ref,a.route_id,rt.route_code,c.id AS checkpoint_id,
  c.label AS checkpoint_label,c.asset_ref,rr.actor_subject,rd.numeric_value,
  rd.choice_value,c.unit_code
  FROM ${SCHEMA}.exceptions e JOIN ${SCHEMA}.readings rd
    ON rd.tenant_id=e.tenant_id AND rd.id=e.reading_id
  JOIN ${SCHEMA}.round_runs rr ON rr.tenant_id=rd.tenant_id AND rr.id=rd.run_id
  JOIN ${SCHEMA}.assignments a ON a.tenant_id=rr.tenant_id AND a.id=rr.assignment_id
  JOIN ${SCHEMA}.route_templates rt ON rt.tenant_id=a.tenant_id AND rt.id=a.route_id
  JOIN ${SCHEMA}.checkpoints c ON c.tenant_id=rd.tenant_id AND c.id=rd.checkpoint_id`;
const view = (row: ExceptionRow) => ({ id:row.id,readingId:row.reading_id,
  severity:row.severity,state:row.state,version:Number(row.version),
  cmmsWorkOrderRef:row.cmms_work_order_ref,refusalCode:row.refusal_code,
  reviewNote:row.review_note,reviewedBy:row.reviewed_by,
  owningUnitId:row.owning_unit_id,placeRef:row.site_ref,routeId:row.route_id,
  routeCode:row.route_code,checkpointId:row.checkpoint_id,checkpointLabel:row.checkpoint_label,
  assetRef:row.asset_ref,actorSubject:row.actor_subject,numericValue:row.numeric_value,
  choiceValue:row.choice_value,unitCode:row.unit_code,
  createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString() });

@Injectable()
export class ExceptionsService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal: ModulePrincipal, limit: number) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const scope = await scopeEvaluator(client,principal);
      const rows = await client.query<ExceptionRow>(
        `${SELECT} WHERE e.tenant_id=$1 ORDER BY e.created_at DESC,e.id LIMIT $2`,
        [principal.tenantId,Math.min(limit*5,500)],
      );
      return { items:(await scope.filter('operator-rounds.exceptions.read',rows.rows,limit)).map(view) };
    });
  }

  async review(context: ModuleCommandContext, id: string, input: ReviewRoundExceptionV1) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client,context.principal);
      const row = (await client.query<ExceptionRow>(
        `${SELECT} WHERE e.tenant_id=$1 AND e.id=$2 FOR UPDATE OF e`,[tenantId,id],
      )).rows[0];
      if (!row || !(await scope.allows('operator-rounds.exceptions.review',row,true)))
        throw new NotFoundException('Exception not found.');
      if (Number(row.version) !== input.version) throw new ConflictException('Exception version changed.');
      if (input.resolution === 'RESOLVED' && row.state === 'ACTION_PENDING')
        throw new ConflictException('Corrective action is pending; reconcile it before resolution.');
      const next = input.resolution === 'RESOLVED' ? 'RESOLVED' : row.state;
      const updated = (await client.query<ExceptionRow>(
        `UPDATE ${SCHEMA}.exceptions SET state=$3,review_note=$4,reviewed_by=$5,
          reviewed_at=now(),updated_at=now(),version=version+1
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,[tenantId,id,next,input.note,subject],
      )).rows[0]!;
      await recordMutation(client,{schema:SCHEMA,topic:TOPIC},context,{
        action:'EXCEPTION_REVIEWED',aggregateType:'exception',aggregateId:id,
        aggregateVersion:Number(updated.version),payload:{resolution:input.resolution,note:input.note,state:next},
      });
      return { ...view(row),state:next,version:Number(updated.version),reviewNote:input.note,reviewedBy:subject };
    });
  }

  /** Requeues the original signed command; CMMS request-key and message-id dedupe make late receipts safe. */
  async retry(context: ModuleCommandContext,id:string,input:RetryRoundCorrectiveActionV1) {
    const {tenantId,subject} = context.principal;
    return this.database.withTenantTransaction(tenantId,async (client) => {
      const scope = await scopeEvaluator(client,context.principal);
      const row = (await client.query<ExceptionRow>(
        `${SELECT} WHERE e.tenant_id=$1 AND e.id=$2 FOR UPDATE OF e`,[tenantId,id],
      )).rows[0];
      if (!row || !(await scope.allows('operator-rounds.exceptions.review',row,true)))
        throw new NotFoundException('Exception not found.');
      if (Number(row.version)!==input.version) throw new ConflictException('Exception version changed.');
      if (row.state!=='ACTION_REJECTED') throw new ConflictException('Only a refused corrective action can be retried.');
      const queued = await client.query(
        `UPDATE ${SCHEMA}.outbox_events SET status='PENDING',attempt_count=0,
           available_at=now(),last_error_code=NULL
         WHERE tenant_id=$1 AND aggregate_type='exception' AND aggregate_id=$2
           AND topic='operator-rounds.cmms.v1'
           AND event_type='ROUND_CORRECTIVE_ACTION_REQUESTED_V1' AND status='FAILED'`,
        [tenantId,id],
      );
      if (queued.rowCount!==1) throw new ConflictException('The corrective action cannot be requeued; reconcile its delivery state.');
      const updated = (await client.query<ExceptionRow>(
        `UPDATE ${SCHEMA}.exceptions SET state='ACTION_PENDING',refusal_code=NULL,
           review_note=$3,reviewed_by=$4,reviewed_at=now(),version=version+1,updated_at=now()
         WHERE tenant_id=$1 AND id=$2 RETURNING *`,[tenantId,id,input.note,subject],
      )).rows[0]!;
      await recordMutation(client,{schema:SCHEMA,topic:TOPIC},context,{
        action:'CORRECTIVE_ACTION_REQUEUED',aggregateType:'exception',aggregateId:id,
        aggregateVersion:Number(updated.version),payload:{note:input.note},
      });
      return {...view(row),state:'ACTION_PENDING',version:Number(updated.version),
        refusalCode:null,reviewNote:input.note,reviewedBy:subject};
    });
  }
}
