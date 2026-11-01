import { RelayEnvelopeV1Schema, RoundWorkforceEligibilityRequestV1, RoundWorkforceEligibilityResponseV1, RoundWorkforceShiftWindowsRequestV1, RoundWorkforceShiftWindowsResponseV1 } from '@gigalibs/contracts';
import { RelayInboxGuardBase, loadRelayConfig, type RelayConfig } from '@gigalibs/module-sdk';
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Inject, Injectable, Post, UseGuards } from '@nestjs/common';
import { WorkforceDatabaseService } from '../database/database.service.js';

export const WORKFORCE_ROUNDS_INBOX_CONFIG=Symbol('WORKFORCE_ROUNDS_INBOX_CONFIG');
const AUDIENCE='gigalibs-workforce-rounds-inbox';

export function loadWorkforceRoundsInboxConfig(environment:NodeJS.ProcessEnv=process.env):RelayConfig {
  return loadRelayConfig(environment,{
    inboxPublicKey:'WORKFORCE_ROUNDS_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl:'WORKFORCE_ROUNDS_UNUSED_RELAY_URL',signingKey:'WORKFORCE_ROUNDS_UNUSED_RELAY_KEY_BASE64',
    interval:'WORKFORCE_ROUNDS_INBOX_INTERVAL_MS',peerService:'module-host',
  });
}

@Injectable()
export class WorkforceRoundsGuard extends RelayInboxGuardBase {
  constructor(@Inject(WORKFORCE_ROUNDS_INBOX_CONFIG) config:RelayConfig) {
    super(config,{audience:AUDIENCE,source:'operator-rounds',label:'Workforce Rounds'});
  }
}

/** Checks the canonical human, position, working slot and blockers in one tenant-bound read. */
@Injectable()
export class WorkforceRoundsEligibilityService {
  constructor(private readonly database:WorkforceDatabaseService) {}

