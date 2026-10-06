/**
 * WI-OI-120 (U28a): the UAT screen inventory. Signed in as the owner's tenant administrator, it opens every screen of
 * the web application, records what each one does, and writes a board the owner keeps open while testing by hand:
 * test-results/uat-screen-inventory/index.html.
 *
 * For each screen it records:
 * - the outcome;
 * - every failed /api call, with its status and the server's message;
 * - browser errors;
 * - any "not connected", "unsupported" or "not available" message;
 * - a screenshot.
 *
 * It only reads screens; it creates no business data. The screen list comes from the application's own routes, so new
 * screens are covered automatically; screens that need a record id are listed as reachable from another screen.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { type Page, type Response, test } from '@playwright/test';
import { hasUatLogin, signInToUat, uatTenantName } from './uat-session';

const APP = join(__dirname, '../../apps/workflow-platform/app');
const OUT = join(__dirname, '../test-results/uat-screen-inventory');
const WORKFORCE_SECTIONS = ['workers', 'engagements', 'resources', 'jobs', 'capabilities', 'availability', 'scheduling', 'time', 'attendance', 'pay', 'expenses', 'compliance', 'analytics'];

/** Every page route of the app: `(group)` folders dropped, sign-in pages and API routes left out. */
function routes(): { visit: string[]; needsRecord: string[] } {
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry === 'api' || entry === '(auth)') continue;
        walk(path);
      } else if (entry === 'page.tsx') {
        const route = `/${relative(APP, directory).split('/').filter((part) => !/^\(.*\)$/.test(part)).join('/')}`;
        found.push(route === '/' ? '/' : route.replace(/\/$/, ''));
      }
    }
  };
  walk(APP);
  const visit = found.filter((route) => !route.includes('['));
  const needsRecord = found.filter((route) => route.includes('[') && !route.startsWith('/gigaops/['));
  visit.push(...WORKFORCE_SECTIONS.map((section) => `/gigaops/${section}`));
  return { visit: [...new Set(visit)].sort(), needsRecord: needsRecord.sort() };
}

type Outcome = 'WORKS' | 'NOT BUILT' | 'BROKEN' | 'CRASHES' | 'NO ACCESS' | 'NOT FOUND' | 'NO DATA CALLS';

interface ScreenResult {
  readonly route: string;
  readonly outcome: Outcome;
  readonly heading: string;
  readonly failedCalls: readonly string[];
  readonly errors: readonly string[];
  readonly messages: readonly string[];
  readonly dataCalls: number;
  readonly screenshot: string;
  readonly finalUrl: string;
}

const MARKERS = [
  /Unsupported [A-Za-z &-]+ route\.?/g,
  /requires a credential-free loopback [A-Z_]+ origin\.?/g,
  /This window is not available/g,
  /[A-Z][^.\n]{0,80} (?:is|are) not connected yet/g,
  /[A-Z][^.\n]{0,80} is not connected/g,
  /Could not load [^.\n]{0,80}/g,
  /Application error: a client-side exception has occurred/g,
  /service (?:is )?(?:temporarily )?unavailable/gi,
  /This page could not be found/g,
];

const within = <T,>(promise: Promise<T>, ms: number, fallback: T) =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

async function message(response: Response): Promise<string> {
  // A failed answer that streams forever must not stop the walk.
  const text = await within(response.text().catch(() => ''), 3000, '');
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const nested = body.message && typeof body.message === 'object' ? (body.message as Record<string, unknown>) : body;
    return String(nested.message ?? body.title ?? body.detail ?? body.code ?? '').slice(0, 160);
  } catch {
    return text.slice(0, 120);
  }
}

