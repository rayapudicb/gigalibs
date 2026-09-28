// Module manifests v1 (WI-OI-081, ADR-0013 §3). `modules/*/module.yaml` and `platform/core.yaml` are the single
// source of the web module catalogue. This script validates them and the per-client solution files
// (`solutions/*.yaml`), and generates `packages/contracts/src/modules/catalog.generated.ts`.
//   node scripts/module-manifests.mjs          audit: fails on invalid manifests, solutions or a stale catalogue
//   node scripts/module-manifests.mjs --write  regenerate the catalogue, then audit
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const root = new URL('../', import.meta.url).pathname;
const write = process.argv.includes('--write');
const MODULE_API = 'modules.gigalibs.io/v1';
const SOLUTION_API = 'solutions.gigalibs.io/v1';
const generatedPath = 'packages/contracts/src/modules/catalog.generated.ts';
const industryPacks = 'modules/gigaops/config/industry-packs';
const countryPacks = 'modules/gigaops/config/country-packs';

const errors = [];
const warnings = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

// Enumerations come from the typed contract, so the manifests cannot drift from it.
const contractSource = readFileSync(join(root, 'packages/contracts/src/modules/index.ts'), 'utf8');
function union(name) {
  const match = contractSource.match(new RegExp(`export type ${name} =([^;]+);`));
  if (!match) throw new Error(`${name} not found in packages/contracts/src/modules/index.ts`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(([, value]) => value);
}
const readinessValues = union('PlatformModuleReadiness');
const groupValues = union('PlatformModuleArea');

// Field order matches PlatformModuleDefinition; navigationOrder and hostedFor are manifest-only.
const entryFields = [
  'key',
  'name',
  'navigationLabel',
  'area',
  'navigationGroup',
  'route',
  'iconKey',
  'readiness',
  'entitlementEligible',
  'trialEligible',
  'requiredPermission',
  'platformInspection',
  'reason',
];
const manifestOnlyFields = ['navigationOrder', 'hostedFor'];
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

function checkEntry(where, entry, kind) {
  if (!entry || typeof entry !== 'object') return fail(where, 'catalog entry must be a mapping');
  const unknown = Object.keys(entry).filter(
    (field) => !entryFields.includes(field) && !manifestOnlyFields.includes(field),
  );
  if (unknown.length) fail(where, `unknown catalog fields: ${unknown.join(', ')}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.key ?? '')) fail(where, 'key must be kebab-case');
  for (const field of ['name', 'navigationLabel', 'area', 'iconKey', 'reason'])
    if (!isText(entry[field])) fail(where, `${field} is required`);
  if (!groupValues.includes(entry.navigationGroup))
    fail(where, `navigationGroup must be one of ${groupValues.join(' | ')}`);
  if (typeof entry.route !== 'string' || !entry.route.startsWith('/'))
    fail(where, 'route must start with /');
  if (!readinessValues.includes(entry.readiness))
    fail(where, `readiness must be one of ${readinessValues.join(' | ')}`);
  for (const field of ['entitlementEligible', 'trialEligible', 'platformInspection'])
    if (typeof entry[field] !== 'boolean') fail(where, `${field} must be true or false`);
  if (entry.requiredPermission !== null && !isText(entry.requiredPermission))
    fail(where, 'requiredPermission must be a permission or null');
  if (!Number.isInteger(entry.navigationOrder)) fail(where, 'navigationOrder must be an integer');
  if (entry.hostedFor !== undefined && (kind !== 'Core' || !isText(entry.hostedFor)))
    fail(where, 'hostedFor is only allowed on core entries');
}

function checkManifest(where, manifest, kind, folder) {
  if (manifest.kind !== kind) fail(where, `kind must be ${kind}`);
  const meta = manifest.metadata ?? {};
  if (folder && meta.name !== folder)
    fail(where, `metadata.name must equal the folder name (${folder})`);
  for (const field of ['name', 'displayName', 'version', 'lifecycle'])
    if (!isText(meta[field])) fail(where, `metadata.${field} is required`);
  if (meta.workItem !== null && !/^WI-OI-\d{3}$/.test(meta.workItem ?? ''))
    fail(where, 'metadata.workItem must be WI-OI-NNN or null (unregistered)');
  const spec = manifest.spec ?? {};
  if (kind === 'Module') {
    if (typeof spec.standalone !== 'boolean') fail(where, 'spec.standalone must be true or false');
    for (const field of ['requiredModules', 'optionalModules', 'capabilities']) {
      if (!Array.isArray(spec[field]) || !spec[field].every(isText))
        fail(where, `spec.${field} must be a list of names`);
    }
  }
  if (!Array.isArray(spec.catalog))
    return fail(where, 'spec.catalog must be a list (it may be empty)');
  spec.catalog.forEach((entry, index) => checkEntry(`${where} catalog[${index}]`, entry, kind));
  const basePath = spec.ui?.basePath;
  if (
    basePath &&
    !spec.catalog.some(
      (entry) => entry.route === basePath || entry.route?.startsWith(`${basePath}/`),
    )
  ) {
    fail(where, `no catalog entry is served under spec.ui.basePath ${basePath}`);
  }
}

// Load manifests.
const modules = new Map();
const legacyManifests = [];
for (const folder of readdirSync(join(root, 'modules')).sort()) {
  const path = `modules/${folder}/module.yaml`;
  if (!existsSync(join(root, path))) continue;
  let manifest;
  try {
    manifest = yaml.load(readFileSync(join(root, path), 'utf8'));
  } catch (error) {
    fail(path, `invalid YAML: ${error.message}`);
    continue;
  }
  if (manifest?.apiVersion !== MODULE_API) {
    legacyManifests.push(`${path} (${manifest?.apiVersion ?? 'no apiVersion'})`);
    continue;
  }
  checkManifest(path, manifest, 'Module', folder);
  modules.set(folder, manifest);
}
const corePath = 'platform/core.yaml';
const core = yaml.load(readFileSync(join(root, corePath), 'utf8'));
if (core?.apiVersion !== MODULE_API) fail(corePath, `apiVersion must be ${MODULE_API}`);
checkManifest(corePath, core, 'Core');

for (const [name, manifest] of modules) {
  for (const required of manifest.spec.requiredModules ?? []) {
    if (!modules.has(required))
      fail(`modules/${name}/module.yaml`, `required module ${required} has no v1 manifest`);
  }
  const unknownOptional = (manifest.spec.optionalModules ?? []).filter(
    (optional) => !modules.has(optional),
  );
  if (unknownOptional.length)
    warnings.push(
      `modules/${name}/module.yaml: optional modules without a v1 manifest: ${unknownOptional.join(', ')}`,
    );
}

// Catalogue: every entry once, ordered by navigationOrder.
const sources = [
  [corePath, core],
  ...[...modules].map(([name, manifest]) => [`modules/${name}/module.yaml`, manifest]),
];
const entries = sources.flatMap(([source, manifest]) =>
  (Array.isArray(manifest?.spec?.catalog) ? manifest.spec.catalog : []).map((entry) => ({
    source,
    entry,
  })),
);
for (const field of ['key', 'route', 'navigationOrder']) {
  const seen = new Map();
  for (const { source, entry } of entries) {
    if (seen.has(entry[field]))
      fail(
        source,
        `duplicate catalog ${field} ${entry[field]} (also in ${seen.get(entry[field])})`,
      );
    else seen.set(entry[field], source);
  }
}
entries.sort((a, b) => a.entry.navigationOrder - b.entry.navigationOrder);

const quote = (value) => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const literal = (value) =>
  value === null ? 'null' : typeof value === 'boolean' ? String(value) : quote(value);
const generated = [
  '// Generated by `pnpm modules:catalog` (scripts/module-manifests.mjs) from platform/core.yaml and',
  '// modules/*/module.yaml (ADR-0013, WI-OI-081). Do not edit: change the owning manifest and regenerate.',
  'export const generatedPlatformModuleCatalog = [',
  ...entries.flatMap(({ source, entry }) => [
    `  // ${source}`,
    '  {',
    ...entryFields.map((field) => `    ${field}: ${literal(entry[field])},`),
    '  },',
  ]),
  '] as const;',
  '',
].join('\n');

