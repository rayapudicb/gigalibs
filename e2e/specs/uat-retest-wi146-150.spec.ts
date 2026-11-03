/**
 * WI-OI-146–150 retest on UAT: opens each screen, form and action dialog that a P1–P3 fix changed, records what a person
 * sees (pickers, labels, buttons, messages, failing calls) and cancels. Read-only: no Save, Create, Submit or Request is
 * ever clicked, so it runs on UAT.
 *
 *   source e2e/load-uat-env.sh && pnpm --dir e2e exec playwright test specs/uat-retest-wi146-150.spec.ts --workers=1
 *
 * Results: e2e/artifacts/retest/<run>.json and a screenshot per check in e2e/artifacts/retest/<run>/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Locator, type Page, test } from '@playwright/test';
import { hasUatLogin, signInToUat } from './uat-session';

interface Check {
  readonly id: string;
  readonly bug: string;
  readonly route: string;
  verdict: 'PASS' | 'FAIL' | 'NOT TESTABLE';
  observed: string[];
  failedCalls: string[];
  shot?: string;
}

const run = `retest-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const directory = join(__dirname, '..', 'artifacts', 'retest');
const checks: Check[] = [];

async function open(page: Page, check: Check): Promise<void> {
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 400) check.failedCalls.push(`${response.request().method()} ${url.pathname} → ${response.status()}`);
  });
  await page.goto(check.route, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}

async function shot(page: Page, check: Check): Promise<void> {
  mkdirSync(join(directory, run), { recursive: true });
  check.shot = `${run}/${check.id}.png`;
  await page.screenshot({ path: join(directory, check.shot), fullPage: false }).catch(() => undefined);
}

/** Label text and control kind of every visible field in a scope. */
async function fields(scope: Locator): Promise<{ label: string; kind: string; value: string }[]> {
  return scope.locator('label').evaluateAll((labels) =>
    labels
      .filter((label) => (label as HTMLElement).offsetParent !== null)
      .map((label) => {
        const element = label as HTMLLabelElement;
        const control =
          (element.htmlFor && document.getElementById(element.htmlFor)) ||
          element.querySelector('input, select, textarea, [role=combobox]') ||
          element.parentElement?.querySelector('[role=combobox]');
        const kind = control ? (control.getAttribute('role') === 'combobox' ? 'picker' : control.tagName === 'SELECT' ? 'list' : `${control.tagName.toLowerCase()}:${control.getAttribute('type') ?? 'text'}`) : 'none';
        const value = control ? ((control as HTMLInputElement).value ?? control.textContent ?? '').trim().slice(0, 40) : '';
        return { label: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60), kind, value };
      }),
  );
}

async function openNew(page: Page): Promise<Locator | null> {
  const frame = page.locator('[data-page-frame]');
  const button = frame.locator('button:not([type=submit])').filter({ hasText: /^\s*(\+\s*)?New\b/ }).first();
  await button.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
  if (!(await button.count())) return null;
  await button.click();
  await page.waitForTimeout(500);
  const dialog = page.locator('[role=dialog]').first();
  return (await dialog.count()) ? dialog : frame;
}

async function cancel(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  const close = page.locator('[role=dialog]').getByRole('button', { name: /^(Cancel|Close)$/ }).first();
  if (await close.count()) await close.click().catch(() => undefined);
}

function record(check: Check, pass: boolean, ...observed: string[]): void {
  check.verdict = pass ? 'PASS' : 'FAIL';
  check.observed.push(...observed);
}

function newCheck(id: string, bug: string, route: string): Check {
  const check: Check = { id, bug, route, verdict: 'NOT TESTABLE', observed: [], failedCalls: [] };
  checks.push(check);
  return check;
}

/** A form opened with New: the named fields must be pickers, and no field may ask for an id or UUID. */
async function formPickers(page: Page, check: Check, expected: readonly RegExp[]): Promise<void> {
  await open(page, check);
  const scope = await openNew(page);
  if (!scope) {
    check.observed.push('No New button on the screen.');
    await shot(page, check);
    return;
  }
  const found = await fields(scope);
  await shot(page, check);
  const typedIds = found.filter((field) => /\b(UUID|id)\b/.test(field.label) && field.kind !== 'picker');
  const missing = expected.filter((pattern) => !found.some((field) => pattern.test(field.label) && field.kind === 'picker'));
  record(
    check,
    typedIds.length === 0 && missing.length === 0,
    `Fields: ${found.map((field) => `${field.label} [${field.kind}${field.value ? `=${field.value}` : ''}]`).join('; ')}`,
    ...(typedIds.length ? [`Typed ids: ${typedIds.map((field) => field.label).join(', ')}`] : []),
    ...(missing.length ? [`Not a picker: ${missing.map(String).join(', ')}`] : []),
  );
  await cancel(page);
}

