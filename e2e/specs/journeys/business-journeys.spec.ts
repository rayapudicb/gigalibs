/**
 * WI-OI-151: the persona business journeys of docs/plans/ux-journeys-benchmark-plan.md §5, timed step by step.
 * `JOURNEY_MODE=dry` (default) fills every required field through the real pickers and cancels; nothing is saved, so it
 * runs on UAT. `JOURNEY_MODE=write` saves, on the isolated test stack (or UAT with the owner's approval).
 *
 *   source e2e/load-uat-env.sh && pnpm --dir e2e exec playwright test specs/journeys --workers=1
 *
 * Results: e2e/artifacts/journeys/<run>.json (machine time, Keystroke-Level human time, target, verdict, blockers).
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { hasUatLogin, signInToUat } from '../uat-session';
import { type HumanAction, Journey, type JourneyResult, journeyMode, mayWrite, writeJourneyReport } from './journey-timer';

interface JourneyDefinition {
  readonly id: string;
  readonly persona: string;
  readonly module: string;
  readonly outcome: string;
  readonly targetSeconds: number;
  readonly route: string;
  /** What the person does on the screen. */
  readonly kind: 'create' | 'view' | 'inline-form' | 'not-run';
  /** A view tab to open first (Settings, Workforce availability, Permits). */
  readonly viewTab?: string;
  readonly reason?: string;
}

export const JOURNEYS: readonly JourneyDefinition[] = [
  { id: 'P1', persona: 'Platform operator', module: 'Platform Control Tower', outcome: 'Create a customer workspace', targetSeconds: 30, route: '/platform-admin', kind: 'not-run', reason: 'Needs a platform operator login; the walkthrough login is a workspace administrator.' },
  { id: 'P2', persona: 'Platform operator', module: 'Platform Control Tower', outcome: 'Enable a module for a workspace', targetSeconds: 10, route: '/platform-admin', kind: 'not-run', reason: 'Needs a platform operator login.' },
  { id: 'A1', persona: 'Workspace admin', module: 'Settings', outcome: 'Invite a person with a role', targetSeconds: 20, route: '/settings', kind: 'inline-form' },
  { id: 'A2', persona: 'Workspace admin', module: 'Settings', outcome: 'Add an organization unit', targetSeconds: 30, route: '/settings/organization', kind: 'view' },
  { id: 'A3', persona: 'Workspace admin', module: 'Settings', outcome: 'Turn on a module for the workspace', targetSeconds: 10, route: '/settings/plan', kind: 'not-run', reason: 'A workspace admin requests a module on Plan & entitlements and a platform operator turns it on (QA-035); the walkthrough workspace already has every module on, so there is nothing to request.' },
  { id: 'A4', persona: 'Workspace admin', module: 'Inventory', outcome: 'Create a warehouse', targetSeconds: 30, route: '/inventory', kind: 'create' },
  { id: 'A5', persona: 'Workspace admin', module: 'Products', outcome: 'Create a product with its unit', targetSeconds: 30, route: '/products', kind: 'create' },
  { id: 'A6', persona: 'Workspace admin', module: 'Asset maintenance', outcome: 'Register an asset', targetSeconds: 30, route: '/cmms/assets', kind: 'create' },
  { id: 'A7', persona: 'Workspace admin', module: 'Workforce', outcome: 'Add a person to Workforce', targetSeconds: 30, route: '/gigaops/resources', kind: 'create' },
  { id: 'T1', persona: 'Technician', module: 'Asset maintenance', outcome: 'Report a maintenance problem', targetSeconds: 15, route: '/cmms/requests', kind: 'create' },
  { id: 'T2', persona: 'Technician', module: 'Asset maintenance', outcome: 'Raise a work order', targetSeconds: 30, route: '/cmms/work-orders', kind: 'create' },
  { id: 'T3', persona: 'Technician', module: 'Safety', outcome: 'Report a hazard', targetSeconds: 30, route: '/safety-operations/report', kind: 'inline-form' },
  { id: 'T4', persona: 'Technician', module: 'Workforce', outcome: 'Request an absence', targetSeconds: 20, route: '/gigaops/availability', viewTab: 'My absences', kind: 'create' },
  { id: 'T5', persona: 'Operator', module: 'Asset maintenance', outcome: 'Start a permit to work', targetSeconds: 30, route: '/cmms/permits', viewTab: 'Request a permit', kind: 'inline-form' },
  { id: 'S1', persona: 'Supervisor', module: 'Safety', outcome: 'Triage a hazard report', targetSeconds: 20, route: '/safety-operations/triage', kind: 'view' },
  { id: 'S2', persona: 'Supervisor', module: 'Workforce', outcome: 'Approve an absence', targetSeconds: 10, route: '/gigaops/availability', viewTab: 'Absence requests', kind: 'view' },
  { id: 'S3', persona: 'Supervisor', module: 'Invoice approvals', outcome: 'Approve an invoice action', targetSeconds: 10, route: '/actions', kind: 'view' },
  { id: 'B1', persona: 'Buyer', module: 'Procurement', outcome: 'Raise a purchase requisition', targetSeconds: 30, route: '/procurement', kind: 'create' },
  { id: 'B2', persona: 'Buyer', module: 'Procurement', outcome: 'Create a purchase order', targetSeconds: 30, route: '/procurement/purchase-orders', kind: 'create' },
  { id: 'B3', persona: 'Clerk', module: 'Inventory', outcome: 'Receive goods into a warehouse', targetSeconds: 30, route: '/inventory/receipts', kind: 'create' },
  { id: 'B4', persona: 'AP clerk', module: 'Procurement', outcome: 'Record a vendor bill', targetSeconds: 30, route: '/procurement/vendor-bills', kind: 'create' },
  { id: 'C1', persona: 'Sales', module: 'Orders', outcome: 'Send a quote', targetSeconds: 30, route: '/orders', kind: 'create' },
  { id: 'C2', persona: 'Sales', module: 'Orders', outcome: 'Create a sales order', targetSeconds: 30, route: '/orders/sales-orders', kind: 'create' },
  { id: 'F1', persona: 'Accountant', module: 'General ledger', outcome: 'Draft a manual journal', targetSeconds: 30, route: '/finance', kind: 'create' },
  { id: 'F2', persona: 'Accountant', module: 'General ledger', outcome: 'Read the trial balance', targetSeconds: 10, route: '/finance/reports', kind: 'view' },
  { id: 'E1', persona: 'Executive', module: 'Executive Control Tower', outcome: "See today's position", targetSeconds: 10, route: '/dashboard', kind: 'view' },
  { id: 'X1', persona: 'Chemist', module: 'Process safety (SPEED)', outcome: 'Start a screening project', targetSeconds: 30, route: '/speed/projects', kind: 'create' },
];