async function inspect(page: Page, route: string, index: number): Promise<ScreenResult> {
  const failed: string[] = [];
  const errors: string[] = [];
  let dataCalls = 0;
  const pending: Promise<void>[] = [];
  const onResponse = (response: Response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/health')) return;
    dataCalls += 1;
    if (response.status() >= 400) {
      pending.push(message(response).then((text) => void failed.push(`${response.request().method()} ${url.pathname} → ${response.status()}${text ? ` ${text}` : ''}`)));
    }
  };
  const onPageError = (error: Error) => void errors.push(error.message.slice(0, 200));
  const onConsole = (entry: { type(): string; text(): string }) => {
    if (entry.type() === 'error' && !/Failed to load resource/.test(entry.text())) errors.push(entry.text().slice(0, 200));
  };
  page.on('response', onResponse);
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  let status = 0;
  try {
    status = (await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 }))?.status() ?? 0;
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  } catch (error) {
    errors.push(`Navigation: ${(error as Error).message.slice(0, 160)}`);
  }
  await within(Promise.all(pending), 5000, []);
  page.off('response', onResponse);
  page.off('pageerror', onPageError);
  page.off('console', onConsole);

  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const messages = [...new Set(MARKERS.flatMap((marker) => [...text.matchAll(marker)].map((match) => match[0].trim())))];
  const heading = ((await page.locator('h1').first().textContent({ timeout: 1000 }).catch(() => '')) ?? '').trim().slice(0, 120);
  const notice = (await page.locator('#capability-unavailable').count()) > 0;
  const finalUrl = new URL(page.url()).pathname;
  const screenshot = `shots/${String(index).padStart(3, '0')}${route.replace(/[^a-z0-9]+/gi, '-')}.png`;
  await page.screenshot({ path: join(OUT, screenshot), fullPage: false, timeout: 10000 }).catch(() => undefined);

  let outcome: Outcome = 'WORKS';
  if (finalUrl.startsWith('/login') || finalUrl.startsWith('/select-tenant') || status === 403) outcome = 'NO ACCESS';
  else if (status === 404 || messages.some((m) => m.startsWith('This page could not be found'))) outcome = 'NOT FOUND';
  else if (messages.some((m) => m.startsWith('Application error')) || errors.some((e) => !e.startsWith('Navigation'))) outcome = 'CRASHES';
  else if (failed.length > 0 || messages.some((m) => !/not connected/.test(m))) outcome = 'BROKEN';
  else if (notice || messages.length > 0) outcome = 'NOT BUILT';
  else if (dataCalls === 0) outcome = 'NO DATA CALLS';
  return { route, outcome, heading, failedCalls: failed, errors, messages, dataCalls, screenshot, finalUrl };
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A failed call seen on at least half of the screens (the app shell's, not the screen's), as `METHOD path → status`. */
function appWide(results: readonly ScreenResult[]): Set<string> {
  const signature = (call: string) => call.replace(/ → (\d+).*$/, ' → $1');
  const seen = new Map<string, number>();
  for (const result of results) for (const call of new Set(result.failedCalls.map(signature))) seen.set(call, (seen.get(call) ?? 0) + 1);
  return new Set([...seen].filter(([, count]) => results.length >= 6 && count >= results.length / 2).map(([call]) => call));
}

/** The screen's outcome once app-wide failures are set aside. */
function reclassify(result: ScreenResult, shell: Set<string>): ScreenResult {
  const own = result.failedCalls.filter((call) => !shell.has(call.replace(/ → (\d+).*$/, ' → $1')));
  if (result.outcome !== 'BROKEN' || own.length > 0 || result.messages.some((m) => !/not connected|loopback/.test(m))) return { ...result, failedCalls: own };
  const notice = result.messages.some((m) => /not connected/.test(m));
  return { ...result, failedCalls: own, outcome: notice ? 'NOT BUILT' : result.dataCalls > own.length ? 'WORKS' : 'NO DATA CALLS' };
}

