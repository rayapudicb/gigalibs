// Journey times by the Keystroke-Level Model (Card, Moran & Newell): M 1.35 s think, P 1.1 s point, B 0.1 s click,
// K 0.28 s per key (average typist), plus the measured screen load and save. Minimum path: required fields only.
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = process.argv[2];
const root = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const { MODULE_WINDOW_BASELINE_SOURCES: windows } = await import(`${root}/packages/contracts/dist/configuration/window-baselines.generated.js`);
const live = Object.fromEntries(JSON.parse(readFileSync(`${DIR}/live.json`, 'utf8')).map((r) => [r.route, r]));
const lookups = JSON.parse(readFileSync(`${DIR}/lookups.json`, 'utf8'));

const M = 1.35, P = 1.1, B = 0.1, K = 0.28, SAVE = 0.6;
const COST = {
  text: M + P + B + 8 * K, long: M + P + B + 25 * K, number: M + P + B + 4 * K, date: M + P + B + 10 * K,
  check: P + B, list: M + P + B + P + B, picker: M + P + B + 3 * K + 0.5 + P + B,
};
const load = (route) => (live[route]?.readyMs ?? 1500) / 1000;
const nav = (route) => M + 2 * (P + B) + load(route);
const submit = M + P + B + SAVE;

function windowForm(surface) {
  const w = windows.find((x) => x.definition.surfaceKey === surface);
  if (!w) return null;
  const dict = w.definition.dictionary;
  const refs = Object.fromEntries((dict.references ?? []).map((r) => [r.referenceKey, r]));
  // The record itself, plus its first line where a document needs lines (fields labelled "Line …"); optional child
  // sections (skills, labour, parts) are not needed to create it.
  const required = dict.fields.filter((f) => f.required && !f.readOnly && !f.isSystemLocked
    && (f.entityKey === dict.targetEntityKey || /^Line /.test(f.label)));
  let seconds = 0; const kinds = {}; const masters = [];
  for (const f of required) {
    const ref = f.referenceKey ? refs[f.referenceKey] : null;
    const kind = ref ? (ref.referenceType === 'VALUE_LIST' ? 'list' : 'picker')
      : /DATE/.test(f.type) ? 'date' : /NUMBER|DECIMAL|CURRENCY|INTEGER|PERCENT/.test(f.type) ? 'number'
      : /BOOLEAN/.test(f.type) ? 'check' : /LONG|TEXTAREA|RICH/.test(f.type) ? 'long' : 'text';
    seconds += COST[kind]; kinds[kind] = (kinds[kind] ?? 0) + 1;
    if (ref?.resolverKey) masters.push(ref.resolverKey);
  }
  return { seconds, fields: required.length, kinds, masters, labels: required.map((f) => f.label) };
}

// Each journey: the person, the business outcome, the steps (screen + what happens), the masters it needs.
const J = [
  // Platform operator
  { id: 'P1', persona: 'Platform operator', outcome: 'Create a customer workspace', target: 30, steps: [
    { nav: '/platform-admin' }, { form: { text: 3, number: 1, list: 2, text2: 1 } }], note: 'Platform Control Tower › create tenant: name, slug, owner email, trial days, region, isolation tier, audit reason.' },
  { id: 'P2', persona: 'Platform operator', outcome: 'Enable a module for a workspace', target: 10, steps: [
    { nav: '/platform-admin' }, { search: true }, { clicks: 3 }, { form: { text: 1 } }], note: 'Find tenant, open it, tick the module, type the mandatory audit reason, save.' },
  // Tenant administrator
  { id: 'A1', persona: 'Workspace admin', outcome: 'Invite a person with a role', target: 20, steps: [{ nav: '/settings' }, { form: { text: 1, list: 1 } }] },
  { id: 'A2', persona: 'Workspace admin', outcome: 'Add an organization unit (site/department)', target: 30, steps: [{ nav: '/settings/organization' }, { form: { text: 2, list: 1 } }] },
  { id: 'A3', persona: 'Workspace admin', outcome: 'Turn on a module for the workspace (self-service)', target: 10, steps: [{ nav: '/settings/plan' }], blockedReason: 'Not possible: only a platform operator can enable modules; Plan & entitlements is read-only and has no request button.' },
  { id: 'A4', persona: 'Workspace admin', outcome: 'Create a warehouse (Inventory master)', target: 30, steps: [{ nav: '/inventory' }, { window: 'inventory-warehouses' }] },
  { id: 'A5', persona: 'Workspace admin', outcome: 'Create a product with its unit', target: 30, steps: [{ nav: '/products' }, { window: 'catalogue-products' }] },
  { id: 'A6', persona: 'Workspace admin', outcome: 'Register an asset (CMMS master)', target: 30, steps: [{ nav: '/cmms/assets' }, { window: 'cmms-assets' }] },
  { id: 'A7', persona: 'Workspace admin', outcome: 'Add a person to Workforce', target: 30, steps: [{ nav: '/gigaops/resources' }, { window: 'wf-resources' }] },
  // Technician / operator
  { id: 'T1', persona: 'Technician', outcome: 'Report a maintenance problem', target: 15, steps: [{ nav: '/cmms/requests' }, { window: 'cmms-requests' }] },
  { id: 'T2', persona: 'Technician', outcome: 'Raise a work order', target: 30, steps: [{ nav: '/cmms/work-orders' }, { window: 'cmms-work-orders' }] },
  { id: 'T3', persona: 'Technician', outcome: 'Report a hazard with a photo', target: 30, steps: [{ nav: '/safety-operations/report' }, { form: { list: 2, text: 2, long: 1 } }] },
  { id: 'T4', persona: 'Technician', outcome: 'Request an absence', target: 20, steps: [{ nav: '/gigaops/availability' }, { window: 'wf-my-absences' }] },
  { id: 'T5', persona: 'Operator', outcome: 'Start a permit to work', target: 30, steps: [{ nav: '/cmms/permits' }, { clicks: 1 }, { form: { list: 2, text: 1, picker: 1 } }] },
  // Supervisor
  { id: 'S1', persona: 'Supervisor', outcome: 'Triage a hazard report', target: 20, steps: [{ nav: '/safety-operations/triage' }, { clicks: 1 }, { form: { list: 3, text: 1 } }] },
  { id: 'S2', persona: 'Supervisor', outcome: 'Approve an absence', target: 10, steps: [{ nav: '/gigaops/availability' }, { clicks: 2 }, { approve: true }] },
  { id: 'S3', persona: 'Supervisor', outcome: 'Approve an invoice action', target: 10, steps: [{ nav: '/actions' }, { approve: true }] },
  // Procure to pay
  { id: 'B1', persona: 'Buyer', outcome: 'Raise a purchase requisition', target: 30, steps: [{ nav: '/procurement' }, { window: 'procurement-requisitions' }] },
  { id: 'B2', persona: 'Buyer', outcome: 'Create a purchase order', target: 30, steps: [{ nav: '/procurement/purchase-orders' }, { window: 'procurement-purchase-orders' }] },
  { id: 'B3', persona: 'Clerk', outcome: 'Receive goods into a warehouse', target: 30, steps: [{ nav: '/inventory/receipts' }, { window: 'inventory-receipts' }] },
  { id: 'B4', persona: 'AP clerk', outcome: 'Record a vendor bill', target: 30, steps: [{ nav: '/procurement/vendor-bills' }, { window: 'procurement-vendor-bills' }] },
  // Order to cash
  { id: 'C1', persona: 'Sales', outcome: 'Send a quote', target: 30, steps: [{ nav: '/orders' }, { window: 'orders-sales-quotes' }] },
  { id: 'C2', persona: 'Sales', outcome: 'Create a sales order', target: 30, steps: [{ nav: '/orders/sales-orders' }, { window: 'orders-sales-orders' }] },
  // Finance
  { id: 'F1', persona: 'Accountant', outcome: 'Draft a manual journal', target: 30, steps: [{ nav: '/finance' }, { window: 'finance-journal-drafts' }] },
  { id: 'F2', persona: 'Accountant', outcome: 'Read the trial balance', target: 10, steps: [{ nav: '/finance/reports' }, { clicks: 1 }] },
  // Executive
  { id: 'E1', persona: 'Executive', outcome: 'See today\'s operational and financial position', target: 10, steps: [{ nav: '/dashboard' }] },
  // Process safety
  { id: 'X1', persona: 'Chemist', outcome: 'Start a screening project', target: 30, steps: [{ nav: '/speed/projects' }, { window: 'speed-projects' }] },
];

