import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
/**
 * WI-OI-151: builds the functional and technical workbook of the UX journey work. One sheet per module and per
 * Settings area holds every screen, form, action, journey and work item of that module as a user story, with its API,
 * inputs, request, response, expected result, business outcome, benchmark, measurement, issues and QA status; the
 * cross-module sheets hold the journeys, the QA bug tracker, the screen inventory, the field dictionary, the masters,
 * the API catalogue, the roles and the work-item register. Measurements come from the benchmark data
 * (docs/plans/ux-benchmark-2026-11-02), the journey reports (e2e/artifacts/journeys) and the generated catalogue;
 * workbook-content.mjs holds the hand-written parts (screen purposes, modules, bugs, UX stories).
 *
 * Usage: node e2e/ux-benchmark/workbook.mjs [out.xlsx]   (needs packages/contracts built)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  BENCH_RELEASES,
  BUGS,
  JOURNEY_AFTER,
  JOURNEY_BUGS,
  MODULES,
  SCREENS,
  UNMEASURED,
  UX_STORIES,
  WINDOW_BASE,
  WINDOW_ROUTE,
} from './workbook-content.mjs';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const ExcelJS = createRequire(join(ROOT, 'e2e/package.json'))('exceljs');
const OUT =
  process.argv[2] ??
  join(ROOT, 'Claude outputs/UX journeys 2026-11-02/GigaLibs-Functional-Technical-Workbook.xlsx');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const git = (args) => {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

// ---------------------------------------------------------------- data
// The first benchmark folder is the baseline (with the KLM plan and the before journey run); the newest is "now".
const BENCH_RUNS = readdirSync(join(ROOT, 'docs/plans'))
  .filter(
    (name) =>
      /^ux-benchmark-\d{4}-\d{2}-\d{2}$/.test(name) &&
      existsSync(join(ROOT, 'docs/plans', name, 'live.json')),
  )
  .sort();
const BENCH = join(ROOT, 'docs/plans', BENCH_RUNS[0]);
const CURRENT = join(ROOT, 'docs/plans', BENCH_RUNS.at(-1));
const CURRENT_DATE = BENCH_RUNS.at(-1).slice('ux-benchmark-'.length);
const BASE_DATE = BENCH_RUNS[0].slice('ux-benchmark-'.length);
const live = readJson(join(CURRENT, 'live.json'));
const liveBefore = readJson(join(BENCH, 'live.json'));
const lookups = readJson(join(CURRENT, 'lookups.json'));
const klm = Object.fromEntries(
  readJson(join(BENCH, 'journeys.json')).map((journey) => [journey.id, journey]),
);
const beforeRun = readJson(join(BENCH, 'journeys-e2e-before.json'));
const runDirectory = join(ROOT, 'e2e/artifacts/journeys');
const runFiles = existsSync(runDirectory)
  ? readdirSync(runDirectory)
      .filter((file) => file.endsWith('.json'))
      .sort()
  : [];
const latestFile = runFiles.length
  ? join(runDirectory, runFiles.at(-1))
  : join(BENCH, 'journeys-e2e-before.json');
const latestRun = readJson(latestFile);
const before = Object.fromEntries(beforeRun.results.map((result) => [result.id, result]));
const latest = Object.fromEntries(latestRun.results.map((result) => [result.id, result]));
const { MODULE_WINDOW_BASELINE_SOURCES } = await import(
  join(ROOT, 'packages/contracts/dist/configuration/window-baselines.generated.js')
);
const { platformModuleCatalog, moduleDefaultRoles } = await import(
  join(ROOT, 'packages/contracts/dist/modules/index.js')
);
const roles = Object.values(moduleDefaultRoles);
const catalog = Object.fromEntries(platformModuleCatalog.map((entry) => [entry.key, entry]));
const FIX_COMMIT = git('log -1 --format=%h --grep=WI-OI-146/147/149/151') || 'fix commit';
const HEAD = git('rev-parse --short HEAD');
const BRANCH = git('rev-parse --abbrev-ref HEAD');
const MEASURED_RELEASE = BENCH_RELEASES[BASE_DATE] ?? BASE_DATE;
const CURRENT_RELEASE = BENCH_RELEASES[CURRENT_DATE] ?? CURRENT_DATE;
const CURRENT_HEADER = `Current result (${CURRENT_DATE})`;

const gateways = (() => {
  const text = readFileSync(
    join(ROOT, 'apps/workflow-platform/lib/generated/module-gateways.ts'),
    'utf8',
  );
  const start = text.indexOf('{', text.indexOf('generatedModuleGateways'));
  return Object.values(JSON.parse(text.slice(start, text.indexOf('\n};', start) + 2)));
})();

const windows = MODULE_WINDOW_BASELINE_SOURCES.map((source) => {
  const definition = source.definition;
  const dictionary = definition.dictionary;
  const references = Object.fromEntries(
    (dictionary.references ?? []).map((reference) => [reference.referenceKey, reference]),
  );
  const entity = dictionary.targetEntityKey ?? dictionary.fields?.[0]?.entityKey;
  return {
    module: definition.moduleKey,
    surface: definition.surfaceKey,
    entity,
    label: source.window?.label ?? definition.title,
    description: source.window?.description ?? '',
    readPermission: source.window?.readPermission ?? '',
    fields: (dictionary.fields ?? []).map((field) => ({
      ...field,
      reference: field.referenceKey ? references[field.referenceKey] : undefined,
    })),
    actions: dictionary.actions ?? [],
    route: WINDOW_ROUTE[definition.surfaceKey] ?? null,
    base: WINDOW_BASE[definition.moduleKey] ?? '',
  };
});

// ---------------------------------------------------------------- helpers
const KLM_CONSTANTS = { M: 1.35, P: 1.1, B: 0.1, K: 0.28 };
const { M, P, B, K } = KLM_CONSTANTS;
const HUMAN = {
  navigate: M + 2 * (P + B),
  open: P + B,
  text: M + P + B + 8 * K,
  number: M + P + B + 4 * K,
  date: M + P + B + 10 * K,
  select: M + 2 * (P + B),
  picker: M + P + B + 3 * K + P + B,
  click: M + P + B,
  submit: M + P + B,
};
const SAVE_SECONDS = 1;
const round1 = (value) => Math.round(value * 10) / 10;
const clip = (text, length = 3000) => {
  const value = String(text ?? '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
};
const lcFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
/** "As an AP clerk", "As a requester", "As any worker": keeps acronyms, picks the article. */
const asPersona = (persona) => {
  const name = /^[A-Z][a-z]/.test(persona) ? lcFirst(persona) : persona;
  return /^any /i.test(name) ? `As ${name}` : `As ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
};
const unique = (items) => [...new Set(items.filter(Boolean))];
const writable = (field) => !field.readOnly && !field.isSystemLocked;
const isPicker = (field) => field.reference && field.reference.referenceType !== 'VALUE_LIST';
const isList = (field) => field.reference?.referenceType === 'VALUE_LIST';
const TECH =
  /\b(id|uuid|json|enum|ref|minor units?|fk|payload|metadata|tenant|surface|entity|key)\b|[A-Z]{2,}_[A-Z]/i;
const shownLabel = (field) => {
  const minor = /-minor$/.test(field.fieldKey) || /\((?:in )?minor(?: units)?\)/i.test(field.label);
  return minor ? field.label.replace(/\s*\((?:in )?minor(?: units)?\)/i, '').trim() : field.label;
};
const humanAction = (field) =>
  isPicker(field)
    ? 'picker'
    : isList(field)
      ? 'select'
      : /DATE/.test(field.type)
        ? 'date'
        : /INTEGER|NUMBER|DECIMAL|MONEY|QUANTITY/.test(field.type)
          ? 'number'
          : /BOOLEAN/.test(field.type)
            ? 'click'
            : 'text';
const sample = (field) => {
  if (isPicker(field)) return `<${shownLabel(field)} id from the picker>`;
  if (isList(field)) return field.reference.staticValues?.[0]?.value ?? 'VALUE';
  if (/DATE/.test(field.type)) return '2026-11-02';
  if (/INTEGER|NUMBER|DECIMAL|MONEY|QUANTITY/.test(field.type))
    return /-minor$/.test(field.fieldKey) ? 1250 : 1;
  if (/BOOLEAN/.test(field.type)) return true;
  return `<${shownLabel(field)}>`;
};
const moduleOf = (route) => MODULES.find((module) => module.routes.test(route));
const liveByRoute = Object.fromEntries(live.map((screen) => [screen.route, screen]));
const beforeByRoute = Object.fromEntries(liveBefore.map((screen) => [screen.route, screen]));
const screenLabel = (route) =>
  liveByRoute[route]?.crumb?.split(' › ').at(-1) ||
  windows.find((window) => window.route === route)?.label ||
  route;
const quote = (sheet) => `'${sheet.replace(/'/g, "''")}'`;
const F = (formula, result) => ({ formula, result });
const link = (sheet, text = sheet) => ({ text, hyperlink: `#${quote(sheet)}!A1` });
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const low = Math.floor(rank);
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (rank - low);
};

function plan(screen) {
  const items = [];
  const failed = (screen.failed ?? []).join(' ');
  if (/ → 404/.test(failed) && /v1\/records/.test(failed))
    items.push('P0 records route answers 404: WI-OI-146');
  if (/ → 500/.test(failed)) items.push('P0 service error 500: WI-OI-146');
  if (/maps\/nodes → 502|node-types → 502/.test(failed))
    items.push('P0 Geospatial not running: deploy it or degrade place pickers: WI-OI-146');
  if (/workflow-studio.* → 502/.test(failed))
    items.push('P0 Workflow Studio not running: deploy or hide: WI-OI-146');
  if (/operator-rounds.* → 503/.test(failed))
    items.push('P0 organization version not delivered: WI-OI-146/147');
  if (/ → 400/.test(failed)) items.push('P0 default sort not allowed by the API: WI-OI-146');
  if (/ → 403/.test(failed)) items.push('P1 sources the person may not read: WI-OI-147');
  if ((screen.alerts ?? []).some((alert) => /JSON input/.test(alert)))
    items.push('P0 empty response parsed as JSON: WI-OI-146');
  if (screen.readyMs > 3000) items.push('P1 never settles: stop after a failure: WI-OI-149');
  if (screen.empty && !(screen.alerts ?? []).length)
    items.push('P1 empty without guidance: purpose, next step, button: WI-OI-148');
  if (screen.form && screen.form.required >= 6)
    items.push(
      `P1 New form asks ${screen.form.required} required fields: defaults and auto-fill: WI-OI-149`,
    );
  if (screen.form && screen.form.pickers >= 3)
    items.push(`P2 ${screen.form.pickers} pickers: inline Add new: WI-OI-148`);
  return items;
}
const screenState = (screen) =>
  !screen
    ? 'not measured'
    : (screen.alerts ?? []).length
      ? `error: ${clip(screen.alerts[0], 120)}`
      : screen.empty
        ? `empty: ${clip(screen.empty, 120)}`
        : 'ok';
const screenVerdict = (screen) =>
  !screen
    ? 'NOT RUN'
    : (screen.alerts ?? []).length
      ? 'BLOCKED'
      : (screen.failed ?? []).length
        ? 'DEGRADED'
        : screen.readyMs > 5000
          ? 'TOO SLOW'
          : screen.readyMs > 2000
            ? 'OVER TARGET'
            : 'MEETS';
const timeVerdict = (seconds, target) =>
  seconds <= target ? 'MEETS' : seconds <= 30 ? 'OVER TARGET' : 'TOO SLOW';
const wiOf = (texts) => unique(texts.join(' ').match(/WI-OI-\d+/g) ?? []).sort();

// ---------------------------------------------------------------- bugs, one row per module
const bugRows = [];
for (const bug of BUGS) {
  const modules =
    bug.modules ??
    unique(liveBefore.filter(bug.match).map((screen) => moduleOf(screen.route)?.sheet));
  modules.forEach((sheet, index) => {
    const affected = new Set();
    if (bug.match)
      for (const screen of liveBefore)
        if (moduleOf(screen.route)?.sheet === sheet && bug.match(screen))
          affected.add(screen.route);
    for (const route of bug.routes ?? []) if (moduleOf(route)?.sheet === sheet) affected.add(route);
    bugRows.push({
      ...bug,
      id: modules.length > 1 ? `${bug.id}.${index + 1}` : bug.id,
      root: bug.id,
      module: sheet,
      affected: [...affected].sort(),
    });
  });
}
const bugById = Object.fromEntries(BUGS.map((bug) => [bug.id, bug]));
const fixedIn = (status) =>
  /in branch/.test(status)
    ? `${HEAD} (${BRANCH}), awaiting the owner's deploy`
    : /on UAT/.test(status)
      ? 'c88a88d4 (on UAT)'
      : /deploying/.test(status)
        ? '59c0fe7f, deploying in 88e493d7'
        : '—';
