import { randomUUID } from 'node:crypto';
import { RoundOfflineGrantV1 } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { issueRoundOfflineGrant } from './mobile-rounds.controller.js';

const assignmentId=randomUUID();
const installationId=randomUUID();
const session={tenant:{id:'tenant-a'},user:{id:'operator-a'},membershipId:'member-a',
  sessionRevision:3,authorizationRevision:12,configurationRevision:4,
  expiresAt:'2026-11-02T00:00:00.000Z'};
const bundle={assignment:{id:assignmentId,operatorSubject:'operator-a',routeRevision:2,
  dueAt:'2026-10-31T12:00:00.000Z',state:'ASSIGNED'},
  route:{revision:2,schedule:{graceMinutes:30}}};
const now=new Date('2026-10-31T08:00:00.000Z');

describe('mobile Rounds offline grant',() => {
  it('binds one authorized assignment to the live session and installation',() => {
    const grant=issueRoundOfflineGrant(session as never,'session-a',installationId,bundle,assignmentId,now);
    expect(RoundOfflineGrantV1.safeParse(grant).success).toBe(true);
    expect(grant).toMatchObject({contractVersion:'round-offline-grant.v1',assignmentId,
      tenantId:'tenant-a',userId:'operator-a',installationId,routeRevision:2,
      issuedAt:now.toISOString(),expiresAt:'2026-10-31T12:30:00.000Z'});
    const differentSession=issueRoundOfflineGrant(session as never,'session-b',installationId,
      bundle,assignmentId,now);
    expect(differentSession.scopeKey).not.toBe(grant.scopeKey);
  });

  it('caps a future assignment at eight hours',() => {
    const future={...bundle,assignment:{...bundle.assignment,dueAt:'2026-11-02T12:00:00.000Z'}};
    expect(issueRoundOfflineGrant(session as never,'session-a',installationId,future,
      assignmentId,now).expiresAt).toBe('2026-10-31T16:00:00.000Z');
  });

  it('caps the grant at session expiry and refuses an expired session',() => {
    const shortSession={...session,expiresAt:'2026-10-31T09:00:00.000Z'} as never;
    expect(issueRoundOfflineGrant(shortSession,'session-a',installationId,bundle,
      assignmentId,now).expiresAt).toBe('2026-10-31T09:00:00.000Z');
    const expiredSession={...session,expiresAt:'2026-10-31T07:59:59.000Z'} as never;
    expect(() => issueRoundOfflineGrant(expiredSession,'session-a',installationId,bundle,
      assignmentId,now)).toThrow();
  });

  it('refuses another operator, a stale route, a closed assignment and an expired window',() => {
    for (const input of [
      {...bundle,assignment:{...bundle.assignment,operatorSubject:'operator-b'}},
      {...bundle,route:{...bundle.route,revision:3}},
      {...bundle,assignment:{...bundle.assignment,state:'COMPLETED'}},
      {...bundle,assignment:{...bundle.assignment,dueAt:'2026-10-31T07:00:00.000Z'}},
    ]) expect(() => issueRoundOfflineGrant(session as never,'session-a',installationId,input,
      assignmentId,now)).toThrow();
  });
});
