import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { RosterService } from './roster.service.js';

const routeId=randomUUID();
const route={id:routeId,state:'PUBLISHED',owning_unit_id:null,site_ref:null,
  schedule:{cadence:'DAILY',timeZone:'UTC',localTime:'08:00',windowMinutes:60,graceMinutes:30}};
const entries=[
  {workforceResourceRef:randomUUID(),operatorSubject:'operator-a'},
  {workforceResourceRef:randomUUID(),operatorSubject:'operator-b'},
];
const context={principal:{tenantId:'tenant-a',subject:'admin-a',
  permissions:['operator-rounds.assignments.manage'],organization:{mode:'TENANT'},
  placeScope:{mode:'ALL'},departmentScope:{mode:'ALL'}},correlationId:randomUUID()} as never;
const db=(query:(sql:string,values:unknown[])=>Promise<{rows:unknown[]}>) => ({
  withTenantTransaction:vi.fn(async (tenant:string,run:(client:{query:typeof query})=>Promise<unknown>) => {
    expect(tenant).toBe('tenant-a');return run({query});
  }),
});

describe('Rounds published-route roster',() => {
  it('requires the exact roster version when replacing configuration',async () => {
    const query=vi.fn(async (sql:string) => {
      if (sql.includes('FROM gigalibs_operator_rounds.route_templates')) return {rows:[route]};
      if (sql.includes('INSERT INTO gigalibs_operator_rounds.route_rosters')) return {rows:[]};
      return {rows:[]};
    });
    const service=new RosterService(db(query) as never,{} as never,{} as never);
    await expect(service.replace(context,routeId,{expectedVersion:0,entries}))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('generates bounded items with stable retry keys and visible per-person failure',async () => {
    const query=vi.fn(async (sql:string) => {
      if (sql.includes('FROM gigalibs_operator_rounds.route_templates')) return {rows:[route]};
      if (sql.includes('FROM gigalibs_operator_rounds.route_rosters'))
        return {rows:[{version:3,entries,updated_by:'admin-a',updated_at:new Date()}]};
      throw new Error('Unexpected query');
    });
    const assignments={assign:vi.fn(async (_context:unknown,_routeId:string,input:{operatorSubject:string}) => {
      if (input.operatorSubject==='operator-b') throw new ConflictException('Shift unavailable.');
      return {assignment:{id:randomUUID()},replayed:false};
    })};
    const service=new RosterService(db(query) as never,assignments as never,{} as never);
    const localDate=new Date().toISOString().slice(0,10);
    const request={localDate,rosterVersion:3};
    const first=await service.generate(context,routeId,request);
    const second=await service.generate(context,routeId,request);
    expect(first.items).toMatchObject([
      {operatorSubject:'operator-a',status:'ASSIGNED',replayed:false},
      {operatorSubject:'operator-b',status:'FAILED',code:'CONFLICT'},
    ]);
    expect(second.items.map((item) => item.status)).toEqual(['ASSIGNED','FAILED']);
    expect(assignments.assign).toHaveBeenCalledTimes(4);
    expect(assignments.assign.mock.calls[0]?.[2]).toMatchObject({
      requestKey:(assignments.assign.mock.calls[2]?.[2] as {requestKey:string}).requestKey,
      workforceResourceRef:entries[0]!.workforceResourceRef,
    });
    expect(assignments.assign.mock.calls[0]?.[3]).toBe(3);
  });

  it('refuses generation from an outdated roster snapshot',async () => {
    const query=vi.fn(async (sql:string) => sql.includes('route_templates')
      ?{rows:[route]}:{rows:[{version:4,entries,updated_by:'admin-a',updated_at:new Date()}]});
    const assignments={assign:vi.fn()};
    const service=new RosterService(db(query) as never,assignments as never,{} as never);
    await expect(service.generate(context,routeId,{localDate:new Date().toISOString().slice(0,10),rosterVersion:3}))
      .rejects.toBeInstanceOf(ConflictException);
    expect(assignments.assign).not.toHaveBeenCalled();
  });

  it('creates one stable assignment per authoritative Workforce shift window',async () => {
    const query=vi.fn(async (sql:string) => sql.includes('route_templates')
      ? {rows:[{...route,schedule:{...route.schedule,cadence:'PER_SHIFT',localTime:undefined}}]}
      : {rows:[{version:3,entries:[entries[0]],updated_by:'admin-a',updated_at:new Date()}]});
    const assignments={assign:vi.fn(async () => ({assignment:{id:randomUUID()},replayed:false}))};
    const workforce={shiftWindows:vi.fn(async () => {
      const day=new Date().toISOString().slice(0,10);
      return {windows:[
        {scheduledStart:`${day}T06:00:00.000Z`,shiftEnd:`${day}T07:00:00.000Z`},
        {scheduledStart:`${day}T14:00:00.000Z`,shiftEnd:`${day}T15:00:00.000Z`},
      ]};
    })};
    const service=new RosterService(db(query) as never,assignments as never,workforce as never);
    const request={localDate:new Date().toISOString().slice(0,10),rosterVersion:3};
    const first=await service.generate(context,routeId,request);
    const keys=assignments.assign.mock.calls.map((call) =>
      (call[2] as {requestKey:string}).requestKey);
    expect(first.items).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    await service.generate(context,routeId,request);
    expect(assignments.assign.mock.calls.slice(2).map((call) =>
      (call[2] as {requestKey:string}).requestKey)).toEqual(keys);
  });

  it('resolves scheduled generation in the route time zone and retries transient failures',async () => {
    const query=vi.fn(async (sql:string) => sql.includes('route_templates')
      ? {rows:[{...route,schedule:{...route.schedule,timeZone:'America/Los_Angeles'}}]}
      : {rows:[{version:3}]});
    const service=new RosterService(db(query) as never,{} as never,{} as never);
    const generate=vi.spyOn(service,'generate').mockResolvedValue({
      localDate:'2026-10-30',rosterVersion:3,scheduledStart:null,dueAt:null,
      items:[{...entries[0],status:'FAILED',retryable:true,code:'WORKFORCE_UNAVAILABLE'}],
    } as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T01:00:00.000Z'));
    try {
      await expect(service.generateCurrent(context,routeId)).rejects.toMatchObject({status:503});
      expect(generate).toHaveBeenCalledWith(context,routeId,
        {localDate:'2026-10-30',rosterVersion:3});
    } finally {vi.useRealTimers();}
  });

  it('runs scheduled PER_SHIFT generation through the current-day HTTP entrypoint',async () => {
    const query=vi.fn(async (sql:string) => sql.includes('route_templates')
      ? {rows:[{...route,schedule:{...route.schedule,cadence:'PER_SHIFT',localTime:undefined}}]}
      : {rows:[{version:3}]});
    const service=new RosterService(db(query) as never,{} as never,{} as never);
    const generate=vi.spyOn(service,'generate').mockResolvedValue({
      localDate:'2026-10-31',rosterVersion:3,scheduledStart:null,dueAt:null,items:[],
    } as never);
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T01:00:00.000Z'));
    try {
      await expect(service.generateCurrent(context,routeId)).resolves.toMatchObject({rosterVersion:3});
      expect(generate).toHaveBeenCalledWith(context,routeId,{localDate:'2026-10-31',rosterVersion:3});
    } finally {vi.useRealTimers();}
  });

  it('skips a weekly route outside its selected weekdays without failing the schedule',async () => {
    const query=vi.fn(async (sql:string) => sql.includes('route_templates')
      ? {rows:[{...route,schedule:{...route.schedule,cadence:'WEEKLY',weekdays:[1]}}]}
      : {rows:[{version:3}]});
    const service=new RosterService(db(query) as never,{} as never,{} as never);
    const generate=vi.spyOn(service,'generate');
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T01:00:00.000Z'));
    try {
      await expect(service.generateCurrent(context,routeId)).resolves.toMatchObject({
        status:'SKIPPED',items:[]});
      expect(generate).not.toHaveBeenCalled();
    } finally {vi.useRealTimers();}
  });
});
