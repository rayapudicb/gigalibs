import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeOrgError,
  orgPermissions,
  orgRequest,
  OrgRequestError,
  workflowSteps,
} from '@/components/organization/organization-client';

// WI-OI-109d: the organization screens explain every refusal and offer only the steps the server would allow.
describe('organization screen rules', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })));

  it('keeps the server explanation, validation problems and field issues', async () => {
    respond(422, { message: 'The version no longer passes validation; return it to draft and fix it.', problems: [{ code: 'CYCLE', unitId: 'u1', detail: 'loops' }] });
    const refused = await orgRequest('/versions/v1/submit', { method: 'POST', body: {} }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(OrgRequestError);
    expect(describeOrgError(refused)).toMatchObject({ kind: 'invalid', message: expect.stringMatching(/no longer passes/), problems: [{ code: 'CYCLE' }], action: null });

    respond(400, { message: 'Request validation failed.', issues: [{ path: ['labels', 'one'], message: 'Too small' }] });
    const invalid = describeOrgError(await orgRequest('/unit-types', { method: 'POST', body: {} }).catch((error: unknown) => error));
    expect(invalid).toMatchObject({ kind: 'invalid', message: 'The change breaks an organization rule.', issues: ['labels.one: Too small'] });
  });

  it.each([
    [401, 'session', 'sign-in'],
    [403, 'denied', null],
    [404, 'missing', 'reload'],
    [409, 'conflict', 'reload'],
    [503, 'unavailable', 'retry'],
    [500, 'unavailable', 'retry'],
  ] as const)('maps HTTP %i to %s with action %s', async (status, kind, action) => {
    respond(status, { statusCode: status, message: status === 500 ? 'Internal server error' : 'from server' });
    const view = describeOrgError(await orgRequest('/trees').catch((error: unknown) => error));
    expect(view).toMatchObject({ kind, action });
    if (status === 500) expect(view.message).not.toMatch(/Internal server error/);
  });

  it('treats an unreachable service as a retryable outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(describeOrgError(await orgRequest('/trees').catch((error: unknown) => error))).toMatchObject({ kind: 'unavailable', action: 'retry' });
  });

  it('reads organization permissions, including the wildcard', () => {
    expect(orgPermissions(['organization:*'])).toEqual({ read: true, draft: true, approve: true, activate: true, grant: true });
    expect(orgPermissions(['organization:read', 'organization:approve'])).toEqual({ read: true, draft: false, approve: true, activate: false, grant: false });
    expect(orgPermissions(['users:read'])).toMatchObject({ read: false });
  });

  it('never lets the author or submitter approve, and explains why', () => {
    const all = orgPermissions(['organization:*']);
    const submitted = { status: 'SUBMITTED' as const, createdBy: 'ana', submittedBy: 'ana' };
    expect(workflowSteps(submitted, all, 'ana').find((step) => step.action === 'approve')).toMatchObject({ allowed: false, reason: expect.stringMatching(/second person/) });
    expect(workflowSteps(submitted, all, 'ben').find((step) => step.action === 'approve')).toMatchObject({ allowed: true, reason: null });
    expect(workflowSteps({ ...submitted, createdBy: 'cy' }, all, 'ana').find((step) => step.action === 'approve')?.allowed).toBe(false);
  });

  it('offers each lifecycle step only in its state and with its permission', () => {
    const drafter = orgPermissions(['organization:read', 'organization:draft']);
    const actions = (status: 'DRAFT' | 'VALIDATED' | 'APPROVED' | 'PUBLISHED' | 'REJECTED', permissions = drafter) =>
      workflowSteps({ status, createdBy: 'ana', submittedBy: null }, permissions, 'ben').map((step) => `${step.action}:${step.allowed}`);
    expect(actions('DRAFT')).toEqual(['edit:true', 'validate:true', 'withdraw:true']);
    expect(actions('VALIDATED')).toEqual(['edit:true', 'submit:true', 'withdraw:true']);
    expect(actions('APPROVED')).toEqual(['publish:false', 'reject:false']);
    expect(actions('PUBLISHED', orgPermissions(['organization:activate']))).toEqual(['activate:true']);
    expect(actions('REJECTED')).toEqual([]);
  });
});
