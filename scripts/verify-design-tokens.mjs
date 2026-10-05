#!/usr/bin/env node
// Design-standard check (WI-OI-120b). Owner rule (.pi/handoff/HANDOFF-2026-09-29.md:81): web screens use @medusajs/ui
// and the ui-* design tokens, with no hard-coded colours. Counts hard-coded Tailwind palette colours and arbitrary
// colour values per file. A file may only lower its count against config/design-token-baseline.json, a file not in the
// baseline must have none, and the files listed in `clean` must have none.
//
//   node scripts/verify-design-tokens.mjs                    check
//   node scripts/verify-design-tokens.mjs --write-baseline   record today's counts (only ever lowers them)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const baselinePath = join(root, 'config/design-token-baseline.json');

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white';
const UTILITY =
  'bg|text|border|border-[trblxy]|ring|ring-offset|divide|from|via|to|fill|stroke|outline|placeholder|decoration|shadow|accent|caret';
// `(?<![\w-])` keeps ui-* tokens (bg-ui-bg-base, text-ui-fg-muted) and words such as "to-do" out of the count.
const HARD_CODED = new RegExp(
  `(?<![\\w-])(?:[a-z-]+:)*(?:${UTILITY})-(?:(?:${PALETTE})(?:-\\d{2,3})?(?:\\/\\d{1,3})?|\\[(?:#|rgb|hsl)[^\\]]*\\])(?![\\w-])`,
  'g',
);

function* sourceFiles(directory) {
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory)) {
    if (name === 'node_modules' || name === 'dist' || name === '.next' || name === '__tests__') continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(tsx|jsx|ts)$/.test(name) && !/\.(test|spec|stories)\.[tj]sx?$/.test(name)) yield path;
  }
}

function scanRoots() {
  const roots = ['apps/workflow-platform/app', 'apps/workflow-platform/components', 'apps/workflow-platform/lib'];
  for (const moduleName of readdirSync(join(root, 'modules'))) roots.push(`modules/${moduleName}/web/src`);
  for (const packageName of readdirSync(join(root, 'packages'))) {
    if (packageName.endsWith('-react')) roots.push(`packages/${packageName}/src`);
  }
  return roots;
}

function counts() {
  const result = {};
  for (const scanRoot of scanRoots()) {
    for (const file of sourceFiles(join(root, scanRoot))) {
      const path = relative(root, file);
      // Uncommitted material is not part of the product (WI-OI-119): the TextFly and platform-rbac trees.
      if (path.startsWith('modules/communications-textfly/') || path.startsWith('modules/platform-rbac/')) continue;
      const matches = readFileSync(file, 'utf8').match(HARD_CODED);
      if (matches?.length) result[path] = matches.length;
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

const current = counts();
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : { clean: [], files: {} };

if (process.argv.includes('--write-baseline')) {
  const files = {};
  for (const [path, count] of Object.entries(current)) {
    const previous = baseline.files?.[path];
    files[path] = previous === undefined ? count : Math.min(previous, count);
  }
  writeFileSync(baselinePath, `${JSON.stringify({ ...baseline, files }, null, 2)}\n`);
  console.log(`Baseline written: ${Object.keys(files).length} files, ${Object.values(files).reduce((a, b) => a + b, 0)} hard-coded colours.`);
  process.exit(0);
}

const violations = [];
for (const [path, count] of Object.entries(current)) {
  const allowed = baseline.clean?.includes(path) ? 0 : (baseline.files?.[path] ?? 0);
  if (count > allowed) {
    violations.push({
      code: allowed === 0 ? 'HARD_CODED_COLOUR' : 'HARD_CODED_COLOUR_INCREASED',
      file: path,
      count,
      allowed,
      message: `${path} has ${count} hard-coded colour classes (allowed ${allowed}); use @medusajs/ui and ui-* tokens.`,
    });
  }
}
const remaining = Object.values(current).reduce((sum, count) => sum + count, 0);
console.log(
  JSON.stringify(
    {
      status: violations.length ? 'failed' : 'passed',
      filesWithHardCodedColours: Object.keys(current).length,
      hardCodedColours: remaining,
      clean: baseline.clean ?? [],
      violations,
    },
    null,
    2,
  ),
);
process.exit(violations.length ? 1 : 0);
