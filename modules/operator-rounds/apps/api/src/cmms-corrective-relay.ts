import { signRelayToken } from '@gigalibs/auth-core';
import { RoundCorrectiveActionV1 } from '@gigalibs/contracts';
import { loadRelayConfig, recordMutation, type RelayConfig } from '@gigalibs/module-sdk';
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { z } from 'zod';
import { SCHEMA, TOPIC } from './config.js';
import { DatabaseService } from './database.service.js';

const AUDIENCE = 'gigalibs-cmms-rounds-inbox';
const RESPONSE = z.object({ status:z.enum(['PROCESSED','DUPLICATE']),workOrderId:z.uuid(),requestKey:z.uuid() }).strict();

interface OutboxRow extends Record<string, unknown> {
  id:string;tenant_id:string;event_type:string;aggregate_type:string;aggregate_id:string;
  aggregate_version:number;correlation_id:string;causation_id:string|null;
  schema_version:number;payload:Record<string,unknown>;created_at:Date;attempt_count:number;
}
type Delivery = { accepted:true;workOrderId:string } | { accepted:false;code:string;permanent:boolean };

export function loadRoundsCmmsRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig({...environment,
    OPERATOR_ROUNDS_CMMS_INBOX_PATH:environment['OPERATOR_ROUNDS_CMMS_INBOX_PATH'] || '/internal/v1/rounds-inbox',
  },{
    inboxPublicKey:'OPERATOR_ROUNDS_UNUSED_INBOX_KEY_BASE64',
    targetUrl:'OPERATOR_ROUNDS_RELAY_CMMS_URL',
    signingKey:'OPERATOR_ROUNDS_CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval:'OPERATOR_ROUNDS_RELAY_INTERVAL_MS',peerService:'cmms-api',
    inboxPath:'OPERATOR_ROUNDS_CMMS_INBOX_PATH',
  });
}

/** Outbox lease and CMMS response settlement share the exception's tenant boundary. */
@Injectable()
export class CmmsCorrectiveRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CmmsCorrectiveRelay.name);
  private readonly config = loadRoundsCmmsRelayConfig();
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;

  constructor(private readonly database: DatabaseService) {}

  onApplicationBootstrap(): void {
    if (!this.config.outbound) {
      this.logger.warn('CMMS corrective-action relay is not configured; exceptions remain pending.');
      return;
    }
    this.timer = setInterval(() => void this.tick(),this.config.intervalMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((resolve) => setTimeout(resolve,10));
  }

  async tick(): Promise<number> {
    if (!this.config.outbound || this.running || this.stopping) return 0;
    this.running = true;
    let accepted = 0;
    try {
      const rows = await this.database.relayCall<OutboxRow>('relay_lease_cmms_events',[20,60]);
      for (const row of rows) {
        const delivery = await this.deliver(row);
        await this.settle(row,delivery);
        if (delivery.accepted) accepted++;
      }
    } catch (error) {
      this.logger.error('CMMS corrective-action relay pass failed.',error instanceof Error ? error.stack : undefined);
    } finally { this.running = false; }
    return accepted;
  }

  private async deliver(row: OutboxRow): Promise<Delivery> {
    const outbound = this.config.outbound!;
    const { aggregateId: _aggregateId, aggregateVersion: _aggregateVersion, ...payload } = row.payload;
    const parsed = RoundCorrectiveActionV1.safeParse(payload);
    if (!parsed.success || row.aggregate_id !== parsed.data.exceptionId)
      return {accepted:false,code:'INVALID_OUTBOX_PAYLOAD',permanent:true};
    const envelope = {messageId:row.id,tenantId:row.tenant_id,eventType:row.event_type,
      aggregateType:row.aggregate_type,aggregateId:row.aggregate_id,
      aggregateVersion:Number(row.aggregate_version),correlationId:row.correlation_id,
      causationId:row.causation_id,schemaVersion:Number(row.schema_version),payload:parsed.data,
      occurredAt:new Date(row.created_at).toISOString()};
    const body = JSON.stringify(envelope);
    const token = signRelayToken({ audience:AUDIENCE,source:'operator-rounds',
      tenantId:row.tenant_id,messageId:row.id,body },outbound.privateKey,60);
    try {
      const response = await fetch(new URL(outbound.inboxPath,outbound.targetOrigin),{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',
          'X-Correlation-Id':row.correlation_id},body,redirect:'error',signal:AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        const outcome = RESPONSE.safeParse(await response.json());
        if (!outcome.success || outcome.data.requestKey !== parsed.data.requestKey)
          return {accepted:false,code:'INVALID_CMMS_RECEIPT',permanent:false};
        return {accepted:true,workOrderId:outcome.data.workOrderId};
      }
      return {accepted:false,code:`HTTP_${response.status}`,
        permanent:response.status>=400 && response.status<500 && ![408,429].includes(response.status)};
    } catch (error) {
      return {accepted:false,code:error instanceof Error && error.name==='TimeoutError'?'TIMEOUT':'UNREACHABLE',permanent:false};
    }
  }

  private async settle(row: OutboxRow, delivery: Delivery): Promise<void> {
    await this.database.withTenantTransaction(row.tenant_id,async (client) => {
      const permanent = !delivery.accepted && (delivery.permanent || Number(row.attempt_count)>=10);
      const status = delivery.accepted ? 'PUBLISHED' : permanent ? 'FAILED' : 'PENDING';
      const retrySeconds = Math.min(5*2**Math.max(Number(row.attempt_count)-1,0),900);
      const updated = await client.query(
        `UPDATE ${SCHEMA}.outbox_events SET status=$3,
          published_at=CASE WHEN $3='PUBLISHED' THEN now() ELSE published_at END,
          available_at=CASE WHEN $3='PENDING' THEN now()+make_interval(secs=>$4::integer) ELSE available_at END,
          last_error_code=$5
         WHERE tenant_id=$1 AND id=$2 AND status='LEASED' AND attempt_count=$6`,
        [row.tenant_id,row.id,status,retrySeconds,delivery.accepted?null:delivery.code,row.attempt_count],
      );
      if (updated.rowCount!==1) return;
      if (delivery.accepted || permanent) {
        const exception = (await client.query<{version:number}>(
          `UPDATE ${SCHEMA}.exceptions SET state=$3,cmms_work_order_ref=$4,refusal_code=$5,
             version=version+1,updated_at=now()
           WHERE tenant_id=$1 AND id=$2 AND state='ACTION_PENDING' RETURNING version`,
          [row.tenant_id,row.aggregate_id,delivery.accepted?'ACTION_ACCEPTED':'ACTION_REJECTED',
            delivery.accepted?delivery.workOrderId:null,delivery.accepted?null:delivery.code],
        )).rows[0];
        if (exception) await recordMutation(client,{schema:SCHEMA,topic:TOPIC},{
          principal:{tenantId:row.tenant_id,subject:'relay:operator-rounds'} as never,
          correlationId:row.correlation_id,
        },{ action:delivery.accepted?'CORRECTIVE_ACTION_ACCEPTED':'CORRECTIVE_ACTION_REJECTED',
          aggregateType:'exception',aggregateId:row.aggregate_id,
          aggregateVersion:Number(exception.version),payload:delivery.accepted
            ? {workOrderId:delivery.workOrderId,requestKey:row.payload['requestKey']}
            : {code:delivery.code,requestKey:row.payload['requestKey']} });
      }
    });
  }
}
