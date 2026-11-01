import { generateKeyPairSync,randomUUID } from 'node:crypto';
import { ConflictException,ServiceUnavailableException } from '@nestjs/common';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { WorkforceEligibilityService } from './workforce-eligibility.js';

const keys=generateKeyPairSync('ed25519',{
  publicKeyEncoding:{type:'spki',format:'der'},privateKeyEncoding:{type:'pkcs8',format:'der'},
});
const resourceId=randomUUID();const subject='cmuy0autt0031l807snorsbhr';
const scope={owningUnitId:'unit-a',placeRef:randomUUID(),timeZone:'Asia/Kolkata',
  scheduledStart:'2026-10-30T08:00:00.000Z',dueAt:'2026-10-30T09:00:00.000Z'};
afterEach(() => {vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('Rounds Workforce assignment admission',() => {
  it('fails closed if the Workforce relay is unconfigured',async () => {
    vi.stubEnv('OPERATOR_ROUNDS_RELAY_WORKFORCE_URL','');
    vi.stubEnv('OPERATOR_ROUNDS_WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64','');
    await expect(new WorkforceEligibilityService().assertEligible('tenant1',resourceId,subject,scope))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('accepts only an active linked human; a refused link blocks assignment',async () => {
    vi.stubEnv('OPERATOR_ROUNDS_RELAY_WORKFORCE_URL','http://workforce-api:4700');
    vi.stubEnv('OPERATOR_ROUNDS_WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64',keys.privateKey.toString('base64'));
    const fetcher=vi.fn(async (_url:URL,init:RequestInit) => {
      expect(JSON.parse(String(init.body)).payload).toEqual({resourceId,operatorSubject:subject,...scope});
      return {ok:true,json:async () => ({eligible:false,code:'USER_MISMATCH'})};
    });
    vi.stubGlobal('fetch',fetcher);
    await expect(new WorkforceEligibilityService().assertEligible('tenant1',resourceId,subject,scope))
      .rejects.toBeInstanceOf(ConflictException);
    fetcher.mockImplementationOnce(async () => ({ok:true,json:async () => ({eligible:true,code:'ACTIVE_LINK'})}));
    await expect(new WorkforceEligibilityService().assertEligible('tenant1',resourceId,subject,scope)).resolves.toBeUndefined();
  });
});
