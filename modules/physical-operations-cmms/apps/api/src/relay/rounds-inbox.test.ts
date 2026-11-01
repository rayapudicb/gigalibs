import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { RoundsInboxService } from './rounds-inbox.js';

const tenantId = 'tenant0001';
const exceptionId = randomUUID();
const requestKey = randomUUID();
const assetId = randomUUID();
const workOrderId = randomUUID();
const placeRef = randomUUID();
const envelope = {messageId:randomUUID(),tenantId,eventType:'ROUND_CORRECTIVE_ACTION_REQUESTED_V1',
  aggregateType:'exception',aggregateId:exceptionId,aggregateVersion:1,correlationId:'wi-oi-133',
  causationId:null,schemaVersion:1,occurredAt:new Date().toISOString(),payload:{
    requestKey,exceptionId,readingId:randomUUID(),runId:randomUUID(),routeId:randomUUID(),
    checkpointId:randomUUID(),assetId,placeRef,severity:'RED',checkpointLabel:'Pump pressure',
    observedAt:new Date().toISOString(),reading:{numericValue:'8',choiceValue:null,unitCode:'bar'},
    aggregateId:exceptionId,aggregateVersion:1,
  }};

describe('CMMS Rounds corrective-action inbox',() => {
  it('reads a tenant-scoped meter and keeps its source and timestamp separate from the operator reading',async () => {
    const checkpointId=randomUUID();const meterId=randomUUID();
    const dbClient={query:vi.fn(async (sql:string,values:unknown[]) => {
      expect(sql).toContain('gigalibs_cmms.meter_readings');
      expect(values).toEqual([tenantId,assetId,meterId,placeRef]);
      return {rows:[{meter_id:meterId,unit:'bar',value:'4.500000',
        read_at:new Date('2026-10-30T08:00:00Z'),source:'IOT_TELEMETRY'}]};
    })};
    const db={withTenantTransaction:async (_tenant:string,callback:(client:typeof dbClient)=>Promise<unknown>) => callback(dbClient)};
    const inbox=new RoundsInboxService(db as never,{} as never);
    const request={...envelope,eventType:'ROUND_METER_CONTEXT_REQUESTED_V1',
      aggregateType:'assignment',aggregateId:randomUUID(),payload:{
        assignmentId:'',checkpoints:[{checkpointId,assetId,meterId,placeRef}],
      }};
    request.payload.assignmentId=request.aggregateId;
    expect(await inbox.meterContext(request)).toEqual({items:[{checkpointId,meterId,
      status:'AVAILABLE',value:'4.500000',unitCode:'bar',
      readAt:'2026-10-30T08:00:00.000Z',source:'IOT_TELEMETRY'}]});
  });

  it('creates one provenance-marked work order and returns the same id on exact replay',async () => {
    let first = true;
    const body = JSON.stringify(envelope);
    const dbClient = {query:vi.fn(async (sql:string) => {
      if (sql.includes('INSERT INTO gigalibs_cmms.inbox_receipts')) {
        if (first) { first=false; return {rows:[{id:randomUUID()}],rowCount:1}; }
        return {rows:[],rowCount:0};
      }
      if (sql.includes('FROM gigalibs_cmms.assets')) return {rows:[{site_ref:placeRef}],rowCount:1};
      if (sql.includes('FROM gigalibs_cmms.work_orders')) return {rows:[],rowCount:0};
      if (sql.includes('SELECT payload_sha256,status')) return {rows:[{
        payload_sha256:createHash('sha256').update(body).digest('hex'),status:'PROCESSED',
      }],rowCount:1};
      return {rows:[],rowCount:1};
    })};
    const workOrders = {createWithClient:vi.fn(async (_client:unknown,_context:unknown,create:unknown,origin:unknown) => {
      expect(create).toMatchObject({requestKey,assetId,priority:'HIGH'});
      expect(origin).toMatchObject({triggerSource:'ROUND_EXCEPTION'});
      return workOrderId;
    })};
    const database = {withTenantTransaction:vi.fn(async (_tenant:string,callback:(client:typeof dbClient)=>Promise<unknown>) => callback(dbClient))};
    const inbox = new RoundsInboxService(database as never,workOrders as never);
    expect(await inbox.receive(envelope,body)).toMatchObject({status:'PROCESSED',workOrderId});
    // The same message id must return the existing work order, with no second create.
    dbClient.query.mockImplementation(async (sql:string) => {
      if (sql.includes('INSERT INTO gigalibs_cmms.inbox_receipts')) return {rows:[],rowCount:0};
      if (sql.includes('SELECT payload_sha256,status')) return {rows:[{
        payload_sha256:createHash('sha256').update(body).digest('hex'),status:'PROCESSED',
      }],rowCount:1};
      if (sql.includes('FROM gigalibs_cmms.work_orders')) return {rows:[{
        id:workOrderId,asset_id:assetId,description:JSON.stringify({source:'operator-rounds',
          exceptionId,readingId:envelope.payload.readingId,runId:envelope.payload.runId,
          routeId:envelope.payload.routeId,checkpointId:envelope.payload.checkpointId,
          observedAt:envelope.payload.observedAt,reading:envelope.payload.reading}),
      }],rowCount:1};
      return {rows:[],rowCount:1};
    });
    expect(await inbox.receive(envelope,body)).toMatchObject({status:'DUPLICATE',workOrderId});
    expect(workOrders.createWithClient).toHaveBeenCalledTimes(1);
  });

  it('creates a defect work order from the operator description, with no reading',async () => {
    const defectId = randomUUID();
    const defect = {...envelope,messageId:randomUUID(),aggregateId:defectId,payload:{...envelope.payload,
      exceptionId:defectId,requestKey:randomUUID(),origin:'DEFECT',readingId:null,reading:null,
      defectDescription:'Oil leak under the gearbox',aggregateId:defectId}};
    const dbClient = {query:vi.fn(async (sql:string) => {
      if (sql.includes('INSERT INTO gigalibs_cmms.inbox_receipts')) return {rows:[{id:randomUUID()}],rowCount:1};
      if (sql.includes('FROM gigalibs_cmms.assets')) return {rows:[{site_ref:placeRef}],rowCount:1};
      if (sql.includes('FROM gigalibs_cmms.work_orders')) return {rows:[],rowCount:0};
      return {rows:[],rowCount:1};
    })};
    const workOrders = {createWithClient:vi.fn(async (_client:unknown,_context:unknown,create:{title:string;description:string}) => {
      expect(create.title).toBe('Round defect: Pump pressure');
      expect(JSON.parse(create.description)).toEqual({source:'operator-rounds',origin:'DEFECT',exceptionId:defectId,
        runId:envelope.payload.runId,routeId:envelope.payload.routeId,checkpointId:envelope.payload.checkpointId,
        observedAt:envelope.payload.observedAt,defect:'Oil leak under the gearbox'});
      return workOrderId;
    })};
    const database = {withTenantTransaction:async (_tenant:string,callback:(client:typeof dbClient)=>Promise<unknown>) => callback(dbClient)};
    const inbox = new RoundsInboxService(database as never,workOrders as never);
    expect(await inbox.receive(defect,JSON.stringify(defect))).toMatchObject({status:'PROCESSED',workOrderId});
    expect(workOrders.createWithClient).toHaveBeenCalledTimes(1);
  });

  it('refuses an asset outside the route place and malformed replay payloads',async () => {
    const dbClient = {query:vi.fn(async (sql:string) => sql.includes('FROM gigalibs_cmms.assets')
      ? {rows:[{site_ref:randomUUID()}]}:{rows:[{id:randomUUID()}]})};
    const database = {withTenantTransaction:async (_tenant:string,callback:(client:typeof dbClient)=>Promise<unknown>) => callback(dbClient)};
    const workOrders = {createWithClient:vi.fn()};
    const inbox = new RoundsInboxService(database as never,workOrders as never);
    await expect(inbox.receive(envelope,JSON.stringify(envelope))).rejects.toBeInstanceOf(BadRequestException);
    expect(workOrders.createWithClient).not.toHaveBeenCalled();
    await expect(inbox.receive({...envelope,payload:{...envelope.payload,assetId:'other'}},JSON.stringify(envelope))).rejects.toBeInstanceOf(BadRequestException);
  });
});
