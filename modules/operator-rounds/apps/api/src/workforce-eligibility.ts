import { randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import { RoundWorkforceEligibilityResponseV1, RoundWorkforceShiftWindowsResponseV1 } from '@gigalibs/contracts';
import { loadRelayConfig } from '@gigalibs/module-sdk';
import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';

const AUDIENCE='gigalibs-workforce-rounds-inbox';

export function loadRoundsWorkforceConfig(environment:NodeJS.ProcessEnv=process.env) {
  return loadRelayConfig({...environment,
    OPERATOR_ROUNDS_WORKFORCE_INBOX_PATH:environment['OPERATOR_ROUNDS_WORKFORCE_INBOX_PATH'] ||
      '/internal/v1/rounds-eligibility',
  },{
    inboxPublicKey:'OPERATOR_ROUNDS_UNUSED_WORKFORCE_KEY_BASE64',
    targetUrl:'OPERATOR_ROUNDS_RELAY_WORKFORCE_URL',
    signingKey:'OPERATOR_ROUNDS_WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval:'OPERATOR_ROUNDS_WORKFORCE_RELAY_INTERVAL_MS',peerService:'workforce-api',
    inboxPath:'OPERATOR_ROUNDS_WORKFORCE_INBOX_PATH',
  });
}

/** Assignment admission requires a current Workforce source record, never an administrator-typed user link alone. */
@Injectable()
export class WorkforceEligibilityService {
  async shiftWindows(tenantId:string,resourceId:string,operatorSubject:string,
    localDate:string,timeZone:string) {
    const outbound=loadRoundsWorkforceConfig().outbound;
    if (!outbound) throw new ServiceUnavailableException('Workforce shift windows are unavailable.');
    const messageId=randomUUID();
    const body=JSON.stringify({messageId,tenantId,eventType:'ROUND_WORKFORCE_WINDOWS_REQUESTED_V1',
      aggregateType:'resource',aggregateId:resourceId,aggregateVersion:1,correlationId:messageId,
      causationId:null,schemaVersion:1,payload:{resourceId,operatorSubject,localDate,timeZone},
      occurredAt:new Date().toISOString()});
    const token=signRelayToken({audience:AUDIENCE,source:'operator-rounds',tenantId,messageId,body},
      outbound.privateKey,60);
    try {
      const response=await fetch(new URL(`${outbound.inboxPath.replace(/\/$/,'')}/windows`,outbound.targetOrigin),{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body,redirect:'error',signal:AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error('WORKFORCE_WINDOWS_HTTP_REFUSED');
      return RoundWorkforceShiftWindowsResponseV1.parse(await response.json());
    } catch {
      throw new ServiceUnavailableException('Workforce shift windows are unavailable.');
    }
  }

  async assertEligible(tenantId:string,resourceId:string,operatorSubject:string,
    scope:{owningUnitId:string|null;placeRef:string|null;timeZone:string;
      scheduledStart:string;dueAt:string}):Promise<void> {
    const outbound=loadRoundsWorkforceConfig().outbound;
    if (!outbound) throw new ServiceUnavailableException('Workforce assignment verification is unavailable.');
    const messageId=randomUUID();
    const body=JSON.stringify({messageId,tenantId,eventType:'ROUND_WORKFORCE_ELIGIBILITY_REQUESTED_V1',
      aggregateType:'resource',aggregateId:resourceId,aggregateVersion:1,correlationId:messageId,
      causationId:null,schemaVersion:1,payload:{resourceId,operatorSubject,...scope},
      occurredAt:new Date().toISOString()});
    const token=signRelayToken({audience:AUDIENCE,source:'operator-rounds',tenantId,messageId,body},
      outbound.privateKey,60);
    let response:Response;
    try {
      response=await fetch(new URL(outbound.inboxPath,outbound.targetOrigin),{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body,redirect:'error',signal:AbortSignal.timeout(5_000),
      });
    } catch {throw new ServiceUnavailableException('Workforce assignment verification is unavailable.');}
    if (!response.ok) throw new ServiceUnavailableException('Workforce assignment verification is unavailable.');
    const parsed=RoundWorkforceEligibilityResponseV1.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new ServiceUnavailableException('Workforce assignment verification returned an invalid response.');
    if (!parsed.data.eligible) throw new ConflictException({code:`ROUNDS_${parsed.data.code}`,
      message:'The selected Workforce resource is not an active human linked to the operator.'});
  }
}
