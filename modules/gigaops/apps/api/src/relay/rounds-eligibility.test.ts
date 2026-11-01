import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { WorkforceRoundsEligibilityService } from './rounds-eligibility.js';

const resourceId=randomUUID();const operatorSubject='cmuy0autt0031l807snorsbhr';
const request={messageId:randomUUID(),tenantId:'tenant0001',eventType:'ROUND_WORKFORCE_ELIGIBILITY_REQUESTED_V1',
  aggregateType:'resource',aggregateId:resourceId,aggregateVersion:1,correlationId:'wi-oi-133',
  causationId:null,schemaVersion:1,occurredAt:new Date().toISOString(),
  payload:{resourceId,operatorSubject,owningUnitId:'unit-a',placeRef:randomUUID(),timeZone:'UTC',
    scheduledStart:'2026-10-30T08:00:00.000Z',dueAt:'2026-10-30T09:00:00.000Z'}};

describe('Workforce Rounds assignment eligibility',() => {
  it('returns tenant-bound shift windows only for the linked operator and local date',async () => {
    const start=new Date('2026-10-30T08:00:00.000Z');
    const end=new Date('2026-10-30T16:00:00.000Z');
    const query=vi.fn(async (_sql:string,values:unknown[]) => {
      expect(values).toEqual(['tenant0001',resourceId,'2026-10-30',operatorSubject,'UTC']);
      return {rows:[{scheduled_start:start,shift_end:end}]};
    });
    const db={withTenantTransaction:vi.fn(async (_tenant:string,
      run:(client:{query:typeof query})=>Promise<unknown>)=>run({query}))};
    const service=new WorkforceRoundsEligibilityService(db as never);
    const envelope={...request,eventType:'ROUND_WORKFORCE_WINDOWS_REQUESTED_V1',
      payload:{resourceId,operatorSubject,localDate:'2026-10-30',timeZone:'UTC'}};
    expect(await service.windows(envelope)).toEqual({windows:[{
      scheduledStart:start.toISOString(),shiftEnd:end.toISOString()}]});
    expect(db.withTenantTransaction).toHaveBeenCalledWith('tenant0001',expect.any(Function));
    await expect(service.windows({...envelope,aggregateId:randomUUID()}))
      .rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    [null,'RESOURCE_UNKNOWN',false],
    [{status:'INACTIVE',resource_type:'HUMAN',platform_user_id:operatorSubject},'RESOURCE_INACTIVE',false],
    [{status:'ACTIVE',resource_type:'TEAM',platform_user_id:operatorSubject},'RESOURCE_INACTIVE',false],
    [{status:'ACTIVE',resource_type:'HUMAN',platform_user_id:randomUUID()},'USER_MISMATCH',false],
  ] as const)('returns %s as %s',async (row,code,eligible) => {
    const dbClient={query:vi.fn(async (_sql:string,values:unknown[]) => {
      expect(values).toEqual(['tenant0001',resourceId]);
      return {rows:row?[row]:[]};
    })};
    const db={withTenantTransaction:vi.fn(async (_tenant:string,callback:(client:typeof dbClient)=>Promise<unknown>) => callback(dbClient))};
    const service=new WorkforceRoundsEligibilityService(db as never);
    expect(await service.check(request)).toEqual({code,eligible});
    expect(db.withTenantTransaction).toHaveBeenCalledWith('tenant0001',expect.any(Function));
  });

  it('rejects an aggregate mismatch',async () => {
    const service=new WorkforceRoundsEligibilityService({} as never);
    await expect(service.check({...request,aggregateId:randomUUID()})).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['position','POSITION_MISMATCH'],['slot','SHIFT_UNAVAILABLE'],
    ['absence','APPROVED_ABSENCE'],['closure','SITE_CLOSED'],
  ] as const)('refuses a %s mismatch with %s',async (stage,code) => {
    const query=vi.fn(async (sql:string,values:unknown[]) => {
      if (sql.includes('FROM gigalibs_workforce.workforce_resources')) return {rows:[{
        status:'ACTIVE',resource_type:'HUMAN',platform_user_id:operatorSubject}]};
      expect(values[0]).toBe('tenant0001');
      expect(values[1]).toBe(resourceId);
      if (sql.includes('FROM gigalibs_workforce.engagements')) {
        expect(values.slice(4)).toEqual([request.payload.owningUnitId,request.payload.placeRef,'UTC']);
        return {rows:stage==='position'?[]:[{site_ref:request.payload.placeRef}]};
      }
      if (sql.includes('FROM gigalibs_workforce.availability_patterns'))
        return {rows:stage==='slot'?[]:[{ok:1}]};
      if (sql.includes('FROM gigalibs_workforce.absences'))
        return {rows:stage==='absence'?[{ok:1}]:[]};
      if (sql.includes('FROM gigalibs_workforce.calendar_closures'))
        return {rows:stage==='closure'?[{ok:1}]:[]};
      throw new Error('Unexpected query');
    });
    const db={withTenantTransaction:vi.fn(async (_tenant:string,run:(client:{query:typeof query})=>Promise<unknown>)=>run({query}))};
    expect(await new WorkforceRoundsEligibilityService(db as never).check(request)).toEqual({code,eligible:false});
  });

  it('accepts a linked worker with a matching position, slot and no blockers',async () => {
    const query=vi.fn(async (sql:string) => ({rows:sql.includes('workforce_resources')
      ? [{status:'ACTIVE',resource_type:'HUMAN',platform_user_id:operatorSubject}]
      :sql.includes('FROM gigalibs_workforce.engagements') || sql.includes('FROM gigalibs_workforce.availability_patterns')
        ? [{ok:1}]:[]}));
    const db={withTenantTransaction:vi.fn(async (_tenant:string,run:(client:{query:typeof query})=>Promise<unknown>)=>run({query}))};
    expect(await new WorkforceRoundsEligibilityService(db as never).check(request))
      .toEqual({code:'ACTIVE_LINK',eligible:true});
  });
});
