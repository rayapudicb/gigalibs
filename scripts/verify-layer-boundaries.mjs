// ADR-0013 layer boundaries (WI-OI-080). Every pnpm workspace unit has one layer (config/package-layers.json):
// core, module:<key>, shell or tooling. Core must not import module code, a module must not import another
// module's code, and nothing imports the shell or tooling. Existing violations are recorded in
// config/layer-boundary-baseline.json; the audit fails on unclassified units and on any violation that is not
// in the baseline, so the coupling can only shrink. `--write-baseline` rewrites the baseline; `--report` lists
// every violation. Every core-database (Prisma) model must also be classified as core or module-owned.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = resolve(new URL('../', import.meta.url).pathname);
const config = JSON.parse(readFileSync(join(root, 'config/package-layers.json'), 'utf8'));
const baselinePath = join(root, 'config/layer-boundary-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');
const report = process.argv.includes('--report');

const ignoredDirectories = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.git',
]);
const sourceExtensions = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const importPattern =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

// Workspace units from pnpm-workspace.yaml (only `dir`, `dir/*` and `!dir` patterns are used there).
function workspaceUnits() {
  const include = [];
  const exclude = new Set();
  let inPackages = false;
  for (const line of readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split('\n')) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line)) break;
    const match = inPackages && line.match(/^\s*-\s*["']?([^"']+)["']?\s*$/);
    if (!match) continue;
    if (match[1].startsWith('!')) exclude.add(match[1].slice(1));
    else include.push(match[1]);
  }
  const units = new Set();
  for (const pattern of include) {
    const parts = pattern.split('/');
    let candidates = [''];
    for (const part of parts) {
      candidates = candidates.flatMap((base) => {
        if (part !== '*') return [join(base, part)];
        const dir = join(root, base);
        return existsSync(dir)
          ? readdirSync(dir)
              .filter((name) => statSync(join(dir, name)).isDirectory())
              .map((name) => join(base, name))
          : [];
      });
    }
    for (const candidate of candidates) {
      if (!exclude.has(candidate) && existsSync(join(root, candidate, 'package.json')))
        units.add(candidate);
    }
  }
  return [...units].sort();
}

const moduleOfPackage = new Map(
  Object.entries(config.modulePackages).flatMap(([key, paths]) => paths.map((path) => [path, key])),
);
function layerOf(unit) {
  const moduleMatch = unit.match(/^modules\/([^/]+)\//);
  if (moduleMatch) return `module:${moduleMatch[1]}`;
  if (moduleOfPackage.has(unit)) return `module:${moduleOfPackage.get(unit)}`;
  if (config.core.includes(unit) || config.coreApps.includes(unit)) return 'core';
  if (config.shell.includes(unit)) return 'shell';
  if (config.tooling.includes(unit)) return 'tooling';
  return null;
}

const units = workspaceUnits();
const unclassified = units.filter((unit) => !layerOf(unit));
const stale = [
  ...config.core,
  ...config.coreApps,
  ...config.shell,
  ...config.tooling,
  ...moduleOfPackage.keys(),
].filter((unit) => !units.includes(unit));
const unitByName = new Map(
  units.map((unit) => [
    JSON.parse(readFileSync(join(root, unit, 'package.json'), 'utf8')).name,
    unit,
  ]),
);
// Longest unit path first, so a file is owned by its innermost unit.
const unitsByDepth = [...units].sort((a, b) => b.length - a.length);
function unitOfPath(path) {
  const rel = relative(root, path);
  const unit = unitsByDepth.find(
    (candidate) => rel === candidate || rel.startsWith(candidate + sep),
  );
  if (unit) return unit;
  const moduleMatch = rel.match(/^modules\/([^/]+)\//);
  return moduleMatch ? `modules/${moduleMatch[1]}/` : null;
}
const layerOfPath = (path) => {
  const unit = unitOfPath(path);
  return unit ? layerOf(unit) : null;
};

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) yield* sourceFiles(join(dir, entry.name));
    } else if (sourceExtensions.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      yield join(dir, entry.name);
    }
  }
}

