import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type WorkOrderActionFacts, workOrderActionOffer } from './work-order-offers.js';

// WI-OI-163: the work-order offers refuse exactly what the commands refuse, with the same codes (WorkOrdersService
// changeStatus, signOff, lockForChange; assertCanExecute).
const facts = (over: Partial<WorkOrderActionFacts> = {}): WorkOrderActionFacts => ({
  status: 'OPEN', assignedTo: 'tech-1', signedOffAt: null, completedBy: null, permitsLive: 0, permitsOpen: 0, ...over,
});
const technician = { subject: 'tech-1', permissions: ['cmms.work-orders.read', 'cmms.work-orders.execute-own'] };
const supervisor = { subject: 'super-1', permissions: ['cmms.work-orders.read', 'cmms.work-orders.write', 'cmms.work-orders.execute-own'] };
const reason = (offer: ReturnType<typeof workOrderActionOffer>) => (offer.offered ? null : offer.reason);

describe('work-order action offers', () => {
  it('follows the transition table', () => {
    expect(reason(workOrderActionOffer('start', facts(), technician))).toBeNull();
    expect(reason(workOrderActionOffer('complete', facts(), technician))).toBe('CMMS_INVALID_TRANSITION');
    expect(reason(workOrderActionOffer('hold', facts({ status: 'IN_PROGRESS' }), supervisor))).toBeNull();
    expect(reason(workOrderActionOffer('resume', facts({ status: 'COMPLETED' }), technician))).toBe('CMMS_INVALID_TRANSITION');
  });

  it('lets a technician execute only work assigned to them; a writer executes any', () => {
    expect(reason(workOrderActionOffer('start', facts({ assignedTo: 'tech-2' }), technician))).toBe('CMMS_OUT_OF_SCOPE');
    expect(reason(workOrderActionOffer('start', facts({ assignedTo: null }), technician))).toBe('CMMS_OUT_OF_SCOPE');
    expect(reason(workOrderActionOffer('start', facts({ assignedTo: 'tech-2' }), supervisor))).toBeNull();
  });

  // WI-OI-169: a live Workforce booking counts as the assignment.
  it('lets a technician booked on the work order execute it, as the assignee may', () => {
    expect(reason(workOrderActionOffer('start', facts({ assignedTo: 'tech-2', bookedUsers: ['tech-1'] }), technician))).toBeNull();
    expect(reason(workOrderActionOffer('start', facts({ assignedTo: null, bookedUsers: ['tech-3'] }), technician))).toBe('CMMS_OUT_OF_SCOPE');
  });

  it('keeps the LOTO interlock: start needs a live permit, completion needs every permit closed', () => {
    expect(reason(workOrderActionOffer('start', facts({ permitsOpen: 1, permitsLive: 0 }), technician))).toBe('CMMS_PERMIT_NOT_LIVE');
    expect(reason(workOrderActionOffer('start', facts({ permitsOpen: 1, permitsLive: 1 }), technician))).toBeNull();
    expect(reason(workOrderActionOffer('complete', facts({ status: 'IN_PROGRESS', permitsOpen: 1, permitsLive: 1 }), technician))).toBe('CMMS_PERMIT_OPEN');
    expect(reason(workOrderActionOffer('complete', facts({ status: 'IN_PROGRESS' }), technician))).toBeNull();
  });

  it('does not offer sign-off to the person who completed the work; another supervisor gets it', () => {
    const completed = facts({ status: 'COMPLETED', completedBy: 'super-1' });
    expect(workOrderActionOffer('sign-off', completed, supervisor)).toEqual({
      offered: false, reason: 'CMMS_SIGN_OFF_FOUR_EYES', message: 'The person who completed the work order cannot sign it off.',
    });
    expect(reason(workOrderActionOffer('sign-off', completed, { ...supervisor, subject: 'super-2' }))).toBeNull();
    expect(reason(workOrderActionOffer('sign-off', facts({ status: 'IN_PROGRESS' }), supervisor))).toBe('CMMS_WORK_ORDER_STATE');
  });

  it('offers nothing once the work order is signed off', () => {
    const closed = facts({ status: 'COMPLETED', signedOffAt: '2026-11-03T10:00:00Z' });
    for (const action of ['start', 'hold', 'resume', 'complete', 'cancel', 'sign-off'] as const)
      expect(reason(workOrderActionOffer(action, closed, supervisor))).toBe('CMMS_WORK_ORDER_SIGNED_OFF');
  });

  it('uses only refusal codes the commands themselves throw (the offers cannot drift into codes of their own)', () => {
    const offers = readFileSync(new URL('./work-order-offers.ts', import.meta.url), 'utf8');
    const commands = ['./work-orders.service.ts', './cmms-record-adapters.ts'].map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
    const codes = [...new Set([...offers.matchAll(/'(CMMS_[A-Z_]+)'/g)].map((match) => match[1]!))];
    expect(codes.length).toBeGreaterThanOrEqual(7);
    for (const code of codes) expect(commands, code).toContain(`code: '${code}'`);
  });
});
