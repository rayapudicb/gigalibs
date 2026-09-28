// Module manifests v1 (WI-OI-081, ADR-0013 §3). `modules/*/module.yaml` and `platform/core.yaml` are the single
// source of the web module catalogue. This script validates them and the per-client solution files
// (`solutions/*.yaml`), and generates `packages/contracts/src/modules/catalog.generated.ts`.
//   node scripts/module-manifests.mjs          audit: fails on invalid manifests, solutions or a stale catalogue
//   node scripts/module-manifests.mjs --write  regenerate the catalogue, then audit
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

// Gateways (WI-OI-083): each module's BFF allow-list, generated for the web shell. Templates are `/`-separated
// segments: a literal, `{id}` (an identifier) or `a|b` (one of several values). No two templates of a module may
// match the same concrete path, so a lookup by path then method equals the former first-match functions.
const gatewaysPath = 'apps/workflow-platform/lib/generated/module-gateways.ts';
const upstreamSource = readFileSync(
  join(root, 'apps/workflow-platform/lib/local-module-upstream.ts'),
  'utf8',
);
const upstreamValues = [
  ...(upstreamSource.match(/export type LocalModuleUpstream =([^;]+);/)?.[1] ?? '').matchAll(
    /'([^']+)'/g,
  ),
].map(([, value]) => value);
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const ID_PATTERN = '[0-9a-fA-F-]{36}';
const SEGMENT = /^(?:\{id\}|[a-z0-9-]+(?:\|[a-z0-9-]+)*)$/;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compileTemplate = (template) =>
  `^${template
    .split('/')
    .map((segment) =>
      segment === '{id}'
        ? ID_PATTERN
        : segment.includes('|')
          ? `(?:${segment.split('|').map(escapeRegex).join('|')})`
          : escapeRegex(segment),
    )
    .join('/')}$`;
function samplePaths(template) {
  let paths = [''];
  for (const segment of template.split('/')) {
    const options =
      segment === '{id}' ? ['00000000-0000-4000-8000-000000000000'] : segment.split('|');
    paths = paths.flatMap((prefix) =>
      options.map((option) => (prefix ? `${prefix}/${option}` : option)),
    );
  }
  return paths;
}
const isPermission = (value) =>
  isText(value) || (Array.isArray(value) && value.length > 0 && value.every(isText));