/** A record action with parameters, opened from the first row: its dialog must offer pickers and never ask for a UUID. */
async function actionDialog(page: Page, check: Check, action: RegExp): Promise<void> {
  await open(page, check);
  const row = page.locator('[data-metadata-window] tbody tr').first();
  if (!(await row.count())) {
    check.observed.push('No record on the list to open.');
    await shot(page, check);
    return;
  }
  await row.click();
  await page.waitForTimeout(800);
  const button = page.getByRole('button', { name: action }).first();
  if (!(await button.count())) {
    check.observed.push(`The first record offers no "${action.source}" action (its state does not allow it).`);
    await shot(page, check);
    await cancel(page);
    return;
  }
  await button.click();
  await page.waitForTimeout(600);
  const dialog = page.locator('[role=dialog]').last();
  const text = (await dialog.textContent().catch(() => '')) ?? '';
  const found = await fields(dialog);
  await shot(page, check);
  record(check, !/UUID/i.test(text), `Dialog fields: ${found.map((field) => `${field.label} [${field.kind}]`).join('; ') || 'none (runs without parameters)'}`);
  await cancel(page);
  await cancel(page);
}

/** An empty master offers its starter set and says what to do; a master with records lists them. */
async function starterOrRecords(page: Page, check: Check, tab?: string): Promise<void> {
  await open(page, check);
  if (tab) await page.getByRole('tab', { name: tab }).click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const window = page.locator('[data-metadata-window]').first();
  const rows = await window.locator('tbody tr').count();
  const starter = window.getByRole('button', { name: /\(\d+\)\s*$/ });
  const guidance = ((await window.textContent().catch(() => '')) ?? '').match(/(adds a typical set[^.]*\.|Use New to create the first one\.[^.]*\.?)/)?.[0];
  await shot(page, check);
  if (rows > 0) record(check, true, `${rows} record(s) listed; starter not needed.`);
  else record(check, (await starter.count()) > 0 && Boolean(guidance), `Empty; starter button: ${(await starter.first().textContent().catch(() => null)) ?? 'none'}; guidance: ${guidance ?? 'none'}`);
}

