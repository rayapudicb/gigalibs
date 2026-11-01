import { RoundSyncResponseV1, type RoundSyncCommandV1 } from '@gigalibs/contracts';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RunsService } from './runs.service.js';

const start: RoundSyncCommandV1 = { type:'START',payload:{
  requestKey:'10000000-0000-4000-8000-000000000001',
  runId:'10000000-0000-4000-8000-000000000002',
  assignmentId:'10000000-0000-4000-8000-000000000003',routeRevision:1,
} };
const reading: RoundSyncCommandV1 = { type:'READING',payload:{
  clientOperationId:'10000000-0000-4000-8000-000000000004',
  runId:start.payload.runId,checkpointId:'10000000-0000-4000-8000-000000000005',
  routeRevision:1,expectedRunVersion:1,capturedAt:'2026-10-30T08:00:00Z',
  source:'MANUAL',proofMethod:'NFC',scannedTag:'NFC-01',numericValue:'4.3',
  choiceValue:null,evidenceId:null,
} };
const complete: RoundSyncCommandV1 = { type:'COMPLETE',payload:{
  clientOperationId:'10000000-0000-4000-8000-000000000006',
  runId:start.payload.runId,expectedRunVersion:2,
} };

describe('offline sync batch results',() => {
  it('rechecks current Workforce eligibility before accepting a new run',async () => {
    const assignment={id:start.payload.assignmentId,route_id:'10000000-0000-4000-8000-000000000007',
      route_revision:1,operator_subject:'operator-a',workforce_resource_ref:'10000000-0000-4000-8000-000000000008',
      owning_unit_id:null,site_ref:null,state:'ASSIGNED',
      scheduled_start:new Date('2026-10-30T08:00:00Z'),due_at:new Date('2026-10-30T09:00:00Z')};
    const query=vi.fn(async (sql:string) => sql.includes('FROM gigalibs_operator_rounds.assignments')
      ? {rows:[assignment]} : sql.includes('FROM gigalibs_operator_rounds.round_runs')
        ? {rows:[]} : {rows:[{state:'PUBLISHED',schedule:{timeZone:'UTC'}}]});
    const database={withTenantTransaction:async (_tenant:string,
      run:(client:{query:typeof query})=>Promise<unknown>)=>run({query})};
    const workforce={assertEligible:vi.fn(async () => {
      throw new ConflictException('Worker absence was approved after assignment.');
    })};
    const service=new RunsService(database as never,workforce as never);
    const context={principal:{tenantId:'tenant-a',subject:'operator-a',
      permissions:['operator-rounds.runs.execute'],organization:{mode:'TENANT'},
      placeScope:{mode:'ALL'},departmentScope:{mode:'ALL'}},correlationId:'proof'} as never;
    await expect(service.start(context,start.payload)).rejects.toBeInstanceOf(ConflictException);
    expect(workforce.assertEligible).toHaveBeenCalledWith('tenant-a',assignment.workforce_resource_ref,
      'operator-a',expect.objectContaining({timeZone:'UTC'}));
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO gigalibs_operator_rounds.round_runs')))
      .toBe(false);
  });
  it('reports a committed first command, the conflict and all unattempted commands',async () => {
    const service = new RunsService({} as never,{} as never);
    vi.spyOn(service,'start').mockResolvedValue({type:'START',accepted:true,replayed:false,
      run:{id:start.payload.runId}} as never);
    vi.spyOn(service,'capture').mockRejectedValue(new ConflictException('stale version'));
    const finish = vi.spyOn(service,'complete');
    const response = await service.sync({} as never,[start,reading,complete]);
    expect(RoundSyncResponseV1.safeParse(response).success).toBe(true);
    expect(response).toMatchObject({stopped:true,results:[
      {accepted:true,type:'START',operationId:start.payload.requestKey},
      {accepted:false,type:'READING',state:'CONFLICT',code:'VERSION_CONFLICT',retryable:false},
      {accepted:false,type:'COMPLETE',state:'NOT_APPLIED',code:'EARLIER_COMMAND_FAILED',retryable:false},
    ]});
    expect(finish).not.toHaveBeenCalled();
  });

  it('keeps a permission refusal as an HTTP refusal for the whole request',async () => {
    const service = new RunsService({} as never,{} as never);
    vi.spyOn(service,'start').mockRejectedValue(new ForbiddenException('scope changed'));
    await expect(service.sync({} as never,[start])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('gives a changed Workforce admission its own offline conflict code',async () => {
    const service=new RunsService({} as never,{} as never);
    vi.spyOn(service,'start').mockRejectedValue(new ConflictException({
      code:'ROUNDS_APPROVED_ABSENCE',message:'Worker absence changed.'}));
    expect(await service.sync({} as never,[start,reading])).toMatchObject({results:[
      {accepted:false,state:'CONFLICT',code:'WORKFORCE_CHANGED'},
      {accepted:false,state:'NOT_APPLIED',code:'EARLIER_COMMAND_FAILED'},
    ]});
  });
});