const qaFrom = (bugs, verdict) => {
  if (bugs.some((bug) => bug.status === 'Open')) return 'Fail - open bug';
  if (bugs.some((bug) => /in branch|deploying/.test(bug.status))) return 'Retest after deploy';
  if (bugs.some((bug) => bug.status === 'Owner action')) return 'Blocked - owner action';
  if (bugs.some((bug) => bug.status === 'Retest')) return 'Retest';
  return verdict === 'MEETS'
    ? 'Pass'
    : verdict === 'DEGRADED'
      ? 'Pass with note'
      : verdict === 'NOT RUN'
        ? 'Not run'
        : verdict === 'BLOCKED'
          ? 'Fail'
          : 'Pass - over time';
};
const bestPriority = (items) =>
  items
    .map((item) => item.match?.(/\bP[0-3]\b/)?.[0])
    .filter(Boolean)
    .sort()[0] ?? '—';

// ---------------------------------------------------------------- work items
const workItems = (() => {
  const register = readFileSync(join(ROOT, '.pi/WORK_ITEMS.md'), 'utf8')
    .split('\n')
    .filter((line) => /^\| WI-[A-Z]+-[0-9A-Za-z]+(-T8b)? \|/.test(line))
    .map((line) => {
      const parts = line.slice(2, -2).split(' | ');
      return {
        id: parts[0],
        requirements: parts[1],
        status: parts[2],
        owner: parts[3],
        reviewers: parts[4],
        gate: parts[5],
        evidence: parts.slice(6).join(' | '),
      };
    });
  const cardTitle = (id) => {
    const file = join(ROOT, '.pi/tasks', `${id}.md`);
    if (!existsSync(file)) return '';
    const heading = readFileSync(file, 'utf8')
      .split('\n')
      .find((line) => line.startsWith('# '));
    return heading
      ? heading
          .slice(2)
          .replace(new RegExp(`^${id}\\s*[—:-]?\\s*`), '')
          .trim()
      : '';
  };
  const known = new Set(register.map((item) => item.id));
  const cards = readdirSync(join(ROOT, '.pi/tasks'))
    .filter((file) => /^WI-/.test(file) && !known.has(file.replace(/\.md$/, '')))
    .map((file) => {
      const id = file.replace(/\.md$/, '');
      const text = readFileSync(join(ROOT, '.pi/tasks', file), 'utf8');
      const status =
        text.match(/\*\*Status:?\*\*:?\s*([A-Za-z ]+)/)?.[1]?.trim() ??
        text.match(/^Status:\s*(.+)$/m)?.[1]?.trim() ??
        'Card only';
      return {
        id,
        requirements: '',
        status,
        owner: '',
        reviewers: '',
        gate: '',
        evidence: clip(text.split('\n').slice(1, 12).join(' '), 600),
      };
    });
  return [...register, ...cards].map((item) => {
    const title = cardTitle(item.id) || clip(item.gate, 160) || clip(item.evidence, 160);
    const probe = `${item.id} ${title} ${item.gate} ${clip(item.evidence, 400)}`;
    return {
      ...item,
      title,
      modules: MODULES.filter((module) => module.wi.test(probe)).map((module) => module.sheet),
      card: existsSync(join(ROOT, '.pi/tasks', `${item.id}.md`)) ? `.pi/tasks/${item.id}.md` : '',
    };
  });
})();
const STATUS_ORDER = [
  'In Progress',
  'Ready',
  'Built',
  'Review',
  'On UAT',
  'Done',
  'Blocked',
  'Proposed',
  'Card only',
  'Replaced',
];
const statusRank = (status) => {
  const index = STATUS_ORDER.findIndex((value) => status.startsWith(value));
  return index < 0 ? STATUS_ORDER.length : index;
};

// ---------------------------------------------------------------- journeys
const JOURNEY_IDS = Object.keys(klm);
const journeySheet = (id) => {
  const result = latest[id] ?? before[id];
  return moduleOf(result?.route ?? '')?.sheet ?? result?.module ?? '';
};
const journeyStatus = (id) => {
  const bugs = (JOURNEY_BUGS[id] ?? []).map((bugId) => bugById[bugId]).filter(Boolean);
  const result = latest[id];
  const open = bugs.filter((bug) => bug.status === 'Open').map((bug) => bug.id);
  if (result?.verdict === 'MEETS') return open.length ? `Meets; open: ${open.join(', ')}` : 'Meets';
  if (open.length) return `Open: ${open.join(', ')}`;
  if (bugs.some((bug) => /in branch|deploying/.test(bug.status))) return 'Retest after deploy';
  if (bugs.some((bug) => bug.status === 'Owner action')) return 'Owner action';
  return result?.verdict === 'NOT RUN' ? 'Not run' : 'Open';
};
const stepsText = (result) =>
  (result?.steps ?? [])
    .map(
      (step, index) =>
        `${index + 1}. ${step.name} ${round1(step.machineMs / 1000)} s machine / ${round1(step.humanSeconds)} s human${step.failed.length ? ` — ${step.failed.join('; ')}` : ''}`,
    )
    .join('\n');

// ---------------------------------------------------------------- styling
const FONT = 'Arial';
const COLOR = {
  ink: 'FF1F2933',
  head: 'FF1F3864',
  headText: 'FFFFFFFF',
  edit: 'FFFCE4B6',
  muted: 'FF52606D',
  line: 'FFD3D9E0',
  band: 'FFF5F7FA',
  input: 'FF0000FF',
  link: 'FF1F5FBF',
  title: 'FF1F3864',
};
const thin = { style: 'thin', color: { argb: COLOR.line } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
function dress(
  cell,
  { bold, size = 10, color, italic, fill, wrap = true, h, border = true, numFmt, underline } = {},
) {
  cell.font = {
    name: FONT,
    size,
    bold: Boolean(bold),
    italic: Boolean(italic),
    color: { argb: color ?? COLOR.ink },
    ...(underline ? { underline: true } : {}),
  };
  cell.alignment = { vertical: 'top', horizontal: h, wrapText: wrap };
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  if (border) cell.border = BORDER;
  if (numFmt) cell.numFmt = numFmt;
}
const isLink = (value) => value && typeof value === 'object' && 'hyperlink' in value;
function put(ws, row, column, value, style = {}) {
  const cell = ws.getCell(row, column);
  cell.value = value ?? null;
  dress(cell, {
    border: false,
    ...style,
    ...(isLink(value) ? { color: COLOR.link, underline: true } : {}),
  });
  return cell;
}
/** A table whose header is row `at`; frozen under the header, filtered, banded. Returns its data rows. */
function table(ws, at, columns, rows, { freezeColumns = 1 } = {}) {
  columns.forEach((column, index) => {
    ws.getColumn(index + 1).width = column.width ?? 14;
    put(ws, at, index + 1, column.header, {
      bold: true,
      color: column.edit ? COLOR.ink : COLOR.headText,
      fill: column.edit ? COLOR.edit : COLOR.head,
      border: true,
    });
  });
  rows.forEach((row, r) =>
    row.forEach((value, c) =>
      put(ws, at + 1 + r, c + 1, value === '' ? null : value, {
        border: true,
        numFmt: columns[c]?.fmt,
        fill: r % 2 ? COLOR.band : undefined,
      }),
    ),
  );
  ws.autoFilter = {
    from: { row: at, column: 1 },
    to: { row: at + Math.max(rows.length, 1), column: columns.length },
  };
  ws.views = [{ state: 'frozen', ySplit: at, xSplit: freezeColumns }];
  return { first: at + 1, last: at + Math.max(rows.length, 1) };
}
const RULES = [
  ['BLOCKED', 'FFF8D7DA'],
  ['Fail', 'FFF8D7DA'],
  ['Partly', 'FFFFF3CD'],
  ['TOO SLOW', 'FFFDE2C4'],
  ['Open', 'FFFDE2C4'],
  ['OVER TARGET', 'FFFFF3CD'],
  ['over time', 'FFFFF3CD'],
  ['DEGRADED', 'FFFFF3CD'],
  ['Retest', 'FFFFF3CD'],
  ['Owner', 'FFDCE8F7'],
  ['deploying', 'FFDCE8F7'],
  ['In Progress', 'FFDCE8F7'],
  ['Review', 'FFDCE8F7'],
  ['Fixed', 'FFD4EDDA'],
  ['MEETS', 'FFD4EDDA'],
  ['Meets', 'FFD4EDDA'],
  ['Pass', 'FFD4EDDA'],
  ['Done', 'FFD4EDDA'],
  ['Built', 'FFD4EDDA'],
  ['NOT RUN', 'FFE9ECEF'],
  ['Not run', 'FFE9ECEF'],
  ['Replaced', 'FFE9ECEF'],
  ['Ready', 'FFE9ECEF'],
  ['Proposed', 'FFE9ECEF'],
];
function colorize(ws, ref) {
  ws.addConditionalFormatting({
    ref,
    rules: RULES.map(([text, argb], index) => ({
      type: 'containsText',
      operator: 'containsText',
      text,
      priority: index + 1,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } },
    })),
  });
}
const letter = (column) => {
  let text = '';
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26))
    text = String.fromCharCode(65 + ((value - 1) % 26)) + text;
  return text;
};
function title(ws, text, subtitle) {
  put(ws, 1, 1, text, { bold: true, size: 14, color: COLOR.title, wrap: false });
  if (subtitle) put(ws, 2, 1, subtitle, { italic: true, color: COLOR.muted, wrap: false });
}

// ---------------------------------------------------------------- workbook and sheet order
const workbook = new ExcelJS.Workbook();
workbook.creator = 'Claude (WI-OI-151 workbook generator)';
workbook.created = new Date();
// Excel recalculates every formula on open, so the cached results never go stale when someone edits a sheet.
workbook.calcProperties.fullCalcOnLoad = true;
const SHEETS = {};
const add = (name, kind, about, tab) => {
  SHEETS[name] = {
    ws: workbook.addWorksheet(name, { properties: { tabColor: { argb: tab } } }),
    kind,
    about,
    rows: null,
  };
  return SHEETS[name].ws;
};
add(
  'Read me',
  'Guide',
  'Purpose, audience, sources, method, legends, assumptions and how to regenerate.',
  'FF1F3864',
);
add('Contents', 'Guide', 'Every sheet with a link and what it holds.', 'FF1F3864');
add(
  'Dashboard',
  'Summary',
  'Screens, journeys and bugs at a glance, and a roll-up per module (all formulas).',
  'FF1F3864',
);
add(
  'Benchmark method',
  'Method',
  'Targets, Keystroke-Level Model constants and action costs (formulas), verdict rules.',
  'FF1F3864',
);
add(
  'Journeys',
  'Cross-module',
  'The 27 persona journeys: KLM plan estimate, e2e before and latest, verdicts, blockers, bugs, expected after.',
  'FFB7791F',
);
add(
  'Journey steps',
  'Cross-module',
  'Every step of every journey in the latest e2e run: machine and human time, calls, failures, errors shown.',
  'FFB7791F',
);
add(
  'QA bug tracker',
  'Cross-module',
  'Every defect and gap found, one row per module, with reproduction, root cause, fix, status and retest.',
  'FFC0392B',
);
add(
  'UX user stories',
  'Cross-module',
  'WI-OI-145 … 151 as user stories with acceptance criteria and status.',
  'FFB7791F',
);
add(
  'Change log',
  'Cross-module',
  'The commits of this work and every file changed by the fix commit, with why.',
  'FFB7791F',
);
for (const module of MODULES)
  add(
    module.sheet,
    module.group === 'Settings' ? 'Settings' : 'Module',
    module.purpose,
    module.group === 'Settings' ? 'FF6B7280' : 'FF2E7D32',
  );
add(
  'Screen inventory',
  'Reference',
  'Every screen measured on UAT: timings, calls, failures, state, form, plan items, bugs.',
  'FF5B21B6',
);
add(
  'Field dictionary',
  'Reference',
  'Every field of every metadata window: label, type, required, picker and master, defaults, help, label issues.',
  'FF5B21B6',
);
add(
  'Masters & lookups',
  'Reference',
  'Every master lookup behind a picker: options in the workspace, who uses it, Add new, starter data.',
  'FF5B21B6',
);
add(
  'API catalogue',
  'Reference',
  'Every gateway route of every module with method and permission, plus the record API and control-plane calls.',
  'FF5B21B6',
);
add(
  'Roles & personas',
  'Reference',
  'Built-in roles of each module with their permissions.',
  'FF5B21B6',
);
add(
  'Work items register',
  'Reference',
  'Every work item in .pi/WORK_ITEMS.md and every task card, with status and the modules it touches.',
  'FF5B21B6',
);

