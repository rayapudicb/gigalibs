import { CMMS_WORK_ORDER_TRANSITIONS, holdsPermission, type CmmsWorkOrderStatusV1 } from '@gigalibs/contracts';
import type { RecordActionOffer } from '@gigalibs/module-sdk';

// WI-OI-163: which work-order actions a person may take now, from the same rules the commands check (WorkOrdersService
// changeStatus, signOff and lockForChange; assertCanExecute). One pure rule so the web screen, the phone and the tests
// agree; the commands keep every check of their own. The reason codes are the ones the commands refuse with.

export const WORK_ORDER_ACTIONS = ['start', 'hold', 'resume', 'complete', 'cancel', 'sign-off'] as const;
export type WorkOrderActionKey = (typeof WORK_ORDER_ACTIONS)[number];

export interface WorkOrderActionFacts {
  readonly status: CmmsWorkOrderStatusV1;
  readonly assignedTo: string | null;
  /** WI-OI-169: logins with a live Workforce booking on the work order (they may execute it, as the assignee may). */
  readonly bookedUsers?: readonly string[];
  readonly signedOffAt: string | null;
  /** Who last moved the work order to COMPLETED (sign-off is four-eyes). */
  readonly completedBy: string | null;
  /** Permits on the work order: live ones, and ones not yet closed or cancelled (the LOTO interlock). */
  readonly permitsLive: number;
  readonly permitsOpen: number;
}

const TARGET: Readonly<Record<Exclude<WorkOrderActionKey, 'sign-off'>, CmmsWorkOrderStatusV1>> = {
  start: 'IN_PROGRESS',
  hold: 'ON_HOLD',
  resume: 'IN_PROGRESS',
  complete: 'COMPLETED',
  cancel: 'CANCELLED',
};
const EXECUTE: ReadonlySet<WorkOrderActionKey> = new Set(['start', 'resume', 'complete']);

const refuse = (reason: string, message: string): RecordActionOffer => ({ offered: false, reason, message });

export function workOrderActionOffer(
  action: WorkOrderActionKey,
  facts: WorkOrderActionFacts,
  principal: { readonly subject: string; readonly permissions: readonly string[] },
): RecordActionOffer {
  if (facts.signedOffAt) return refuse('CMMS_WORK_ORDER_SIGNED_OFF', 'This work order is closed and cannot be changed.');
  if (action === 'sign-off') {
    if (facts.status !== 'COMPLETED') return refuse('CMMS_WORK_ORDER_STATE', `This is not possible while the work order is ${facts.status}.`);
    if (facts.completedBy && facts.completedBy === principal.subject)
      return refuse('CMMS_SIGN_OFF_FOUR_EYES', 'The person who completed the work order cannot sign it off.');
    return { offered: true };
  }
  const target = TARGET[action];
  if (!CMMS_WORK_ORDER_TRANSITIONS[facts.status].includes(target))
    return refuse('CMMS_INVALID_TRANSITION', `A ${facts.status} work order cannot move to ${target}.`);
  if (EXECUTE.has(action) && !holdsPermission(principal.permissions, 'cmms.work-orders.write')) {
    const own = facts.assignedTo === principal.subject || (facts.bookedUsers ?? []).includes(principal.subject);
    if (!own) return refuse('CMMS_OUT_OF_SCOPE', 'You can only execute work orders assigned to you.');
  }
  if (target === 'IN_PROGRESS' && facts.permitsOpen > 0 && facts.permitsLive === 0)
    return refuse('CMMS_PERMIT_NOT_LIVE', 'This work needs its permit live before it starts.');
  if (target === 'COMPLETED' && facts.permitsOpen > 0)
    return refuse('CMMS_PERMIT_OPEN', 'De-isolate and close the permit before completing the work.');
  return { offered: true };
}
