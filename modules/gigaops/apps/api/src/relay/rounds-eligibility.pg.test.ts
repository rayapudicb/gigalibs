import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { WorkforceRoundsEligibilityService } from './rounds-eligibility.js';

const proofUrl=process.env['ROUND_WORKFORCE_SQL_PROOF_URL'];
const proof=proofUrl?describe:describe.skip;

proof('Rounds Workforce eligibility on disposable PostgreSQL',() => {
  it('admits a current shift and refuses a missing shift, position and approved absence',async () => {
    const pool=new Pool({connectionString:proofUrl});
    const client=await pool.connect();
    const tenant=`rounds-proof-${randomUUID()}`;
    const resource=randomUUID();const job=randomUUID();const position=randomUUID();
    const engagement=randomUUID();const pattern=randomUUID();const place=randomUUID();
    const subject='rounds-proof-user';const start='2026-10-30T08:00:00.000Z';
    const due='2026-10-30T09:00:00.000Z';
    const envelope={messageId:randomUUID(),tenantId:tenant,
      eventType:'ROUND_WORKFORCE_ELIGIBILITY_REQUESTED_V1',aggregateType:'resource',
      aggregateId:resource,aggregateVersion:1,correlationId:randomUUID(),causationId:null,
      schemaVersion:1,occurredAt:new Date().toISOString(),
      payload:{resourceId:resource,operatorSubject:subject,owningUnitId:'unit-a',
        placeRef:place,timeZone:'UTC',scheduledStart:start,dueAt:due}};
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
      await client.query(`INSERT INTO gigalibs_workforce.workforce_resources
        (id,tenant_id,reference_code,display_name,resource_type,platform_user_id,
         created_by,updated_by,correlation_id)
        VALUES ($1,$2,'ROUND_PROOF','Round Proof','HUMAN',$3,$3,$3,$4)`,
        [resource,tenant,subject,randomUUID()]);
      await client.query(`INSERT INTO gigalibs_workforce.job_profiles
        (id,tenant_id,code,created_by,updated_by,correlation_id)
        VALUES ($1,$2,'ROUND_PROOF',$3,$3,$4)`,[job,tenant,subject,randomUUID()]);
      await client.query(`INSERT INTO gigalibs_workforce.positions
        (id,tenant_id,code,job_profile_id,site_ref,department_id,effective_from,
         created_by,updated_by,correlation_id)
        VALUES ($1,$2,'ROUND_PROOF',$3,$4,'unit-a','2026-01-01',$5,$5,$6)`,
        [position,tenant,job,place,subject,randomUUID()]);
      await client.query(`INSERT INTO gigalibs_workforce.engagements
        (id,tenant_id,resource_id,position_id,engagement_type,start_date,
         created_by,updated_by,correlation_id)
        VALUES ($1,$2,$3,$4,'EMPLOYEE','2026-01-01',$5,$5,$6)`,
        [engagement,tenant,resource,position,subject,randomUUID()]);
      await client.query(`INSERT INTO gigalibs_workforce.availability_patterns
        (id,tenant_id,resource_id,effective_from,time_zone,weekly_slots,
         created_by,updated_by,correlation_id)
        VALUES ($1,$2,$3,'2026-01-01','UTC',$4,$5,$5,$6)`,
        [pattern,tenant,resource,JSON.stringify([{day:'FRIDAY',start:'08:00',end:'10:00'}]),
         subject,randomUUID()]);
      const db={withTenantTransaction:async (_tenant:string,run:(connection:PoolClient)=>Promise<unknown>)=>run(client)};
      const service=new WorkforceRoundsEligibilityService(db as never);
      expect(await service.check(envelope)).toEqual({eligible:true,code:'ACTIVE_LINK'});
      const windowsEnvelope={...envelope,eventType:'ROUND_WORKFORCE_WINDOWS_REQUESTED_V1',
        payload:{resourceId:resource,operatorSubject:subject,localDate:'2026-10-30',timeZone:'UTC'}};
      expect(await service.windows(windowsEnvelope)).toEqual({windows:[{
        scheduledStart:'2026-10-30T08:00:00.000Z',shiftEnd:'2026-10-30T10:00:00.000Z'}]});
      expect(await service.windows({...windowsEnvelope,payload:{...windowsEnvelope.payload,
        operatorSubject:'different-operator'}})).toEqual({windows:[]});
      expect(await service.check({...envelope,payload:{...envelope.payload,owningUnitId:'unit-b'}}))
        .toEqual({eligible:false,code:'POSITION_MISMATCH'});
      await client.query(`UPDATE gigalibs_workforce.availability_patterns
        SET weekly_slots='[{"day":"FRIDAY","start":"11:00","end":"12:00"}]'::jsonb
        WHERE tenant_id=$1 AND id=$2`,[tenant,pattern]);
      expect(await service.check(envelope)).toEqual({eligible:false,code:'SHIFT_UNAVAILABLE'});
      await client.query(`UPDATE gigalibs_workforce.availability_patterns
        SET weekly_slots='[{"day":"FRIDAY","start":"08:00","end":"10:00"}]'::jsonb
        WHERE tenant_id=$1 AND id=$2`,[tenant,pattern]);
      const type=randomUUID();
      await client.query(`INSERT INTO gigalibs_workforce.absence_types
        (id,tenant_id,code,name,created_by,updated_by,correlation_id)
        VALUES ($1,$2,'ROUND_PROOF','Round Proof',$3,$3,$4)`,[type,tenant,subject,randomUUID()]);
      await client.query(`INSERT INTO gigalibs_workforce.absences
        (tenant_id,resource_id,absence_type_id,starts_at,ends_at,status,
         requested_by,decided_by,decided_at,correlation_id)
        VALUES ($1,$2,$3,$4,$5,'APPROVED','owner','reviewer',now(),$6)`,
        [tenant,resource,type,start,due,randomUUID()]);
      expect(await service.check(envelope)).toEqual({eligible:false,code:'APPROVED_ABSENCE'});
      await client.query(`DELETE FROM gigalibs_workforce.absences WHERE tenant_id=$1 AND resource_id=$2`,
        [tenant,resource]);
      const calendar=randomUUID();
      await client.query(`INSERT INTO gigalibs_workforce.working_calendars
        (id,tenant_id,code,name,site_ref,created_by,updated_by,correlation_id)
        VALUES ($1,$2,'ROUND_PROOF','Round Proof',$3,$4,$4,$5)`,
        [calendar,tenant,place,subject,randomUUID()]);
      await client.query(`INSERT INTO gigalibs_workforce.calendar_closures
        (tenant_id,calendar_id,closure_date,label,created_by,correlation_id)
        VALUES ($1,$2,'2026-10-30','Round Proof',$3,$4)`,
        [tenant,calendar,subject,randomUUID()]);
      expect(await service.check(envelope)).toEqual({eligible:false,code:'SITE_CLOSED'});
      expect(await service.check({...envelope,payload:{...envelope.payload,placeRef:null}}))
        .toEqual({eligible:false,code:'SITE_CLOSED'});
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});
