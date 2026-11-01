import { randomUUID } from 'node:crypto';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { InspectionTrendService } from './inspection-trend.service.js';
import { resolveOrganizationAccess } from '../organization/organization-scope.js';
import { resolvePlaceScope } from '../places/place-scope.js';

vi.mock('../organization/organization-scope.js',() => ({resolveOrganizationAccess:vi.fn()}));
vi.mock('../places/place-scope.js',() => ({resolvePlaceScope:vi.fn()}));

const ids={assetId:randomUUID(),checkpointId:randomUUID()};
const principal={tenantId:'tenant-a',subject:'reviewer'} as never;
const query={...ids,unitCode:'bar'};

describe('Analytics Rounds 90-day trend read',() => {
  beforeEach(() => {
    vi.mocked(resolveOrganizationAccess).mockReset().mockResolvedValue(null);
    vi.mocked(resolvePlaceScope).mockReset().mockResolvedValue(null);
  });

  it('requires a bounded asset/checkpoint/unit query before database access',async () => {
    const db={queryWithTenant:vi.fn()};
    const service=new InspectionTrendService(db as never);
    await expect(service.get(principal,{assetId:'not-a-uuid',checkpointId:ids.checkpointId,
      unitCode:'bar'})).rejects.toMatchObject({status:400});
    expect(db.queryWithTenant).not.toHaveBeenCalled();
  });

  it('returns no rows when organization or place scope is denied',async () => {
    const db={queryWithTenant:vi.fn()};
    const service=new InspectionTrendService(db as never);
    vi.mocked(resolveOrganizationAccess).mockResolvedValueOnce({
      denied:true,readUnits:[],writeUnits:[],versionId:null,
    });
    expect((await service.get(principal,query)).days).toEqual([]);
    vi.mocked(resolvePlaceScope).mockResolvedValueOnce({placeIds:[],paths:[]});
    expect((await service.get(principal,query)).days).toEqual([]);
    expect(db.queryWithTenant).not.toHaveBeenCalled();
  });

  it('binds tenant, ownership and place scope and returns dated Analytics facts',async () => {
    const now=new Date();
    const db={queryWithTenant:vi.fn(async () => ({rows:[{
      day:now.toISOString().slice(0,10),unit_code:'bar',average:'4.250000',
      minimum:'4.000000',maximum:'4.500000',sample_count:2,last_accepted_at:now,
    }]}))};
    vi.mocked(resolveOrganizationAccess).mockResolvedValue({
      denied:false,readUnits:['PLANT_A'],writeUnits:[],versionId:'v1',
    });
    vi.mocked(resolvePlaceScope).mockResolvedValue({placeIds:[ids.assetId],paths:['plant']});
    const result=await new InspectionTrendService(db as never).get(principal,query);
    expect(result).toMatchObject({contractVersion:'round-inspection-trend.v1',...ids,
      unitCode:'bar',source:'ANALYTICS_ROUNDS_FACTS',
      days:[{average:'4.250000',sampleCount:2}]});
    const [tenant,sql,params]=db.queryWithTenant.mock.calls[0]!;
    expect(tenant).toBe('tenant-a');
    expect(sql).toContain("r.raw_payload->>'scopeKnown'='true'");
    expect(sql).toContain("s.module_source_key='operator-rounds:readings'");
    expect(params.slice(0,6)).toEqual(['tenant-a',ids.assetId,ids.checkpointId,'bar',
      ['PLANT_A'],[ids.assetId]]);
  });
});
