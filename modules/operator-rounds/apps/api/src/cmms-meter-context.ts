import { randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import { RoundMeterContextResponseV1, type RoundCheckpointDraftV1, type RoundMeterContextRequestV1 } from '@gigalibs/contracts';
import { Injectable } from '@nestjs/common';
import { loadRoundsCmmsRelayConfig } from './cmms-corrective-relay.js';

const AUDIENCE = 'gigalibs-cmms-rounds-inbox';
export type MeterContextResult = {status:'AVAILABLE';items:RoundMeterContextResponseV1['items']} |
  {status:'UNAVAILABLE';items:[]};

/** Reads only the meter IDs on an already authorized assignment; no CMMS schema access. */
@Injectable()
export class CmmsMeterContextService {
  async forAssignment(tenantId:string,assignmentId:string,routeRevision:number,
    checkpoints:readonly RoundCheckpointDraftV1[],placeRef:string|null):Promise<MeterContextResult> {
    const points = checkpoints.filter((point) => point.meterRef !== null);
    if (points.length===0) return {status:'AVAILABLE',items:[]};
    const outbound = loadRoundsCmmsRelayConfig().outbound;
    if (!outbound) return {status:'UNAVAILABLE',items:[]};
    try {
      const chunks:RoundMeterContextRequestV1['checkpoints'][] = [];
      for (let i=0;i<points.length;i+=100) chunks.push(points.slice(i,i+100).map((point) => ({
        checkpointId:point.id!,assetId:point.assetRef,meterId:point.meterRef!,placeRef,
      })));
      const responses = await Promise.all(chunks.map(async (chunk) => {
        const messageId=randomUUID();
        const body=JSON.stringify({messageId,tenantId,eventType:'ROUND_METER_CONTEXT_REQUESTED_V1',
          aggregateType:'assignment',aggregateId:assignmentId,aggregateVersion:routeRevision,
          correlationId:messageId,causationId:null,schemaVersion:1,
          payload:{assignmentId,checkpoints:chunk},occurredAt:new Date().toISOString()});
        const token=signRelayToken({audience:AUDIENCE,source:'operator-rounds',tenantId,messageId,body},
          outbound.privateKey,60);
        const response=await fetch(new URL('/internal/v1/rounds-meter-context',outbound.targetOrigin),{
          method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
          body,redirect:'error',signal:AbortSignal.timeout(5_000),
        });
        if (!response.ok) throw new Error('CMMS meter context unavailable.');
        const parsed=RoundMeterContextResponseV1.safeParse(await response.json());
        if (!parsed.success || parsed.data.items.length!==chunk.length) throw new Error('Invalid CMMS meter context.');
        const expected=new Map(chunk.map((point) => [point.checkpointId,point.meterId]));
        for (const item of parsed.data.items) {
          if (expected.get(item.checkpointId)!==item.meterId) throw new Error('Mismatched CMMS meter context.');
          expected.delete(item.checkpointId);
        }
        if (expected.size!==0) throw new Error('Incomplete CMMS meter context.');
        return parsed.data.items;
      }));
      return {status:'AVAILABLE',items:responses.flat()};
    } catch { return {status:'UNAVAILABLE',items:[]}; }
  }
}
