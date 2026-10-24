import { holdsPermission } from './permission-match.js';

// WI-OI-120hp (R3, segregation of duties): the declared sets of duties no one person should hold together. A
// conflict is holding a permission from two or more *sides* of the same set at once (e.g. requesting absence AND
// deciding absence). Enforced at grant time in the control plane (assertNoDutyConflict), over the union of a
// member's live assignments; the per-record four-eyes checks stay as defence in depth. An administrator may record
// an audited acceptance for a set (a compensating control) so a very small team is not locked out.

export interface DutyConflictSet {
  readonly id: string;
  readonly reason: string;
  /** The separate duties. Holding a permission from two or more sides at once is the conflict. */
  readonly sides: readonly (readonly string[])[];
}

export const DUTY_CONFLICT_SETS: readonly DutyConflictSet[] = [
  {
    id: 'workforce-absence-request-approve',
    reason: 'Requesting absence and deciding absence are separate duties.',
    sides: [['workforce.absences.request', 'workforce.absences.request-own'], ['workforce.absences.approve']],
  },
  {
    id: 'workforce-timesheet-correct-approve',
    reason: 'Correcting time and approving timesheets are separate duties.',
    sides: [['workforce.time.manage'], ['workforce.timesheets.approve']],
  },
  {
    id: 'workforce-pay-prepare-approve',
    reason: 'Preparing a pay run and approving it are separate duties.',
    sides: [['workforce.pay.manage'], ['workforce.pay.approve']],
  },
];

/**
 * The declared duty-conflict sets that `permissions` violate — a permission held on two or more of a set's sides —
 * minus any set whose id is in `accepted` (an administrator's recorded compensating control). Empty means no conflict.
 */
export function dutyConflicts(
  permissions: readonly string[],
  accepted: readonly string[] = [],
  sets: readonly DutyConflictSet[] = DUTY_CONFLICT_SETS,
): DutyConflictSet[] {
  return sets.filter((set) => {
    if (accepted.includes(set.id)) return false;
    const sidesHeld = set.sides.filter((side) => side.some((code) => holdsPermission(permissions, code))).length;
    return sidesHeld >= 2;
  });
}

/** Every distinct permission code named by the sets, so a test can prove none references an unknown code. */
export function dutyConflictCodes(sets: readonly DutyConflictSet[] = DUTY_CONFLICT_SETS): readonly string[] {
  return [...new Set(sets.flatMap((set) => set.sides.flat()))];
}
