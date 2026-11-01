import { describe, expect, it } from 'vitest';
import { isRoundAssignmentOverdue } from './assignments.service.js';

describe('Rounds supervisor overdue status', () => {
  const due = new Date('2026-10-31T08:00:00.000Z');
  it('respects the route grace period and keeps accepted completions closed', () => {
    expect(isRoundAssignmentOverdue('ASSIGNED',due,30,new Date('2026-10-31T08:30:00.000Z'))).toBe(false);
    expect(isRoundAssignmentOverdue('STARTED',due,30,new Date('2026-10-31T08:30:01.000Z'))).toBe(true);
    expect(isRoundAssignmentOverdue('COMPLETED',due,30,new Date('2026-10-31T09:00:00.000Z'))).toBe(false);
  });
});
