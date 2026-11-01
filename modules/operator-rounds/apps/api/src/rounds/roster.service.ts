import { RoundRosterEntryV1, RoundScheduleV1, type GenerateRoundAssignmentsV1, type ReplaceRoundRosterV1 } from '@gigalibs/contracts';
import { type ModuleCommandContext, type ModulePrincipal, recordMutation } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException,
  ServiceUnavailableException } from '@nestjs/common';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { scopeEvaluator } from '../organization.js';
import { AssignmentsService } from './assignments.service.js';
import { occurrenceRequestKey,roundOccurrence } from './schedule.js';
import { WorkforceEligibilityService } from '../workforce-eligibility.js';

interface RosterRow { version:number;entries:RoundRosterEntryV1[];updated_by:string;updated_at:Date }
interface RouteRow { id:string;state:string;owning_unit_id:string|null;site_ref:string|null;schedule:unknown }
const view=(row:RosterRow|null) => ({version:row?Number(row.version):0,
  entries:row?validatedEntries(row.entries):[],updatedBy:row?.updated_by ?? null,
  updatedAt:row?.updated_at.toISOString() ?? null});
function validatedEntries(value:unknown):RoundRosterEntryV1[] {
  const parsed=RoundRosterEntryV1.array().max(10).safeParse(value);
  if (!parsed.success) throw new ServiceUnavailableException('Route roster configuration is invalid.');
  if (new Set(parsed.data.map((entry) => entry.workforceResourceRef)).size!==parsed.data.length ||
      new Set(parsed.data.map((entry) => entry.operatorSubject)).size!==parsed.data.length)
    throw new ServiceUnavailableException('Route roster configuration has duplicate operators.');
  return parsed.data;
}

@Injectable()
export class RosterService {
  constructor(private readonly database:DatabaseService,private readonly assignments:AssignmentsService,
    private readonly workforce:WorkforceEligibilityService) {}