// ---------------------------------------------------------------- stories per module
const STORY_COLUMNS = [
  { header: 'Story ID', width: 11 },
  { header: 'Type', width: 10 },
  { header: 'Screen', width: 18 },
  { header: 'Route', width: 22 },
  { header: 'Persona', width: 16 },
  { header: 'User story', width: 46 },
  { header: 'Functional description', width: 46 },
  { header: 'Inputs - required', width: 34 },
  { header: 'Inputs - optional', width: 30 },
  { header: 'Masters / pickers', width: 34 },
  { header: 'API - main call', width: 40 },
  { header: 'Other API calls', width: 40 },
  { header: 'Permission', width: 22 },
  { header: 'Request (input)', width: 40 },
  { header: 'Response (output)', width: 36 },
  { header: 'Expected result', width: 40 },
  { header: 'Business outcome', width: 34 },
  { header: 'Target (s)', width: 9, fmt: '0' },
  { header: 'KLM estimate (s)', width: 10, fmt: '0.0' },
  { header: 'Screen ready (ms)', width: 10, fmt: '#,##0' },
  { header: 'Journey measured (s)', width: 10, fmt: '0.0' },
  { header: CURRENT_HEADER, width: 36 },
  { header: 'Verdict', width: 13 },
  { header: 'Issues found', width: 40 },
  { header: 'Bug IDs', width: 14 },
  { header: 'Fix / change', width: 40 },
  { header: 'Work item', width: 14 },
  { header: 'Priority', width: 8 },
  { header: 'QA status', width: 18, edit: true },
  { header: 'Evidence', width: 34 },
];
const COL = Object.fromEntries(STORY_COLUMNS.map((column, index) => [column.header, index]));
const blankStory = () => STORY_COLUMNS.map(() => null);
const story = (values) => {
  const row = blankStory();
  for (const [key, value] of Object.entries(values)) row[COL[key]] = value;
  return row;
};
const BENCH_EVIDENCE = `docs/plans/ux-benchmark-${CURRENT_DATE}/live.json (bench ${CURRENT_RELEASE}, ${CURRENT_DATE}); before: ux-benchmark-${BASE_DATE}`;
const lookupCount = (resolver) => {
  const entry = lookups[resolver];
  return !entry
    ? 'not measured'
    : entry.status
      ? `fails (HTTP ${entry.status})`
      : `${entry.options} options`;
};
const pickerText = (field) => {
  const reference = field.reference;
  const resolver = reference.resolverKey ?? reference.targetEntityKey ?? reference.referenceKey;
  const fills = reference.fills ? ` · fills ${Object.values(reference.fills).join(', ')}` : '';
  return `${field.required ? '*' : ''}${shownLabel(field)} → ${resolver} (${lookupCount(resolver)})${reference.createWith ? ' · Add new' : ''}${fills}`;
};
const routesOf = (module) =>
  unique(
    [...live, ...liveBefore]
      .map((screen) => screen.route)
      .concat(Object.keys(UNMEASURED))
      .filter((route) => module.routes.test(route)),
  ).sort();
const journeysOf = (module) => JOURNEY_IDS.filter((id) => journeySheet(id) === module.sheet);

function storiesFor(module) {
  const rows = [];
  let count = 0;
  const id = () => `${module.code}-${String(++count).padStart(3, '0')}`;
  const moduleWindows = windows.filter((window) => (module.windows ?? []).includes(window.module));
  const routes = routesOf(module);
  for (const route of routes) {
    const screen = liveByRoute[route];
    const label = screenLabel(route);
    const text = SCREENS[route] ?? {
      persona: 'Workspace admin',
      want: `use ${label}`,
      outcome: lcFirst(module.purpose),
    };
    const onScreen = moduleWindows.filter((window) => window.route === route);
    const bugsHere = bugRows.filter(
      (bug) => bug.module === module.sheet && bug.affected.includes(route),
    );
    const planItems = screen ? plan(screen) : [];
    const verdict = screenVerdict(screen);
    const viewJourney = journeysOf(module).find(
      (jid) => latest[jid]?.route === route && latest[jid]?.kind === 'view',
    );
    const first = onScreen[0];
    const apis = first
      ? onScreen.map((window) => `GET ${window.base}/v1/records/${window.entity}`)
      : [];
    rows.push(
      story({
        'Story ID': id(),
        Type: 'Screen',
        Screen: label,
        Route: route,
        Persona: text.persona,
        'User story': `${asPersona(text.persona)}, I want to ${text.want}, so that ${text.outcome}.`,
        'Functional description': clip(
          [
            onScreen.map((window) => `${window.label}: ${window.description}`).join(' '),
            screen
              ? `Breadcrumb ${screen.crumb ?? '—'}; ${screen.tabs ?? 0} screens in the module tab bar; ${screen.search ? 'list search' : 'no list search'}; buttons ${(screen.buttons ?? []).join(', ') || '—'}.`
              : UNMEASURED[route],
          ]
            .filter(Boolean)
            .join(' '),
        ),
        'Inputs - required': '—',
        'Inputs - optional': screen?.search ? 'Search text, sort, filters, page' : '—',
        'Masters / pickers': '—',
        'API - main call': apis[0] ?? screen?.slowest?.path ?? module.apis?.[0] ?? '—',
        'Other API calls':
          clip(
            unique([
              ...apis.slice(1),
              ...(screen?.failed ?? []).map((failure) => `failed: ${failure}`),
              ...(first ? [] : (module.apis ?? []).slice(1)),
            ]).join('\n'),
            1500,
          ) || '—',
        Permission: first?.readPermission || catalog[module.catalog[0]]?.requiredPermission || '—',
        'Request (input)': first
          ? `GET ${first.base}/v1/records/${first.entity}?page=1&pageSize=25&search=&sortField=&sortDirection=ASC (session cookie; workspace from the signed platform context)`
          : 'GET with the session cookie; the workspace comes from the signed platform context',
        'Response (output)': first
          ? '200 { items: [record…], total, page, pageSize }; 403 without the read permission'
          : '200 JSON for the screen',
        'Expected result':
          'Ready ≤ 1 s (p90 ≤ 2 s); rows or an empty state that says what to do; search, sort and open work; no error shown.',
        'Business outcome': text.outcome,
        'Target (s)': 10,
        'KLM estimate (s)': screen ? round1(HUMAN.navigate + screen.readyMs / 1000) : null,
        'Screen ready (ms)': screen?.readyMs ?? null,
        'Journey measured (s)': viewJourney ? latest[viewJourney].humanSeconds : null,
        [CURRENT_HEADER]: screen
          ? `${screenState(screen)} — ready ${screen.readyMs} ms, ${screen.rows ?? 0} rows, ${screen.calls} calls`
          : `Not measured: ${UNMEASURED[route] ?? '—'}`,
        Verdict: verdict,
        'Issues found':
          clip([...planItems, ...bugsHere.map((bug) => `${bug.id} ${bug.title}`)].join('\n')) ||
          '—',
        'Bug IDs': bugsHere.map((bug) => bug.id).join(', ') || '—',
        'Fix / change': clip(bugsHere.map((bug) => `${bug.id}: ${bug.fix}`).join('\n')) || '—',
        'Work item':
          unique([...wiOf(planItems), ...bugsHere.flatMap((bug) => wiOf([bug.wi]))]).join(', ') ||
          '—',
        Priority: bestPriority([...planItems, ...bugsHere.map((bug) => bug.priority)]),
        'QA status': qaFrom(bugsHere, verdict),
        Evidence: screen ? BENCH_EVIDENCE : 'Not measured',
      }),
    );
    for (const window of onScreen)
      rows.push(...windowStories(window, { id, module, route, screen, text, bugsHere }));
  }
  for (const window of moduleWindows.filter((candidate) => !candidate.route)) {
    rows.push(
      ...windowStories(window, {
        id,
        module,
        route: null,
        screen: null,
        text: { persona: 'Workspace admin', want: '', outcome: lcFirst(module.purpose) },
        bugsHere: bugRows.filter((bug) => bug.module === module.sheet && bug.root === 'QA-039'),
      }),
    );
  }
  for (const jid of journeysOf(module)) rows.push(journeyStory(jid, id()));
  for (const api of module.apis ?? []) {
    const [call, purpose] = api.split(' — ');
    rows.push(
      story({
        'Story ID': id(),
        Type: 'API',
        Screen: screenLabel(routes[0] ?? ''),
        Route: routes[0] ?? '—',
        Persona: SCREENS[routes[0]]?.persona ?? '—',
        'User story': `The screen calls ${call} (${purpose}).`,
        'API - main call': call,
        'Functional description': purpose,
        'Expected result': '2xx within 1 s; refusals in plain words',
        'QA status': 'Not run',
        Evidence: 'apps/workflow-platform/components (source read)',
      }),
    );
  }
  for (const item of workItems
    .filter((candidate) => candidate.modules.includes(module.sheet))
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.id.localeCompare(b.id, 'en', { numeric: true }),
    )) {
    rows.push(
      story({
        'Story ID': item.id,
        Type: 'Work item',
        Screen: '—',
        Route: '—',
        Persona: clip(item.owner, 80) || '—',
        'User story': clip(item.title, 400),
        'Functional description': clip(item.evidence, 900),
        'Work item': item.id,
        'QA status': item.status,
        Evidence: item.card || '.pi/WORK_ITEMS.md',
      }),
    );
  }
  return rows;
}

