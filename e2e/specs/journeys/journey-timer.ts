/**
 * WI-OI-151: timed business journeys. Each journey is a persona's business outcome (for example "raise a purchase
 * requisition") run step by step in a real browser; every step records its wall time, the calls it made, failed calls
 * and errors shown. Two modes:
 * - `dry` (default): navigate, open the form, fill every required field with realistic values through the real
 *   pickers, then cancel. Nothing is saved, so it is safe on the UAT instance.
 * - `write`: also saves. Refused on the UAT instance (5180) unless the owner approved writes
 *   (`GIGALIBS_ALLOW_UAT_WRITE_E2E=1`); meant for the isolated test stack.
 * The human time of each journey is the Keystroke-Level Model estimate of the same steps (docs/plans/
 * ux-journeys-benchmark-plan.md §1), so a report shows machine time, estimated human time and the target together.
 */
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type JourneyMode = 'dry' | 'write';
export const journeyMode: JourneyMode = process.env.JOURNEY_MODE === 'write' ? 'write' : 'dry';

/** Keystroke-Level Model, seconds: think, point, click, per key (average typist). */
export const KLM = { M: 1.35, P: 1.1, B: 0.1, K: 0.28 } as const;
const HUMAN = {
  navigate: KLM.M + 2 * (KLM.P + KLM.B),
  open: KLM.P + KLM.B,
  text: KLM.M + KLM.P + KLM.B + 8 * KLM.K,
  number: KLM.M + KLM.P + KLM.B + 4 * KLM.K,
  date: KLM.M + KLM.P + KLM.B + 10 * KLM.K,
  select: KLM.M + 2 * (KLM.P + KLM.B),
  picker: KLM.M + KLM.P + KLM.B + 3 * KLM.K + KLM.P + KLM.B,
  submit: KLM.M + KLM.P + KLM.B,
  click: KLM.M + KLM.P + KLM.B,
} as const;
export type HumanAction = keyof typeof HUMAN;

export interface StepResult {
  readonly name: string;
  readonly machineMs: number;
  readonly humanSeconds: number;
  readonly calls: number;
  readonly failed: readonly string[];
  readonly shownErrors: readonly string[];
  readonly note?: string;
}

export interface JourneyResult {
  readonly id: string;
  readonly persona: string;
  readonly module: string;
  readonly outcome: string;
  readonly targetSeconds: number;
  readonly mode: JourneyMode;
  readonly route: string;
  readonly steps: StepResult[];
  readonly machineSeconds: number;
  readonly humanSeconds: number;
  readonly requiredFields: number;
  readonly pickers: number;
  readonly emptyPickers: readonly string[];
  readonly verdict: 'MEETS' | 'OVER TARGET' | 'TOO SLOW' | 'BLOCKED' | 'NOT RUN';
  readonly blockers: readonly string[];
  readonly finishedAt: string;
}

/** A journey in progress: steps are timed, calls and errors are recorded per step. */
export class Journey {
  readonly steps: StepResult[] = [];
  readonly blockers: string[] = [];
  readonly emptyPickers: string[] = [];
  requiredFields = 0;
  pickers = 0;
  private calls: { path: string; status: number }[] = [];

  constructor(
    private readonly page: Page,
    readonly meta: { id: string; persona: string; module: string; outcome: string; targetSeconds: number; route: string },
  ) {
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith('/api/')) return;
      this.calls.push({ path: `${response.request().method()} ${url.pathname}`, status: response.status() });
    });
  }

  /** Times one step; `human` lists the person's actions in it for the Keystroke-Level estimate. */
  async step(name: string, human: readonly HumanAction[], run: () => Promise<string | void>): Promise<void> {
    this.calls = [];
    const started = Date.now();
    let note: string | undefined;
    try {
      note = (await run()) ?? undefined;
    } catch (error) {
      note = `failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`.slice(0, 200);
      this.blockers.push(`${name}: ${note}`);
    }
    const machineMs = Date.now() - started;
    const shownErrors = await this.page
      .locator('[data-page-frame] [role=alert], [data-page-frame] .text-ui-fg-error')
      .allInnerTexts()
      .catch(() => [] as string[]);
    const failed = [...new Set(this.calls.filter((call) => call.status >= 400).map((call) => `${call.path} → ${call.status}`))];
    // The red "*" of a required field is not an error.
    const errors = shownErrors.map((text) => text.replace(/\s+/g, ' ').trim()).filter((text) => text && text !== '*').slice(0, 3);
    if (errors.length) this.blockers.push(`${name}: ${errors[0]!.slice(0, 160)}`);
    this.steps.push({
      name,
      machineMs,
      humanSeconds: human.reduce((sum, action) => sum + HUMAN[action], 0) + machineMs / 1000,
      calls: this.calls.length,
      failed,
      shownErrors: errors,
      ...(note ? { note } : {}),
    });
  }

  result(): JourneyResult {
    const machineSeconds = this.steps.reduce((sum, step) => sum + step.machineMs, 0) / 1000;
    const humanSeconds = this.steps.reduce((sum, step) => sum + step.humanSeconds, 0);
    const blockers = [...new Set([...this.blockers, ...this.emptyPickers.map((picker) => `no options in ${picker}`)])];
    const verdict = blockers.length
      ? 'BLOCKED'
      : humanSeconds <= this.meta.targetSeconds
        ? 'MEETS'
        : humanSeconds <= 30
          ? 'OVER TARGET'
          : 'TOO SLOW';
    return {
      ...this.meta,
      mode: journeyMode,
      steps: this.steps,
      machineSeconds: Math.round(machineSeconds * 10) / 10,
      humanSeconds: Math.round(humanSeconds * 10) / 10,
      requiredFields: this.requiredFields,
      pickers: this.pickers,
      emptyPickers: this.emptyPickers,
      verdict,
      blockers,
      finishedAt: new Date().toISOString(),
    };
  }
}

/** Appends the run's results to `e2e/artifacts/journeys/<run>.json`. */
export function writeJourneyReport(run: string, results: readonly JourneyResult[]): string {
  const directory = join(process.cwd(), 'artifacts', 'journeys');
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${run}.json`);
  writeFileSync(file, JSON.stringify({ run, mode: journeyMode, results }, null, 2));
  return file;
}

/** The isolated test stack and the owner's approval decide whether a journey may save. */
export function mayWrite(baseURL: string | undefined): boolean {
  if (journeyMode !== 'write') return false;
  const uat = /:5180\b/.test(baseURL ?? '');
  return !uat || process.env.GIGALIBS_ALLOW_UAT_WRITE_E2E === '1';
}
