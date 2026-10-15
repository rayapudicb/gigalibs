import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain ES module shared with scripts/verify-sdlc-governance.mjs
import { workStatusFindings } from '../../../scripts/lib/work-status.mjs';

// WI-OI-120aq (plan v3 step 0.6, owner D1a): a work item's status claims only what its evidence shows.
const STATUSES = [
  'Proposed',
  'Ready',
  'In Progress',
  'Built',
  'Review',
  'On UAT',
  'Done',
  'Blocked',
  'Replaced',
];
const codes = (status: string, evidence: string) =>
  (workStatusFindings({ id: 'WI-OI-999', status, evidence }, STATUSES) as [string, string][]).map(
    ([code]) => code,
  );

describe('work item status', () => {
  it('accepts the plan v3 statuses and refuses the retired and unknown ones', () => {
    for (const status of ['Proposed', 'Ready', 'In Progress', 'Built', 'Review', 'Blocked'])
      expect(codes(status, 'evidence')).toEqual([]);
    for (const status of ['Accepted', 'Released', 'Retired', 'Done!'])
      expect(codes(status, 'Owner accepted on release abcdef1; replaced by X')).toEqual([
        'WORK_STATUS',
      ]);
  });

  it('needs a release for On UAT', () => {
    expect(codes('On UAT', 'Deployed and verified')).toEqual(['UAT_EVIDENCE']);
    expect(codes('On UAT', 'On UAT in release `d17db37` (journey 9jh56k)')).toEqual([]);
  });

  it("needs the owner's recorded acceptance for Done", () => {
    expect(codes('Done', 'All tests pass on release d17db37')).toEqual(['OWNER_ACCEPTANCE']);
    expect(codes('Done', 'On release d17db37; owner accepted 2026-10-15')).toEqual([]);
  });

  it('needs a pointer for Replaced', () => {
    expect(codes('Replaced', 'No longer needed')).toEqual(['REPLACEMENT_POINTER']);
    expect(codes('Replaced', 'Replaced by plan v3 GU1–GU7 (1.4–1.10)')).toEqual([]);
  });
});