  async windows(rawEnvelope:unknown) {
    const parsed=RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!parsed.success || parsed.data.eventType!=='ROUND_WORKFORCE_WINDOWS_REQUESTED_V1' ||
        parsed.data.aggregateType!=='resource' || parsed.data.schemaVersion!==1)
      throw new BadRequestException('Unsupported Rounds shift-window request.');
    const request=RoundWorkforceShiftWindowsRequestV1.safeParse(parsed.data.payload);
    if (!request.success || request.data.resourceId!==parsed.data.aggregateId)
      throw new BadRequestException('Invalid Rounds shift-window request.');
    return this.database.withTenantTransaction(parsed.data.tenantId,async (client) => {
      const {resourceId,operatorSubject,localDate,timeZone}=request.data;
      const rows=await client.query<{scheduled_start:Date;shift_end:Date}>(
        `SELECT (d.day+s.start::time) AT TIME ZONE p.time_zone AS scheduled_start,
                ((CASE WHEN s."end"::time<=s.start::time AND s."end"<>'24:00'
                    THEN d.day+1 ELSE d.day END)+s."end"::time) AT TIME ZONE p.time_zone AS shift_end
           FROM gigalibs_workforce.availability_patterns p
           JOIN gigalibs_workforce.workforce_resources r
             ON r.tenant_id=p.tenant_id AND r.id=p.resource_id
           CROSS JOIN LATERAL (SELECT $3::date AS day) d
           CROSS JOIN LATERAL jsonb_to_recordset(p.weekly_slots)
             AS s(day text,start text,"end" text)
          WHERE p.tenant_id=$1 AND p.resource_id=$2
            AND r.status='ACTIVE' AND r.resource_type='HUMAN' AND r.platform_user_id=$4
            AND p.time_zone=$5 AND d.day>=p.effective_from
            AND (p.effective_to IS NULL OR d.day<p.effective_to)
            AND extract(isodow FROM d.day)::int=
              array_position(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']::text[],upper(s.day))
          ORDER BY scheduled_start LIMIT 9`,
        [parsed.data.tenantId,resourceId,localDate,operatorSubject,timeZone],
      );
      if (rows.rows.length>8)
        throw new BadRequestException('Workforce has too many working windows for one local date.');
      return RoundWorkforceShiftWindowsResponseV1.parse({windows:rows.rows.map((row) => ({
        scheduledStart:row.scheduled_start.toISOString(),shiftEnd:row.shift_end.toISOString(),
      }))});
    });
  }

  async check(rawEnvelope:unknown) {
    const parsed=RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!parsed.success || parsed.data.eventType!=='ROUND_WORKFORCE_ELIGIBILITY_REQUESTED_V1' ||
        parsed.data.aggregateType!=='resource' || parsed.data.schemaVersion!==1)
      throw new BadRequestException('Unsupported Rounds eligibility request.');
    const request=RoundWorkforceEligibilityRequestV1.safeParse(parsed.data.payload);
    if (!request.success || request.data.resourceId!==parsed.data.aggregateId)
      throw new BadRequestException('Invalid Rounds eligibility request.');
    return this.database.withTenantTransaction(parsed.data.tenantId,async (client) => {
      const {resourceId,operatorSubject,owningUnitId,placeRef,timeZone,scheduledStart,dueAt}=request.data;
      const resource=(await client.query<{status:string;resource_type:string;platform_user_id:string|null}>(
        `SELECT status,resource_type,platform_user_id FROM gigalibs_workforce.workforce_resources
         WHERE tenant_id=$1 AND id=$2`,[parsed.data.tenantId,resourceId],
      )).rows[0];
      let code=!resource?'RESOURCE_UNKNOWN'
        :resource.status!=='ACTIVE' || resource.resource_type!=='HUMAN'?'RESOURCE_INACTIVE'
        :resource.platform_user_id!==operatorSubject?'USER_MISMATCH':'ACTIVE_LINK';
      let assignedPlaceRef=placeRef;
      if (code==='ACTIVE_LINK') {
        const position=await client.query<{site_ref:string|null}>(
          `SELECT p.site_ref FROM gigalibs_workforce.engagements e
             JOIN gigalibs_workforce.positions p ON p.tenant_id=e.tenant_id AND p.id=e.position_id
            WHERE e.tenant_id=$1 AND e.resource_id=$2 AND e.status='ACTIVE'
              AND e.start_date <= ($3::timestamptz AT TIME ZONE $7)::date
              AND (e.end_date IS NULL OR e.end_date > (($4::timestamptz-interval '1 microsecond') AT TIME ZONE $7)::date)
              AND p.status <> 'CLOSED'
              AND p.effective_from <= ($3::timestamptz AT TIME ZONE $7)::date
              AND (p.effective_to IS NULL OR p.effective_to > (($4::timestamptz-interval '1 microsecond') AT TIME ZONE $7)::date)
              AND ($5::varchar IS NULL OR p.department_id=$5)
              AND ($6::uuid IS NULL OR p.site_ref=$6)
            ORDER BY e.start_date DESC,e.id LIMIT 1`,
          [parsed.data.tenantId,resourceId,scheduledStart,dueAt,owningUnitId,placeRef,timeZone],
        );
        if (position.rows.length===0) code='POSITION_MISMATCH';
        else assignedPlaceRef=position.rows[0]!.site_ref;
      }
      if (code==='ACTIVE_LINK') {
        const slot=await client.query(
          `WITH days AS (
             SELECT d::date AS day FROM generate_series(
               (($3::timestamptz AT TIME ZONE 'UTC')::date - 2)::timestamp,
               (($4::timestamptz AT TIME ZONE 'UTC')::date + 2)::timestamp,
               interval '1 day') d
           )
           SELECT 1 FROM gigalibs_workforce.availability_patterns p
             CROSS JOIN LATERAL jsonb_to_recordset(p.weekly_slots)
               AS s(day text,start text,"end" text)
             JOIN days ON extract(isodow FROM days.day)::int=
               array_position(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']::text[],upper(s.day))
            WHERE p.tenant_id=$1 AND p.resource_id=$2
              AND days.day>=p.effective_from AND (p.effective_to IS NULL OR days.day<p.effective_to)
              AND (days.day+s.start::time) AT TIME ZONE p.time_zone <= $3::timestamptz
              AND ((CASE WHEN s."end"::time<=s.start::time AND s."end"<>'24:00'
                         THEN days.day+1 ELSE days.day END)+s."end"::time)
                   AT TIME ZONE p.time_zone >= $4::timestamptz
            LIMIT 1`,
          [parsed.data.tenantId,resourceId,scheduledStart,dueAt],
        );
        if (slot.rows.length===0) code='SHIFT_UNAVAILABLE';
      }
      if (code==='ACTIVE_LINK') {
        const absence=await client.query(
          `SELECT 1 FROM gigalibs_workforce.absences
            WHERE tenant_id=$1 AND resource_id=$2 AND status='APPROVED'
              AND starts_at<$4::timestamptz AND ends_at>$3::timestamptz LIMIT 1`,
          [parsed.data.tenantId,resourceId,scheduledStart,dueAt],
        );
        if (absence.rows.length>0) code='APPROVED_ABSENCE';
      }
      if (code==='ACTIVE_LINK') {
        const closure=await client.query(
          `SELECT 1 FROM gigalibs_workforce.calendar_closures c
             JOIN gigalibs_workforce.working_calendars wc
               ON wc.tenant_id=c.tenant_id AND wc.id=c.calendar_id
             JOIN gigalibs_workforce.availability_patterns p
               ON p.tenant_id=c.tenant_id AND p.resource_id=$2
              AND c.closure_date>=p.effective_from
              AND (p.effective_to IS NULL OR c.closure_date<p.effective_to)
            WHERE c.tenant_id=$1 AND c.status='ACTIVE'
              AND (wc.site_ref IS NULL OR wc.site_ref=$5::uuid)
              AND (c.closure_date::timestamp AT TIME ZONE p.time_zone)<$4::timestamptz
              AND ((c.closure_date+1)::timestamp AT TIME ZONE p.time_zone)>$3::timestamptz
            LIMIT 1`,
          [parsed.data.tenantId,resourceId,scheduledStart,dueAt,assignedPlaceRef],
        );
        if (closure.rows.length>0) code='SITE_CLOSED';
      }
      return RoundWorkforceEligibilityResponseV1.parse({eligible:code==='ACTIVE_LINK',code});
    });
  }
}

@Controller('internal/v1/rounds-eligibility')
@UseGuards(WorkforceRoundsGuard)
export class WorkforceRoundsEligibilityController {
  constructor(private readonly service:WorkforceRoundsEligibilityService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  check(@Body() body:unknown) {return this.service.check(body);}

  @Post('windows')
  @HttpCode(HttpStatus.OK)
  windows(@Body() body:unknown) {return this.service.windows(body);}
}