  /** Kernel schedule owner is reauthorized by the control plane and this module on every run. */
  async generateCurrent(context:ModuleCommandContext,routeId:string) {
    const config=await this.database.withTenantTransaction(context.principal.tenantId,async (client) => {
      const scope=await scopeEvaluator(client,context.principal);
      const route=(await client.query<RouteRow>(
        `SELECT id,state,owning_unit_id,site_ref,schedule FROM ${SCHEMA}.route_templates
         WHERE tenant_id=$1 AND id=$2`,[context.principal.tenantId,routeId],
      )).rows[0];
      if (!route || !(await scope.allows('operator-rounds.assignments.manage',route,true)))
        throw new NotFoundException('Route not found.');
      if (route.state!=='PUBLISHED') throw new ConflictException('Only published routes can generate assignments.');
      const roster=(await client.query<{version:number}>(
        `SELECT version FROM ${SCHEMA}.route_rosters WHERE tenant_id=$1 AND route_id=$2`,
        [context.principal.tenantId,routeId],
      )).rows[0];
      if (!roster) throw new ConflictException('Configure the route roster before scheduling.');
      return {schedule:RoundScheduleV1.parse(route.schedule),rosterVersion:Number(roster.version)};
    });
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
      timeZone:config.schedule.timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    }).formatToParts(new Date()).map((part) => [part.type,part.value]));
    const localDate=`${parts.year}-${parts.month}-${parts.day}`;
    if (config.schedule.cadence==='WEEKLY') {
      const weekday=(new Date(`${localDate}T00:00:00.000Z`).getUTCDay()+6)%7+1;
      if (!config.schedule.weekdays?.includes(weekday))
        return {localDate,rosterVersion:config.rosterVersion,
          scheduledStart:null,dueAt:null,items:[],status:'SKIPPED'};
    }
    const result=await this.generate(context,routeId,{localDate,rosterVersion:config.rosterVersion});
    if (result.items.some((item) => item.status==='FAILED' && item.retryable))
      throw new ServiceUnavailableException('One or more Rounds assignments need a scheduled retry.');
    return {...result,status:result.items.some((item) => item.status==='FAILED')?'PARTIAL':'GENERATED'};
  }

  async get(principal:ModulePrincipal,routeId:string) {
    return this.database.withTenantTransaction(principal.tenantId,async (client) => {
      const scope=await scopeEvaluator(client,principal);
      const route=(await client.query<RouteRow>(
        `SELECT id,state,owning_unit_id,site_ref,schedule FROM ${SCHEMA}.route_templates
         WHERE tenant_id=$1 AND id=$2`,[principal.tenantId,routeId],
      )).rows[0];
      if (!route || !(await scope.allows('operator-rounds.assignments.manage',route,false)))
        throw new NotFoundException('Route not found.');
      const roster=(await client.query<RosterRow>(
        `SELECT version,entries,updated_by,updated_at FROM ${SCHEMA}.route_rosters
         WHERE tenant_id=$1 AND route_id=$2`,[principal.tenantId,routeId],
      )).rows[0] ?? null;
      return view(roster);
    });
  }

  async replace(context:ModuleCommandContext,routeId:string,input:ReplaceRoundRosterV1) {
    return this.database.withTenantTransaction(context.principal.tenantId,async (client) => {
      const {tenantId,subject}=context.principal;
      const scope=await scopeEvaluator(client,context.principal);
      const route=(await client.query<RouteRow>(
        `SELECT id,state,owning_unit_id,site_ref,schedule FROM ${SCHEMA}.route_templates
         WHERE tenant_id=$1 AND id=$2 FOR SHARE`,[tenantId,routeId],
      )).rows[0];
      if (!route) throw new NotFoundException('Route not found.');
      await scope.assert('operator-rounds.assignments.manage',route);
      if (route.state!=='PUBLISHED') throw new ConflictException('Configure the roster on a published route.');
      let row:RosterRow|undefined;
      if (input.expectedVersion===0) {
        row=(await client.query<RosterRow>(
          `INSERT INTO ${SCHEMA}.route_rosters(tenant_id,route_id,version,entries,updated_by)
           VALUES($1,$2,1,$3,$4) ON CONFLICT (tenant_id,route_id) DO NOTHING
           RETURNING version,entries,updated_by,updated_at`,
          [tenantId,routeId,JSON.stringify(input.entries),subject],
        )).rows[0];
      } else {
        row=(await client.query<RosterRow>(
          `UPDATE ${SCHEMA}.route_rosters SET version=version+1,entries=$4,updated_by=$5,updated_at=now()
           WHERE tenant_id=$1 AND route_id=$2 AND version=$3
           RETURNING version,entries,updated_by,updated_at`,
          [tenantId,routeId,input.expectedVersion,JSON.stringify(input.entries),subject],
        )).rows[0];
      }
      if (!row) throw new ConflictException('The route roster changed; reload before saving.');
      await recordMutation(client,{schema:SCHEMA,topic:TOPIC},context,{
        action:'ROSTER_REPLACED',aggregateType:'roster',aggregateId:routeId,
        aggregateVersion:Number(row.version),payload:{routeId,entryCount:input.entries.length},
      });
      return view(row);
    });
  }

  async generate(context:ModuleCommandContext,routeId:string,input:GenerateRoundAssignmentsV1) {
    const snapshot=await this.database.withTenantTransaction(context.principal.tenantId,async (client) => {
      const scope=await scopeEvaluator(client,context.principal);
      const route=(await client.query<RouteRow>(
        `SELECT id,state,owning_unit_id,site_ref,schedule FROM ${SCHEMA}.route_templates
         WHERE tenant_id=$1 AND id=$2`,[context.principal.tenantId,routeId],
      )).rows[0];
      if (!route || !(await scope.allows('operator-rounds.assignments.manage',route,true)))
        throw new NotFoundException('Route not found.');
      if (route.state!=='PUBLISHED') throw new ConflictException('Only published routes can generate assignments.');
      const roster=(await client.query<RosterRow>(
        `SELECT version,entries,updated_by,updated_at FROM ${SCHEMA}.route_rosters
         WHERE tenant_id=$1 AND route_id=$2`,[context.principal.tenantId,routeId],
      )).rows[0];
      if (!roster || Number(roster.version)!==input.rosterVersion)
        throw new ConflictException('The route roster changed; reload before generating.');
      const entries=validatedEntries(roster.entries);
      if (!entries.length) throw new ConflictException('Add an operator to the route roster first.');
      const day=Date.parse(`${input.localDate}T00:00:00.000Z`);
      if (day<Date.now()-7*86_400_000 || day>Date.now()+31*86_400_000)
        throw new BadRequestException('Generate only a date within the recovery and planning window.');
      const schedule=RoundScheduleV1.parse(route.schedule);
      const occurrence=schedule.cadence==='PER_SHIFT'?null:roundOccurrence(schedule,input.localDate);
      if (schedule.cadence!=='PER_SHIFT' && !occurrence)
        throw new BadRequestException('The route does not run on this weekday.');
      return {entries,occurrence,schedule};
    });
    const assignOne=async (entry:RoundRosterEntryV1,occurrence:{scheduledStart:string;dueAt:string},
      keyDate:string) => {
      try {
        const result=await this.assignments.assign(context,routeId,{
          requestKey:occurrenceRequestKey(routeId,entry.workforceResourceRef,keyDate),
          workforceResourceRef:entry.workforceResourceRef,operatorSubject:entry.operatorSubject,
          ...occurrence,
        },input.rosterVersion);
        return {...entry,...occurrence,status:'ASSIGNED' as const,
          assignmentId:result.assignment.id,replayed:result.replayed};
      } catch (error) {
        const status=error instanceof HttpException?error.getStatus():503;
        return {...entry,...occurrence,status:'FAILED' as const,retryable:status>=500,
          code:status===409?'CONFLICT':status===404?'ROUTE_CHANGED'
            :status===403?'FORBIDDEN':status===400?'INVALID_ASSIGNMENT'
              :status===503?'WORKFORCE_UNAVAILABLE':'SERVER_RETRY_REQUIRED'};
      }
    };
    const items=(await Promise.all(snapshot.entries.map(async (entry) => {
      if (snapshot.occurrence)
        return [await assignOne(entry,snapshot.occurrence,input.localDate)];
      let windows;
      try {
        windows=(await this.workforce.shiftWindows(context.principal.tenantId,
          entry.workforceResourceRef,entry.operatorSubject,input.localDate,
          snapshot.schedule.timeZone)).windows;
      } catch {
        return [{...entry,status:'FAILED' as const,retryable:true,code:'WORKFORCE_UNAVAILABLE'}];
      }
      if (!windows.length)
        return [{...entry,status:'FAILED' as const,retryable:false,code:'SHIFT_UNAVAILABLE'}];
      return Promise.all(windows.map((window) => {
        const start=Date.parse(window.scheduledStart);
        const end=Math.min(Date.parse(window.shiftEnd),
          start+snapshot.schedule.windowMinutes*60_000);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end<=start)
          return Promise.resolve({...entry,status:'FAILED' as const,retryable:false,
            code:'INVALID_SHIFT_WINDOW'});
        const occurrence={scheduledStart:new Date(start).toISOString(),dueAt:new Date(end).toISOString()};
        return assignOne(entry,occurrence,`${input.localDate}|${occurrence.scheduledStart}`);
      }));
    }))).flat();
    return {localDate:input.localDate,rosterVersion:input.rosterVersion,
      scheduledStart:snapshot.occurrence?.scheduledStart??null,
      dueAt:snapshot.occurrence?.dueAt??null,items};
  }
}
