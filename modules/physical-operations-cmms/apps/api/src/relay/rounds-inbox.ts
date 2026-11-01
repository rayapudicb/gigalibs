import { createHash } from 'node:crypto';
import { RelayEnvelopeV1Schema, RoundCorrectiveActionV1, RoundMeterContextRequestV1, RoundMeterContextResponseV1, CreateCmmsWorkOrderV1Schema } from '@gigalibs/contracts';
import { RelayInboxGuardBase, receiveOnce, type RelayConfig, type RelayRequest } from '@gigalibs/module-sdk';
import { BadRequestException, Body, ConflictException, Controller, HttpCode, HttpStatus, Inject, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';

export const CMMS_ROUNDS_INBOX_CONFIG = Symbol('CMMS_ROUNDS_INBOX_CONFIG');
export const CMMS_ROUNDS_INBOX_AUDIENCE = 'gigalibs-cmms-rounds-inbox';

@Injectable()
export class RoundsInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(CMMS_ROUNDS_INBOX_CONFIG) config: RelayConfig) {
    super(config, { audience: CMMS_ROUNDS_INBOX_AUDIENCE, source: 'operator-rounds', label: 'CMMS Rounds' });
  }
}

/** Accepts one signed, body-bound corrective command and creates the CMMS-owned work order atomically. */
@Injectable()
export class RoundsInboxService {
  constructor(private readonly database: DatabaseService, private readonly workOrders: WorkOrdersService) {}

