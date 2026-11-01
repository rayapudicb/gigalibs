import type { DecideRoundSkipV1 } from '@gigalibs/contracts';
import { type ModuleCommandContext, type ModulePrincipal, recordMutation } from '@gigalibs/module-sdk';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { scopeEvaluator } from '../organization.js';

interface SkipRow {
  id:string; run_id:string; checkpoint_id:string; reason_code:string; note:string|null; requested_by:string;
  state:'REQUESTED'|'APPROVED'|'REJECTED'; decided_by:string|null; decision_note:string|null; decided_at:Date|null;
  version:number; captured_at:Date; received_at:Date; assignment_id:string; owning_unit_id:string|null;
  site_ref:string|null; route_id:string; route_code:string; checkpoint_label:string; asset_ref:string;
}
const SELECT = `SELECT sk.id,sk.run_id,sk.checkpoint_id,sk.reason_code,sk.note,sk.requested_by,sk.state,sk.decided_by,
  sk.decision_note,sk.decided_at,sk.version,sk.captured_at,sk.received_at,a.id AS assignment_id,a.owning_unit_id,
  a.site_ref,a.route_id,rt.route_code,c.label AS checkpoint_label,c.asset_ref
  FROM ${SCHEMA}.checkpoint_skips sk
  JOIN ${SCHEMA}.round_runs rr ON rr.tenant_id=sk.tenant_id AND rr.id=sk.run_id
  JOIN ${SCHEMA}.assignments a ON a.tenant_id=rr.tenant_id AND a.id=rr.assignment_id
  JOIN ${SCHEMA}.route_templates rt ON rt.tenant_id=a.tenant_id AND rt.id=a.route_id
  JOIN ${SCHEMA}.checkpoints c ON c.tenant_id=sk.tenant_id AND c.id=sk.checkpoint_id`;
const view = (row: SkipRow) => ({
  id:row.id, runId:row.run_id, assignmentId:row.assignment_id, routeId:row.route_id, routeCode:row.route_code,
  checkpointId:row.checkpoint_id, checkpointLabel:row.checkpoint_label, assetRef:row.asset_ref,
  owningUnitId:row.owning_unit_id, placeRef:row.site_ref, reasonCode:row.reason_code, note:row.note,
  requestedBy:row.requested_by, capturedAt:row.captured_at.toISOString(), receivedAt:row.received_at.toISOString(),
  state:row.state, decidedBy:row.decided_by, decisionNote:row.decision_note,
  decidedAt:row.decided_at?.toISOString() ?? null, version:Number(row.version),
});

/** Skip requests arrive through sync; a different person with operator-rounds.skips.approve decides each one. */
@Injectable()
export class SkipsService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal: ModulePrincipal, state: SkipRow['state'] | undefined, limit: number) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const scope = await scopeEvaluator(client, principal);
      const rows = await client.query<SkipRow>(
        `${SELECT} WHERE sk.tenant_id=$1 AND ($2::text IS NULL OR sk.state=$2) ORDER BY sk.received_at DESC,sk.id LIMIT $3`,
        [principal.tenantId, state ?? null, Math.min(limit * 5, 500)],
      );
      return { items: (await scope.filter('operator-rounds.skips.approve', rows.rows, limit)).map(view) };
    });
  }

  async decide(context: ModuleCommandContext, id: string, input: DecideRoundSkipV1) {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const scope = await scopeEvaluator(client, context.principal);
      const row = (await client.query<SkipRow>(`${SELECT} WHERE sk.tenant_id=$1 AND sk.id=$2 FOR UPDATE OF sk`, [tenantId, id])).rows[0];
      if (!row || !(await scope.allows('operator-rounds.skips.approve', row, true))) throw new NotFoundException('Skip not found.');
      if (Number(row.version) !== input.version) throw new ConflictException('Skip version changed.');
      if (row.state !== 'REQUESTED') throw new ConflictException('This skip was already decided.');
      if (row.requested_by === subject) throw new ForbiddenException('A different authorized person must decide this skip.');
      const updated = (await client.query<{ version: number; decided_at: Date }>(
        `UPDATE ${SCHEMA}.checkpoint_skips SET state=$3,decided_by=$4,decision_note=$5,decided_at=now(),version=version+1
          WHERE tenant_id=$1 AND id=$2 RETURNING version,decided_at`,
        [tenantId, id, input.decision, subject, input.note],
      )).rows[0]!;
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: input.decision === 'APPROVED' ? 'SKIP_APPROVED' : 'SKIP_REJECTED', aggregateType: 'skip', aggregateId: id,
        aggregateVersion: Number(updated.version),
        payload: { runId: row.run_id, assignmentId: row.assignment_id, routeId: row.route_id, checkpointId: row.checkpoint_id,
          reasonCode: row.reason_code, note: input.note },
      });
      return { ...view(row), state: input.decision, decidedBy: subject, decisionNote: input.note,
        decidedAt: updated.decided_at.toISOString(), version: Number(updated.version) };
    });
  }
}
