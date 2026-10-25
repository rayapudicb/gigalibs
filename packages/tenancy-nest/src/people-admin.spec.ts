/** WI-OI-120p slice 4 (R13): the scoped assignments an accepted delegated invitation grants (pure). */
import { describe, expect, it } from 'vitest';
import { invitedRoleAssignments } from './people-admin.js';

describe('invitedRoleAssignments', () => {
  it('grants each carried role at the invite unit', () => {
    expect(invitedRoleAssignments({ customRoleIds: ['tech', 'planner'], unitId: 'north' })).toEqual([
      { customRoleId: 'tech', scope: 'UNITS', unitIds: ['north'] },
      { customRoleId: 'planner', scope: 'UNITS', unitIds: ['north'] },
    ]);
  });

  it('grants nothing for an ordinary invite (no roles or no unit)', () => {
    expect(invitedRoleAssignments({ customRoleIds: [], unitId: 'north' })).toEqual([]);
    expect(invitedRoleAssignments({ customRoleIds: ['tech'], unitId: null })).toEqual([]);
  });

  it('de-duplicates repeated role ids', () => {
    expect(invitedRoleAssignments({ customRoleIds: ['tech', 'tech'], unitId: 'north' })).toEqual([
      { customRoleId: 'tech', scope: 'UNITS', unitIds: ['north'] },
    ]);
  });
});
