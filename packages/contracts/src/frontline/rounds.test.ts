import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AssignRoundV1, CreateRoundRouteV1, ReplaceRoundRosterV1,
  RoundCheckpointHistoryV1, RoundWorkforceEligibilityRequestV1, StageRoundEvidenceV1 } from './rounds.js';

describe('Rounds platform identity contract', () => {
  it('accepts the control-plane CUID subject linked to a UUID Workforce resource', () => {
    const operatorSubject = 'cmuy0autt0031l807snorsbhr';
    const workforceResourceRef = randomUUID();
    expect(AssignRoundV1.safeParse({
      requestKey: randomUUID(), workforceResourceRef, operatorSubject,
      scheduledStart: '2026-10-30T08:00:00.000Z', dueAt: '2026-10-30T09:00:00.000Z',
    }).success).toBe(true);
    expect(RoundWorkforceEligibilityRequestV1.safeParse({
      resourceId: workforceResourceRef, operatorSubject,owningUnitId:null,placeRef:null,
      timeZone:'UTC',scheduledStart:'2026-10-30T08:00:00.000Z',dueAt:'2026-10-30T09:00:00.000Z',
    }).success).toBe(true);
    expect(RoundWorkforceEligibilityRequestV1.safeParse({
      resourceId: operatorSubject, operatorSubject,owningUnitId:null,placeRef:null,
      timeZone:'UTC',scheduledStart:'2026-10-30T08:00:00.000Z',dueAt:'2026-10-30T09:00:00.000Z',
    }).success).toBe(false);
  });

  it('keeps a Geospatial place reference in the CMMS UUID domain', () => {
    const route = {
      requestKey: randomUUID(), code: 'PUMP_A', title: 'Pump A', description: null,
      owningUnitId: null, placeRef: randomUUID(),
      schedule: { cadence: 'DAILY', timeZone: 'UTC', localTime: '08:00', graceMinutes: 30,windowMinutes:60 },
    };
    expect(CreateRoundRouteV1.safeParse(route).success).toBe(true);
    expect(CreateRoundRouteV1.safeParse({ ...route, placeRef: 'not-a-place-uuid' }).success).toBe(false);
    expect(CreateRoundRouteV1.safeParse({ ...route,schedule:{...route.schedule,
      timeZone:'Mars/Phobos'} }).success).toBe(false);
  });
  it('refuses duplicate route-roster people and resource references',() => {
    const entry={workforceResourceRef:randomUUID(),operatorSubject:'operator-a'};
    expect(ReplaceRoundRosterV1.safeParse({expectedVersion:0,entries:[entry]}).success).toBe(true);
    expect(ReplaceRoundRosterV1.safeParse({expectedVersion:0,entries:[entry,entry]}).success).toBe(false);
    expect(ReplaceRoundRosterV1.safeParse({expectedVersion:0,
      entries:[entry,{...entry,workforceResourceRef:randomUUID()}]}).success).toBe(false);
  });
  it('requires an assignment and checkpoint before an evidence upload can be staged',() => {
    const input={evidenceId:randomUUID(),assignmentId:randomUUID(),checkpointId:randomUUID(),
      sha256:'a'.repeat(64),mimeType:'image/jpeg',byteSize:1024};
    expect(StageRoundEvidenceV1.safeParse(input).success).toBe(true);
    expect(StageRoundEvidenceV1.safeParse({...input,checkpointId:undefined}).success).toBe(false);
    expect(StageRoundEvidenceV1.safeParse({...input,assignmentId:undefined}).success).toBe(false);
  });
  it('keeps manual history bounded and excludes actor or media fields',() => {
    const reading={readingId:randomUUID(),capturedAt:'2026-10-30T08:00:00.000Z',
      numericValue:'4.3',choiceValue:null,status:'NORMAL',source:'MANUAL'};
    const item={checkpointId:randomUUID(),readings:[reading]};
    const history={contractVersion:'round-checkpoint-history.v1',assignmentId:randomUUID(),
      routeRevision:1,items:[item]};
    expect(RoundCheckpointHistoryV1.safeParse(history).success).toBe(true);
    expect(RoundCheckpointHistoryV1.safeParse({...history,items:[item,item]}).success).toBe(false);
    expect(RoundCheckpointHistoryV1.safeParse({...history,
      items:[{...item,readings:Array(6).fill(reading)}]}).success).toBe(false);
    expect(RoundCheckpointHistoryV1.safeParse({...history,
      items:[{...item,readings:[{...reading,actorSubject:'someone'}]}]}).success).toBe(false);
  });
});
