import { createPublicKey,generateKeyPairSync,randomUUID } from 'node:crypto';
import { verifyRelayToken } from '@gigalibs/auth-core';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { CmmsMeterContextService } from './cmms-meter-context.js';

const keys = generateKeyPairSync('ed25519',{
  publicKeyEncoding:{type:'spki',format:'der'},privateKeyEncoding:{type:'pkcs8',format:'der'},
});
const checkpointId=randomUUID();
const meterId=randomUUID();
const assignmentId=randomUUID();
const point={id:checkpointId,position:1,label:'Pump pressure',assetRef:randomUUID(),meterRef:meterId,
  tagCode:'TAG-1',proofMode:'BARCODE' as const,readingKind:'NUMERIC' as const,unitCode:'bar',
  nominal:null,amberLow:null,amberHigh:null,redLow:null,redHigh:null,choices:[],branchRules:[],
  instructions:null,photoOnException:false};

afterEach(() => {vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('authorized CMMS meter context',() => {
  it('keeps missing relay configuration visible as unavailable',async () => {
    vi.stubEnv('OPERATOR_ROUNDS_RELAY_CMMS_URL','');
    vi.stubEnv('OPERATOR_ROUNDS_CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64','');
    expect(await new CmmsMeterContextService().forAssignment('tenant1',assignmentId,1,[point],null))
      .toEqual({status:'UNAVAILABLE',items:[]});
  });

  it('returns a source-attributed CMMS reading only for the requested checkpoint',async () => {
    vi.stubEnv('OPERATOR_ROUNDS_RELAY_CMMS_URL','http://cmms-api:4200');
    vi.stubEnv('OPERATOR_ROUNDS_CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64',keys.privateKey.toString('base64'));
    const key=createPublicKey({key:keys.publicKey,format:'der',type:'spki'})
      .export({format:'pem',type:'spki'}).toString();
    vi.stubGlobal('fetch',vi.fn(async (_url:URL,init:RequestInit) => {
      const body=String(init.body);
      const token=String((init.headers as Record<string,string>)['Authorization']).slice(7);
      const envelope=JSON.parse(body);
      expect(verifyRelayToken(token,key,{audience:'gigalibs-cmms-rounds-inbox',
        source:'operator-rounds',body})).toMatchObject({tenant_id:'tenant1',message_id:envelope.messageId});
      expect(envelope.payload.checkpoints).toEqual([{checkpointId,assetId:point.assetRef,meterId,placeRef:null}]);
      return {ok:true,json:async () => ({items:[{checkpointId,meterId,status:'AVAILABLE',
        value:'4.500000',unitCode:'bar',readAt:'2026-10-30T08:00:00.000Z',source:'IOT_TELEMETRY'}]})};
    }));
    expect(await new CmmsMeterContextService().forAssignment('tenant1',assignmentId,1,[point],null))
      .toMatchObject({status:'AVAILABLE',items:[{checkpointId,meterId,source:'IOT_TELEMETRY'}]});
  });

  it('refuses a response for a different checkpoint',async () => {
    vi.stubEnv('OPERATOR_ROUNDS_RELAY_CMMS_URL','http://cmms-api:4200');
    vi.stubEnv('OPERATOR_ROUNDS_CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64',keys.privateKey.toString('base64'));
    vi.stubGlobal('fetch',vi.fn(async () => ({ok:true,json:async () => ({items:[{
      checkpointId:randomUUID(),meterId,status:'AVAILABLE',value:'4',unitCode:'bar',
      readAt:'2026-10-30T08:00:00.000Z',source:'IOT_TELEMETRY',
    }]})})));
    expect(await new CmmsMeterContextService().forAssignment('tenant1',assignmentId,1,[point],null))
      .toEqual({status:'UNAVAILABLE',items:[]});
  });
});
