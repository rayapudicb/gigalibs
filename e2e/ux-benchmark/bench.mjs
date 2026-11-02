// Read-only UX benchmark of the live UAT (5180): every screen in the sidebar and Settings sidebar, load timings, API
// failures, empty and error states, list size, the New form's size (opened, measured, closed with Escape; never
// submitted), and how many options each picker's master list returns. Nothing is created or changed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const OUT = process.argv[2];
mkdirSync(`${OUT}/shots`, { recursive: true });
const base = process.env.UX_BENCH_BASE_URL ?? 'http://127.0.0.1:5180';
const admin = { email: process.env.E2E_UAT_ADMIN_EMAIL ?? '', password: process.env.E2E_UAT_ADMIN_PASSWORD ?? '' };
const statics = JSON.parse(readFileSync(`${OUT}/static.json`, 'utf8'));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: base });
const page = await context.newPage();
const login = await page.request.post('/api/auth/login', { data: admin, headers: { Origin: base } });
if (login.status() !== 200) throw new Error(`login ${login.status()}`);
const tenants = await (await page.request.get('/api/auth/tenants')).json();
const tenant = (Array.isArray(tenants) ? tenants : tenants.items ?? tenants.tenants ?? []).map((t) => t.tenant ?? t)
  .find((t) => t.name?.toLowerCase() === 'gigalibs global enterprise');
await page.request.post('/api/auth/select-tenant', { data: { tenantId: tenant.id }, headers: { Origin: base } });

let calls = [];
page.on('requestfinished', async (request) => {
  const url = new URL(request.url());
  if (url.origin !== base || !url.pathname.startsWith('/api/')) return;
  const response = await request.response().catch(() => null);
  const timing = request.timing();
  calls.push({ path: `${request.method()} ${url.pathname}`, status: response?.status() ?? 0, ms: Math.round(timing.responseEnd > 0 ? timing.responseEnd : 0) });
});
page.on('requestfailed', (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith('/api/')) calls.push({ path: `${request.method()} ${url.pathname}`, status: -1, ms: 0 });
});

// Routes: what the person can actually reach, read from the live sidebars and tab bars.
async function hrefs(selector) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel)].map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/')), selector);
}
await page.goto('/modules'); await page.waitForLoadState('networkidle').catch(() => {});
for (const toggle of await page.locator('aside button[aria-label^="Expand "]').all()) await toggle.click().catch(() => {});
let routes = await hrefs('aside nav a');
await page.goto('/settings'); await page.waitForLoadState('networkidle').catch(() => {});
routes.push(...(await hrefs('aside nav a')));
const moduleRoots = [...new Set(routes)];
for (const route of moduleRoots.slice()) {
  await page.goto(route).catch(() => {}); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  routes.push(...(await hrefs('[data-module-tab-bar] nav a')));
}
routes = [...new Set(routes)].filter((r) => !r.startsWith('/select-tenant'));
console.log(`${routes.length} screens`);