const results = [];
for (const j of J) {
  let seconds = 0; const masters = []; const parts = []; const blockers = [];
  for (const step of j.steps) {
    if (step.nav) {
      const s = nav(step.nav); seconds += s; parts.push(`open ${step.nav} ${s.toFixed(1)}s`);
      const r = live[step.nav];
      if (r?.alerts?.length) blockers.push(`${step.nav}: ${r.alerts[0].slice(0, 90)}`);
      else if (r?.failed?.length) blockers.push(`${step.nav}: ${r.failed[0]}`);
    }
    if (step.window) {
      const f = windowForm(step.window);
      const s = P + B + 0.3 + f.seconds + submit; seconds += s; masters.push(...f.masters);
      parts.push(`form ${f.fields} required (${Object.entries(f.kinds).map(([k, v]) => `${v} ${k}`).join(', ')}) ${s.toFixed(1)}s`);
    }
    if (step.form) {
      let s = P + B + 0.3 + submit;
      for (const [kind, n] of Object.entries(step.form)) s += n * COST[kind.replace(/\d$/, '')];
      seconds += s; parts.push(`form ${Object.values(step.form).reduce((a, b) => a + b, 0)} fields ${s.toFixed(1)}s`);
    }
    if (step.search) { const s = M + P + B + 6 * K + 0.8; seconds += s; parts.push(`search ${s.toFixed(1)}s`); }
    if (step.clicks) { const s = step.clicks * (M + P + B) + 0.8; seconds += s; parts.push(`${step.clicks} click(s) ${s.toFixed(1)}s`); }
    if (step.approve) { const s = (P + B + 0.8) + (M + P + B + SAVE); seconds += s; parts.push(`open + approve ${s.toFixed(1)}s`); }
  }
  const missing = [...new Set(masters)].filter((m) => !lookups[m] || lookups[m].options === 0 || lookups[m].status);
  for (const m of missing) blockers.push(`master ${m}: ${lookups[m]?.status ? `lookup fails (HTTP ${lookups[m].status})` : 'no records yet'}`);
  if (j.blockedReason) blockers.unshift(j.blockedReason);
  results.push({ ...j, seconds: Math.round(seconds), parts, masters: [...new Set(masters)], blockers,
    verdict: blockers.length ? 'BLOCKED' : seconds <= j.target ? 'MEETS' : seconds <= 30 ? 'OVER TARGET' : 'TOO SLOW' });
}
writeFileSync(`${DIR}/journeys.json`, JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.id.padEnd(3)} ${r.persona.padEnd(18)} ${r.outcome.padEnd(48)} ${String(r.seconds).padStart(3)}s / ${String(r.target).padStart(2)}s  ${r.verdict}${r.blockers.length ? '  ← ' + r.blockers[0].slice(0, 80) : ''}`);
