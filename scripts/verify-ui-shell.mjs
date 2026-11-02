#!/usr/bin/env node
// One Medusa-standard console (WI-OI-145, owner 2026-11-02). Every module screen sits in the shell's page frame with
// @gigalibs/web-sdk's ModulePage header; the sidebar is a module's only menu; in-page views use the shared PageTabs;
// screens speak plain words. This check holds those rules:
//
//   menu       a catalogue entry with more than one screen (generated pages below its route) declares a `menu`
//              (hard rule, no baseline)
//   tablist    hand-made role="tablist" bars outside the shared components
//   emoji      emoji in screen source
//   dev-text   work-item IDs and bare status-code errors ("Request failed (404)") in screen source
//
// The last three are counted per file: a file may only lower its counts against config/ui-shell-baseline.json, and a
// file not in the baseline must have none.
//
//   node scripts/verify-ui-shell.mjs                    check
//   node scripts/verify-ui-shell.mjs --write-baseline   record today's counts (only ever lowers them)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const baselinePath = join(root, 'config/ui-shell-baseline.json');
const SHARED = new Set(['packages/web-sdk/src/page.tsx', 'apps/workflow-platform/components/design-system/Tabs.tsx']);
const RULES = {
  tablist: /role="tablist"/g,
  emoji: /\p{Extended_Pictographic}/gu,
  'dev-text': /WI-OI-\d|Request failed \(/g,
};

function* sourceFiles(directory) {
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory)) {
    if (['node_modules', 'dist', '.next', '__tests__', 'generated'].includes(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx$/.test(name) && !/\.(test|spec|stories)\.tsx$/.test(name)) yield path;
  }
}

/** Source without comments, so a work item named in a comment is not screen text. */
function withoutComments(text) {
  return text.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const directories = [
  'apps/workflow-platform/app',
  'apps/workflow-platform/components',
  'packages/web-sdk/src',
  'packages/configuration-react/src',
  ...readdirSync(join(root, 'modules')).map((module) => `modules/${module}/web/src`),
];
const counts = {};
for (const directory of directories) {
  for (const path of sourceFiles(join(root, directory))) {
    const file = relative(root, path);
    if (SHARED.has(file)) continue;
    const text = withoutComments(readFileSync(path, 'utf8'));
    for (const [rule, pattern] of Object.entries(RULES)) {
      const found = text.match(pattern)?.length ?? 0;
      if (found > 0) (counts[file] ??= {})[rule] = found;
    }
  }
}

// Menu rule: from the generated catalogue, navigation and page tree.
const { generatedPlatformModuleCatalog } = await import(join(root, 'packages/contracts/dist/modules/catalog.generated.js'));
const navigation = readFileSync(join(root, 'apps/workflow-platform/lib/generated/module-navigation.ts'), 'utf8');
const menus = JSON.parse(navigation.match(/generatedModuleMenus[^=]*=\s*(\{[\s\S]*?\n\});/)[1]);
const appRoot = join(root, 'apps/workflow-platform/app/(app)');
const pageRoutes = [];
(function walk(directory, segments) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path, [...segments, name]);
    else if (name === 'page.tsx') pageRoutes.push(`/${segments.join('/')}`);
  }
})(appRoot, []);
const catalogueRoutes = new Set(generatedPlatformModuleCatalog.map((entry) => entry.route));
// Not screens of their own: create flows, sign-in callbacks and placeholders for capabilities not connected yet.
const notAScreen = (route) => {
  if (/\/new(\/|$)|callback/.test(route)) return true;
  const source = readFileSync(join(appRoot, route, 'page.tsx'), 'utf8');
  return /UnavailableCapability|CapabilityStatus/.test(source);
};
// Entries the shell shows nowhere (apps/workflow-platform/lib/module-navigation.ts hiddenModuleKeys).
const HIDDEN = new Set(['solution-packs', 'module-marketplace']);
const violations = [];
for (const entry of generatedPlatformModuleCatalog) {
  if (entry.readiness === 'CONTAINED' || HIDDEN.has(entry.key) || menus[entry.key]) continue;
  const screens = pageRoutes.filter(
    (route) =>
      route.startsWith(`${entry.route}/`) &&
      !route.slice(entry.route.length + 1).includes('[') &&
      !catalogueRoutes.has(route) &&
      !notAScreen(route) &&
      !generatedPlatformModuleCatalog.some((other) => other.route.length > entry.route.length && route.startsWith(`${other.route}/`)),
  );
  if (screens.length > 0)
    violations.push({ rule: 'menu', entry: entry.key, message: `has screens ${screens.join(', ')} but no manifest menu` });
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : { files: {} };
if (process.argv.includes('--write-baseline')) {
  const files = {};
  for (const [file, found] of Object.entries(counts)) {
    const before = baseline.files[file];
    files[file] = Object.fromEntries(
      Object.entries(found).map(([rule, value]) => [rule, before?.[rule] === undefined ? value : Math.min(value, before[rule])]),
    );
  }
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ workItem: 'WI-OI-145', note: 'Counts may only go down; new files must have none.', files: Object.fromEntries(Object.entries(files).sort()) }, null, 2)}\n`,
  );
  console.log(`ui-shell baseline written: ${Object.keys(files).length} files`);
  process.exit(0);
}

for (const [file, found] of Object.entries(counts)) {
  for (const [rule, value] of Object.entries(found)) {
    const allowed = baseline.files[file]?.[rule] ?? 0;
    if (value > allowed) violations.push({ rule, file, message: `${value} found, ${allowed} allowed` });
  }
}
const stale = Object.entries(baseline.files).filter(([file, rules]) =>
  Object.entries(rules).some(([rule, value]) => (counts[file]?.[rule] ?? 0) < value),
);

if (violations.length > 0) {
  console.error(JSON.stringify({ status: 'failed', violations }, null, 2));
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      status: 'passed',
      files: Object.keys(counts).length,
      baselineFiles: Object.keys(baseline.files).length,
      ...(stale.length ? { lowered: `${stale.length} baseline entries can be lowered with --write-baseline` } : {}),
    },
    null,
    2,
  ),
);