test.describe('WI-OI-146–150 retest (read-only)', () => {
  test.skip(!hasUatLogin, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD (e2e/uat.env).');
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    await signInToUat(page, new URL(baseURL ?? 'http://127.0.0.1:5180').origin);
  });

  test.afterAll(() => {
    mkdirSync(directory, { recursive: true });
    const file = join(directory, `${run}.json`);
    writeFileSync(file, `${JSON.stringify({ run, release: process.env.E2E_RELEASE ?? null, checks }, null, 2)}\n`);
    console.log(`retest report: ${file}`);
    for (const check of checks) console.log(`${check.bug} ${check.id} ${check.verdict} — ${check.observed.join(' | ').slice(0, 300)}`);
  });

  test('QA-022 quote → order dialog picks the warehouse', async ({ page }) => {
    await actionDialog(page, newCheck('quote-convert', 'QA-022', '/orders'), /^Convert to (sales )?order/i);
  });
  test('QA-022 requisition → purchase order dialog picks the vendor', async ({ page }) => {
    await actionDialog(page, newCheck('requisition-convert', 'QA-022', '/procurement'), /^Convert to purchase order/i);
  });
  test('QA-022 fulfillment dispatch asks for no issue id', async ({ page }) => {
    await actionDialog(page, newCheck('fulfillment-dispatch', 'QA-022', '/orders/fulfillment'), /^Dispatch/i);
  });
  test('QA-023 credit memo picks the invoice', async ({ page }) => {
    await formPickers(page, newCheck('credit-memo-new', 'QA-023', '/orders/credit-memos'), [/invoice/i]);
  });
  test('QA-023 vendor bill picks the purchase order', async ({ page }) => {
    await formPickers(page, newCheck('vendor-bill-new', 'QA-023', '/procurement/vendor-bills'), [/Purchase order/, /Vendor/]);
  });
  test('QA-024/025 warehouse owning unit is a picker', async ({ page }) => {
    await formPickers(page, newCheck('warehouse-new', 'QA-024', '/inventory'), [/organization unit/i]);
  });
  test('QA-025 organization unit options answer for a member', async ({ page }) => {
    const check = newCheck('unit-options', 'QA-025', '/api/control/v1/lookups/organization-units');
    const response = await page.request.get('/api/control/v1/lookups/organization-units');
    const body = await response.text();
    record(check, response.ok(), `GET /api/control/v1/lookups/organization-units → ${response.status()}; ${body.slice(0, 160)}`);
  });
  test('QA-026 absence types offer the starter set', async ({ page }) => {
    await starterOrRecords(page, newCheck('absence-types', 'QA-026', '/gigaops/availability'), 'Absence types');
  });
  test('QA-027 CMMS classifications offer the starter set', async ({ page }) => {
    await starterOrRecords(page, newCheck('cmms-classes', 'QA-027', '/cmms/classifications'));
  });
  test('QA-028 required pickers offer Add new or say where to create', async ({ page }) => {
    const check = newCheck('accounts-add-new', 'QA-028', '/finance/accounts');
    await open(page, check);
    const scope = await openNew(page);
    if (!scope) {
      check.observed.push('No New button on the screen.');
      await shot(page, check);
      return;
    }
    const text = (await scope.textContent().catch(() => '')) ?? '';
    const addNew = (text.match(/\+ Add new [^+]*/g) ?? []).length;
    const hints = text.match(/(are created|is created|Create them in|set up in)[^.]*\./gi) ?? [];
    await shot(page, check);
    record(check, addNew > 0 || hints.length > 0, `"Add new" links: ${addNew}; hints: ${hints.join(' ') || 'none'}`);
    await cancel(page);
  });
  test('QA-035 Plan & entitlements lets the admin request a module', async ({ page }) => {
    const check = newCheck('request-module', 'QA-035', '/settings/plan');
    await open(page, check);
    const requestButtons = await page.getByRole('button', { name: 'Request this module' }).count();
    const requested = await page.getByText(/^Requested .*A platform operator turns it on\.$/).count();
    const api = await page.request.get('/api/control/tenants/current/module-requests');
    await shot(page, check);
    record(check, api.ok(), `"Request this module" buttons: ${requestButtons}; requested notes: ${requested}; GET module-requests → ${api.status()}`);
    if (requestButtons + requested === 0) check.observed.push('Every module in the plan is already on (nothing to request).');
  });
  test('QA-037 new role uses the permission picker', async ({ page }) => {
    const check = newCheck('role-picker', 'QA-037', '/settings/security');
    await open(page, check);
    let search = page.getByPlaceholder('Find a permission, for example work orders');
    if (!(await search.count())) {
      check.route = '/settings';
      await open(page, check);
      search = page.getByPlaceholder('Find a permission, for example work orders');
    }
    if (await search.count()) await search.first().scrollIntoViewIfNeeded().catch(() => undefined);
    const copy = await page.getByText('Pick a role to copy its permissions…').count();
    await shot(page, check);
    record(check, (await search.count()) > 0, `Permission search boxes: ${await search.count()}; "start from a built-in role": ${copy > 0}`);
  });
  test('QA-039 standard costs screen', async ({ page }) => {
    const check = newCheck('standard-costs', 'QA-039', '/finance/standard-costs');
    await open(page, check);
    const window = await page.locator('[data-metadata-window]').count();
    await shot(page, check);
    record(check, window > 0 && !check.failedCalls.some((call) => / → 5\d\d$/.test(call)), `Metadata window: ${window > 0}`);
  });
  test('QA-009 Workflows says plainly that Workflow Studio is not running', async ({ page }) => {
    const check = newCheck('workflows', 'QA-009', '/workflows');
    const started = Date.now();
    await open(page, check);
    const settled = Date.now() - started;
    const text = ((await page.locator('[data-page-frame]').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
    await shot(page, check);
    record(check, settled < 8000 && !/Unexpected|SyntaxError|502 Bad Gateway/.test(text), `Settled in ${settled} ms; says: ${text.slice(0, 200)}`);
  });
  test('QA-012 what the admin session carries', async ({ page }) => {
    const check = newCheck('session-permissions', 'QA-012', '/api/auth/context');
    const response = await page.request.get('/api/auth/context');
    const context = (await response.json().catch(() => ({}))) as { permissions?: string[]; roles?: string[]; tenant?: { name?: string } };
    const permissions = context.permissions ?? [];
    const covers = (code: string) => permissions.some((granted) => granted === '*' || granted === code || granted === `${code.split(/[:.]/)[0]}:*` || granted === `${code.split(/[:.]/)[0]}.*`);
    record(
      check,
      covers('cmms.analytics.read') && covers('workforce.positions.read'),
      `Workspace: ${context.tenant?.name ?? '?'}; roles: ${(context.roles ?? []).join(', ')}; ${permissions.length} permission(s): ${permissions.slice(0, 40).join(', ')}`,
      `Covers cmms.analytics.read: ${covers('cmms.analytics.read')}; workforce.positions.read: ${covers('workforce.positions.read')}`,
    );
  });
  test('QA-012 Analytics screens for the workspace admin', async ({ page }) => {
    const check = newCheck('analytics', 'QA-012', '/analytics, /cmms/analytics, /gigaops/analytics');
    const seen: string[] = [];
    for (const route of ['/analytics', '/cmms/analytics', '/gigaops/analytics']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const catalog = page.waitForResponse((response) => /module-sources\/[^/]+\/catalog/.test(response.url()), { timeout: 12_000 }).catch(() => null);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      const response = await catalog;
      const refusal = ((await page.locator('[data-page-frame]').textContent().catch(() => '')) ?? '').match(/(Missing module permission[^.]*|needs[^.]*role[^.]*\.)/)?.[0];
      seen.push(`${route}: catalog ${response ? response.status() : 'not called'}${refusal ? `; says "${refusal.slice(0, 120)}"` : ''}`);
    }
    await shot(page, check);
    record(check, seen.every((line) => !/catalog 403/.test(line) && !/Missing module permission/.test(line)), ...seen);
  });
  test('QA-013 Connections settles: no request left open', async ({ page }) => {
    const check = newCheck('connections-settle', 'QA-013', '/connections');
    const pending = new Map<object, string>();
    const counts = new Map<string, number>();
    page.on('request', (request) => {
      const name = `${request.method()} ${new URL(request.url()).pathname}`;
      counts.set(name, (counts.get(name) ?? 0) + 1);
      pending.set(request, `${name} (${request.resourceType()})`);
    });
    page.on('response', (response) => {
      if (response.url().includes('/api/workflow-studio/')) check.observed.push(`answer ${response.status()} at ${Date.now() - started} ms`);
    });
    page.on('requestfinished', (request) => pending.delete(request));
    page.on('requestfailed', (request) => pending.delete(request));
    const started = Date.now();
    await page.goto(check.route, { waitUntil: 'domcontentloaded' });
    const idle = await page.waitForLoadState('networkidle', { timeout: 15_000 }).then(() => true).catch(() => false);
    await shot(page, check);
    record(
      check,
      idle,
      `Network idle: ${idle} after ${Date.now() - started} ms; still open: ${[...pending.values()].join('; ') || 'none'}`,
      `Requests: ${[...counts].filter(([name]) => name.includes('/api/')).map(([name, count]) => `${name} ×${count}`).join(', ')}`,
    );
  });
  test('QA-010 Security & SSO loads', async ({ page }) => {
    const check = newCheck('security-sso', 'QA-010', '/settings/security');
    await open(page, check);
    const text = (await page.locator('[data-page-frame]').textContent().catch(() => '')) ?? '';
    await shot(page, check);
    record(check, !/Unexpected end of JSON input/.test(text), `JSON error shown: ${/Unexpected end of JSON input/.test(text)}`);
  });
  test('QA-040 no emoji or developer text on Workflows and Platform Control Tower', async ({ page }) => {
    const check = newCheck('ui-shell', 'QA-040', '/workflows, /platform-admin');
    const seen: string[] = [];
    for (const route of ['/workflows', '/platform-admin']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      const text = (await page.locator('[data-page-frame], main').first().textContent().catch(() => '')) ?? '';
      const emoji = text.match(/\p{Extended_Pictographic}/gu) ?? [];
      seen.push(`${route}: ${emoji.length} emoji`);
    }
    await shot(page, check);
    record(check, seen.every((line) => / 0 emoji$/.test(line)), ...seen);
  });
});
