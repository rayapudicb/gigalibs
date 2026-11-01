import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { verifyRelayToken } from '@gigalibs/auth-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CmmsCorrectiveRelay, loadRoundsCmmsRelayConfig } from './cmms-corrective-relay.js';

const keys = generateKeyPairSync('ed25519', {
  publicKeyEncoding:{type:'spki',format:'der'},privateKeyEncoding:{type:'pkcs8',format:'der'},
});
const exceptionId = randomUUID();
const requestKey = randomUUID();
const workOrderId = randomUUID();
const payload = {requestKey,exceptionId,readingId:randomUUID(),runId:randomUUID(),
  routeId:randomUUID(),checkpointId:randomUUID(),assetId:randomUUID(),placeRef:null,
  severity:'RED',checkpointLabel:'Pump pressure',observedAt:new Date().toISOString(),
  reading:{numericValue:'8',choiceValue:null,unitCode:'bar'},
  aggregateId:exceptionId,aggregateVersion:1};
const row = {id:randomUUID(),tenant_id:'tenant0001',event_type:'ROUND_CORRECTIVE_ACTION_REQUESTED_V1',
  aggregate_type:'exception',aggregate_id:exceptionId,aggregate_version:1,correlation_id:'wi-oi-133',
  causation_id:null,schema_version:1,payload,created_at:new Date(),attempt_count:1};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Rounds corrective-action relay',() => {
  it('loads only an allowlisted CMMS origin when signing credentials are paired',() => {
    expect(loadRoundsCmmsRelayConfig({}).outbound).toBeNull();
    expect(() => loadRoundsCmmsRelayConfig({OPERATOR_ROUNDS_RELAY_CMMS_URL:'https://example.com',
      OPERATOR_ROUNDS_CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64:keys.privateKey.toString('base64')})).toThrow();
  });

  it('sends a body-bound token and records the CMMS work-order receipt',async () => {
    vi.stubEnv('OPERATOR_ROUNDS_RELAY_CMMS_URL','http://cmms-api:4200');
    vi.stubEnv('OPERATOR_ROUNDS_CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64',keys.privateKey.toString('base64'));
    const queries: string[] = [];
    const dbClient = {query:vi.fn(async (sql:string) => {
      queries.push(sql);
      return sql.includes('UPDATE gigalibs_operator_rounds.exceptions')
        ? {rows:[{version:2}],rowCount:1}:{rows:[],rowCount:1};
    })};
    const database = {relayCall:vi.fn(async () => [row]),withTenantTransaction:vi.fn(async (_tenant:string, callback:(client:typeof dbClient)=>Promise<unknown>) => callback(dbClient))};
    vi.stubGlobal('fetch',vi.fn(async (_url:URL,init:RequestInit) => {
      const body = String(init.body);
      const token = String((init.headers as Record<string,string>)['Authorization']).slice(7);
      const key = await import('node:crypto').then(({createPublicKey}) => createPublicKey({key:keys.publicKey,format:'der',type:'spki'}).export({format:'pem',type:'spki'}).toString());
      expect(verifyRelayToken(token,key,{audience:'gigalibs-cmms-rounds-inbox',source:'operator-rounds',body})).toMatchObject({tenant_id:row.tenant_id,message_id:row.id});
      expect(JSON.parse(body).payload).not.toHaveProperty('aggregateVersion');
      return {ok:true,json:async () => ({status:'PROCESSED',workOrderId,requestKey})};
    }));
    const relay = new CmmsCorrectiveRelay(database as never);
    expect(await relay.tick()).toBe(1);
    expect(queries.some((sql) => sql.includes("status=$3") && sql.includes('outbox_events'))).toBe(true);
    expect(queries.some((sql) => sql.includes('UPDATE gigalibs_operator_rounds.exceptions'))).toBe(true);
    expect(database.withTenantTransaction).toHaveBeenCalledWith(row.tenant_id,expect.any(Function));
    await relay.onApplicationShutdown();
  });
});