const results: JourneyResult[] = [];
const run = `journeys-${new Date().toISOString().replace(/[:.]/g, '-')}`;

/** Required controls of the open form: a label marked with "*", or a required / aria-required control. */
async function requiredControls(scope: Locator): Promise<Locator[]> {
  const controls = scope.locator('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role=combobox]');
  const found: Locator[] = [];
  for (const control of await controls.all()) {
    if (!(await control.isVisible().catch(() => false)) || (await control.isDisabled().catch(() => true))) continue;
    const required = await control.evaluate((element) => {
      const input = element as HTMLInputElement;
      if (input.required || element.getAttribute('aria-required') === 'true') return true;
      const label = (element.id && document.querySelector(`label[for="${element.id}"]`)) || element.closest('label');
      return /\*\s*$/.test((label?.textContent ?? '').trim());
    });
    if (required) found.push(control);
  }
  return found;
}

/** Fills one control the way a person would; returns the person's action for the Keystroke-Level estimate. */
async function fill(page: Page, journey: Journey, control: Locator, id: string): Promise<HumanAction> {
  const tag = await control.evaluate((element) => element.tagName);
  const role = await control.getAttribute('role');
  const type = (await control.getAttribute('type')) ?? '';
  const label = await control.evaluate((element) => {
    const label = (element.id && document.querySelector(`label[for="${element.id}"]`)) || element.closest('label');
    return (label?.textContent ?? element.getAttribute('aria-label') ?? element.getAttribute('placeholder') ?? 'field').replace(/\s*\*\s*$/, '').trim();
  });
  if (role === 'combobox') {
    journey.pickers += 1;
    await control.click();
    const options = page.locator('[role=listbox] [role=option], [role=option]');
    const appeared = await options.first().waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
    if (!appeared) {
      journey.emptyPickers.push(label);
      await page.keyboard.press('Escape').catch(() => undefined);
      return 'picker';
    }
    await options.first().click();
    return 'picker';
  }
  if (tag === 'SELECT') {
    const values = await control.locator('option').evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value).filter(Boolean));
    if (values[0]) await control.selectOption(values[0]);
    return 'select';
  }
  if (type === 'date') {
    await control.fill(new Date().toISOString().slice(0, 10));
    return 'date';
  }
  if (type === 'datetime-local') {
    await control.fill(`${new Date().toISOString().slice(0, 10)}T09:00`);
    return 'date';
  }
  if (type === 'number' || (await control.getAttribute('inputmode')) === 'decimal') {
    await control.fill('1');
    return 'number';
  }
  if (type === 'email') {
    await control.fill(`journey.${id.toLowerCase()}@example.test`);
    return 'text';
  }
  await control.fill(`Journey ${id} ${Date.now().toString(36)}`);
  return 'text';
}