const results = [];
for (const route of routes) {
  calls = [];
  const t0 = Date.now();
  let status = 0;
  try { status = (await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 }))?.status() ?? 0; } catch { status = -1; }
  const domMs = Date.now() - t0;
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const frame = document.querySelector('[data-page-frame]') ?? document.querySelector('main') ?? document.body;
    const text = (frame.innerText || '').replace(/\s+/g, ' ');
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const alerts = [...frame.querySelectorAll('[role=alert], .text-ui-fg-error')].filter(visible).map((el) => el.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const empty = text.match(/No records yet|Nothing here|No [^.]{0,40} yet|nothing to show|Nothing (isolated|is waiting)|No [^.]{0,30} found|not set up[^.]*|0 matching/i)?.[0] ?? null;
    const buttons = [...new Set([...frame.querySelectorAll('button, a[role=button]')].filter(visible).map((b) => b.innerText.replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 40))].slice(0, 14);
    const bar = [...document.querySelectorAll('#module-page-actions button, #module-page-actions a')].map((b) => b.innerText.trim()).filter(Boolean);
    return {
      crumb: document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText.replace(/\s+/g, ' ') ?? '',
      tabs: document.querySelectorAll('[data-module-tab-bar] nav a').length,
      viewTabs: frame.querySelectorAll('[role=tab]').length,
      rows: frame.querySelectorAll('table tbody tr').length,
      alerts: alerts.slice(0, 3),
      empty,
      search: !!frame.querySelector('input[placeholder="Search"], input[aria-label^="Search"]'),
      buttons: [...bar, ...buttons],
      fieldsOnPage: [...frame.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')].filter(visible).length,
      textLength: text.length,
    };
  }).catch(() => ({}));
  // The New form: open, measure, close. Only a non-submit button whose text starts with "New".
  let form = null;
  const newButton = page.locator('[data-page-frame] button:not([type=submit])').filter({ hasText: /^\s*(\+\s*)?New\b/ }).first();
  if (await newButton.count()) {
    const before = await page.evaluate(() => document.querySelectorAll('input, select, textarea').length);
    const t1 = Date.now();
    await newButton.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(900);
    const openMs = Date.now() - t1;
    form = await page.evaluate((beforeCount) => {
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const scope = document.querySelector('[role=dialog]') ?? document.querySelector('[data-page-frame]') ?? document.body;
      const controls = [...scope.querySelectorAll('input:not([type=hidden]), select, textarea, [role=combobox]')].filter(visible);
      const labelFor = (el) => (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest('label')?.innerText || el.getAttribute('aria-label') || '';
      const required = controls.filter((el) => el.required || el.getAttribute('aria-required') === 'true' || /\*\s*$/.test(labelFor(el).trim()));
      const pickers = controls.filter((el) => el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') || el.hasAttribute('list'));
      return {
        dialog: !!document.querySelector('[role=dialog]'),
        controls: controls.length, required: required.length, pickers: pickers.length,
        selects: controls.filter((el) => el.tagName === 'SELECT').length,
        dates: controls.filter((el) => /date|time/.test(el.type)).length,
        labels: controls.slice(0, 30).map((el) => labelFor(el).replace(/\s+/g, ' ').trim()).filter(Boolean),
        grew: document.querySelectorAll('input, select, textarea').length - beforeCount,
      };
    }, before).catch(() => null);
    if (form) form.openMs = openMs;
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    const close = page.locator('[role=dialog] button').filter({ hasText: /^(Close|Cancel)$/ }).first();
    if (await close.count()) await close.click().catch(() => {});
  }
  const name = route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'root';
  await page.screenshot({ path: `${OUT}/shots/${name}.png` }).catch(() => {});
  const failed = calls.filter((c) => c.status >= 400 || c.status === -1);
  const slowest = [...calls].sort((a, b) => b.ms - a.ms)[0] ?? null;
  results.push({ route, status, domMs, readyMs, calls: calls.length, failed: [...new Set(failed.map((c) => `${c.path} → ${c.status}`))], slowest, ...state, form });
  writeFileSync(`${OUT}/live.json`, JSON.stringify(results, null, 1));
  console.log(`${String(readyMs).padStart(6)}ms ${route} rows=${state.rows ?? '-'} fail=${failed.length}${form ? ` form=${form.controls}/${form.required}req/${form.pickers}pick` : ''}`);
}

// Master data behind every picker: how many options each lookup returns for this workspace.
const bases = ['/api/control', '/api/universal-inventory', '/api/product-catalogue', '/api/financial-operations', '/api/universal-orders',
  '/api/universal-procurement', '/api/workforce', '/api/cmms', '/api/speed', '/api/business-partners'];
const moduleBase = { 'universal-inventory': '/api/universal-inventory', 'product-catalogue': '/api/product-catalogue', 'financial-operations': '/api/financial-operations',
  'universal-orders': '/api/universal-orders', 'universal-procurement': '/api/universal-procurement', gigaops: '/api/workforce',
  'physical-operations-cmms': '/api/cmms', 'process-safety-screening': '/api/speed' };
const resolvers = new Map();
for (const w of statics) for (const p of w.pickers) if (p.resolver) resolvers.set(p.resolver, w.module);
const lookups = {};
for (const [resolver, module] of resolvers) {
  const candidates = [...new Set([['workspace-members', 'organization-units', 'workspace-sites'].includes(resolver) ? '/api/control' : null, moduleBase[module], ...bases].filter(Boolean))];
  for (const b of candidates) {
    const response = await page.request.get(`${b}/v1/lookups/${resolver}?search=`).catch(() => null);
    if (!response) continue;
    const body = await response.json().catch(() => null);
    if (response.status() === 200 && Array.isArray(body)) { lookups[resolver] = { base: b, options: body.length }; break; }
    if (!lookups[resolver]) lookups[resolver] = { base: b, status: response.status() };
  }
}
writeFileSync(`${OUT}/lookups.json`, JSON.stringify(lookups, null, 1));
console.log('lookups', JSON.stringify(lookups));
await browser.close();
