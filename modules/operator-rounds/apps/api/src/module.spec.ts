import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import { type PlatformContextV1, signPlatformContextToken } from '@gigalibs/auth-core';
import { CaptureRoundReadingV1, CreateRoundRouteV1, ReplaceRoundCheckpointsV1, RoundSyncBatchV1 } from '@gigalibs/contracts';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthorizationGuard } from './authorization.js';
import { AUDIENCE, MODULE_KEY, SCHEMA_CONTRACT_VERSION, runtimeConfigProvider } from './config.js';
import type { DatabaseService } from './database.service.js';
import { RoutesController } from './rounds/routes.controller.js';
import { RunsController } from './rounds/runs.controller.js';

const pem = { privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } } as const;
const signer = generateKeyPairSync('ed25519', pem);
const publicKeyBase64 = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const environment = {
  OPERATOR_ROUNDS_PLATFORM_CONTEXT_AUDIENCE: AUDIENCE,
  OPERATOR_ROUNDS_API_HOST: '0.0.0.0', OPERATOR_ROUNDS_API_PORT: '4790',
  OPERATOR_ROUNDS_CORS_ORIGINS: 'http://127.0.0.1:5180',
  OPERATOR_ROUNDS_DATABASE_URL: 'postgresql://runtime:secret@postgres:5432/gigalibs',
  OPERATOR_ROUNDS_DATABASE_POOL_SIZE: '10', OPERATOR_ROUNDS_EXPECTED_MIGRATION_VERSION: String(SCHEMA_CONTRACT_VERSION),
  OPERATOR_ROUNDS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: publicKeyBase64,
};
function claims(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return { iss:'gigalibs-control-plane',aud:AUDIENCE,sub:'user00000000000000000001',
    tenant_id:'tenant000000000000000001',session_id:'session-1',auth_version:1,
    roles:['TENANT_ADMIN'],granted_scopes:['operator-rounds.routes.read'],persona_type:'TENANT_ADMIN',
    org_scope:{mode:'FLAT_TENANT'},entitlement:{module_key:MODULE_KEY,status:'ENABLED',version:'v1'},
    iat:now,exp:now+60,jti:'jti-1',...overrides };
}
function authorize(controller: typeof RoutesController | typeof RunsController, handler: string,
  overrides: Partial<PlatformContextV1> = {}) {
  const request = { headers:{authorization:`Bearer ${signPlatformContextToken(claims(overrides),signer.privateKey)}`} };
  const context = { switchToHttp:() => ({getRequest:() => request}),
    getHandler:() => (controller.prototype as unknown as Record<string,unknown>)[handler],
    getClass:() => controller } as unknown as ExecutionContext;
  const database = {isContextRevoked:async () => false} as unknown as DatabaseService;
  const config = {platformContextPublicKey:signer.publicKey,platformContextAudience:AUDIENCE};
  return new AuthorizationGuard(config as never,database).canActivate(context);
}

describe('Rounds runtime configuration',() => {
  const load = (overrides:Record<string,string> = {}) => {
    const saved = {...process.env}; Object.assign(process.env,environment,overrides);
    try {return (runtimeConfigProvider as {useFactory:() => unknown}).useFactory();}
    finally {process.env = saved;}
  };
  it('requires the migration contract version and module audience',() => {
    expect(load()).toMatchObject({platformContextAudience:AUDIENCE,expectedMigrationVersion:SCHEMA_CONTRACT_VERSION});
    expect(() => load({OPERATOR_ROUNDS_PLATFORM_CONTEXT_AUDIENCE:'wrong'})).toThrow(AUDIENCE);
  });
});

describe('Rounds signed context authorization',() => {
  it('allows a route reader to list and refuses management',async () => {
    await expect(authorize(RoutesController,'list')).resolves.toBe(true);
    await expect(authorize(RoutesController,'create')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows only the matching permission for offline sync',async () => {
    await expect(authorize(RunsController,'sync')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(authorize(RunsController,'sync',{granted_scopes:['operator-rounds.runs.execute']})).resolves.toBe(true);
  });
  it('refuses another module entitlement or audience',async () => {
    await expect(authorize(RoutesController,'list',{entitlement:{module_key:'asset-maintenance',status:'ENABLED',version:'v1'}})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(authorize(RoutesController,'list',{aud:'gigalibs-cmms-api'})).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('Rounds wire contracts',() => {
  it('requires a versioned schedule and rejects caller tenant input',() => {
    const valid = {requestKey:'10000000-0000-4000-8000-000000000001',code:'PUMP_01',title:'Pump route',
      description:null,owningUnitId:null,placeRef:null,
      schedule:{cadence:'DAILY',timeZone:'Asia/Kolkata',localTime:'08:00',graceMinutes:30,windowMinutes:60}};
    expect(CreateRoundRouteV1.safeParse(valid).success).toBe(true);
    expect(CreateRoundRouteV1.safeParse({...valid,tenantId:'tenant-other'}).success).toBe(false);
    expect(CreateRoundRouteV1.safeParse({...valid,schedule:{...valid.schedule,timeZone:''}}).success).toBe(false);
  });
  it('rejects empty checkpoint replacement and unknown offline commands',() => {
    expect(ReplaceRoundCheckpointsV1.safeParse({routeVersion:1,checkpoints:[]}).success).toBe(false);
    expect(RoundSyncBatchV1.safeParse({commands:[{type:'DELETE',payload:{}}]}).success).toBe(false);
  });
  it('keeps handheld BLE claims out of the first manual-reading contract',() => {
    const capture = { clientOperationId:'10000000-0000-4000-8000-000000000001',
      runId:'10000000-0000-4000-8000-000000000002',checkpointId:'10000000-0000-4000-8000-000000000003',
      routeRevision:1,expectedRunVersion:1,capturedAt:'2026-10-30T08:00:00Z',source:'MANUAL',
      proofMethod:'NFC',scannedTag:'NFC-01',numericValue:'72.5',choiceValue:null,evidenceId:null };
    expect(CaptureRoundReadingV1.safeParse(capture).success).toBe(true);
    expect(CaptureRoundReadingV1.safeParse({...capture,source:'BLE'}).success).toBe(false);
    expect(CaptureRoundReadingV1.safeParse({...capture,sensorRef:'probe-1'}).success).toBe(false);
  });
});