const gateways = [];
const basePathOwner = new Map();
for (const [name, manifest] of modules) {
  const gateway = manifest.spec.gateway;
  if (gateway === undefined) continue;
  const where = `modules/${name}/module.yaml spec.gateway`;
  if (!gateway || typeof gateway !== 'object') {
    fail(where, 'must be a mapping');
    continue;
  }
  const catalogKeys = (manifest.spec.catalog ?? []).map((entry) => entry.key);
  if (!Array.isArray(gateway.basePaths) || gateway.basePaths.length === 0) {
    fail(where, 'basePaths must list at least one /api/<segment> path');
  }
  for (const basePath of gateway.basePaths ?? []) {
    if (!/^\/api\/[a-z0-9-]+$/.test(basePath))
      fail(where, `basePath ${basePath} must be /api/<segment>`);
    if (basePathOwner.has(basePath))
      fail(where, `basePath ${basePath} is also used by ${basePathOwner.get(basePath)}`);
    else basePathOwner.set(basePath, name);
  }
  if (!catalogKeys.includes(gateway.catalogKey))
    fail(
      where,
      `catalogKey must be one of this module's catalogue keys (${catalogKeys.join(', ')})`,
    );
  if (!upstreamValues.includes(gateway.upstream))
    fail(where, `upstream must be one of ${upstreamValues.join(' | ')}`);
  for (const field of [
    'audience',
    'signingKeyEnvironment',
    'codePrefix',
    'routeNoun',
    'serviceName',
    'entitlementName',
  ]) {
    if (!isText(gateway[field])) fail(where, `${field} is required`);
  }
  if (!Array.isArray(gateway.routes) || gateway.routes.length === 0) {
    fail(where, 'routes must list at least one route');
    continue;
  }
  const routes = [];
  gateway.routes.forEach((route, index) => {
    const at = `${where} routes[${index}]`;
    const template = route?.path;
    if (
      typeof template !== 'string' ||
      !template.startsWith('v1/') ||
      !template.split('/').every((segment) => SEGMENT.test(segment))
    ) {
      fail(at, 'path must be v1/… made of literals, {id} or a|b segments');
      return;
    }
    const unknown = Object.keys(route).filter((key) => key !== 'path' && !METHODS.includes(key));
    if (unknown.length)
      fail(at, `unknown keys ${unknown.join(', ')} (methods are ${METHODS.join(', ')})`);
    const methods = Object.fromEntries(
      METHODS.filter((method) => route[method] !== undefined).map((method) => [
        method,
        route[method],
      ]),
    );
    if (Object.keys(methods).length === 0) fail(at, 'at least one method is required');
    for (const [method, permission] of Object.entries(methods)) {
      if (!isPermission(permission))
        fail(at, `${method} needs a permission or a non-empty list of permissions`);
    }
    routes.push({ template, pattern: compileTemplate(template), methods });
  });
  for (const route of routes) {
    for (const sample of samplePaths(route.template)) {
      const matches = routes.filter((candidate) => new RegExp(candidate.pattern).test(sample));
      if (matches.length !== 1)
        fail(
          where,
          `${sample} matches ${matches.length} route templates; each concrete path must match exactly one`,
        );
    }
  }
  gateways.push({
    module: name,
    basePaths: gateway.basePaths,
    catalogKey: gateway.catalogKey,
    audience: gateway.audience,
    upstream: gateway.upstream,
    signingKeyEnvironment: gateway.signingKeyEnvironment,
    codePrefix: gateway.codePrefix,
    routeNoun: gateway.routeNoun,
    serviceName: gateway.serviceName,
    entitlementName: gateway.entitlementName,
    routes: routes.map(({ template, pattern, methods }) => ({ template, pattern, methods })),
  });
}
const gatewaysGenerated = [
  '// Generated by `pnpm modules:catalog` (scripts/module-manifests.mjs) from `spec.gateway` in modules/*/module.yaml',
  '// (ADR-0013, WI-OI-083). Do not edit: change the owning manifest and regenerate.',
  'export interface GeneratedGatewayRoute {',
  '  readonly template: string;',
  '  readonly pattern: string;',
  '  readonly methods: Readonly<Partial<Record<string, string | readonly string[]>>>;',
  '}',
  'export interface GeneratedModuleGateway {',
  '  readonly module: string;',
  '  readonly basePaths: readonly string[];',
  '  readonly catalogKey: string;',
  '  readonly audience: string;',
  '  readonly upstream: string;',
  '  readonly signingKeyEnvironment: string;',
  '  readonly codePrefix: string;',
  '  readonly routeNoun: string;',
  '  readonly serviceName: string;',
  '  readonly entitlementName: string;',
  '  readonly routes: readonly GeneratedGatewayRoute[];',
  '}',
  `export const generatedModuleGateways: Readonly<Record<string, GeneratedModuleGateway>> = ${JSON.stringify(
    Object.fromEntries(gateways.map((gateway) => [gateway.module, gateway])),
    null,
    2,
  )};`,
  '',
].join('\n');

let catalogueCurrent =
  existsSync(join(root, generatedPath)) &&
  readFileSync(join(root, generatedPath), 'utf8') === generated;
let gatewaysCurrent =
  existsSync(join(root, gatewaysPath)) &&
  readFileSync(join(root, gatewaysPath), 'utf8') === gatewaysGenerated;
if (write && errors.length === 0) {
  if (!catalogueCurrent) writeFileSync(join(root, generatedPath), generated);
  if (!gatewaysCurrent) {
    mkdirSync(dirname(join(root, gatewaysPath)), { recursive: true });
    writeFileSync(join(root, gatewaysPath), gatewaysGenerated);
  }
  catalogueCurrent = true;
  gatewaysCurrent = true;
}
if (!catalogueCurrent) fail(generatedPath, 'out of date; run `pnpm modules:catalog`');
if (!gatewaysCurrent) fail(gatewaysPath, 'out of date; run `pnpm modules:catalog`');

console.log(
  JSON.stringify(
    {
      manifests: modules.size,
      catalogEntries: entries.length,
      gateways: gateways.map((gateway) => `${gateway.module}: ${gateway.routes.length} routes`),
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