test.describe('Business journeys (timed)', () => {
  test.skip(!hasUatLogin, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD (e2e/uat.env or e2e/test.env).');
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, baseURL }) => {
    await signInToUat(page, new URL(baseURL ?? 'http://127.0.0.1:5180').origin);
  });

  test.afterAll(() => {
    const file = writeJourneyReport(run, results);
    console.log(`journey report: ${file}`);
  });

  for (const definition of JOURNEYS) {
    test(`${definition.id} ${definition.persona}: ${definition.outcome}`, async ({ page, baseURL }) => {
      test.setTimeout(120_000);
      const journey = new Journey(page, definition);
      if (definition.kind === 'not-run') {
        journey.blockers.push(definition.reason ?? 'Not run.');
        results.push({ ...journey.result(), verdict: 'NOT RUN' });
        return;
      }
      await journey.step('Open the screen', ['navigate'], async () => {
        await page.goto(definition.route, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      });
      if (definition.viewTab) {
        await journey.step(`Open "${definition.viewTab}"`, ['click'], async () => {
          await page.getByRole('tab', { name: definition.viewTab }).click({ timeout: 5000 });
          await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        });
      }
      if (definition.kind === 'create' || definition.kind === 'inline-form') {
        const frame = page.locator('[data-page-frame]');
        if (definition.kind === 'create') {
          await journey.step('Open the New form', ['open'], async () => {
            // The create button: New…, or Add / Register / Request … on hand-written screens (never a submit button).
            const button = frame.locator('button:not([type=submit])').filter({ hasText: /^\s*(\+\s*)?(New|Add|Register|Request)\b/ }).first();
            // QA-032: a window's New button appears once its manifest has loaded; wait for it instead of looking once.
            await button.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
            if (!(await button.count())) throw new Error('No create button on the screen.');
            await button.click();
            await page.waitForTimeout(400);
          });
        }
        const scope = page.locator('[role=dialog]').first();
        const formScope = (await scope.count()) ? scope : frame;
        const human: HumanAction[] = [];
        await journey.step('Fill the required fields', [], async () => {
          const controls = await requiredControls(formScope);
          journey.requiredFields = controls.length;
          for (const control of controls) human.push(await fill(page, journey, control, definition.id));
          return `${controls.length} required, ${journey.pickers} picker(s)`;
        });
        // The fill step's human time is the sum of the fields' Keystroke-Level times.
        const fillStep = journey.steps[journey.steps.length - 1]!;
        journey.steps[journey.steps.length - 1] = { ...fillStep, humanSeconds: fillStep.humanSeconds + human.reduce((sum, action) => sum + ({ text: 4.79, number: 3.67, date: 5.35, select: 3.75, picker: 5.09 } as Record<string, number>)[action]!, 0) };
        if (mayWrite(baseURL)) {
          await journey.step('Save', ['submit'], async () => {
            await formScope.getByRole('button', { name: /^(Save|Create|Submit|Send)/ }).first().click();
            await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
          });
        } else {
          await journey.step('Cancel (dry run: nothing saved)', [], async () => {
            await page.keyboard.press('Escape').catch(() => undefined);
            const cancel = formScope.getByRole('button', { name: /^(Cancel|Close)$/ }).first();
            if (await cancel.count()) await cancel.click().catch(() => undefined);
          });
          // The person would save: the submit's Keystroke-Level time counts, the machine time does not exist.
          journey.steps.push({ name: 'Save (estimated)', machineMs: 0, humanSeconds: 2.55 + 0.6, calls: 0, failed: [], shownErrors: [] });
        }
      } else {
        await journey.step('Read the result', ['click'], async () => {
          await page.waitForTimeout(300);
        });
      }
      const result = journey.result();
      results.push(result);
      console.log(`${result.id} ${result.verdict} human ${result.humanSeconds}s machine ${result.machineSeconds}s target ${result.targetSeconds}s${result.blockers.length ? ` — ${result.blockers[0]}` : ''}`);
      expect(result.steps.length).toBeGreaterThan(0);
    });
  }
});

export { journeyMode };