// Solutions: per-client module selections.
const solutions = [];
const solutionDir = join(root, 'solutions');
for (const file of existsSync(solutionDir)
  ? readdirSync(solutionDir)
      .filter((name) => name.endsWith('.yaml'))
      .sort()
  : []) {
  const path = `solutions/${file}`;
  const solution = yaml.load(readFileSync(join(root, path), 'utf8'));
  if (solution?.apiVersion !== SOLUTION_API || solution.kind !== 'Solution')
    fail(path, `apiVersion must be ${SOLUTION_API} and kind Solution`);
  if (solution?.metadata?.name !== file.replace(/\.yaml$/, ''))
    fail(path, 'metadata.name must equal the file name');
  const selected = solution?.spec?.modules;
  if (!Array.isArray(selected) || selected.length === 0) {
    fail(path, 'spec.modules must list at least one module');
    continue;
  }
  for (const name of selected) {
    if (!modules.has(name)) fail(path, `module ${name} has no v1 manifest`);
    for (const required of modules.get(name)?.spec.requiredModules ?? []) {
      if (!selected.includes(required))
        fail(path, `${name} requires ${required}, which the solution does not include`);
    }
  }
  const { industryPack, countryPack } = solution.spec;
  if (!existsSync(join(root, industryPacks, `${industryPack}.json`)))
    fail(path, `industry pack ${industryPack} not found in ${industryPacks}`);
  if (countryPack !== null && !existsSync(join(root, countryPacks, `${countryPack}.json`)))
    fail(path, `country pack ${countryPack} not found in ${countryPacks}`);
  solutions.push({ name: solution.metadata.name, modules: selected.length });
}

let catalogueCurrent =
  existsSync(join(root, generatedPath)) &&
  readFileSync(join(root, generatedPath), 'utf8') === generated;
if (write && errors.length === 0 && !catalogueCurrent) {
  writeFileSync(join(root, generatedPath), generated);
  catalogueCurrent = true;
}
if (!catalogueCurrent) fail(generatedPath, 'out of date; run `pnpm modules:catalog`');

console.log(
  JSON.stringify(
    {
      manifests: modules.size,
      catalogEntries: entries.length,
      solutions,
      legacyManifests,
      warnings,
      errors,
    },
    null,
    2,
  ),
);
if (errors.length) {
  console.error('Module manifest audit failed (WI-OI-081).');
  process.exit(1);
}
