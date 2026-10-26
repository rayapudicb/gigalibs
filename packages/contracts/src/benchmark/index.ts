// WI-OI-120 (X2, task benchmark — a measurement, not a gate): a repeatable measure of the Day-1 onboarding task — how
// a brand-new workspace reaches a working state (the M1a / Phase-3 outcome). It scores how much of Day-1 can be done
// without hand-work (a bulk, API or Assistant surface) versus manual-only screens, and how the headline "200 people in
// one import" scales. Pure and data-only: each task names the real control-plane surface that performs it, so the
// benchmark is traceable, and re-running it after a change shows the number move. It gates nothing.

/**
 * How a task is accomplished today, best automation first:
 * - `ASSISTANT`: the GigaLibs Assistant can do it on request.
 * - `BULK_API`: one call handles many items (e.g. invite 200 people at once).
 * - `API`: a single programmatic call (no hand-work), but one per item.
 * - `MANUAL_UI`: only by a person clicking through a screen.
 */
export type DayOneTaskMode = 'ASSISTANT' | 'BULK_API' | 'API' | 'MANUAL_UI';

export interface DayOneTask {
  readonly key: string;
  readonly label: string;
  readonly mode: DayOneTaskMode;
  /** The control-plane route or screen that performs it — the evidence the benchmark is measuring something real. */
  readonly surface: string;
  /** For a task repeated per person (e.g. inviting), how many calls N people take in this mode. Undefined = not per-person. */
  readonly callsForNPeople?: (people: number) => number;
}

/**
 * The canonical Day-1 task set. Each maps to a surface built and verified in Phase 3 (R13/R14 people admin, R15
 * directory groups, S17 console, T11b wizard) — a company naming + organization + people + roles + modules + packs +
 * lifecycle path to a working workspace.
 */
export const DAY_ONE_TASKS: readonly DayOneTask[] = [
  {
    key: 'name-company',
    label: 'Name the company',
    mode: 'MANUAL_UI',
    surface: '/settings?tab=general',
  },
  {
    key: 'build-organization',
    label: 'Create units and sites',
    mode: 'API',
    surface: 'tenants/current/organization/units',
  },
  { key: 'choose-modules', label: 'Turn on modules', mode: 'API', surface: 'tenant entitlements' },
  {
    key: 'invite-people',
    label: 'Invite people (bulk import)',
    mode: 'BULK_API',
    surface: 'tenants/current/delegated-invitations/bulk',
    callsForNPeople: () => 1,
  },
  {
    key: 'grant-roles',
    label: 'Grant scoped roles to existing people',
    mode: 'BULK_API',
    surface: 'tenants/current/delegated-grants',
    callsForNPeople: () => 1,
  },
  {
    key: 'directory-groups',
    label: 'Map directory groups to scoped roles (no hand-adding)',
    mode: 'API',
    surface: 'tenants/current/directory-group-sync',
  },
  {
    key: 'apply-pack',
    label: 'Apply an industry/country solution pack',
    mode: 'API',
    surface: 'configuration/catalogues/install',
  },
  {
    key: 'offboard',
    label: 'Off-board people in bulk',
    mode: 'BULK_API',
    surface: 'tenants/current/members/bulk-offboard',
    callsForNPeople: () => 1,
  },
];

export interface DayOneBenchmark {
  readonly totalTasks: number;
  readonly automatable: number;
  readonly manualOnly: number;
  /** 0–100: share of Day-1 tasks with a non-manual surface. The measurement that should rise over time. */
  readonly automationCoverage: number;
  readonly byMode: Readonly<Record<DayOneTaskMode, number>>;
  /** Calls to invite `people` at once through the best per-person task, vs one call each. Lower is better. */
  readonly peopleImportCalls: number;
  readonly peopleImportCallsIfOneByOne: number;
}

/** Measure the Day-1 task set. `people` is the headline import size (Phase-3 exit uses 200). */
export function summarizeDayOneBenchmark(
  tasks: readonly DayOneTask[] = DAY_ONE_TASKS,
  people = 200,
): DayOneBenchmark {
  const byMode: Record<DayOneTaskMode, number> = {
    ASSISTANT: 0,
    BULK_API: 0,
    API: 0,
    MANUAL_UI: 0,
  };
  for (const task of tasks) byMode[task.mode] += 1;
  const totalTasks = tasks.length;
  const manualOnly = byMode.MANUAL_UI;
  const automatable = totalTasks - manualOnly;
  const perPerson = tasks.filter((task) => task.callsForNPeople);
  const peopleImportCalls = perPerson.reduce(
    (sum, task) => sum + (task.callsForNPeople?.(people) ?? 0),
    0,
  );
  return {
    totalTasks,
    automatable,
    manualOnly,
    automationCoverage: totalTasks === 0 ? 0 : Math.round((automatable / totalTasks) * 100),
    byMode,
    peopleImportCalls,
    peopleImportCallsIfOneByOne: perPerson.length * people,
  };
}