function windowStories(window, { id, module, route, screen, text, bugsHere }) {
  const rows = [];
  const root = window.fields.filter((field) => field.entityKey === window.entity);
  const lines = window.fields.filter(
    (field) => field.entityKey !== window.entity && /line/i.test(field.entityKey),
  );
  const editable = root.filter(writable);
  // A field a picker fills (product code, name, unit; customer name) is not typed by the person.
  const filled = new Set(
    window.fields.flatMap((field) => Object.values(field.reference?.fills ?? {})),
  );
  const filledBy = (field) =>
    window.fields.find((candidate) =>
      Object.values(candidate.reference?.fills ?? {}).includes(field.fieldKey),
    );
  const required = editable.filter(
    (field) => field.required && field.defaultValue === undefined && !filled.has(field.fieldKey),
  );
  const optional = editable.filter(
    (field) => !required.includes(field) && !filled.has(field.fieldKey),
  );
  const lineRequired = lines.filter(
    (field) =>
      writable(field) &&
      field.required &&
      field.defaultValue === undefined &&
      !filled.has(field.fieldKey),
  );
  const autoFilled = [...editable, ...lines.filter(writable)].filter((field) =>
    filled.has(field.fieldKey),
  );
  const pickers = [...editable, ...lines.filter(writable)].filter(isPicker);
  const labelIssues = window.fields
    .filter((field) => TECH.test(shownLabel(field)))
    .map((field) => shownLabel(field));
  const helpless = required
    .filter((field) => !field.helpText && !field.description)
    .map((field) => shownLabel(field));
  const emptyMasters = pickers
    .filter((field) => /fails|^0 options/.test(lookupCount(field.reference.resolverKey ?? '')))
    .map((field) => shownLabel(field));
  const label = window.label;
  const createJourney = route
    ? JOURNEY_IDS.find((jid) => latest[jid]?.route === route && latest[jid]?.kind === 'create')
    : null;
  const measuredJourney =
    createJourney &&
    screenLabel(route) &&
    window === windows.find((candidate) => candidate.route === route)
      ? latest[createJourney]
      : null;
  if (editable.length) {
    const seconds = round1(
      HUMAN.navigate +
        (screen?.readyMs ?? 900) / 1000 +
        HUMAN.open +
        (screen?.form?.openMs ?? 600) / 1000 +
        [...required, ...lineRequired].reduce((sum, field) => sum + HUMAN[humanAction(field)], 0) +
        HUMAN.submit +
        SAVE_SECONDS,
    );
    const body = Object.fromEntries(
      [...required, ...lineRequired].map((field) => [field.fieldKey, sample(field)]),
    );
    const blocked = screenVerdict(screen) === 'BLOCKED';
    const verdict = measuredJourney
      ? measuredJourney.verdict
      : !route
        ? 'NOT RUN'
        : blocked
          ? 'BLOCKED'
          : timeVerdict(seconds, 30);
    const issues = [
      required.length + lineRequired.length >= 6
        ? `${required.length + lineRequired.length} required fields (target ≤ 5)`
        : '',
      pickers.filter((field) => field.required && !field.reference.createWith).length
        ? `required pickers without Add new: ${pickers
            .filter((field) => field.required && !field.reference.createWith)
            .map((field) => shownLabel(field))
            .join(', ')}`
        : '',
      emptyMasters.length ? `masters empty or failing: ${emptyMasters.join(', ')}` : '',
      labelIssues.length ? `technical labels: ${labelIssues.join(', ')}` : '',
      helpless.length ? `required fields without help: ${helpless.join(', ')}` : '',
      !route ? 'window is on no screen' : '',
    ].filter(Boolean);
    rows.push(
      story({
        'Story ID': id(),
        Type: 'Create / edit',
        Screen: label,
        Route: route ?? '— (no screen)',
        Persona: text.persona,
        'User story': `${asPersona(text.persona)}, I want to add or change ${lcFirst(label)} in one form, so that ${text.outcome}.`,
        'Functional description': clip(
          `${window.description} Window ${window.surface} over ${window.entity}: ${editable.length} editable fields (${required.length} required${lineRequired.length ? `, plus ${lineRequired.length} per line` : ''}), ${pickers.length} pickers, ${window.actions.length} actions.`,
        ),
        'Inputs - required':
          clip(
            [...required, ...lineRequired]
              .map((field) => `${shownLabel(field)} (${humanAction(field)})`)
              .join('; '),
          ) || '—',
        'Inputs - optional':
          clip(
            [
              optional.map((field) => shownLabel(field)).join('; '),
              autoFilled.length
                ? `Filled by a pick: ${autoFilled.map((field) => `${shownLabel(field)} (from ${shownLabel(filledBy(field))})`).join('; ')}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
            1500,
          ) || '—',
        'Masters / pickers': clip(pickers.map(pickerText).join('\n')) || '—',
        'API - main call': `POST ${window.base}/v1/records/${window.entity}`,
        'Other API calls': clip(
          [
            `PATCH ${window.base}/v1/records/${window.entity}/{id} (If-Match: version)`,
            `GET ${window.base}/v1/records/${window.entity}/{id}`,
            ...unique(pickers.map((field) => field.reference.resolverKey).filter(Boolean)).map(
              (resolver) =>
                `GET ${lookups[resolver]?.base ?? window.base}/v1/lookups/${resolver}?search=`,
            ),
          ].join('\n'),
        ),
        Permission: `create/update: the module's write permission (see Roles & personas); read ${window.readPermission || '—'}`,
        'Request (input)': clip(
          `POST body (Idempotency-Key header): ${JSON.stringify(body)}`,
          1200,
        ),
        'Response (output)':
          '201 the record { id, version, …readable fields } with an ETag; 400 names the fields to correct; 403 without permission; 409 on a stale version (update)',
        'Expected result': `Form opens; ${required.length + lineRequired.length} required fields; every picker offers options or Add new; Save creates the record and it appears in the list; ≤ 30 s for a trained person.`,
        'Business outcome': text.outcome,
        'Target (s)': 30,
        'KLM estimate (s)': seconds,
        'Screen ready (ms)': screen?.readyMs ?? null,
        'Journey measured (s)': measuredJourney?.humanSeconds ?? null,
        [CURRENT_HEADER]: screen?.form
          ? `New form: ${screen.form.controls} controls, ${screen.form.required} required, ${screen.form.pickers} pickers, opened in ${screen.form.openMs} ms`
          : screen
            ? screenState(screen)
            : 'Not measured',
        Verdict: verdict,
        'Issues found': clip(issues.join('\n')) || '—',
        'Bug IDs': bugsHere.map((bug) => bug.id).join(', ') || '—',
        'Fix / change': clip(bugsHere.map((bug) => `${bug.id}: ${bug.fix}`).join('\n')) || '—',
        'Work item':
          unique([
            ...bugsHere.flatMap((bug) => wiOf([bug.wi])),
            issues.length ? 'WI-OI-148' : '',
            required.length + lineRequired.length >= 6 ? 'WI-OI-149' : '',
            labelIssues.length || helpless.length ? 'WI-OI-150' : '',
          ]).join(', ') || '—',
        Priority:
          bestPriority(bugsHere.map((bug) => bug.priority)) !== '—'
            ? bestPriority(bugsHere.map((bug) => bug.priority))
            : issues.length
              ? 'P2'
              : '—',
        'QA status': qaFrom(bugsHere, verdict),
        Evidence: measuredJourney
          ? `journey ${createJourney}, ${latestFile.split('/').at(-1)}`
          : 'packages/contracts window baselines (generated)',
      }),
    );
  }
  for (const action of window.actions) {
    const parameters = action.parameters ?? [];
    const uuidish = parameters
      .filter((parameter) => /uuid|\bid\b/i.test(parameter.label))
      .map((parameter) => parameter.label);
    const visibility = action.visibilityCondition
      ? `Offered when ${action.visibilityCondition.field} ${String(action.visibilityCondition.operator).toLowerCase()} ${JSON.stringify(action.visibilityCondition.value)}`
      : 'Offered on every record';
    const seconds = round1(
      HUMAN.navigate +
        HUMAN.open +
        HUMAN.click +
        parameters
          .filter((parameter) => parameter.required)
          .reduce(
            (sum, parameter) =>
              sum + (/TEXTAREA/.test(parameter.type) ? HUMAN.text + 10 * K : HUMAN.text),
            0,
          ) +
        HUMAN.submit +
        SAVE_SECONDS,
    );
    const actionBugs = uuidish.length
      ? bugRows.filter((bug) => bug.root === 'QA-022' && bug.module === module.sheet)
      : [];
    rows.push(
      story({
        'Story ID': id(),
        Type: 'Action',
        Screen: label,
        Route: route ?? '— (no screen)',
        Persona: text.persona,
        'User story': `${asPersona(text.persona)}, I want to run "${action.label}" on a record in ${label}, so that it moves to its next state with an audit trail.`,
        'Functional description': clip(
          `${action.type ?? 'COMMAND'} ${action.handlerKey ?? action.actionKey}. ${visibility}.${action.confirmationPrompt ? ` Confirmation: "${action.confirmationPrompt}"` : ''}`,
        ),
        'Inputs - required':
          parameters
            .filter((parameter) => parameter.required)
            .map((parameter) => `${parameter.label} (${parameter.type})`)
            .join('; ') || '—',
        'Inputs - optional':
          parameters
            .filter((parameter) => !parameter.required)
            .map((parameter) => `${parameter.label} (${parameter.type})`)
            .join('; ') || '—',
        'Masters / pickers': uuidish.length ? `typed ids: ${uuidish.join(', ')}` : '—',
        'API - main call': `POST ${window.base}/v1/records/${window.entity}/{id}/actions/${action.actionKey}`,
        'Other API calls': '—',
        Permission: (action.requiredPermissions ?? []).join(', ') || '—',
        'Request (input)': `POST body (Idempotency-Key header): ${JSON.stringify(Object.fromEntries(parameters.map((parameter) => [parameter.key, parameter.required ? `<${parameter.label}>` : null])))}`,
        'Response (output)':
          '200 the updated record; 403 without the permission; 409/422 when the record is not in a state that allows it',
        'Expected result': `${visibility}; ${action.confirmationPrompt ? 'asks for confirmation' : 'no confirmation'}; the record changes state and the change is audited; ≤ 10 s.`,
        'Business outcome': `${action.label} on ${lcFirst(label)} is controlled and traceable`,
        'Target (s)': 10,
        'KLM estimate (s)': seconds,
        [CURRENT_HEADER]: screen
          ? screenVerdict(screen) === 'BLOCKED'
            ? 'Screen blocked (see the screen story)'
            : 'Action offered by the window (not run: dry e2e never changes data on UAT)'
          : 'Not measured',
        Verdict:
          screen && screenVerdict(screen) !== 'BLOCKED'
            ? timeVerdict(seconds, 10)
            : screen
              ? 'BLOCKED'
              : 'NOT RUN',
        'Issues found': uuidish.length
          ? `asks for ids: ${uuidish.join(', ')}`
          : seconds > 10
            ? 'over the 10 s action target'
            : '—',
        'Bug IDs': actionBugs.map((bug) => bug.id).join(', ') || '—',
        'Fix / change': actionBugs.map((bug) => bug.fix).join('\n') || '—',
        'Work item': uuidish.length || seconds > 10 ? 'WI-OI-149' : '—',
        Priority: uuidish.length ? 'P1' : '—',
        'QA status': uuidish.length ? 'Fail - open bug' : 'Not run',
        Evidence: 'packages/contracts window baselines (generated)',
      }),
    );
  }
  return rows;
}

function journeyStory(jid, storyId) {
  const result = latest[jid];
  const estimate = klm[jid];
  const bugs = (JOURNEY_BUGS[jid] ?? []).map((bugId) => bugById[bugId]).filter(Boolean);
  return story({
    'Story ID': storyId,
    Type: 'Journey',
    Screen: screenLabel(result?.route ?? ''),
    Route: result?.route ?? '—',
    Persona: estimate.persona,
    'User story': `${jid}: ${asPersona(estimate.persona)}, I want to ${lcFirst(estimate.outcome)} within ${estimate.target} s.`,
    'Functional description': clip(estimate.note ?? estimate.parts?.join('; ') ?? ''),
    'Inputs - required': result?.requiredFields ? `${result.requiredFields} required fields` : '—',
    'Masters / pickers': result?.pickers
      ? `${result.pickers} pickers${result.emptyPickers?.length ? `; empty: ${result.emptyPickers.join(', ')}` : ''}`
      : '—',
    'API - main call':
      unique((result?.steps ?? []).flatMap((step) => step.failed)).join('\n') ||
      'see Journey steps',
    'Expected result': `The outcome in ≤ ${estimate.target} s for a trained-once person; no error; no dead end.`,
    'Business outcome': estimate.outcome,
    'Target (s)': estimate.target,
    'KLM estimate (s)': estimate.seconds,
    'Journey measured (s)': result?.verdict === 'NOT RUN' ? null : (result?.humanSeconds ?? null),
    [CURRENT_HEADER]: result
      ? `${result.verdict}${result.verdict === 'NOT RUN' ? '' : ` — ${result.humanSeconds} s human, ${result.machineSeconds} s machine`}`
      : 'not run',
    Verdict: result?.verdict ?? 'NOT RUN',
    'Issues found': clip((result?.blockers ?? []).join('\n')) || '—',
    'Bug IDs': bugs.map((bug) => bug.id).join(', ') || '—',
    'Fix / change': clip(bugs.map((bug) => `${bug.id}: ${bug.fix}`).join('\n')) || '—',
    'Work item': unique(bugs.flatMap((bug) => wiOf([bug.wi])).concat('WI-OI-151')).join(', '),
    Priority: bestPriority(bugs.map((bug) => bug.priority)),
    'QA status': journeyStatus(jid),
    Evidence: `${latestFile.split('/').at(-1)} (dry run); plan estimate after the work: ${JOURNEY_AFTER[jid]} s`,
  });
}

// ---------------------------------------------------------------- module sheets
const moduleTables = {};
for (const module of MODULES) {
  const ws = SHEETS[module.sheet].ws;
  const rows = storiesFor(module);
  const screens = routesOf(module);
  title(ws, module.sheet);
  ws.mergeCells(2, 1, 2, 12);
  put(ws, 2, 1, module.purpose, { italic: true, color: COLOR.muted });
  ws.getRow(2).height = 30;
  const entries = module.catalog.map((key) => catalog[key]).filter(Boolean);
  const facts = [
    ['Module', module.sheet],
    ['Route', screens[0] ?? '—'],
    ['API base', module.base.join(', ') || '—'],
    [
      'Readiness',
      entries.map((entry) => `${entry.readiness} / ${entry.maturity}`).join('; ') || '—',
    ],
  ];
  facts.forEach(([label, value], index) => {
    put(ws, 3, index * 2 + 1, label, { bold: true, color: COLOR.muted, wrap: false });
    put(ws, 3, index * 2 + 2, value, { wrap: false });
  });
  const lastRow = 7 + rows.length;
  const bugs = bugRows.filter((bug) => bug.module === module.sheet);
  const journeys = journeysOf(module);
  const kpis = [
    ['Screens', F(`COUNTIF('Screen inventory'!$A:$A,$B$3)`, screens.length)],
    ['Stories', F(`COUNTA($A$8:$A$${lastRow})`, rows.length)],
    [
      'Bugs open',
      F(
        `COUNTIFS('QA bug tracker'!$B:$B,$B$3,'QA bug tracker'!$N:$N,"Open")`,
        bugs.filter((bug) => bug.status === 'Open').length,
      ),
    ],
    [
      'Bugs fixed',
      F(
        `COUNTIFS('QA bug tracker'!$B:$B,$B$3,'QA bug tracker'!$N:$N,"Fixed*")`,
        bugs.filter((bug) => bug.status.startsWith('Fixed')).length,
      ),
    ],
    ['Journeys', F('COUNTIF(Journeys!$D:$D,$B$3)', journeys.length)],
    [
      'Journeys meeting target',
      F(
        `COUNTIFS(Journeys!$D:$D,$B$3,Journeys!$M:$M,"MEETS")`,
        journeys.filter((jid) => latest[jid]?.verdict === 'MEETS').length,
      ),
    ],
  ];
  kpis.forEach(([label, value], index) => {
    put(ws, 4, index * 2 + 1, label, { bold: true, color: COLOR.muted, wrap: false });
    put(ws, 4, index * 2 + 2, value, { bold: true, h: 'left' });
  });
  put(ws, 5, 1, 'Roles', { bold: true, color: COLOR.muted, wrap: false });
  ws.mergeCells(5, 2, 5, 6);
  put(
    ws,
    5,
    2,
    roles
      .filter((role) => module.catalog.includes(role.catalogKey))
      .map((role) => role.name)
      .join(', ') || '—',
  );
  put(ws, 5, 7, 'Personas', { bold: true, color: COLOR.muted, wrap: false });
  ws.mergeCells(5, 8, 5, 12);
  put(ws, 5, 8, unique(screens.map((route) => SCREENS[route]?.persona)).join(', ') || '—');
  ws.getRow(5).height = 28;
  const span = table(ws, 7, STORY_COLUMNS, rows, { freezeColumns: 1 });
  colorize(ws, `${letter(COL.Verdict + 1)}8:${letter(COL.Verdict + 1)}${lastRow}`);
  colorize(ws, `${letter(COL['QA status'] + 1)}8:${letter(COL['QA status'] + 1)}${lastRow}`);
  SHEETS[module.sheet].rows = span;
  moduleTables[module.sheet] = { rows, span };
}

// ---------------------------------------------------------------- journeys
{
  const ws = SHEETS.Journeys.ws;
  const rows = JOURNEY_IDS.map((jid, index) => {
    const r = index + 2;
    const plan = klm[jid];
    const b = before[jid];
    const l = latest[jid];
    const bugs = JOURNEY_BUGS[jid] ?? [];
    const measured = l && l.verdict !== 'NOT RUN' ? l.humanSeconds : null;
    return [
      jid,
      plan.persona,
      plan.outcome,
      journeySheet(jid),
      l?.route ?? '—',
      l?.kind ?? '—',
      plan.target,
      plan.seconds,
      plan.verdict,
      b && b.verdict !== 'NOT RUN' ? b.humanSeconds : null,
      b?.verdict ?? 'NOT RUN',
      measured,
      l?.verdict ?? 'NOT RUN',
      F(`IF(L${r}="","",L${r}-G${r})`, measured === null ? '' : round1(measured - plan.target)),
      l && l.verdict !== 'NOT RUN' ? l.machineSeconds : null,
      l?.requiredFields ?? null,
      l?.pickers ?? null,
      (l?.emptyPickers ?? []).join(', ') || '—',
      clip((l?.blockers ?? []).join('\n')) || '—',
      bugs.join(', ') || '—',
      journeyStatus(jid),
      JOURNEY_AFTER[jid],
      unique(bugs.flatMap((bugId) => wiOf([bugById[bugId]?.wi ?? ''])).concat('WI-OI-151')).join(
        ', ',
      ),
      clip(stepsText(l)) || clip(l?.reason ?? '—'),
    ];
  });
  table(
    ws,
    1,
    [
      { header: 'ID', width: 6 },
      { header: 'Persona', width: 16 },
      { header: 'Business outcome', width: 30 },
      { header: 'Module', width: 18 },
      { header: 'Route', width: 24 },
      { header: 'Kind', width: 10 },
      { header: 'Target (s)', width: 8, fmt: '0' },
      { header: 'KLM plan estimate (s)', width: 10, fmt: '0' },
      { header: 'KLM verdict', width: 12 },
      { header: `E2E before ${MEASURED_RELEASE} (s)`, width: 11, fmt: '0.0' },
      { header: 'Verdict before', width: 12 },
      { header: 'E2E latest (s)', width: 10, fmt: '0.0' },
      { header: 'Verdict latest', width: 12 },
      { header: 'Gap vs target (s)', width: 10, fmt: '+0.0;-0.0;0.0' },
      { header: 'Machine time (s)', width: 9, fmt: '0.0' },
      { header: 'Required fields', width: 9 },
      { header: 'Pickers', width: 8 },
      { header: 'Empty pickers', width: 16 },
      { header: 'Blockers (latest)', width: 44 },
      { header: 'Bug IDs', width: 18 },
      { header: 'Status after fixes', width: 20, edit: true },
      { header: 'Expected after plan (s)', width: 10, fmt: '0' },
      { header: 'Work items', width: 16 },
      { header: 'Steps (latest run)', width: 60 },
    ],
    rows,
    { freezeColumns: 1 },
  );
  for (const column of ['I', 'K', 'M', 'U']) colorize(ws, `${column}2:${column}${rows.length + 1}`);
  SHEETS.Journeys.rows = { first: 2, last: rows.length + 1 };
}
{
  const ws = SHEETS['Journey steps'].ws;
  const rows = JOURNEY_IDS.flatMap((jid) =>
    (latest[jid]?.steps ?? []).map((step, index) => [
      jid,
      latest[jid].persona,
      index + 1,
      step.name,
      step.machineMs,
      round1(step.humanSeconds),
      step.calls,
      step.failed.join('\n') || '—',
      step.shownErrors.join('\n') || '—',
      step.note ?? '—',
    ]),
  );
  title(
    ws,
    'Journey steps',
    `Latest e2e run: ${latestFile.replace(`${ROOT}/`, '')} (${latestRun.mode} mode). Human time = Keystroke-Level Model estimate of the step's actions + machine time.`,
  );
  SHEETS['Journey steps'].rows = table(
    ws,
    4,
    [
      { header: 'Journey', width: 8 },
      { header: 'Persona', width: 16 },
      { header: '#', width: 4 },
      { header: 'Step', width: 34 },
      { header: 'Machine (ms)', width: 11, fmt: '#,##0' },
      { header: 'Human (s)', width: 9, fmt: '0.0' },
      { header: 'API calls', width: 8 },
      { header: 'Failed calls', width: 50 },
      { header: 'Errors shown', width: 50 },
      { header: 'Note', width: 26 },
    ],
    rows,
  );
}

// ---------------------------------------------------------------- QA bug tracker
{
  const ws = SHEETS['QA bug tracker'].ws;
  const rows = bugRows.map((bug) => [
    bug.id,
    bug.module,
    bug.title,
    bug.affected.join('\n') || '—',
    bug.severity,
    bug.priority,
    bug.steps,
    bug.expected,
    bug.actual,
    bug.evidence,
    bug.cause,
    bug.fix,
    bug.files,
    bug.status,
    bug.wi,
    bug.found ?? `${BASE_DATE} · ${MEASURED_RELEASE}`,
    bug.fixedIn ?? fixedIn(bug.status),
    bug.retest,
    bug.retestResult ?? null,
    null,
    null,
  ]);
  const span = table(
    ws,
    1,
    [
      { header: 'Bug ID', width: 9 },
      { header: 'Module', width: 18 },
      { header: 'Title', width: 40 },
      { header: 'Affected screens', width: 24 },
      { header: 'Severity', width: 11 },
      { header: 'Priority', width: 7 },
      { header: 'Steps to reproduce', width: 36 },
      { header: 'Expected', width: 30 },
      { header: 'Actual', width: 34 },
      { header: 'Evidence', width: 40 },
      { header: 'Root cause', width: 44 },
      { header: 'Fix', width: 44 },
      { header: 'Files', width: 40 },
      { header: 'Status', width: 16, edit: true },
      { header: 'Work item', width: 14 },
      { header: 'Found (date · release)', width: 16 },
      { header: 'Fixed in', width: 22 },
      { header: 'Retest steps', width: 32 },
      { header: 'Retest result', width: 16, edit: true },
      { header: 'Verified by', width: 14, edit: true },
      { header: 'Notes', width: 24, edit: true },
    ],
    rows,
    { freezeColumns: 1 },
  );
  for (let row = span.first; row <= span.last; row += 1) {
    ws.getCell(row, 14).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [
        '"Open,Fixed - in branch,Fixed - deploying,Fixed - on UAT,Owner action,Retest,Closed"',
      ],
    };
    ws.getCell(row, 19).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Pass,Fail,Blocked,Not retested"'],
    };
  }
  colorize(ws, `N2:N${span.last}`);
  colorize(ws, `S2:S${span.last}`);
  SHEETS['QA bug tracker'].rows = span;
}

