/** WI-OI-120hp (R3): segregation-of-duties conflict detection. */
import { describe, expect, it } from 'vitest';
import { DUTY_CONFLICT_SETS, dutyConflictCodes, dutyConflicts } from './duty-conflicts.js';
import { modulePermissionCatalogue } from './permission-catalogue.generated.js';

describe('dutyConflicts', () => {
  it('flags holding both sides of a set (request and approve absence)', () => {
    const conflicts = dutyConflicts(['workforce.absences.request', 'workforce.absences.approve']);
    expect(conflicts.map((set) => set.id)).toEqual(['workforce-absence-request-approve']);
  });

  it('does not flag two codes on the same side (request and request-own)', () => {
    expect(dutyConflicts(['workforce.absences.request', 'workforce.absences.request-own'])).toEqual([]);
  });

  it('does not flag one side alone (approve without request)', () => {
    expect(dutyConflicts(['workforce.absences.approve'])).toEqual([]);
  });

  it('flags preparing and approving a pay run', () => {
    expect(dutyConflicts(['workforce.pay.manage', 'workforce.pay.approve']).map((set) => set.id)).toEqual([
      'workforce-pay-prepare-approve',
    ]);
  });

  it('suppresses a conflict the administrator has accepted', () => {
    expect(
      dutyConflicts(
        ['workforce.pay.manage', 'workforce.pay.approve'],
        ['workforce-pay-prepare-approve'],
      ),
    ).toEqual([]);
  });

  it('reports several conflicts at once', () => {
    const conflicts = dutyConflicts([
      'workforce.absences.request',
      'workforce.absences.approve',
      'workforce.time.manage',
      'workforce.timesheets.approve',
    ]);
    expect(conflicts.map((set) => set.id).sort()).toEqual([
      'workforce-absence-request-approve',
      'workforce-timesheet-correct-approve',
    ]);
  });

  it('every code named by a conflict set exists in the permission catalogue', () => {
    for (const code of dutyConflictCodes())
      expect(modulePermissionCatalogue.some((entry) => entry.code === code), `missing catalogue code: ${code}`).toBe(true);
  });

  it('every conflict set has a stable id and at least two sides', () => {
    const ids = DUTY_CONFLICT_SETS.map((set) => set.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const set of DUTY_CONFLICT_SETS) expect(set.sides.length).toBeGreaterThanOrEqual(2);
  });
});
