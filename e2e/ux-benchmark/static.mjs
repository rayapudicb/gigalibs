import { writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const { MODULE_WINDOW_BASELINE_SOURCES: windows } = await import(`${root}/packages/contracts/dist/configuration/window-baselines.generated.js`);
const TECH = /\b(id|uuid|json|enum|ref|minor units?|fk|sku code|payload|metadata|tenant|surface|entity|key)\b|[A-Z]{2,}_[A-Z]/i;
const out = [];
for (const source of windows) {
  const d = source.definition; const dict = d.dictionary;
  const fields = dict.fields ?? [];
  const refs = Object.fromEntries((dict.references ?? []).map((r) => [r.referenceKey, r]));
  const writable = fields.filter((f) => !f.readOnly && !f.isSystemLocked);
  const required = writable.filter((f) => f.required);
  const pickers = writable.filter((f) => f.referenceKey && refs[f.referenceKey] && refs[f.referenceKey].referenceType !== 'VALUE_LIST');
  const lists = writable.filter((f) => f.referenceKey && refs[f.referenceKey]?.referenceType === 'VALUE_LIST');
  const requiredPickers = pickers.filter((f) => f.required);
  const labelIssues = fields.filter((f) => TECH.test(f.label) || f.label.length > 40).map((f) => f.label);
  const views = (dict.views ?? []).map((v) => ({ key: v.viewKey ?? v.key, type: v.viewType ?? v.type, label: v.label, columns: (v.fields ?? v.columns ?? []).length }));
  const actions = (dict.actions ?? []).map((a) => a.label ?? a.actionKey);
  out.push({
    module: d.moduleKey, surface: d.surfaceKey, route: source.window?.route, label: source.window?.label ?? d.title,
    description: source.window?.description, fields: fields.length, writable: writable.length, required: required.length,
    requiredLabels: required.map((f) => f.label), types: writable.reduce((t, f) => ((t[f.type] = (t[f.type] ?? 0) + 1), t), {}),
    pickers: pickers.map((f) => ({ label: f.label, required: !!f.required, resolver: refs[f.referenceKey].resolverKey ?? null, target: refs[f.referenceKey].targetEntityKey ?? null, createWith: !!refs[f.referenceKey].createWith })),
    valueLists: lists.length, requiredPickers: requiredPickers.length, labelIssues, views, actions,
    hasDefaults: writable.filter((f) => f.defaultValue !== undefined).length,
    helpTexts: writable.filter((f) => f.helpText || f.description).length,
  });
}
writeFileSync(`${process.argv[2]}/static.json`, JSON.stringify(out, null, 1));
const byModule = {};
for (const w of out) (byModule[w.module] ??= []).push(w);
for (const [m, ws] of Object.entries(byModule)) {
  console.log(`\n${m} (${ws.length} windows)`);
  for (const w of ws) console.log(`  ${w.surface.padEnd(38)} fields ${String(w.writable).padStart(2)} req ${String(w.required).padStart(2)} pickers ${w.pickers.length}${w.pickers.length ? ' [' + w.pickers.map((p) => (p.required ? '*' : '') + (p.resolver ?? p.target)).join(', ') + ']' : ''} actions ${w.actions.length} help ${w.helpTexts} labelIssues ${w.labelIssues.length}`);
}
