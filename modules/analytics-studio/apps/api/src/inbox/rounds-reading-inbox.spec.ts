import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { ConnectorHubInboxService } from './connector-hub-inbox.js';

const readingId=randomUUID();
const payload={aggregateId:readingId,aggregateVersion:1,runId:randomUUID(),assignmentId:randomUUID(),
  routeId:randomUUID(),routeRevision:1,checkpointId:randomUUID(),assetRef:randomUUID(),meterRef:null,
  owningUnitId:'PLANT_A',placeRef:randomUUID(),
  numericValue:'4.500000',choiceValue:null,unitCode:'bar',status:'AMBER',source:'MANUAL',
  proofMethod:'BARCODE',exceptionId:randomUUID(),capturedAt:'2026-10-30T08:00:00.000Z',
  evidenceId:randomUUID(),actorNote:'must not reach Analytics'};
const fact={messageId:randomUUID(),tenantId:'tenant0001',eventType:'EXCEPTION_RAISED_V1',
  aggregateType:'reading',aggregateId:readingId,aggregateVersion:1,correlationId:'wi-oi-133',
  causationId:null,schemaVersion:1,occurredAt:'2026-10-30T08:01:00.000Z',payload};

describe('Analytics Rounds reading inbox',() => {
  it('stores a bounded, attributable reading once without evidence content',async () => {
    let seen=false;
    const client={query:vi.fn(async (sql:string,values:unknown[]) => {
      if (sql.includes('INSERT INTO gigalibs_analytics.inbox_receipts')) {
        if (seen) return {rowCount:0,rows:[]};
        seen=true;return {rowCount:1,rows:[]};
      }
      if (sql.includes('source_connections')) return {rows:[{id:randomUUID()}],rowCount:1};
      if (sql.includes('source_sync_runs')) return {rows:[{id:randomUUID()}],rowCount:1};
      if (sql.includes('raw_record_versions')) {
        const stored=JSON.parse(String(values[4]));
        expect(stored).toMatchObject({readingId,status:'AMBER',source:'MANUAL',numericValue:'4.500000',
          owningUnitId:'PLANT_A',placeRef:payload.placeRef,scopeKnown:true});
        expect(stored).not.toHaveProperty('evidenceId');
        expect(stored).not.toHaveProperty('actorNote');
      }
      return {rows:[],rowCount:1};
    })};
    const db={withTenantTransaction:vi.fn(async (_tenant:string,run:(client:typeof client)=>Promise<unknown>) => run(client))};
    const inbox=new ConnectorHubInboxService(db as never);
    expect(await inbox.receiveFrom('operator-rounds',fact)).toMatchObject({status:'stored'});
    expect(await inbox.receiveFrom('operator-rounds',fact)).toEqual({status:'duplicate'});
    expect(client.query.mock.calls.filter(([sql]) => String(sql).includes('raw_record_versions'))).toHaveLength(1);
  });

  it('refuses an IoT claim or a mismatched exception event',async () => {
    const inbox=new ConnectorHubInboxService({} as never);
    await expect(inbox.receiveFrom('operator-rounds',{...fact,payload:{...payload,source:'IOT_TELEMETRY'}}))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(inbox.receiveFrom('operator-rounds',{...fact,eventType:'READING_ACCEPTED_V1'}))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps older facts without owner and place provenance out of scoped trends',async () => {
    const client={query:vi.fn(async (sql:string,values:unknown[]) => {
      if (sql.includes('source_connections') || sql.includes('source_sync_runs'))
        return {rows:[{id:randomUUID()}],rowCount:1};
      if (sql.includes('raw_record_versions')) {
        const stored=JSON.parse(String(values[4]));
        expect(stored).toMatchObject({scopeKnown:false,owningUnitId:null,placeRef:null});
      }
      return {rows:[],rowCount:1};
    })};
    const db={withTenantTransaction:vi.fn(async (_tenant:string,run:(client:typeof client)=>Promise<unknown>) => run(client))};
    const legacyPayload:Record<string,unknown>={...payload};
    delete legacyPayload.owningUnitId;delete legacyPayload.placeRef;
    await new ConnectorHubInboxService(db as never).receiveFrom('operator-rounds',{
      ...fact,payload:legacyPayload,
    });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('raw_record_versions'))).toBe(true);
  });
});
