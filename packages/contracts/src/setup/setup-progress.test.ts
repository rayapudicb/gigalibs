import { describe, expect, it } from 'vitest';
import { SETUP_STEPS, type SetupSignals, type SetupStepKey, deriveSetupProgress } from './index.js';

// WI-OI-120 (T11b): the set-up wizard derives each step from the workspace's own data — no persisted "setup done" flag.
const base: SetupSignals = {
  companyNamed: true,
  unitCount: 0,
  memberCount: 1,
  customRoleCount: 0,
  enabledModuleCount: 0,
  packInstalled: null,
};
const statusOf = (progress: ReturnType<typeof deriveSetupProgress>, key: SetupStepKey) =>
  progress.steps.find((step) => step.key === key)?.status;

describe('deriveSetupProgress', () => {
  it('counts only required steps toward completion (company, organization, people, modules)', () => {
    expect(SETUP_STEPS.filter((step) => step.required).map((step) => step.key)).toEqual([
      'company',
      'organization',
      'people',
      'modules',
    ]);
  });

  it('a fresh workspace: only the (auto-named) company is done; next is organization', () => {
    const progress = deriveSetupProgress(base);
    expect(statusOf(progress, 'company')).toBe('done');
    expect(statusOf(progress, 'organization')).toBe('todo');
    expect(statusOf(progress, 'people')).toBe('todo');
    expect(statusOf(progress, 'modules')).toBe('todo');
    expect(statusOf(progress, 'access')).toBe('optional');
    expect(statusOf(progress, 'packs')).toBe('optional');
    expect(progress.completedRequired).toBe(1);
    expect(progress.totalRequired).toBe(4);
    expect(progress.percent).toBe(25);
    expect(progress.nextStepKey).toBe('organization');
    expect(progress.allRequiredDone).toBe(false);
  });

  it('a fully set-up workspace is 100% with no next step', () => {
    const progress = deriveSetupProgress({
      companyNamed: true,
      unitCount: 3,
      memberCount: 5,
      customRoleCount: 2,
      enabledModuleCount: 4,
      packInstalled: true,
    });
    expect(progress.steps.every((step) => step.status === 'done')).toBe(true);
    expect(progress.percent).toBe(100);
    expect(progress.nextStepKey).toBeNull();
    expect(progress.allRequiredDone).toBe(true);
  });

  it('next step skips satisfied required steps and ignores optional ones', () => {
    // Units + modules done, people not; access (optional) satisfied. Next required is people.
    const progress = deriveSetupProgress({
      ...base,
      unitCount: 2,
      enabledModuleCount: 1,
      customRoleCount: 3,
      memberCount: 1,
    });
    expect(statusOf(progress, 'access')).toBe('done');
    expect(progress.nextStepKey).toBe('people');
    expect(progress.percent).toBe(75); // company + organization + modules of 4 required
  });

  it('an unnamed company surfaces as the first thing to do', () => {
    const progress = deriveSetupProgress({ ...base, companyNamed: false });
    expect(statusOf(progress, 'company')).toBe('todo');
    expect(progress.nextStepKey).toBe('company');
  });

  it('a solution pack is optional: done when installed, optional when absent or unknown', () => {
    expect(statusOf(deriveSetupProgress({ ...base, packInstalled: true }), 'packs')).toBe('done');
    expect(statusOf(deriveSetupProgress({ ...base, packInstalled: false }), 'packs')).toBe(
      'optional',
    );
    expect(statusOf(deriveSetupProgress({ ...base, packInstalled: null }), 'packs')).toBe(
      'optional',
    );
  });
});