function targetLayer(file, specifier) {
  if (specifier.startsWith('.')) return layerOfPath(resolve(dirname(file), specifier));
  const name = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  const unit = unitByName.get(name);
  return unit ? layerOf(unit) : null; // external dependency or quarantined package (other audits own those)
}

function rule(from, to) {
  if (!to || from === to) return null;
  if (to === 'shell') return 'IMPORTS_SHELL';
  if (to === 'tooling' && from !== 'tooling') return 'IMPORTS_TOOLING';
  if (from === 'core' && to.startsWith('module:')) return 'CORE_IMPORTS_MODULE';
  if (from.startsWith('module:') && to.startsWith('module:')) return 'MODULE_IMPORTS_MODULE';
  return null;
}

const violations = [];
const shellModuleImports = new Map();
let filesScanned = 0;
let workspaceImports = 0;
for (const unit of units) {
  const from = layerOf(unit);
  if (!from) continue;
  for (const file of sourceFiles(join(root, unit))) {
    if (unitOfPath(file) !== unit) continue; // nested unit scanned on its own
    const text = readFileSync(file, 'utf8');
    filesScanned += 1;
    for (const [, specifier] of text.matchAll(importPattern)) {
      const to = targetLayer(file, specifier);
      if (to) workspaceImports += 1;
      const code = rule(from, to);
      if (code) violations.push(`${code} ${relative(root, file)} -> ${specifier}`);
      if (from === 'shell' && to?.startsWith('module:'))
        shellModuleImports.set(to, (shellModuleImports.get(to) ?? 0) + 1);
    }
  }
}
const found = [...new Set(violations)].sort();

// Core database: every control-plane model is classified, so business tables cannot enter the core unreviewed.
const modelConfig = config.controlPlaneModels;
const models = [
  ...readFileSync(join(root, modelConfig.schema), 'utf8').matchAll(/^model (\w+)/gm),
].map(([, name]) => name);
const moduleOwnedModels = Object.values(modelConfig.moduleOwned).flat();
const unclassifiedModels = models.filter(
  (name) => !modelConfig.core.includes(name) && !moduleOwnedModels.includes(name),
);
const staleModels = [...modelConfig.core, ...moduleOwnedModels].filter(
  (name) => !models.includes(name),
);

if (writeBaseline) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ schemaVersion: 1, policy: 'Existing layer violations when ADR-0013 was adopted (WI-OI-080). Entries may only be removed.', violations: found }, null, 2)}\n`,
  );
  console.log(`Wrote ${found.length} baseline violations to config/layer-boundary-baseline.json`);
}
const baseline = new Set(
  existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')).violations : [],
);
const fresh = found.filter((entry) => !baseline.has(entry));
const resolved = [...baseline].filter((entry) => !found.includes(entry));

const count = (keys) => {
  const counts = {};
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
};
const byRule = count(found.map((entry) => entry.split(' ')[0]));
console.log(
  JSON.stringify(
    {
      units: units.length,
      filesScanned,
      workspaceImports,
      layers: count(units.map((unit) => layerOf(unit)?.split(':')[0] ?? 'unclassified')),
      violations: found.length,
      byRule,
      baseline: baseline.size,
      newViolations: fresh,
      resolvedBaselineEntries: resolved.length,
      shellImportsOfModuleCode: Object.fromEntries([...shellModuleImports].sort()),
      unclassified,
      staleClassifications: stale,
      coreDatabase: {
        models: models.length,
        core: modelConfig.core.length,
        moduleOwned: moduleOwnedModels.length,
        unclassifiedModels,
        staleModels,
      },
    },
    null,
    2,
  ),
);
if (report) for (const entry of found) console.log(entry);
if (resolved.length)
  console.log(
    `${resolved.length} baseline entries no longer occur; remove them with --write-baseline.`,
  );
if (
  unclassified.length ||
  stale.length ||
  fresh.length ||
  unclassifiedModels.length ||
  staleModels.length
) {
  console.error(
    'Layer boundary audit failed: classify every workspace unit and core-database model in config/package-layers.json and fix new violations (ADR-0013).',
  );
  process.exit(1);
}
