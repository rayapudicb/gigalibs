// WI-OI-120 (T11b): the full set-up wizard model. A new workspace is guided through company, organization, people,
// access, modules and solution packs. There is no persisted "setup done" flag — progress is DERIVED from the
// workspace's own data (does it have units, more than the founding member, enabled modules, …), so the wizard is
// always truthful and resumes itself without a separate state machine to drift. Pure and browser-safe.

/** The ordered steps. Keys are stable (used in the UI and tests). */
export type SetupStepKey = 'company' | 'country' | 'organization' | 'people' | 'access' | 'modules' | 'packs';

export interface SetupStepDefinition {
  readonly key: SetupStepKey;
  readonly title: string;
  readonly description: string;
  /** Where the step is completed — an existing screen, so the wizard orchestrates rather than reimplements. */
  readonly href: string;
  /** A required step counts toward completion and can be the "next" step; an optional one is offered, never blocking. */
  readonly required: boolean;
}

export const SETUP_STEPS: readonly SetupStepDefinition[] = [
  {
    key: 'company',
    title: 'Name your company',
    description: 'Confirm the workspace name and branding.',
    href: '/settings/general',
    required: true,
  },
  {
    // WI-OI-153 slice B (ADR-0038 §5): a workspace without a country confirms it; nothing is loaded until it does.
    key: 'country',
    title: 'Confirm your country',
    description: 'Choose the workspace country, base currency and time zone; the country pack follows from it.',
    href: '/settings/general',
    required: true,
  },
  {
    key: 'organization',
    title: 'Set up your organization',
    description: 'Add the units and sites people and records belong to.',
    href: '/settings/organization',
    required: true,
  },
  {
    key: 'people',
    title: 'Invite your people',
    description: 'Invite teammates and department heads into their units.',
    href: '/settings/people',
    required: true,
  },
  {
    key: 'access',
    title: 'Tailor roles & access',
    description: 'Create custom roles beyond the built-in ones (optional).',
    href: '/settings',
    required: false,
  },
  {
    key: 'modules',
    title: 'Choose your modules',
    description: 'Turn on the modules this workspace will use.',
    href: '/settings/plan',
    required: true,
  },
  {
    key: 'packs',
    title: 'Apply a solution pack',
    description: 'Add an industry or country pack to pre-fill wording and settings (optional).',
    href: '/configuration',
    required: false,
  },
];

/** What the wizard reads about a workspace to decide each step. `packInstalled: null` means "not known / not checked". */
export interface SetupSignals {
  readonly companyNamed: boolean;
  /** WI-OI-153: the workspace settings hold a country. */
  readonly countryConfirmed: boolean;
  readonly unitCount: number;
  /** Includes the founding member, so "more than one" means someone else has been invited. */
  readonly memberCount: number;
  readonly customRoleCount: number;
  readonly enabledModuleCount: number;
  readonly packInstalled: boolean | null;
}

/** `done`: satisfied. `todo`: a required step still to do. `optional`: an unmet optional step (offered, not blocking). */
export type SetupStepStatus = 'done' | 'todo' | 'optional';

export interface SetupStepProgress {
  readonly key: SetupStepKey;
  readonly status: SetupStepStatus;
}

export interface SetupProgress {
  readonly steps: readonly SetupStepProgress[];
  readonly completedRequired: number;
  readonly totalRequired: number;
  /** 0–100, over the REQUIRED steps only, so optional steps never hold completion back. */
  readonly percent: number;
  /** The first required step still to do, or null when every required step is done. */
  readonly nextStepKey: SetupStepKey | null;
  readonly allRequiredDone: boolean;
}

function isStepSatisfied(key: SetupStepKey, signals: SetupSignals): boolean {
  switch (key) {
    case 'company':
      return signals.companyNamed;
    case 'country':
      return signals.countryConfirmed;
    case 'organization':
      return signals.unitCount > 0;
    case 'people':
      return signals.memberCount > 1;
    case 'access':
      return signals.customRoleCount > 0;
    case 'modules':
      return signals.enabledModuleCount > 0;
    case 'packs':
      return signals.packInstalled === true;
  }
}

/** Derive each step's status and the overall progress from a workspace's current state. */
export function deriveSetupProgress(signals: SetupSignals): SetupProgress {
  const steps = SETUP_STEPS.map<SetupStepProgress>((step) => {
    const satisfied = isStepSatisfied(step.key, signals);
    return { key: step.key, status: satisfied ? 'done' : step.required ? 'todo' : 'optional' };
  });
  const requiredSteps = SETUP_STEPS.filter((step) => step.required);
  const completedRequired = requiredSteps.filter((step) =>
    isStepSatisfied(step.key, signals),
  ).length;
  const totalRequired = requiredSteps.length;
  const nextStepKey = steps.find((step) => step.status === 'todo')?.key ?? null;
  return {
    steps,
    completedRequired,
    totalRequired,
    percent: totalRequired === 0 ? 100 : Math.round((completedRequired / totalRequired) * 100),
    nextStepKey,
    allRequiredDone: nextStepKey === null,
  };
}
