/**
 * Milestone A retest on UAT (queue item 4a, release bd852946): the Master data area (WI-OI-152), the platform reference
 * sets and the workspace profile (WI-OI-153), and the Products standard-units button. Read-only: it opens screens and
 * reads answers; nothing is clicked that saves, so it runs on UAT.
 *
 *   source e2e/load-uat-env.sh && pnpm --dir e2e exec playwright test specs/uat-milestone-a.spec.ts --workers=1
 *
 * Results: e2e/artifacts/retest/<run>.json and a screenshot per check in e2e/artifacts/retest/<run>/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Page, type Response, test } from '@playwright/test';
import { hasUatLogin, signInToUat } from './uat-session';

interface Check {
  readonly id: string;
  readonly what: string;
  readonly route: string;
  verdict: 'PASS' | 'FAIL';
  observed: string[];
  failedCalls: string[];
  shot?: string;
}

const run = `milestone-a-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const directory = join(__dirname, '..', 'artifacts', 'retest');
const checks: Check[] = [];
// The pickers' route over the loaded reference sets (the control plane's set route is not exposed through the web).
const REFERENCE_LOOKUPS: ReadonlyArray<readonly [string, string, string]> = [
  ['platform-countries', 'India', 'IN'],
  ['platform-currencies', 'INR', 'INR'],
  ['platform-languages', 'Japanese', 'ja'],
  ['platform-time-zones', 'Asia', 'Asia/'],
];
const GROUPS = ['Organization and people', 'Products and stock', 'Customers and vendors', 'Finance', 'Assets and places', 'Reference data'];

function check(id: string, what: string, route: string): Check {
  const entry: Check = { id, what, route, verdict: 'FAIL', observed: [], failedCalls: [] };
  checks.push(entry);
  return entry;
}

async function open(page: Page, entry: Check): Promise<void> {
  const listener = (response: Response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 400) entry.failedCalls.push(`${response.request().method()} ${url.pathname} → ${response.status()}`);
  };
  page.on('response', listener);
  await page.goto(entry.route, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  page.off('response', listener);
  mkdirSync(join(directory, run), { recursive: true });
  entry.shot = `${run}/${entry.id}.png`;
  await page.screenshot({ path: join(directory, entry.shot), fullPage: false }).catch(() => undefined);
}

async function visibleText(page: Page, text: string): Promise<boolean> {
  return page.getByText(text, { exact: false }).first().isVisible().catch(() => false);
}

test.describe('Milestone A on UAT', () => {
  test.skip(!hasUatLogin, 'Needs E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD (source e2e/load-uat-env.sh).');
  test.setTimeout(240_000);

  test('master data, reference data, workspace profile, standard units', async ({ page }) => {
    await signInToUat(page, process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://127.0.0.1:5180');

    const hub = check('MA-01', 'Master data area lists its groups with counts', '/master-data');
    await open(page, hub);
    const groups = [];
    for (const group of GROUPS) if (await visibleText(page, group)) groups.push(group);
    hub.observed.push(`groups shown: ${groups.length}/${GROUPS.length} (${groups.join(', ')})`);
    const errors = await page.getByText(/could not|failed|error/i).count();
    hub.observed.push(`error texts on the page: ${errors}`);
    hub.verdict = groups.length >= 4 && hub.failedCalls.length === 0 ? 'PASS' : 'FAIL';

    const sidebar = check('MA-02', 'Sidebar has the Master data entry', '/dashboard');
    await open(page, sidebar);
    const link = await page.locator('a[href="/master-data"]').count();
    sidebar.observed.push(`links to /master-data: ${link}`);
    sidebar.verdict = link > 0 ? 'PASS' : 'FAIL';

    const group = check('MA-03', 'Reference data group opens', '/master-data/reference-data');
    await open(page, group);
    const rows = await page.locator('tr').filter({ hasText: /Countries|Currencies|Languages|Time zones/ }).count();
    group.observed.push(`reference entries shown: ${rows}`);
    group.verdict = rows > 0 && group.failedCalls.length === 0 ? 'PASS' : 'FAIL';

    const sets = check('MA-04', 'Reference pickers answer from the loaded sets', '/api/control/v1/lookups/<key>');
    let answered = 0;
    for (const [key, search, expected] of REFERENCE_LOOKUPS) {
      const answer = await page.request.get(`/api/control/v1/lookups/${key}?search=${encodeURIComponent(search)}`);
      const text = answer.ok() ? await answer.text() : '';
      const found = text.includes(expected);
      if (found) answered += 1;
      sets.observed.push(`${key} "${search}": ${answer.status()} ${found ? `has ${expected}` : 'missing'}`);
    }
    sets.verdict = answered === REFERENCE_LOOKUPS.length ? 'PASS' : 'FAIL';

    const profile = check('MA-05', 'Workspace profile is readable by a member', '/api/control/tenants/current/profile');
    const answer = await page.request.get('/api/control/tenants/current/profile');
    const body = answer.ok() ? ((await answer.json()) as Record<string, unknown>) : {};
    profile.observed.push(`status ${answer.status()}; fields ${Object.keys(body).join(', ') || 'none'}`);
    profile.verdict = answer.ok() ? 'PASS' : 'FAIL';

    const settings = check('MA-06', 'Settings › General shows country, currency, language and time zone', '/settings/general');
    await open(page, settings);
    const labels = [];
    for (const label of ['Country', 'Currency', 'Language', 'Time zone']) if (await visibleText(page, label)) labels.push(label);
    settings.observed.push(`fields shown: ${labels.join(', ') || 'none'}`);
    settings.verdict = labels.length === 4 ? 'PASS' : 'FAIL';

    const units = check('MA-07', 'Products › Units offers the standard units (not clicked)', '/products/units');
    await open(page, units);
    const button = await page.getByRole('button', { name: /standard units/i }).count();
    units.observed.push(`standard units button: ${button}`);
    units.verdict = button > 0 ? 'PASS' : 'FAIL';

    const setup = check('MA-08', 'Set-up guide has the country step', '/setup');
    await open(page, setup);
    const step = await visibleText(page, 'ountry');
    setup.observed.push(`country step shown: ${step}`);
    setup.verdict = step ? 'PASS' : 'FAIL';

    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${run}.json`), JSON.stringify({ run, release: 'bd852946', checks }, null, 2));
    for (const entry of checks) console.log(`${entry.verdict.padEnd(5)} ${entry.id} ${entry.what} — ${entry.observed.join('; ')}${entry.failedCalls.length ? ` [failed: ${entry.failedCalls.join(', ')}]` : ''}`);
  });
});