// ---------------------------------------------------------------- UX stories
{
  const ws = SHEETS['UX user stories'].ws;
  const rows = UX_STORIES.map(
    ([sid, wi, modules, persona, text, criteria, technical, status, commit]) => {
      const register = workItems.find((item) => item.id === wi);
      return [
        sid,
        wi,
        register?.status ?? '—',
        modules,
        persona,
        text,
        criteria,
        technical,
        status,
        commit,
        `.pi/work/${wi}.md`,
      ];
    },
  );
  SHEETS['UX user stories'].rows = table(
    ws,
    1,
    [
      { header: 'Story ID', width: 10 },
      { header: 'Work item', width: 11 },
      { header: 'Card status', width: 12 },
      { header: 'Modules', width: 22 },
      { header: 'Persona', width: 16 },
      { header: 'User story', width: 54 },
      { header: 'Acceptance criteria', width: 48 },
      { header: 'Technical change', width: 34 },
      { header: 'Status', width: 24, edit: true },
      { header: 'Commit', width: 14 },
      { header: 'Evidence', width: 20 },
    ],
    rows,
  );
  colorize(ws, `C2:C${rows.length + 1}`);
  colorize(ws, `I2:I${rows.length + 1}`);
}

// ---------------------------------------------------------------- change log
{
  const ws = SHEETS['Change log'].ws;
  title(
    ws,
    'Change log',
    `Branch ${BRANCH}; fixes in ${FIX_COMMIT}; this workbook generated at ${HEAD}.`,
  );
  const commits = git('log --date=short --format=%h%x09%ad%x09%s 268384f8^..HEAD')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
  const commitTable = table(
    ws,
    4,
    [
      { header: 'Commit', width: 11 },
      { header: 'Date', width: 11 },
      { header: 'Summary', width: 90 },
      { header: 'State', width: 30 },
    ],
    commits.map(([hash, date, subject]) => [
      hash,
      date,
      subject,
      ['268384f8', 'c88a88d4'].includes(hash)
        ? 'On UAT'
        : ['59c0fe7f', '88e493d7'].includes(hash)
          ? 'On UAT (88e493d7)'
          : "In branch, awaiting the owner's deploy",
    ]),
  );
  const NOTES = [
    [
      /module-call\.job\.ts$/,
      'Kernel worker',
      'Organization delivery to Inventory, Orders, Procurement and General ledger',
      'QA-003',
    ],
    [
      /organization-access\.ts$/,
      'Module SDK',
      'A pending organization version is a plain 503',
      'QA-003',
    ],
    [
      /universal-(orders|procurement)\/module\.yaml$/,
      'Orders / Procurement',
      'records: true in the gateway; roles read the masters their pickers need',
      'QA-001, QA-002, QA-018',
    ],
    [
      /module-gateways\.ts$/,
      'Web gateway (generated)',
      'Record and lookup routes for Orders and Procurement',
      'QA-001, QA-002',
    ],
    [
      /partners-record-adapter\.ts$/,
      'Business partners',
      'Sort fields; business-partners-parties lookup for customer and vendor pickers',
      'QA-006, QA-014, QA-015',
    ],
    [
      /catalogue-records\.service\.ts$/,
      'Products',
      'Product lookup returns code, name and base unit',
      'QA-016',
    ],
    [/dictionary\.ts$/, 'Contracts', 'Reference fills', 'QA-016'],
    [
      /window-model\.ts$/,
      'Configuration React',
      'Money typed and shown in normal units; plain labels',
      'QA-017',
    ],
    [
      /record-client\.ts$/,
      'Configuration React',
      'Lookup option attributes; plain status words',
      'QA-016, QA-019',
    ],
    [
      /MetadataWindow\.tsx$/,
      'Configuration React',
      'Picks fill the named fields; money shown in normal units',
      'QA-016, QA-017',
    ],
    [/record-dispatcher\.ts$/, 'Module SDK', 'Lookup option attributes', 'QA-016'],
    [/window-builder\.mjs$/, 'Window builder', 'lookup(key, resolver, { fills })', 'QA-016'],
    [
      /(orders|procurement).*(windows\.mjs|\.window\.json)$/,
      'Orders / Procurement windows',
      'Customer, vendor and product references with fills',
      'QA-014, QA-015, QA-016',
    ],
    [
      /Workspace\.tsx$/,
      'Orders / Procurement web',
      'Parties lookup routed to Business partners',
      'QA-014, QA-015',
    ],
    [/TenantAccessManager\.tsx$/, 'Settings', 'Empty response bodies tolerated', 'QA-010'],
    [/ConfiguredTenantFields\.tsx$/, 'Settings', 'Hidden when no manifest is published', 'QA-011'],
    [/source-access\.service\.ts$/, 'Analytics', 'Plain refusal messages', 'QA-012'],
    [
      /PlatformTenantControl\.tsx$/,
      'Platform Control Tower',
      'Workspace address follows the name',
      'QA-020',
    ],
    [/setup\/index\.ts$/, 'Set-up guide', 'Links to the Settings routes', 'QA-021'],
    [/generated\.ts$/, 'Generated', 'Regenerated from the manifests and windows', '—'],
    [/e2e\/specs\/journeys\//, 'Journey e2e', 'Timed persona journeys (WI-OI-151)', '—'],
    [/^\.pi\/|^docs\//, 'Evidence', 'Work-item evidence and the before run', '—'],
  ];
  const files = git(`show --name-only --format= ${FIX_COMMIT}`).split('\n').filter(Boolean);
  const start = commitTable.last + 3;
  put(ws, start - 1, 1, `Files changed by ${FIX_COMMIT}`, {
    bold: true,
    size: 12,
    color: COLOR.title,
    wrap: false,
  });
  const fileRows = files.map((file) => {
    const note = NOTES.find(([pattern]) => pattern.test(file));
    return [file, note?.[1] ?? '—', note?.[2] ?? '—', note?.[3] ?? '—'];
  });
  fileRows.forEach((row, index) =>
    row.forEach((value, column) =>
      put(ws, start + 1 + index, column + 1, value, {
        border: true,
        fill: index % 2 ? COLOR.band : undefined,
      }),
    ),
  );
  ['File', 'Area', 'Change', 'Bugs'].forEach((header, column) =>
    put(ws, start, column + 1, header, {
      bold: true,
      color: COLOR.headText,
      fill: COLOR.head,
      border: true,
    }),
  );
  ws.getColumn(1).width = 70;
  SHEETS['Change log'].rows = { first: commitTable.first, last: start + fileRows.length };
}

// ---------------------------------------------------------------- screen inventory
const inventoryRoutes = MODULES.flatMap((module) =>
  routesOf(module).map((route) => [module.sheet, route]),
);
{
  const ws = SHEETS['Screen inventory'].ws;
  const rows = inventoryRoutes.map(([sheet, route], index) => {
    const r = index + 2;
    const screen = liveByRoute[route];
    const items = screen ? plan(screen) : [];
    const bugs = bugRows
      .filter((bug) => bug.module === sheet && bug.affected.includes(route))
      .map((bug) => bug.id);
    return [
      sheet,
      route,
      screenLabel(route),
      screen?.crumb ?? '—',
      screen?.domMs ?? null,
      screen?.readyMs ?? null,
      screen?.calls ?? null,
      screen?.slowest?.path ?? '—',
      screen?.slowest?.ms ?? null,
      (screen?.failed ?? []).join('\n') || '—',
      screen ? screenState(screen) : `not measured: ${UNMEASURED[route] ?? ''}`,
      screen?.rows ?? null,
      screen ? (screen.search ? 'Yes' : 'No') : '—',
      (screen?.buttons ?? []).join(', ') || '—',
      screen?.form
        ? `${screen.form.controls} / ${screen.form.required} / ${screen.form.pickers}`
        : '—',
      screen?.form?.openMs ?? null,
      items.join('\n') || '—',
      wiOf(items).join(', ') || '—',
      bugs.join(', ') || '—',
      F(
        `IF(F${r}="","",IF(F${r}<=1000,"Yes","No"))`,
        screen ? (screen.readyMs <= 1000 ? 'Yes' : 'No') : '',
      ),
      F(
        `IF(F${r}="","",IF(F${r}<=2000,"Yes","No"))`,
        screen ? (screen.readyMs <= 2000 ? 'Yes' : 'No') : '',
      ),
      screenVerdict(screen),
      beforeByRoute[route]?.readyMs ?? null,
      beforeByRoute[route] ? screenState(beforeByRoute[route]) : 'not measured',
      (beforeByRoute[route]?.failed ?? []).join('\n') || '—',
      screenVerdict(beforeByRoute[route]),
    ];
  });
  SHEETS['Screen inventory'].rows = table(
    ws,
    1,
    [
      { header: 'Module', width: 18 },
      { header: 'Route', width: 28 },
      { header: 'Screen', width: 20 },
      { header: 'Breadcrumb', width: 34 },
      { header: 'DOM (ms)', width: 9, fmt: '#,##0' },
      { header: 'Ready (ms)', width: 9, fmt: '#,##0' },
      { header: 'API calls', width: 7 },
      { header: 'Slowest call', width: 44 },
      { header: 'Slowest (ms)', width: 9, fmt: '#,##0' },
      { header: 'Failed calls', width: 44 },
      { header: 'State', width: 34 },
      { header: 'Rows', width: 6 },
      { header: 'Search', width: 7 },
      { header: 'Buttons', width: 18 },
      { header: 'Form (controls / required / pickers)', width: 12 },
      { header: 'Form opens (ms)', width: 9, fmt: '#,##0' },
      { header: 'Plan items', width: 44 },
      { header: 'Work items', width: 14 },
      { header: 'Bug IDs', width: 14 },
      { header: 'Ready ≤ 1 s', width: 8 },
      { header: 'Ready ≤ 2 s', width: 8 },
      { header: 'Verdict', width: 12 },
      { header: `Ready before ${MEASURED_RELEASE} (ms)`, width: 10, fmt: '#,##0' },
      { header: 'State before', width: 30 },
      { header: 'Failed calls before', width: 40 },
      { header: 'Verdict before', width: 12 },
    ],
    rows,
    { freezeColumns: 2 },
  );
  colorize(ws, `V2:V${rows.length + 1}`);
  colorize(ws, `Z2:Z${rows.length + 1}`);
}

// ---------------------------------------------------------------- field dictionary
{
  const ws = SHEETS['Field dictionary'].ws;
  const rows = windows.flatMap((window) => {
    const sheet =
      MODULES.find((module) => (module.windows ?? []).includes(window.module))?.sheet ??
      window.module;
    return window.fields.map((field) => [
      sheet,
      window.label,
      window.route ?? '— (no screen)',
      field.entityKey,
      field.fieldKey,
      shownLabel(field),
      field.type,
      field.required ? 'Yes' : 'No',
      writable(field) ? 'Yes' : 'No',
      isPicker(field)
        ? (field.reference.resolverKey ?? field.reference.targetEntityKey ?? '—')
        : '—',
      isPicker(field) ? lookupCount(field.reference.resolverKey ?? '') : '—',
      isPicker(field) ? (field.reference.createWith ? 'Yes' : 'No') : '—',
      field.reference?.fills
        ? Object.entries(field.reference.fills)
            .map(([from, to]) => `${from} → ${to}`)
            .join(', ')
        : '—',
      isList(field)
        ? clip((field.reference.staticValues ?? []).map((value) => value.label).join(', '), 500)
        : '—',
      field.defaultValue === undefined ? '—' : JSON.stringify(field.defaultValue),
      clip(field.helpText ?? field.description ?? '', 400) || '—',
      TECH.test(shownLabel(field))
        ? 'technical word in label'
        : shownLabel(field).length > 40
          ? 'label over 40 characters'
          : '—',
      `${field.classification ?? '—'}${field.maskOnDisplay ? ', masked' : ''}`,
    ]);
  });
  SHEETS['Field dictionary'].rows = table(
    ws,
    1,
    [
      { header: 'Module', width: 18 },
      { header: 'Window', width: 20 },
      { header: 'Screen route', width: 24 },
      { header: 'Entity', width: 26 },
      { header: 'Field key', width: 24 },
      { header: 'Label (as shown)', width: 26 },
      { header: 'Type', width: 11 },
      { header: 'Required', width: 8 },
      { header: 'Editable', width: 8 },
      { header: 'Picker → lookup', width: 24 },
      { header: 'Lookup options (bench)', width: 14 },
      { header: 'Add new', width: 7 },
      { header: 'Fills', width: 30 },
      { header: 'Values', width: 30 },
      { header: 'Default', width: 14 },
      { header: 'Help text', width: 36 },
      { header: 'Label issue', width: 18 },
      { header: 'Classification', width: 14 },
    ],
    rows,
    { freezeColumns: 2 },
  );
}

// ---------------------------------------------------------------- masters
{
  const ws = SHEETS['Masters & lookups'].ws;
  const used = {};
  for (const window of windows)
    for (const field of window.fields.filter(isPicker)) {
      const resolver = field.reference.resolverKey;
      if (!resolver) continue;
      used[resolver] ??= { windows: new Set(), required: new Set(), addNew: false };
      used[resolver].windows.add(window.label);
      if (field.required && writable(field)) used[resolver].required.add(window.label);
      if (field.reference.createWith) used[resolver].addNew = true;
    }
  const STARTER = {
    'wf-resources': 'Import people; add from Settings › People (WI-OI-148)',
    'wf-absence-types': 'Starter absence types on enable (WI-OI-148)',
    'wf-calendars': 'Starter site calendar and working week (WI-OI-148)',
    'wf-capabilities': 'Starter skills pack (WI-OI-148)',
    'cmms-classifications': 'Classification starter pack (WI-OI-148)',
    'inventory-warehouses': 'Default warehouse per unit on enable (WI-OI-148)',
    'catalogue-uoms': 'Units starter pack (exists)',
    'finance-accounts': 'Starter chart on book set-up (exists)',
    'speed-library-materials': 'Library starter pack (WI-OI-148)',
    'organization-units': 'From Settings › Organization',
    'workspace-sites': 'From Places & maps (Geospatial)',
    'business-partners-parties': 'Import customers and vendors (WI-OI-148)',
  };
  const LOOKUP_BUGS = {
    'inventory-warehouses': ['QA-004', 'QA-003'],
    'inventory-locations': ['QA-005'],
    'cmms-classifications': ['QA-027'],
    'organization-units': ['QA-025', 'QA-024'],
    'workspace-sites': ['QA-008'],
    'business-partners-parties': ['QA-014', 'QA-015'],
    'finance-books': ['QA-028'],
    'speed-sites': ['QA-028'],
    'wf-capabilities': ['QA-026', 'QA-028'],
  };
  const keys = unique([...Object.keys(lookups), ...Object.keys(used)]).sort();
  const rows = keys.map((key) => {
    const entry = lookups[key];
    const base =
      entry?.base ?? (key.startsWith('business-partners') ? '/api/business-partners' : '—');
    const bugs = LOOKUP_BUGS[key] ?? (key.startsWith('wf-') ? ['QA-026'] : []);
    return [
      key,
      base,
      `GET ${base}/v1/lookups/${key}?search=&limit=`,
      entry ? (entry.status ? null : entry.options) : null,
      entry
        ? entry.status
          ? `fails (HTTP ${entry.status})`
          : entry.options
            ? 'ok'
            : 'empty'
        : key === 'business-partners-parties'
          ? `not measured (new in ${FIX_COMMIT})`
          : 'not measured in the bench',
      [...(used[key]?.windows ?? [])].join(', ') || '—',
      [...(used[key]?.required ?? [])].join(', ') || '—',
      used[key] ? (used[key].addNew ? 'Yes' : 'No') : '—',
      STARTER[key] ?? '—',
      unique(bugs).slice(0, 6).join(', ') || '—',
    ];
  });
  SHEETS['Masters & lookups'].rows = table(
    ws,
    1,
    [
      { header: 'Lookup', width: 26 },
      { header: 'API base', width: 26 },
      { header: 'Call', width: 50 },
      { header: 'Options in the workspace', width: 11, fmt: '0' },
      { header: 'State', width: 24 },
      { header: 'Used by windows', width: 40 },
      { header: 'Required in', width: 34 },
      { header: 'Add new', width: 8 },
      { header: 'Starter data / source', width: 36 },
      { header: 'Bug IDs', width: 16 },
    ],
    rows,
  );
}

// ---------------------------------------------------------------- API catalogue
{
  const ws = SHEETS['API catalogue'].ws;
  const sheetOfBase = (bases) =>
    MODULES.find((module) => module.base.some((base) => bases.includes(base)))?.sheet ?? '—';
  const rows = [];
  for (const gateway of gateways) {
    const sheet = sheetOfBase(gateway.basePaths);
    const base = gateway.basePaths[0];
    for (const route of gateway.routes)
      for (const [method, permission] of Object.entries(route.methods)) {
        rows.push([
          sheet,
          gateway.serviceName,
          method,
          `${base}/${route.template}`,
          [permission].flat().join(', '),
          route.template.startsWith('v1/records')
            ? 'Record API'
            : route.template.startsWith('v1/lookups')
              ? 'Lookup'
              : 'REST',
          gateway.basePaths.slice(1).join(', ')
            ? `also ${gateway.basePaths.slice(1).join(', ')}`
            : '—',
        ]);
      }
    for (const unavailable of gateway.unavailable ?? [])
      rows.push([
        sheet,
        gateway.serviceName,
        unavailable.methods.join(', '),
        `${base}/${unavailable.template}`,
        '—',
        'Unavailable',
        'Declared unavailable in the manifest',
      ]);
  }
  const recordModules = unique(windows.map((window) => window.base)).filter(Boolean);
  for (const base of recordModules) {
    const sheet = sheetOfBase([base]);
    if (rows.some((row) => row[3].startsWith(`${base}/v1/records`))) continue;
    for (const [method, path, what] of [
      [
        'GET',
        'v1/records/{entity}',
        'List (page, pageSize, search, sortField, sortDirection, filters)',
      ],
      ['POST', 'v1/records/{entity}', 'Create (Idempotency-Key)'],
      ['GET', 'v1/records/{entity}/{id}', 'Read (ETag)'],
      ['PATCH', 'v1/records/{entity}/{id}', 'Update (If-Match)'],
      ['POST', 'v1/records/{entity}/{id}/actions/{action}', 'Action (Idempotency-Key)'],
      ['GET', 'v1/lookups/{resolver}', 'Picker options (search, ids, limit)'],
    ]) {
      rows.push([
        sheet,
        'Record API (module SDK)',
        method,
        `${base}/${path}`,
        'per entity and action (record adapter)',
        'Record API',
        what,
      ]);
    }
  }
  for (const module of MODULES)
    for (const api of module.apis ?? []) {
      const [call, purpose] = api.split(' — ');
      const [method, ...path] = call.split(' ');
      rows.push([
        module.sheet,
        'Control plane / web',
        method,
        path.join(' '),
        '—',
        'Control plane',
        purpose,
      ]);
    }
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[3].localeCompare(b[3]));
  SHEETS['API catalogue'].rows = table(
    ws,
    1,
    [
      { header: 'Module', width: 20 },
      { header: 'Service', width: 26 },
      { header: 'Method', width: 9 },
      { header: 'Path', width: 64 },
      { header: 'Permission', width: 36 },
      { header: 'Kind', width: 13 },
      { header: 'Notes', width: 40 },
    ],
    rows,
    { freezeColumns: 1 },
  );
}

// ---------------------------------------------------------------- roles
{
  const ws = SHEETS['Roles & personas'].ws;
  const rows = roles.map((role) => [
    MODULES.find((module) => module.catalog.includes(role.catalogKey))?.sheet ?? role.catalogKey,
    role.name,
    role.description,
    role.permissions.length,
    role.permissions.join(', '),
  ]);
  SHEETS['Roles & personas'].rows = table(
    ws,
    1,
    [
      { header: 'Module', width: 20 },
      { header: 'Role', width: 28 },
      { header: 'What the role does', width: 50 },
      { header: 'Permissions', width: 11 },
      { header: 'Permission list', width: 90 },
    ],
    rows,
  );
}

// ---------------------------------------------------------------- work items register
{
  const ws = SHEETS['Work items register'].ws;
  const rows = [...workItems]
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
    .map((item) => [
      item.id,
      clip(item.title, 300),
      item.status,
      clip(item.owner, 120),
      clip(item.reviewers, 160),
      clip(item.gate, 200),
      item.modules.join(', ') || '—',
      clip(item.requirements, 200),
      clip(item.evidence, 1500),
      item.card || '—',
    ]);
  SHEETS['Work items register'].rows = table(
    ws,
    1,
    [
      { header: 'Work item', width: 13 },
      { header: 'Title', width: 44 },
      { header: 'Status', width: 12 },
      { header: 'Owner', width: 22 },
      { header: 'Reviewers', width: 22 },
      { header: 'Gate', width: 22 },
      { header: 'Modules', width: 26 },
      { header: 'Requirements', width: 22 },
      { header: 'Evidence', width: 90 },
      { header: 'Card', width: 22 },
    ],
    rows,
  );
  colorize(ws, `C2:C${rows.length + 1}`);
}

// ---------------------------------------------------------------- benchmark method
{
  const ws = SHEETS['Benchmark method'].ws;
  title(ws, 'Benchmark method', 'Blue cells are inputs; black cells are formulas over them.');
  const measures = [
    [
      'Business outcome',
      '10 s look-up or approval; ≤ 30 s create',
      'Owner target; 10-second attention limit for one task',
    ],
    [
      'Screen ready (navigation → data shown)',
      'p50 ≤ 1 s, p90 ≤ 2 s, never > 5 s',
      '1-second flow limit',
    ],
    ['Clicks to a screen', '≤ 2 (sidebar module → tab)', 'WI-OI-145'],
    [
      'Required fields on a create form',
      '≤ 5; the rest defaulted or derived',
      'Each typed field costs 4–5 s',
    ],
    [
      'Prerequisites',
      'Never a dead end: a missing master is named with a way to create it in place',
      'Without training',
    ],
    [
      'First use',
      'Each module usable 10 minutes after it is enabled, by the workspace admin alone',
      'Time to first value',
    ],
    [
      'Words',
      'No codes, ids, "minor units", API paths or work-item numbers on screen',
      'audit:ui-shell',
    ],
  ];
  table(
    ws,
    4,
    [
      { header: 'Measure', width: 34 },
      { header: 'Target', width: 50 },
      { header: 'Why', width: 40 },
    ],
    measures,
    { freezeColumns: 0 },
  );
  ws.views = [];
  const at = 4 + measures.length + 3;
  put(ws, at - 1, 1, 'Keystroke-Level Model (Card, Moran & Newell)', {
    bold: true,
    size: 12,
    color: COLOR.title,
    wrap: false,
  });
  const constants = [
    ['M — think (s)', M],
    ['P — point (s)', P],
    ['B — click (s)', B],
    ['K — key, average typist (s)', K],
    ['Save round-trip assumed (s)', SAVE_SECONDS],
  ];
  constants.forEach(([label, value], index) => {
    put(ws, at + index, 1, label, { border: true });
    put(ws, at + index, 2, value, { border: true, color: COLOR.input, numFmt: '0.00', h: 'left' });
  });
  const c = (index) => `$B$${at + index}`;
  const costs = [
    ['Navigate to a screen (M + 2(P+B))', `${c(0)}+2*(${c(1)}+${c(2)})`, HUMAN.navigate],
    ['Open a form (P+B)', `${c(1)}+${c(2)}`, HUMAN.open],
    ['Type text, 8 keys (M+P+B+8K)', `${c(0)}+${c(1)}+${c(2)}+8*${c(3)}`, HUMAN.text],
    ['Type a number, 4 keys (M+P+B+4K)', `${c(0)}+${c(1)}+${c(2)}+4*${c(3)}`, HUMAN.number],
    ['Type a date, 10 keys (M+P+B+10K)', `${c(0)}+${c(1)}+${c(2)}+10*${c(3)}`, HUMAN.date],
    ['Choose from a list (M+2(P+B))', `${c(0)}+2*(${c(1)}+${c(2)})`, HUMAN.select],
    [
      'Picker: search 3 keys and pick (M+P+B+3K+P+B)',
      `${c(0)}+${c(1)}+${c(2)}+3*${c(3)}+${c(1)}+${c(2)}`,
      HUMAN.picker,
    ],
    ['Click / submit (M+P+B)', `${c(0)}+${c(1)}+${c(2)}`, HUMAN.submit],
  ];
  const costAt = at + constants.length + 2;
  put(ws, costAt - 1, 1, 'Action costs (s)', {
    bold: true,
    size: 12,
    color: COLOR.title,
    wrap: false,
  });
  costs.forEach(([label, formula, result], index) => {
    put(ws, costAt + index, 1, label, { border: true });
    put(ws, costAt + index, 2, F(formula, round1(result * 100) / 100), {
      border: true,
      numFmt: '0.00',
      h: 'left',
    });
  });
  const example = costAt + costs.length + 2;
  put(
    ws,
    example - 1,
    1,
    'Worked example: a create form with 2 text fields, 1 list and 2 pickers, screen ready 0.9 s, form opens 0.6 s',
    { bold: true, wrap: false },
  );
  put(ws, example, 1, 'Estimated human time (s)', { border: true });
  put(
    ws,
    example,
    2,
    F(
      `B${costAt}+0.9+B${costAt + 1}+0.6+2*B${costAt + 2}+B${costAt + 5}+2*B${costAt + 6}+B${costAt + 7}+B${at + 4}`,
      round1(
        HUMAN.navigate +
          0.9 +
          HUMAN.open +
          0.6 +
          2 * HUMAN.text +
          HUMAN.select +
          2 * HUMAN.picker +
          HUMAN.submit +
          SAVE_SECONDS,
      ),
    ),
    { border: true, numFmt: '0.0', h: 'left', bold: true },
  );
  const rulesAt = example + 3;
  put(ws, rulesAt - 1, 1, 'Verdicts', { bold: true, size: 12, color: COLOR.title, wrap: false });
  [
    ['MEETS', 'Estimated or measured human time within the target; no blocker.'],
    ['OVER TARGET', 'Over the target but ≤ 30 s.'],
    ['TOO SLOW', 'Over 30 s.'],
    [
      'BLOCKED',
      'An error is shown, a call fails on the main path, or a required picker has no options.',
    ],
    [
      'DEGRADED (screens)',
      'The screen works but a secondary call fails (for example place pickers).',
    ],
    ['NOT RUN', 'Needs a login or a capability the run did not have.'],
  ].forEach(([verdict, meaning], index) => {
    put(ws, rulesAt + index, 1, verdict, { border: true, bold: true });
    put(ws, rulesAt + index, 2, meaning, { border: true });
  });
  colorize(ws, `A${rulesAt}:A${rulesAt + 5}`);
  ws.getColumn(1).width = 46;
  ws.getColumn(2).width = 60;
}

// ---------------------------------------------------------------- dashboard
{
  const ws = SHEETS.Dashboard.ws;
  title(
    ws,
    'Dashboard',
    `Now: UAT 5180 ${CURRENT_RELEASE} on ${CURRENT_DATE}; before: ${MEASURED_RELEASE} on ${BASE_DATE}; latest journey run ${latestFile.split('/').at(-1)}; fixes in ${FIX_COMMIT}. Every number is a formula over the other sheets.`,
  );
  const inv = SHEETS['Screen inventory'].rows;
  const range = (column) => `'Screen inventory'!$${column}$${inv.first}:$${column}$${inv.last}`;
  const ready = live.map((screen) => screen.readyMs);
  const readyBefore = liveBefore.map((screen) => screen.readyMs);
  const failing = (screens) => screens.filter((screen) => (screen.failed ?? []).length).length;
  const erroring = (screens) => screens.filter((screen) => (screen.alerts ?? []).length).length;
  const empty = (screens) =>
    screens.filter((screen) => screen.empty && !(screen.alerts ?? []).length).length;
  const screenKpis = [
    ['Screens in the workbook', F(`COUNTA(${range('B')})`, inventoryRoutes.length), null, '—'],
    [
      'Screens measured',
      F(`COUNT(${range('F')})`, inventoryRoutes.filter(([, route]) => liveByRoute[route]).length),
      F(`COUNT(${range('W')})`, inventoryRoutes.filter(([, route]) => beforeByRoute[route]).length),
      '—',
    ],
    [
      'Ready p50 (ms)',
      F(`MEDIAN(${range('F')})`, median(ready)),
      F(`MEDIAN(${range('W')})`, median(readyBefore)),
      '≤ 1,000',
    ],
    [
      'Ready p90 (ms)',
      F(`PERCENTILE(${range('F')},0.9)`, round1(percentile(ready, 0.9))),
      F(`PERCENTILE(${range('W')},0.9)`, round1(percentile(readyBefore, 0.9))),
      '≤ 2,000',
    ],
    [
      'Screens ready ≤ 1 s',
      F(`COUNTIF(${range('F')},"<=1000")`, ready.filter((value) => value <= 1000).length),
      F(`COUNTIF(${range('W')},"<=1000")`, readyBefore.filter((value) => value <= 1000).length),
      'all',
    ],
    [
      'Screens with a failing call',
      F(`COUNTA(${range('J')})-COUNTIF(${range('J')},"—")`, failing(live)),
      F(`COUNTA(${range('Y')})-COUNTIF(${range('Y')},"—")`, failing(liveBefore)),
      '0',
    ],
    [
      'Screens showing an error',
      F(`COUNTIF(${range('K')},"error*")`, erroring(live)),
      F(`COUNTIF(${range('X')},"error*")`, erroring(liveBefore)),
      '0',
    ],
    [
      'Empty screens without guidance',
      F(`COUNTIF(${range('K')},"empty*")`, empty(live)),
      F(`COUNTIF(${range('X')},"empty*")`, empty(liveBefore)),
      '0',
    ],
  ];
  put(ws, 4, 1, 'Screens', { bold: true, size: 12, color: COLOR.title, wrap: false });
  table(
    ws,
    5,
    [
      { header: 'Measure', width: 34 },
      { header: `Now (${CURRENT_RELEASE})`, width: 12, fmt: '#,##0' },
      { header: `Before (${MEASURED_RELEASE})`, width: 12, fmt: '#,##0' },
      { header: 'Target', width: 12 },
    ],
    screenKpis,
    { freezeColumns: 0 },
  );
  const jr = SHEETS.Journeys.rows;
  const jrange = (column) => `Journeys!$${column}$${jr.first}:$${column}$${jr.last}`;
  const verdicts = ['MEETS', 'OVER TARGET', 'TOO SLOW', 'BLOCKED', 'NOT RUN'];
  const count = (values, verdict) => values.filter((value) => value === verdict).length;
  const verdictRows = verdicts.map((verdict) => [
    verdict,
    F(
      `COUNTIF(${jrange('I')},"${verdict}")`,
      count(
        JOURNEY_IDS.map((jid) => klm[jid].verdict),
        verdict,
      ),
    ),
    F(
      `COUNTIF(${jrange('K')},"${verdict}")`,
      count(
        JOURNEY_IDS.map((jid) => before[jid]?.verdict ?? 'NOT RUN'),
        verdict,
      ),
    ),
    F(
      `COUNTIF(${jrange('M')},"${verdict}")`,
      count(
        JOURNEY_IDS.map((jid) => latest[jid]?.verdict ?? 'NOT RUN'),
        verdict,
      ),
    ),
  ]);
  verdictRows.push([
    'Total',
    F(`SUM(B${17}:B${21})`, JOURNEY_IDS.length),
    F(`SUM(C${17}:C${21})`, JOURNEY_IDS.length),
    F(`SUM(D${17}:D${21})`, JOURNEY_IDS.length),
  ]);
  put(ws, 15, 1, 'Journeys (27)', { bold: true, size: 12, color: COLOR.title, wrap: false });
  table(
    ws,
    16,
    [
      { header: 'Verdict', width: 34 },
      { header: 'KLM plan', width: 12 },
      { header: 'E2E before', width: 12 },
      { header: 'E2E latest', width: 12 },
    ],
    verdictRows,
    { freezeColumns: 0 },
  );
  colorize(ws, 'A17:A21');
  const qa = SHEETS['QA bug tracker'].rows;
  const qrange = (column) => `'QA bug tracker'!$${column}$${qa.first}:$${column}$${qa.last}`;
  const statuses = [
    'Open',
    'Fixed - in branch',
    'Fixed - deploying',
    'Fixed - on UAT',
    'Owner action',
    'Retest',
  ];
  const priorities = ['P0', 'P1', 'P2', 'P3'];
  const bugTable = priorities.map((priority) => [
    priority,
    ...statuses.map((status) =>
      F(
        `COUNTIFS(${qrange('F')},"${priority}",${qrange('N')},"${status}")`,
        bugRows.filter((bug) => bug.priority === priority && bug.status === status).length,
      ),
    ),
    F(
      `COUNTIF(${qrange('F')},"${priority}")`,
      bugRows.filter((bug) => bug.priority === priority).length,
    ),
  ]);
  bugTable.push([
    'Total',
    ...statuses.map((status, index) =>
      F(
        `SUM(${letter(index + 2)}26:${letter(index + 2)}29)`,
        bugRows.filter((bug) => bug.status === status).length,
      ),
    ),
    F('SUM(H26:H29)', bugRows.length),
  ]);
  put(ws, 24, 1, 'QA bugs (rows per module) by priority and status', {
    bold: true,
    size: 12,
    color: COLOR.title,
    wrap: false,
  });
  table(
    ws,
    25,
    [
      { header: 'Priority', width: 34 },
      ...statuses.map((status) => ({ header: status, width: 12 })),
      { header: 'Total', width: 10 },
    ],
    bugTable,
    { freezeColumns: 0 },
  );
  put(ws, 33, 1, 'Per module', { bold: true, size: 12, color: COLOR.title, wrap: false });
  const moduleRows = MODULES.map((module, index) => {
    const r = 35 + index;
    const name = `$A${r}`;
    const span = moduleTables[module.sheet].span;
    const screens = routesOf(module);
    const bugs = bugRows.filter((bug) => bug.module === module.sheet);
    const journeys = journeysOf(module);
    return [
      link(module.sheet),
      module.group,
      F(`COUNTIF(${range('A')},${name})`, screens.length),
      F(
        `COUNTIFS(${range('A')},${name},${range('J')},"<>—")`,
        screens.filter((route) => (liveByRoute[route]?.failed ?? []).length).length,
      ),
      F(
        `COUNTA(${quote(module.sheet)}!$A$${span.first}:$A$${span.last})`,
        moduleTables[module.sheet].rows.length,
      ),
      F(`COUNTIF(${qrange('B')},${name})`, bugs.length),
      F(
        `COUNTIFS(${qrange('B')},${name},${qrange('N')},"Open")`,
        bugs.filter((bug) => bug.status === 'Open').length,
      ),
      F(
        `COUNTIFS(${qrange('B')},${name},${qrange('N')},"Fixed*")`,
        bugs.filter((bug) => bug.status.startsWith('Fixed')).length,
      ),
      F(`COUNTIF(${jrange('D')},${name})`, journeys.length),
      F(
        `COUNTIFS(${jrange('D')},${name},${jrange('M')},"MEETS")`,
        journeys.filter((jid) => latest[jid]?.verdict === 'MEETS').length,
      ),
    ];
  });
  table(
    ws,
    34,
    [
      { header: 'Module', width: 34 },
      { header: 'Group', width: 12 },
      { header: 'Screens', width: 12 },
      { header: 'Screens failing', width: 12 },
      { header: 'Stories', width: 12 },
      { header: 'Bugs', width: 12 },
      { header: 'Bugs open', width: 12 },
      { header: 'Bugs fixed', width: 10 },
      { header: 'Journeys', width: 10 },
      { header: 'Journeys meeting', width: 10 },
    ],
    moduleRows,
    { freezeColumns: 0 },
  );
  ws.views = [];
}

// ---------------------------------------------------------------- read me and contents
{
  const ws = SHEETS['Read me'].ws;
  title(ws, 'GigaLibs — functional and technical workbook (UX journeys, 2026-11-02)');
  const lines = [
    ['Audience', 'The owner, QA and the engineers continuing WI-OI-146 … 151 (Cursor or Claude).'],
    [
      'What it is',
      'One document for the whole product: every module and Settings area as a sheet of user stories (screens, create forms, actions, journeys, API calls, work items), each with inputs, API, request, response, expected result, business outcome, benchmark target, estimate, measurement, current result, issues, bugs, fix, work item and QA status; plus the journeys, the QA bug tracker and the reference sheets.',
    ],
    [
      'Measured on',
      `Now: UAT 5180, release ${CURRENT_RELEASE}, ${CURRENT_DATE}; before: ${MEASURED_RELEASE}, ${BASE_DATE}. As the walkthrough workspace administrator at 1440×900 (read-only crawl, e2e/ux-benchmark/bench.mjs).`,
    ],
    [
      'Journeys',
      `27 persona journeys (e2e/specs/journeys). Before: ${'journeys-e2e-before.json'} (dry run on ${MEASURED_RELEASE}). Latest: ${latestFile.replace(`${ROOT}/`, '')}. Dry runs fill every required field through the real pickers and cancel; nothing is saved on UAT.`,
    ],
    [
      'Fixes',
      `${FIX_COMMIT} on ${BRANCH} (pnpm verify green). They reach UAT when the owner deploys; the after-measurement is a rerun of the journeys and the bench, then this generator.`,
    ],
    [
      'Sheets',
      `${Object.keys(SHEETS).length} sheets: guide and summary (4), cross-module (5), modules (${MODULES.filter((module) => module.group !== 'Settings').length}), Settings areas and Platform Control Tower (${MODULES.filter((module) => module.group === 'Settings').length}), reference (6). See Contents.`,
    ],
    [
      'Story types',
      'Screen (open and use a screen), Create / edit (the metadata form), Action (a command on a record), Journey (a timed persona outcome), API (a control-plane call a Settings screen makes), Work item (a register item that touches the module).',
    ],
    [
      'Verdicts',
      'MEETS, OVER TARGET (≤ 30 s), TOO SLOW (> 30 s), BLOCKED (error or failing main call), DEGRADED (secondary call fails), NOT RUN. See Benchmark method.',
    ],
    [
      'Bug status',
      "Open; Fixed - in branch (awaiting the owner's deploy); Fixed - deploying; Fixed - on UAT; Owner action (an operation, not code); Retest (could not reproduce); Closed.",
    ],
    [
      'Cells to edit',
      'Orange headers mark the columns QA updates: QA status (module sheets), Status, Retest result, Verified by and Notes (QA bug tracker, with drop-down lists), Status after fixes (Journeys), Status (UX user stories). Example: QA-006 → Status "Fixed - on UAT", Retest result "Pass", Verified by your name.',
    ],
    [
      'Formulas',
      'The Dashboard, the KPI rows at the top of each module sheet, the journey gaps, the screen "Ready ≤ 1 s" columns and the Benchmark method costs are formulas; they recalculate when the sheets change.',
    ],
    [
      'Assumptions',
      `Human times are Keystroke-Level Model estimates (constants on Benchmark method) plus measured machine time; save round-trip assumed ${SAVE_SECONDS} s; a trained-once person. Create estimates count required fields without a default on the record and one line. Actions are estimated, never run (dry e2e does not change data on UAT). Screens not reachable by the walkthrough administrator (Accounts receivable, Platform Control Tower) are listed but not measured. Work items are mapped to modules by keywords in their title and evidence; check before relying on a mapping.`,
    ],
    [
      'Regenerate',
      'node e2e/ux-benchmark/workbook.mjs "<out.xlsx>" (needs packages/contracts built). After a new bench or journey run it picks up the latest files.',
    ],
  ];
  lines.forEach(([label, value], index) => {
    put(ws, 3 + index, 1, label, { bold: true, color: COLOR.muted });
    put(ws, 3 + index, 2, value);
  });
  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 140;
}
{
  const ws = SHEETS.Contents.ws;
  title(ws, 'Contents');
  const names = Object.keys(SHEETS);
  const rows = names.map((name, index) => {
    const entry = SHEETS[name];
    const rowsSpan = entry.rows;
    return [
      index + 1,
      link(name),
      entry.kind,
      entry.about,
      rowsSpan
        ? F(
            `COUNTA(${quote(name)}!$A$${rowsSpan.first}:$A$${rowsSpan.last})`,
            countRows(name, rowsSpan),
          )
        : null,
    ];
  });
  table(
    ws,
    3,
    [
      { header: '#', width: 5 },
      { header: 'Sheet', width: 30 },
      { header: 'Kind', width: 13 },
      { header: 'What it holds', width: 100 },
      { header: 'Rows', width: 8, fmt: '#,##0' },
    ],
    rows,
    { freezeColumns: 0 },
  );
}
function countRows(name, span) {
  const ws = SHEETS[name].ws;
  let total = 0;
  for (let row = span.first; row <= span.last; row += 1)
    if (ws.getCell(row, 1).value !== null && ws.getCell(row, 1).value !== '') total += 1;
  return total;
}

mkdirSync(dirname(OUT), { recursive: true });
await workbook.xlsx.writeFile(OUT);
console.log(
  `wrote ${OUT}: ${Object.keys(SHEETS).length} sheets, ${Object.values(moduleTables).reduce((sum, entry) => sum + entry.rows.length, 0)} stories, ${bugRows.length} bug rows (${BUGS.length} bugs), ${JOURNEY_IDS.length} journeys`,
);
