// Generates docs/plans/ux-journeys-screen-inventory.md from the benchmark data: one row per screen with what was
// measured and the plan item each finding implies; one row per metadata window with its fields, pickers, masters and
// label problems.
import { readFileSync, writeFileSync } from 'node:fs';
const [DIR, OUT] = process.argv.slice(2);
const live = JSON.parse(readFileSync(`${DIR}/live.json`, 'utf8'));
const statics = JSON.parse(readFileSync(`${DIR}/static.json`, 'utf8'));
const lookups = JSON.parse(readFileSync(`${DIR}/lookups.json`, 'utf8'));
const esc = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function plan(r) {
  const items = [];
  const failed = (r.failed ?? []).join(' ');
  if (/ → 404/.test(failed) && /v1\/records/.test(failed)) items.push('P0 records route answers 404 (entity not registered for the workspace): WI-OI-146');
  if (/ → 500/.test(failed)) items.push('P0 service error 500: WI-OI-146');
  if (/maps\/nodes → 502|node-types → 502/.test(failed)) items.push('P0 Geospatial not running: deploy it or degrade place pickers gracefully: WI-OI-146');
  if (/workflow-studio.* → 502/.test(failed)) items.push('P0 Workflow Studio not running: deploy or hide: WI-OI-146');
  if (/operator-rounds.* → 503/.test(failed)) items.push('P0 organization version not delivered; show "Send organization to modules" action: WI-OI-146/147');
  if (/ → 400/.test(failed)) items.push('P0 default sort not allowed by the API: WI-OI-146');
  if (/ → 403/.test(failed)) items.push('P1 sources the person may not read: hide or explain, grant to admin role: WI-OI-147');
  if ((r.alerts ?? []).some((a) => /JSON input/.test(a))) items.push('P0 "Unexpected end of JSON input": empty response parsed as JSON: WI-OI-146');
  if (r.readyMs > 3000) items.push('P1 never settles (polling or retrying): stop after failure, cap retries: WI-OI-149');
  if (r.empty && !(r.alerts ?? []).length) items.push('P1 empty: say what this is for, link the master it needs, offer New / import / sample data: WI-OI-148');
  if (r.form && r.form.required >= 6) items.push(`P1 New form asks ${r.form.required} required fields: defaults and auto-fill (WI-OI-149)`);
  if (r.form && r.form.pickers >= 3) items.push(`P2 ${r.form.pickers} pickers: inline "Add new" on each (WI-OI-148)`);
  return items.join('; ') || '—';
}

const lines = [];
lines.push('# UX journeys — screen inventory (generated)', '');
lines.push('Measured read-only on UAT 5180 (release `c88a88d4`) on 2026-11-02 as the walkthrough workspace administrator, at',
  '1440×900, by `e2e/ux-benchmark/bench.mjs`. Regenerate with `node e2e/ux-benchmark/inventory.mjs <data> <out>` after a',
  'new run. "Ready" is navigation start to network idle (15 s means it never settled). "Form" is the New form opened and',
  'closed without saving: controls / required / pickers. Plan items name the work item that owns them.', '');
lines.push('## Screens', '');
lines.push('| Screen | Breadcrumb | Ready | Rows | State | Failed call | Form | Plan |', '|---|---|---:|---:|---|---|---|---|');
for (const r of [...live].sort((a, b) => a.route.localeCompare(b.route))) {
  const state = (r.alerts ?? []).length ? `error: ${esc(r.alerts[0]).slice(0, 70)}` : r.empty ? `empty: ${esc(r.empty)}` : 'ok';
  const form = r.form ? `${r.form.controls}/${r.form.required}/${r.form.pickers}` : '—';
  lines.push(`| \`${r.route}\` | ${esc(r.crumb)} | ${r.readyMs} ms | ${r.rows ?? 0} | ${state} | ${esc((r.failed ?? [])[0] ?? '—').slice(0, 80)} | ${form} | ${esc(plan(r))} |`);
}
lines.push('', '## Metadata windows (labels, fields, masters)', '');
lines.push('From `packages/contracts/src/configuration/window-baselines.generated.ts` (each module\'s `dictionary/*.window.json`).',
  'Masters: the lookup each picker reads and how many options it returned for the workspace (`HTTP n` = the lookup fails).', '');
lines.push('| Module | Window | Route | Fields | Required | Required fields | Pickers → masters | Label problems | Help |', '|---|---|---|---:|---:|---|---|---|---:|');
for (const w of statics) {
  const pickers = w.pickers.map((p) => {
    const l = p.resolver ? lookups[p.resolver] : null;
    const n = l ? (l.status ? `HTTP ${l.status}` : `${l.options}`) : 'n/a';
    return `${p.required ? '*' : ''}${p.label} → ${p.resolver ?? p.target} (${n})${p.createWith ? ' +new' : ''}`;
  }).join('; ');
  lines.push(`| ${w.module} | ${w.label ?? w.surface} | \`${w.route ?? ''}\` | ${w.writable} | ${w.required} | ${esc(w.requiredLabels.join(', ')).slice(0, 160)} | ${esc(pickers) || '—'} | ${esc(w.labelIssues.join(', ')) || '—'} | ${w.helpTexts} |`);
}
lines.push('', '## Masters behind the pickers', '');
lines.push('| Lookup | Options for the workspace | Used by |', '|---|---:|---|');
const usedBy = {};
for (const w of statics) for (const p of w.pickers) if (p.resolver) (usedBy[p.resolver] ??= new Set()).add(w.surface);
for (const [key, value] of Object.entries(lookups)) lines.push(`| \`${key}\` | ${value.status ? `fails (HTTP ${value.status})` : value.options} | ${[...(usedBy[key] ?? [])].join(', ')} |`);
writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(`wrote ${OUT}: ${live.length} screens, ${statics.length} windows, ${Object.keys(lookups).length} lookups`);