function board(all: readonly ScreenResult[], needsRecord: readonly string[], origin: string): string {
  const shell = appWide(all);
  const results = all.map((result) => reclassify(result, shell));
  const counts = results.reduce<Record<string, number>>((all, r) => ({ ...all, [r.outcome]: (all[r.outcome] ?? 0) + 1 }), {});
  const order: Outcome[] = ['CRASHES', 'BROKEN', 'NO ACCESS', 'NOT FOUND', 'NO DATA CALLS', 'NOT BUILT', 'WORKS'];
  const tone: Record<Outcome, string> = {
    CRASHES: 'bad', BROKEN: 'bad', 'NO ACCESS': 'warn', 'NOT FOUND': 'warn', 'NO DATA CALLS': 'warn', 'NOT BUILT': 'info', WORKS: 'good',
  };
  const rows = [...results]
    .sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome) || a.route.localeCompare(b.route))
    .map((r) => {
      const detail = [...r.messages, ...r.failedCalls, ...r.errors].map((line) => `<li>${escape(line)}</li>`).join('');
      return `<tr data-route="${escape(r.route)}" data-outcome="${r.outcome}">
  <td><a href="${escape(origin + r.route)}" target="uat">${escape(r.route)}</a><div class="muted">${escape(r.heading)}</div></td>
  <td><span class="pill ${tone[r.outcome]}">${r.outcome}</span><div class="muted">${r.dataCalls} data calls</div></td>
  <td>${detail ? `<ul>${detail}</ul>` : '<span class="muted">—</span>'}</td>
  <td><a href="${escape(r.screenshot)}" target="_blank"><img src="${escape(r.screenshot)}" alt="" loading="lazy"></a></td>
  <td><select class="mine"><option value="">—</option><option>Pass</option><option>Fail</option><option>Blocked</option></select>
      <textarea class="note" placeholder="Your notes"></textarea></td>
</tr>`;
    })
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UAT screen board</title>
<style>
:root{--bg:#f7f7f8;--fg:#18181b;--muted:#71717a;--line:#e4e4e7;--card:#fff;--good:#15803d;--bad:#b91c1c;--warn:#a16207;--info:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f11;--fg:#f4f4f5;--muted:#a1a1aa;--line:#27272a;--card:#18181b;--good:#4ade80;--bad:#f87171;--warn:#facc15;--info:#60a5fa}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
main{max-width:1400px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0 0 4px}.muted{color:var(--muted);font-size:12px}
.summary{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.summary button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:4px 10px;cursor:pointer}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}
td{border-top:1px solid var(--line);padding:8px;vertical-align:top}
td ul{margin:0;padding-left:16px}img{width:180px;border:1px solid var(--line);border-radius:4px}
.pill{font-weight:600;font-size:12px}.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}.info{color:var(--info)}
textarea{width:100%;min-height:48px;margin-top:4px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:4px}
select{background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:4px}
@media (max-width:800px){td:nth-child(4){display:none}}
</style></head><body><main>
<h1>UAT screen board</h1>
<div class="muted">Tenant ${escape(uatTenantName)} · ${escape(origin)} · walked ${escape(new Date().toISOString())} · ${results.length} screens. Your Pass/Fail and notes stay in this browser.</div>
${shell.size ? `<p><strong>App-wide failures</strong> (seen on most screens, so not repeated per screen):</p><ul>${[...shell].map((call) => `<li>${escape(call)}</li>`).join('')}</ul>` : ''}
<div class="summary"><button data-filter="">All ${results.length}</button>${order
    .filter((o) => counts[o])
    .map((o) => `<button data-filter="${o}"><span class="pill ${tone[o]}">${o}</span> ${counts[o]}</button>`)
    .join('')}</div>
<table><tbody>
${rows}
</tbody></table>
<h2 style="font-size:16px">Screens that open from a record</h2>
<p class="muted">${needsRecord.map(escape).join(' · ')}</p>
</main>
<script>
const key = (route, kind) => 'uat-board:' + kind + ':' + route;
for (const row of document.querySelectorAll('tr[data-route]')) {
  const route = row.dataset.route; const mine = row.querySelector('.mine'); const note = row.querySelector('.note');
  try { mine.value = localStorage.getItem(key(route, 'result')) || ''; note.value = localStorage.getItem(key(route, 'note')) || ''; } catch {}
  mine.addEventListener('change', () => { try { localStorage.setItem(key(route, 'result'), mine.value); } catch {} });
  note.addEventListener('input', () => { try { localStorage.setItem(key(route, 'note'), note.value); } catch {} });
}
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
  for (const row of document.querySelectorAll('tr[data-route]')) row.hidden = Boolean(button.dataset.filter) && row.dataset.outcome !== button.dataset.filter;
});
</script></body></html>`;
}

test.describe('UAT screen inventory', () => {
  test.skip(!hasUatLogin, 'Set E2E_UAT_ADMIN_EMAIL and E2E_UAT_ADMIN_PASSWORD (run e2e/run-uat-walkthrough.sh).');

  test('every screen, as the tenant administrator', async ({ page, baseURL }) => {
    test.setTimeout(30 * 60 * 1000);
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5180').origin;
    mkdirSync(join(OUT, 'shots'), { recursive: true });
    await signInToUat(page, origin);
    const { visit, needsRecord } = routes();
    const results: ScreenResult[] = [];
    for (const [index, route] of visit.entries()) {
      const result = await within(inspect(page, route, index), 60000, {
        route, outcome: 'BROKEN' as Outcome, heading: '', failedCalls: [], errors: ['The screen did not finish loading within 60 seconds.'], messages: [], dataCalls: 0, screenshot: '', finalUrl: route,
      });
      results.push(result);
      console.log(`${result.outcome.padEnd(13)} ${route}${result.failedCalls[0] ? `  ${result.failedCalls[0]}` : result.messages[0] ? `  ${result.messages[0]}` : ''}`);
      writeFileSync(join(OUT, 'results.json'), JSON.stringify({ origin, tenant: uatTenantName, results, needsRecord }, null, 2));
      writeFileSync(join(OUT, 'index.html'), board(results, needsRecord, origin));
    }
  });
});