  async meterContext(rawEnvelope: unknown) {
    const envelope = RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!envelope.success || envelope.data.eventType !== 'ROUND_METER_CONTEXT_REQUESTED_V1' ||
        envelope.data.aggregateType !== 'assignment' || envelope.data.schemaVersion !== 1)
      throw new BadRequestException('Unsupported Rounds meter-context request.');
    const parsed = RoundMeterContextRequestV1.safeParse(envelope.data.payload);
    if (!parsed.success || parsed.data.assignmentId !== envelope.data.aggregateId)
      throw new BadRequestException('Invalid Rounds meter-context request.');
    return this.database.withTenantTransaction(envelope.data.tenantId,async (client) => {
      const items = [];
      for (const point of parsed.data.checkpoints) {
        const result = await client.query<{meter_id:string|null;unit:string|null;value:string|null;read_at:Date|null;source:string|null}>(
          `SELECT m.id AS meter_id,m.unit,rd.value::text AS value,rd.read_at,rd.source
           FROM gigalibs_cmms.assets a
           JOIN gigalibs_cmms.meters m ON m.tenant_id=a.tenant_id AND m.asset_id=a.id AND m.id=$3
           LEFT JOIN LATERAL (
             SELECT value,read_at,source FROM gigalibs_cmms.meter_readings rd
             WHERE rd.tenant_id=m.tenant_id AND rd.meter_id=m.id
             ORDER BY rd.read_at DESC,rd.id DESC LIMIT 1
           ) rd ON true
           WHERE a.tenant_id=$1 AND a.id=$2 AND a.archived_at IS NULL
             AND ($4::uuid IS NULL OR a.site_ref=$4::uuid)`,
          [envelope.data.tenantId,point.assetId,point.meterId,point.placeRef],
        );
        const row = result.rows[0];
        items.push({checkpointId:point.checkpointId,meterId:point.meterId,
          status:!row?'NOT_FOUND':row.read_at?'AVAILABLE':'NO_READING',
          value:row?.value ?? null,unitCode:row?.unit ?? null,
          readAt:row?.read_at?.toISOString() ?? null,source:row?.source ?? null});
      }
      return RoundMeterContextResponseV1.parse({items});
    });
  }

  async receive(rawEnvelope: unknown, rawBody: string) {
    const envelope = RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!envelope.success || envelope.data.eventType !== 'ROUND_CORRECTIVE_ACTION_REQUESTED_V1' ||
        envelope.data.schemaVersion !== 1 || envelope.data.aggregateType !== 'exception' ||
        envelope.data.aggregateVersion !== 1)
      throw new BadRequestException('Unsupported Rounds corrective-action envelope.');
    const {aggregateId,aggregateVersion,...payload} = envelope.data.payload;
    if (aggregateId !== envelope.data.aggregateId || aggregateVersion !== envelope.data.aggregateVersion)
      throw new BadRequestException('Corrective-action aggregate binding is invalid.');
    const parsed = RoundCorrectiveActionV1.safeParse(payload);
    if (!parsed.success || parsed.data.exceptionId !== envelope.data.aggregateId)
      throw new BadRequestException('Invalid Rounds corrective-action payload.');
    const command = parsed.data;
    // A threshold exception keeps the exact description it always had, so a replayed request still matches its work
    // order; a defect carries the operator's words instead of a reading.
    const defect = command.origin === 'DEFECT';
    const title = `${defect ? 'Round defect' : 'Round exception'}: ${command.checkpointLabel}`;
    const description = defect
      ? JSON.stringify({ source:'operator-rounds', origin:'DEFECT', exceptionId:command.exceptionId,
        runId:command.runId, routeId:command.routeId, checkpointId:command.checkpointId,
        observedAt:command.observedAt, defect:command.defectDescription })
      : JSON.stringify({ source:'operator-rounds', exceptionId:command.exceptionId,
        readingId:command.readingId, runId:command.runId, routeId:command.routeId,
        checkpointId:command.checkpointId, observedAt:command.observedAt, reading:command.reading });
    const create = CreateCmmsWorkOrderV1Schema.parse({ requestKey:command.requestKey,
      type:'REACTIVE', priority:command.severity === 'RED' ? 'HIGH' : 'MEDIUM',
      title, description, assetId:command.assetId });
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    return this.database.withTenantTransaction(envelope.data.tenantId, async (client) => {
      const outcome = await receiveOnce(client, {
        schema:'gigalibs_cmms', consumer:'cmms.rounds-corrective-action',sourceModule:'operator-rounds',
      }, envelope.data, rawBody, async () => {
        const asset = (await client.query<{site_ref:string|null}>(
          `SELECT site_ref FROM gigalibs_cmms.assets WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL`,
          [envelope.data.tenantId,command.assetId],
        )).rows[0];
        if (!asset || (command.placeRef !== null && asset.site_ref !== command.placeRef))
          throw new BadRequestException('Corrective-action asset is absent or outside the route place.');
        const existing = (await client.query<{id:string;description:string|null;asset_id:string|null}>(
          `SELECT id,description,asset_id FROM gigalibs_cmms.work_orders
           WHERE tenant_id=$1 AND request_key=$2`,[envelope.data.tenantId,command.requestKey],
        )).rows[0];
        if (existing && (existing.description !== description || existing.asset_id !== command.assetId))
          throw new ConflictException('Corrective-action request key was reused with different content.');
        const context: CmmsCommandContext = { principal: relayPrincipal(envelope.data.tenantId),
          correlationId:envelope.data.correlationId };
        const workOrderId = existing?.id ?? await this.workOrders.createWithClient(client,context,create,{
          triggerSource:'ROUND_EXCEPTION',pmScheduleId:null,pmOccurrenceAt:null,
        });
        return { status:'PROCESSED' as const, workOrderId, requestKey:command.requestKey };
      });
      if (outcome.status !== 'DUPLICATE') return outcome;
      const receipt = (await client.query<{payload_sha256:string;status:string}>(
        `SELECT payload_sha256,status FROM gigalibs_cmms.inbox_receipts
         WHERE tenant_id=$1 AND consumer_name='cmms.rounds-corrective-action' AND message_id=$2`,
        [envelope.data.tenantId,envelope.data.messageId],
      )).rows[0];
      if (!receipt || receipt.payload_sha256 !== bodyHash || receipt.status !== 'PROCESSED')
        throw new ConflictException('Corrective-action replay does not match the accepted message.');
      const workOrder = (await client.query<{id:string;description:string|null;asset_id:string|null}>(
        `SELECT id,description,asset_id FROM gigalibs_cmms.work_orders
         WHERE tenant_id=$1 AND request_key=$2`,[envelope.data.tenantId,command.requestKey],
      )).rows[0];
      if (!workOrder || workOrder.description !== description || workOrder.asset_id !== command.assetId)
        throw new ConflictException('Corrective-action receipt cannot be reconciled to a work order.');
      return { status:'DUPLICATE' as const, workOrderId:workOrder.id, requestKey:command.requestKey };
    });
  }
}

@Controller('internal/v1/rounds-inbox')
@UseGuards(RoundsInboxGuard)
export class RoundsInboxController {
  constructor(private readonly inbox: RoundsInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'));
  }
}

@Controller('internal/v1/rounds-meter-context')
@UseGuards(RoundsInboxGuard)
export class RoundsMeterContextController {
  constructor(private readonly inbox: RoundsInboxService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  read(@Body() body: unknown) { return this.inbox.meterContext(body); }
}

function relayPrincipal(tenantId: string): CmmsPrincipal {
  return Object.freeze({ tenantId,subject:'relay:operator-rounds',sessionId:'relay',authVersion:0,
    permissions:Object.freeze(['cmms:*']),roles:Object.freeze([]),persona:'OPERATIONS_SUPERVISOR' as const,
    departmentScope:Object.freeze({mode:'ALL' as const}),placeScope:Object.freeze({mode:'ALL' as const}) });
}
