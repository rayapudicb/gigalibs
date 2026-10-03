// Module manifests v1 (WI-OI-081, ADR-0013 §3). `modules/*/module.yaml` and `platform/core.yaml` are the single
// source of the web module catalogue. This script validates them and the per-client solution files
// (`solutions/*.yaml`), and generates `packages/contracts/src/modules/catalog.generated.ts`.
//   node scripts/module-manifests.mjs          audit: fails on invalid manifests, solutions or a stale catalogue
//   node scripts/module-manifests.mjs --write  regenerate the catalogue, then audit
// `--conformance-module <name>` defers only that generated module's existing-record listing gate while the
// conformance runner refreshes it. The runner performs the ordinary audit again after writing the new record.
// Selective builds (WI-OI-083d): `--solution <name>` generates for the core plus that solution's modules only, and
// `--root <dir>` works on another checkout (the solution build's worktree). The repository keeps the full build.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import yaml from 'js-yaml';
import { moduleCodeSha256 } from './lib/module-code-hash.mjs';

const argValue = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};
const root = argValue('--root')
  ? `${resolve(argValue('--root'))}/`
  : new URL('../', import.meta.url).pathname;
const solutionName = argValue('--solution');
const conformanceModule = argValue('--conformance-module');
if (conformanceModule !== undefined && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(conformanceModule)) {
  console.error('--conformance-module must name one kebab-case module.');
  process.exit(2);
}
const write = process.argv.includes('--write');
const MODULE_API = 'modules.gigalibs.io/v1';
const SOLUTION_API = 'solutions.gigalibs.io/v1';
const generatedPath = 'packages/contracts/src/modules/catalog.generated.ts';
// WI-OI-107 (ADR-0016 F10): industry and country packs live at the solution layer.
const packsRoot = 'solutions/packs';
const packsPath = 'packages/contracts/src/configuration/packs.generated.ts';
const PACK_LAYERS = ['vocabulary', 'fields', 'lists', 'capabilities', 'workflows', 'outcomes', 'rules'];
const generatedModuleConformanceChecks = [
  ...Array.from({ length: 15 }, (_, index) => `S${index + 1}`),
  'L0',
  ...Array.from({ length: 14 }, (_, index) => `L${index + 1}`),
  'L20',
  'L21',
  'L22',
  'L23',
  'L99',
];

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
const maturityValues = union('PlatformModuleMaturity');
// Vision §5: only certified entries may be advertised as available (ADR-0016, WI-OI-102e).
const advertisableMaturity = ['CERTIFIED', 'PRODUCTION_PROVEN'];
const groupValues = union('PlatformModuleArea');
const iconValues = union('PlatformModuleIcon');

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
  'maturity',
  'entitlementEligible',
  'trialEligible',
  'requiredPermission',
  'platformInspection',
  'reason',
];
// `menu` and `personas` (WI-OI-083c) feed the web sidebar only, generated into module-navigation.ts.
// `roles` (WI-OI-103e, ADR-0016 F16): default roles a tenant entitled to this entry receives as built-in custom roles,
// generated into packages/contracts/src/modules/roles.generated.ts.
const manifestOnlyFields = ['navigationOrder', 'hostedFor', 'menu', 'personas', 'roles'];
// The kernel's tenant permission grammar (contracts isTenantPermissionCode), without wildcards: a default role names
// every permission it grants.
const ROLE_PERMISSION = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/;
const roleNames = new Set();
// Platform Operators and Tenant Admins see every entry; these personas see only the entries that list them.
const restrictedPersonas = ['C_LEVEL', 'OPERATIONS_SUPERVISOR', 'WORKFORCE_MEMBER', 'CUSTOMER_GUEST'];
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
  if (!iconValues.includes(entry.iconKey))
    fail(where, `iconKey must be one of ${iconValues.join(' | ')}`);
  if (typeof entry.route !== 'string' || !entry.route.startsWith('/'))
    fail(where, 'route must start with /');
  if (!readinessValues.includes(entry.readiness))
    fail(where, `readiness must be one of ${readinessValues.join(' | ')}`);
  if (!maturityValues.includes(entry.maturity))
    fail(where, `maturity must be one of ${maturityValues.join(' | ')}`);
  else if (entry.readiness === 'AVAILABLE' && !advertisableMaturity.includes(entry.maturity))
    fail(where, `readiness AVAILABLE requires maturity ${advertisableMaturity.join(' or ')} (vision §5)`);
  for (const field of ['entitlementEligible', 'trialEligible', 'platformInspection'])
    if (typeof entry[field] !== 'boolean') fail(where, `${field} must be true or false`);
  if (entry.requiredPermission !== null && !isText(entry.requiredPermission))
    fail(where, 'requiredPermission must be a permission or null');
  if (!Number.isInteger(entry.navigationOrder)) fail(where, 'navigationOrder must be an integer');
  if (entry.hostedFor !== undefined && (kind !== 'Core' || !isText(entry.hostedFor)))
    fail(where, 'hostedFor is only allowed on core entries');
  if (
    entry.personas !== undefined &&
    (!Array.isArray(entry.personas) ||
      entry.personas.length === 0 ||
      entry.personas.some((persona) => !restrictedPersonas.includes(persona)) ||
      new Set(entry.personas).size !== entry.personas.length)
  )
    fail(where, `personas must list distinct values of ${restrictedPersonas.join(' | ')}`);
  if (entry.menu !== undefined) {
    if (!Array.isArray(entry.menu) || entry.menu.length === 0)
      return fail(where, 'menu must be a non-empty list');
    const keys = new Set();
    entry.menu.forEach((item, index) => {
      const at = `${where} menu[${index}]`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item?.key ?? '')) fail(at, 'key must be kebab-case');
      else if (keys.has(item.key)) fail(at, `duplicate menu key ${item.key}`);
      keys.add(item?.key);
      if (!isText(item?.label)) fail(at, 'label is required');
      if (item?.path !== entry.route && !String(item?.path).startsWith(`${entry.route}/`))
        fail(at, `path must be ${entry.route} or below it`);
      if (!iconValues.includes(item?.icon)) fail(at, `icon must be one of ${iconValues.join(' | ')}`);
    });
  }
  if (entry.roles !== undefined) {
    if (!Array.isArray(entry.roles) || entry.roles.length === 0)
      return fail(where, 'roles must be a non-empty list');
    const keys = new Set();
    entry.roles.forEach((role, index) => {
      const at = `${where} roles[${index}]`;
      const unknownRoleFields = Object.keys(role ?? {}).filter((field) => !['key', 'name', 'description', 'permissions'].includes(field));
      if (unknownRoleFields.length) fail(at, `unknown role fields: ${unknownRoleFields.join(', ')}`);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(role?.key ?? '')) fail(at, 'key must be kebab-case');
      else if (keys.has(role.key)) fail(at, `duplicate role key ${role.key}`);
      keys.add(role?.key);
      // Tenant custom role names are unique per tenant, so a default role name must be unique across all manifests.
      if (!isText(role?.name) || role.name.length > 60) fail(at, 'name is required (at most 60 characters)');
      else if (roleNames.has(role.name)) fail(at, `role name "${role.name}" is already declared by another entry`);
      roleNames.add(role?.name);
      if (!isText(role?.description)) fail(at, 'description is required');
      const permissions = role?.permissions;
      if (!Array.isArray(permissions) || permissions.length === 0) fail(at, 'permissions must be a non-empty list');
      else {
        if (new Set(permissions).size !== permissions.length) fail(at, 'permissions must be distinct');
        for (const permission of permissions)
          if (typeof permission !== 'string' || !ROLE_PERMISSION.test(permission) || permission.startsWith('platform:'))
            fail(at, `permission ${JSON.stringify(permission)} must be a tenant permission such as analytics:read, without wildcards`);
      }
    });
  }
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
    // ADR-0016 F1 (WI-OI-102c): a module is a capability any solution may select, or a business module.
    if (!['capability', 'business'].includes(spec.category))
      fail(where, 'spec.category must be capability or business (ADR-0016)');
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

// Selective build (WI-OI-083d): everything generated below covers the core plus the chosen solution's modules.
const allModules = new Map(modules);
if (solutionName !== undefined) {
  const path = `solutions/${solutionName}.yaml`;
  const selected = existsSync(join(root, path))
    ? yaml.load(readFileSync(join(root, path), 'utf8'))?.spec?.modules
    : undefined;
  if (!Array.isArray(selected)) fail(path, 'no such solution file with a spec.modules list');
  else for (const name of [...modules.keys()]) if (!selected.includes(name)) modules.delete(name);
}

// Industry and country packs (WI-OI-107, ADR-0016 F10): solution-level files with one section per module and layer.
// The section's module must declare that layer in `spec.pack`; the section schemas live in @gigalibs/contracts and
// its tests parse every compiled pack. Compiled into packages/contracts/src/configuration/packs.generated.ts.
for (const [name, manifest] of allModules) {
  const declared = manifest.spec.pack;
  if (declared === undefined) continue;
  for (const [kind, layers] of Object.entries(declared ?? {})) {
    if (!['industry', 'country'].includes(kind) || !Array.isArray(layers) || layers.length === 0 || layers.some((layer) => !PACK_LAYERS.includes(layer)))
      fail(`modules/${name}/module.yaml`, `spec.pack.${kind} must list pack layers (${PACK_LAYERS.join(', ')})`);
  }
}
const packs = { industry: new Map(), country: new Map() };
for (const kind of ['industry', 'country']) {
  const directory = join(root, packsRoot, kind);
  for (const file of existsSync(directory) ? readdirSync(directory).filter((entry) => entry.endsWith('.yaml')).sort() : []) {
    const where = `${packsRoot}/${kind}/${file}`;
    let pack;
    try {
      pack = yaml.load(readFileSync(join(directory, file), 'utf8'));
    } catch (error) {
      fail(where, `not valid YAML: ${error.message}`);
      continue;
    }
    const key = kind === 'industry' ? pack?.slug : String(pack?.code ?? '').toLowerCase();
    if (pack?.formatVersion !== 2) fail(where, 'formatVersion must be 2');
    if (`${key}.yaml` !== file) fail(where, `the file name must be the pack's ${kind === 'industry' ? 'slug' : 'code in lower case'}`);
    if (!/^[1-9][0-9]{0,3}\.[0-9]{1,4}$/.test(String(pack?.version ?? ''))) fail(where, "version must be major.minor, quoted (such as '1.0')");
    for (const [moduleKey, section] of Object.entries(pack?.modules ?? {})) {
      const declared = allModules.get(moduleKey)?.spec?.pack?.[kind];
      if (!allModules.has(moduleKey)) fail(where, `module ${moduleKey} has no v1 manifest`);
      else if (!Array.isArray(declared)) fail(where, `module ${moduleKey} does not read ${kind} packs (spec.pack.${kind})`);
      for (const layer of Object.keys(section ?? {})) {
        if (!PACK_LAYERS.includes(layer)) fail(where, `${moduleKey}.${layer} is not a pack layer (${PACK_LAYERS.join(', ')})`);
        else if (Array.isArray(declared) && !declared.includes(layer)) fail(where, `module ${moduleKey} does not read the ${layer} layer`);
      }
    }
    packs[kind].set(key, pack);
  }
}
const packsGenerated = [
  '// Generated by `pnpm modules:catalog` (scripts/module-manifests.mjs) from solutions/packs/ (WI-OI-107, ADR-0016 F10).',
  '// Do not edit: change the pack file and regenerate. The contracts tests parse every pack against its schema.',
  "import type { CountryPackV2, IndustryPackV2 } from './packs.js';",
  '',
  `export const SHIPPED_INDUSTRY_PACKS: readonly IndustryPackV2[] = ${JSON.stringify([...packs.industry.values()], null, 2)};`,
  '',
  `export const SHIPPED_COUNTRY_PACKS: readonly CountryPackV2[] = ${JSON.stringify([...packs.country.values()], null, 2)};`,
  '',
].join('\n');

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

// Default roles (WI-OI-103e): the kernel keeps them as built-in custom roles of each tenant entitled to the entry.
const rolesPath = 'packages/contracts/src/modules/roles.generated.ts';
const rolesGenerated = [
  '// Generated by `pnpm modules:catalog` (scripts/module-manifests.mjs) from `roles` of the catalogue entries in',
  '// platform/core.yaml and modules/*/module.yaml (ADR-0016 F16, WI-OI-103e). Do not edit: change the owning manifest',
  '// and regenerate.',
  '',
  'export interface ModuleDefaultRole {',
  '  /** The catalogue entry whose entitlement brings this role. */',
  '  readonly catalogKey: string;',
  '  readonly key: string;',
  '  readonly name: string;',
  '  readonly description: string;',
  '  readonly permissions: readonly string[];',
  '}',
  '',
  `export const moduleDefaultRoles: readonly ModuleDefaultRole[] = ${JSON.stringify(
    entries.flatMap(({ entry }) =>
      (entry.roles ?? []).map((role) => ({
        catalogKey: entry.key,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
      })),
    ),
    null,
    2,
  )};`,
  '',
].join('\n');

// Sidebar navigation (WI-OI-083c): each entry's sub-menu and the restricted personas that see it.
const navigationPath = 'apps/workflow-platform/lib/generated/module-navigation.ts';
const pick = (field) =>
  Object.fromEntries(
    entries
      .filter(({ entry }) => entry[field] !== undefined)
      .map(({ entry }) => [entry.key, entry[field]]),
  );
const navigationGenerated = [
  '// Generated by `pnpm modules:catalog` (scripts/module-manifests.mjs) from `menu` and `personas` of the catalogue',
  '// entries in platform/core.yaml and modules/*/module.yaml (ADR-0013, WI-OI-083c). Do not edit: change the owning',
  '// manifest and regenerate.',
  "import type { PlatformContextPersona, PlatformModuleIcon } from '@gigalibs/contracts';",
  '',
  'export interface GeneratedModuleMenuItem {',
  '  readonly key: string;',
  '  readonly label: string;',
  '  readonly path: string;',
  '  readonly icon: PlatformModuleIcon;',
  '}',
  '',
  `export const generatedModuleMenus: Readonly<Record<string, readonly GeneratedModuleMenuItem[]>> = ${JSON.stringify(
    pick('menu'),
    null,
    2,
  )};`,
  '',
  `export const generatedModulePersonas: Readonly<Record<string, readonly PlatformContextPersona[]>> = ${JSON.stringify(
    pick('personas'),
    null,
    2,
  )};`,
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
    if (!allModules.has(name)) fail(path, `module ${name} has no v1 manifest`);
    for (const required of allModules.get(name)?.spec.requiredModules ?? []) {
      if (!selected.includes(required))
        fail(path, `${name} requires ${required}, which the solution does not include`);
    }
  }
  const { industryPack, countryPack } = solution.spec;
  if (!packs.industry.has(industryPack))
    fail(path, `industry pack ${industryPack} not found in ${packsRoot}/industry`);
  if (countryPack !== null && !packs.country.has(countryPack))
    fail(path, `country pack ${countryPack} not found in ${packsRoot}/country`);
  solutions.push({ name: solution.metadata.name, modules: selected.length });
}

// Gateways (WI-OI-083): each module's BFF allow-list, generated for the web shell. Templates are `/`-separated
// segments: a literal, `{id}` (an identifier) or `a|b` (one of several values). No two templates of a module may
// match the same concrete path, so a lookup by path then method equals the former first-match functions.
const gatewaysPath = 'apps/workflow-platform/lib/generated/module-gateways.ts';

// Upstreams (WI-OI-083c): how the web gateway reaches a module service, from `spec.api.upstream` plus
// `spec.api.port`. The shell only accepts that exact loopback or Compose service origin.
const upstreamsPath = 'apps/workflow-platform/lib/generated/module-upstreams.ts';
const upstreams = new Map();
for (const [name, manifest] of modules) {
  const upstream = manifest.spec.api?.upstream;
  if (upstream === undefined) continue;
  const where = `modules/${name}/module.yaml spec.api.upstream`;
  const port = manifest.spec.api.port;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(upstream?.key ?? ''))
    fail(where, 'key must be kebab-case');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(upstream?.serviceHostname ?? ''))
    fail(where, 'serviceHostname must be a Compose service name');
  if (!/^[A-Z][A-Z0-9_]*_URL$/.test(upstream?.environmentKey ?? ''))
    fail(where, 'environmentKey must be an upper-case …_URL variable');
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    fail(where, 'spec.api.port must be an integer between 1024 and 65535');
  // WI-OI-085e: a module inside the shared module host is reached under its own path.
  const basePath = upstream?.basePath ?? '';
  if (basePath !== '' && !/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(basePath))
    fail(where, 'basePath must be /<segment> when present');
  if (upstreams.has(upstream?.key))
    fail(where, `key ${upstream.key} is also used by ${upstreams.get(upstream.key).module}`);
  else
    upstreams.set(upstream?.key, {
      module: name,
      environmentKey: upstream?.environmentKey,
      port: String(port),
      serviceHostname: upstream?.serviceHostname,
      basePath,
    });
}
const upstreamValues = [...upstreams.keys()];
const upstreamsGenerated = [
  '// Generated by `pnpm modules:catalog` (scripts/module-manifests.mjs) from `spec.api` in modules/*/module.yaml',
  '// (ADR-0013, WI-OI-083c). Do not edit: change the owning manifest and regenerate.',
  `export const generatedModuleUpstreams = ${JSON.stringify(
    Object.fromEntries([...upstreams].sort(([a], [b]) => a.localeCompare(b))),
    null,
    2,
  )} as const;`,
  '',
  'export type GeneratedModuleUpstream = keyof typeof generatedModuleUpstreams;',
  '',
].join('\n');
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
  // WI-OI-083d: a named body transform the shell runs before forwarding, and contained routes the gateway answers as
  // unavailable (503 to a signed-in tenant user, no business action). Neither may overlap an allowed route.
  if (gateway.transformBody !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gateway.transformBody))
    fail(where, 'transformBody must name a shell gateway transform in kebab-case');
  if (gateway.unavailable !== undefined && !Array.isArray(gateway.unavailable))
    fail(where, 'unavailable must be a list');
  const unavailable = [];
  (Array.isArray(gateway.unavailable) ? gateway.unavailable : []).forEach((entry, index) => {
    const at = `${where} unavailable[${index}]`;
    const template = entry?.path;
    if (typeof template !== 'string' || !template.split('/').every((segment) => SEGMENT.test(segment)))
      return fail(at, 'path must be made of literals, {id} or a|b segments');
    const methods = entry.methods;
    if (!Array.isArray(methods) || methods.length === 0 || methods.some((method) => !METHODS.includes(method)))
      return fail(at, `methods must list some of ${METHODS.join(', ')}`);
    for (const sample of samplePaths(template)) {
      if (routes.some((route) => new RegExp(route.pattern).test(sample)))
        fail(at, `${sample} is also an allowed route`);
    }
    unavailable.push({ template, pattern: compileTemplate(template), methods });
  });
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
    transformBody: gateway.transformBody ?? null,
    unavailable,
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
  '  readonly transformBody: string | null;',
  '  readonly unavailable: readonly {',
  '    readonly template: string;',
  '    readonly pattern: string;',
  '    readonly methods: readonly string[];',
  '  }[];',
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
let upstreamsCurrent =
  existsSync(join(root, upstreamsPath)) &&
  readFileSync(join(root, upstreamsPath), 'utf8') === upstreamsGenerated;
let navigationCurrent =
  existsSync(join(root, navigationPath)) &&
  readFileSync(join(root, navigationPath), 'utf8') === navigationGenerated;
let rolesCurrent =
  existsSync(join(root, rolesPath)) && readFileSync(join(root, rolesPath), 'utf8') === rolesGenerated;
let packsCurrent =
  existsSync(join(root, packsPath)) && readFileSync(join(root, packsPath), 'utf8') === packsGenerated;
if (write && errors.length === 0) {
  if (!catalogueCurrent) writeFileSync(join(root, generatedPath), generated);
  for (const [path, content, current] of [
    [gatewaysPath, gatewaysGenerated, gatewaysCurrent],
    [upstreamsPath, upstreamsGenerated, upstreamsCurrent],
    [navigationPath, navigationGenerated, navigationCurrent],
    [rolesPath, rolesGenerated, rolesCurrent],
    [packsPath, packsGenerated, packsCurrent],
  ]) {
    if (current) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  catalogueCurrent = true;
  gatewaysCurrent = true;
  upstreamsCurrent = true;
  navigationCurrent = true;
  rolesCurrent = true;
  packsCurrent = true;
}
if (!catalogueCurrent) fail(generatedPath, 'out of date; run `pnpm modules:catalog`');
if (!gatewaysCurrent) fail(gatewaysPath, 'out of date; run `pnpm modules:catalog`');
if (!upstreamsCurrent) fail(upstreamsPath, 'out of date; run `pnpm modules:catalog`');
if (!navigationCurrent) fail(navigationPath, 'out of date; run `pnpm modules:catalog`');
if (!rolesCurrent) fail(rolesPath, 'out of date; run `pnpm modules:catalog`');
if (!packsCurrent) fail(packsPath, 'out of date; run `pnpm modules:catalog`');

// Generated module runtime (WI-OI-085b): a module declaring `spec.runtime.generated` is built by the generic
// `generated-module` image target and run from a Compose overlay generated here; its credentials live in
// infra/compose/.env.module.<name>. Everything else comes from the manifest, so there is one source of truth.
// Existing modules keep their hand-written wiring.
const RUNTIME_DIR = 'infra/compose/generated';
const runtimeFiles = new Map();
const runtimeIndex = {};
const readText = (file) =>
  existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null;
const required = (variable) => `\${${variable}:?${variable} is required}`;
const overlayLabels = [
  '    labels:',
  '      com.gigalibs.profile-key: module-runtime-local-development-v1',
  '      com.gigalibs.execution-class: LOCAL_DEVELOPMENT',
  `      com.gigalibs.release-id: ${required('RELEASE_ID')}`,
  `      org.opencontainers.image.revision: ${required('SOURCE_REVISION')}`,
  `      com.gigalibs.source-state-sha256: ${required('SOURCE_STATE_SHA256')}`,
];
const overlayHardening = [
  '    extra_hosts:',
  '      - "host.docker.internal:host-gateway"',
  '    security_opt:',
  '      - no-new-privileges:true',
  '    cap_drop:',
  '      - ALL',
];
// WI-OI-085e (product vision §8): generated modules run inside one shared module host by default.
const HOST_SERVICE = 'module-host';
const HOST_PORT = 4790;
const migrationsService = (name, runtime, image, directory) => [
  `  ${name}-migrations:`,
  `    image: ${required(image)}`,
  '    pull_policy: never',
  '    command: ["run-module-migrations.mjs"]',
  '    restart: "no"',
  '    read_only: true',
  '    tmpfs:',
  '      - /tmp:rw,noexec,nosuid,size=64m',
  '    environment:',
  `      DATABASE_URL: ${required('MODULE_MIGRATIONS_DATABASE_URL')}`,
  `      MODULE_RUNTIME_DATABASE_URL: ${required(`${runtime.prefix}_DATABASE_URL`)}`,
  `      MODULE_MIGRATIONS_DIRECTORY: ${directory}`,
  `      MODULE_SCHEMA: ${runtime.schema}`,
  `      MODULE_EXPECTED_MIGRATION_VERSION: "${runtime.migrationVersion}"`,
  `      MODULE_APPEND_ONLY_TABLES: ${runtime.appendOnlyTables.join(',')}`,
  `      MODULE_READ_ONLY_TABLES: ${runtime.readOnlyTables.join(',')}`,
  ...overlayHardening,
  ...overlayLabels,
  '',
];
function hostOverlay(entries) {
  return [
    '# Generated by `pnpm modules:catalog` from `spec.runtime.hosting: host` in modules/*/module.yaml (WI-OI-085e).',
    '# Do not edit. Render with compose.yaml and infra/compose/.env, .env.modules, .env.module.host and each',
    '# .env.module.<name>. One process runs every hosted module; each keeps its own schema, role, key and migrations.',
    'services:',
    ...entries.flatMap(([name, runtime]) =>
      migrationsService(name, runtime, 'MODULE_HOST_IMAGE', `/app/modules/${name}/migrations`),
    ),
    `  ${HOST_SERVICE}:`,
    `    image: ${required('MODULE_HOST_IMAGE')}`,
    '    pull_policy: never',
    '    restart: unless-stopped',
    '    init: true',
    '    read_only: true',
    '    tmpfs:',
    '      - /tmp:rw,noexec,nosuid,size=64m',
    '    environment:',
    '      NODE_ENV: development',
    '      MODULE_HOST_API_HOST: 0.0.0.0',
    `      MODULE_HOST_API_PORT: "${HOST_PORT}"`,
    `      MODULE_HOST_CORS_ORIGINS: ${required('PUBLIC_ORIGIN')}`,
    ...entries.flatMap(([, runtime]) => [
      `      ${runtime.prefix}_DATABASE_URL: ${required(`${runtime.prefix}_DATABASE_URL`)}`,
      `      ${runtime.prefix}_DATABASE_POOL_SIZE: "5"`,
      `      ${runtime.prefix}_EXPECTED_MIGRATION_VERSION: "${runtime.migrationVersion}"`,
      `      ${runtime.prefix}_PLATFORM_CONTEXT_AUDIENCE: ${runtime.audience}`,
      `      ${runtime.prefix}_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: ${required(`${runtime.prefix}_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64`)}`,
    ]),
    ...overlayHardening.slice(0, 2),
    '    depends_on:',
    ...entries.flatMap(([name]) => [`      ${name}-migrations:`, '        condition: service_completed_successfully']),
    '    healthcheck:',
    '      test:',
    '        - CMD',
    '        - node',
    '        - -e',
    `        - "fetch('http://127.0.0.1:${HOST_PORT}/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"`,
    '      interval: 10s',
    '      timeout: 5s',
    '      retries: 12',
    '      start_period: 15s',
    ...overlayHardening.slice(2),
    ...overlayLabels,
    '',
    '  web:',
    '    environment:',
    ...entries.flatMap(([, runtime]) => [
      `      ${runtime.prefix}_API_URL: http://${HOST_SERVICE}:${HOST_PORT}`,
      `      ${runtime.prefix}_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: ${required(`${runtime.prefix}_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64`)}`,
    ]),
    '',
    '  kernel-worker:',
    '    environment:',
    ...entries.flatMap(([, runtime]) => [
      `      ${runtime.prefix}_API_URL: http://${HOST_SERVICE}:${HOST_PORT}`,
      `      ${runtime.prefix}_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: ${required(`${runtime.prefix}_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64`)}`,
    ]),
    '',
  ].join('\n');
}
function runtimeOverlay(name, runtime) {
  const labels = overlayLabels;
  const hardening = overlayHardening;
  const { prefix, service, port, schema, migrationVersion, audience } = runtime;
  return [
    `# Generated by \`pnpm modules:catalog\` from modules/${name}/module.yaml (WI-OI-085b). Do not edit.`,
    '# Render with compose.yaml and infra/compose/.env, .env.modules and',
    `# .env.module.${name} (scripts/generate-generated-module-credentials.sh ${name}). No module port is published.`,
    'services:',
    `  ${name}-migrations:`,
    `    image: ${required(`${prefix}_IMAGE`)}`,
    '    pull_policy: never',
    '    command: ["run-module-migrations.mjs"]',
    '    restart: "no"',
    '    read_only: true',
    '    tmpfs:',
    '      - /tmp:rw,noexec,nosuid,size=64m',
    '    environment:',
    `      DATABASE_URL: ${required('MODULE_MIGRATIONS_DATABASE_URL')}`,
    `      MODULE_RUNTIME_DATABASE_URL: ${required(`${prefix}_DATABASE_URL`)}`,
    '      MODULE_MIGRATIONS_DIRECTORY: /app/migrations',
    `      MODULE_SCHEMA: ${schema}`,
    `      MODULE_EXPECTED_MIGRATION_VERSION: "${migrationVersion}"`,
    `      MODULE_APPEND_ONLY_TABLES: ${runtime.appendOnlyTables.join(',')}`,
    `      MODULE_READ_ONLY_TABLES: ${runtime.readOnlyTables.join(',')}`,
    ...hardening,
    ...labels,
    '',
    `  ${service}:`,
    `    image: ${required(`${prefix}_IMAGE`)}`,
    '    pull_policy: never',
    '    restart: unless-stopped',
    '    init: true',
    '    read_only: true',
    '    tmpfs:',
    '      - /tmp:rw,noexec,nosuid,size=64m',
    '    environment:',
    '      NODE_ENV: development',
    `      ${prefix}_API_HOST: 0.0.0.0`,
    `      ${prefix}_API_PORT: "${port}"`,
    `      ${prefix}_CORS_ORIGINS: ${required('PUBLIC_ORIGIN')}`,
    `      ${prefix}_DATABASE_URL: ${required(`${prefix}_DATABASE_URL`)}`,
    `      ${prefix}_DATABASE_POOL_SIZE: "10"`,
    `      ${prefix}_EXPECTED_MIGRATION_VERSION: "${migrationVersion}"`,
    `      ${prefix}_PLATFORM_CONTEXT_AUDIENCE: ${audience}`,
    `      ${prefix}_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: ${required(`${prefix}_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64`)}`,
    ...hardening.slice(0, 2),
    '    depends_on:',
    `      ${name}-migrations:`,
    '        condition: service_completed_successfully',
    '    healthcheck:',
    '      test:',
    '        - CMD',
    '        - node',
    '        - -e',
    `        - "fetch('http://127.0.0.1:${port}/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"`,
    '      interval: 10s',
    '      timeout: 5s',
    '      retries: 12',
    '      start_period: 15s',
    ...hardening.slice(2),
    ...labels,
    '',
    '  web:',
    '    environment:',
    `      ${prefix}_API_URL: http://${service}:${port}`,
    `      ${prefix}_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: ${required(`${prefix}_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64`)}`,
    '',
  ].join('\n');
}
for (const [name, manifest] of modules) {
  const runtime = manifest.spec.runtime;
  if (runtime === undefined) continue;
  const where = `modules/${name}/module.yaml spec.runtime`;
  if (runtime?.generated !== true) {
    fail(where, 'generated must be true; only generated modules declare spec.runtime');
    continue;
  }
  const unknown = Object.keys(runtime).filter(
    (key) => !['generated', 'hosting', 'appendOnlyTables', 'readOnlyTables'].includes(key),
  );
  if (unknown.length) fail(where, `unknown keys ${unknown.join(', ')}`);
  const tables = (field) => {
    const list = runtime[field] ?? [];
    if (Array.isArray(list) && list.every((table) => /^[a-z][a-z0-9_]*$/.test(table))) return list;
    fail(where, `${field} must list lower-case table names`);
    return [];
  };
  const api = manifest.spec.api ?? {};
  const upstream = api.upstream ?? {};
  const database = manifest.spec.database ?? {};
  const gateway = gateways.find((entry) => entry.module === name);
  const prefix = /^([A-Z][A-Z0-9_]*)_API_URL$/.exec(upstream.environmentKey ?? '')?.[1];
  if (!prefix) {
    fail(where, 'spec.api.upstream.environmentKey must be <PREFIX>_API_URL');
    continue;
  }
  if (!gateway) {
    fail(where, 'a generated module needs spec.gateway');
    continue;
  }
  if (gateway.signingKeyEnvironment !== `${prefix}_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64`)
    fail(where, `spec.gateway.signingKeyEnvironment must be ${prefix}_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64`);
  const hosting = runtime.hosting ?? 'host';
  if (!['host', 'service'].includes(hosting)) fail(where, 'hosting must be host or service');
  if (hosting === 'host') {
    if (upstream.serviceHostname !== HOST_SERVICE || api.port !== HOST_PORT || upstream.basePath !== `/${name}`)
      fail(where, `a hosted module is reached at ${HOST_SERVICE}:${HOST_PORT} with spec.api.upstream.basePath /${name}`);
  } else if (upstream.serviceHostname !== `${name}-api` || upstream.basePath !== undefined) {
    fail(where, `a module with hosting: service is reached at ${name}-api, without a basePath`);
  }
  if (!/^gigalibs_[a-z0-9_]+$/.test(database.defaultSchema ?? ''))
    fail(where, 'spec.database.defaultSchema must be gigalibs_<name>');
  const packageFile = `modules/${name}/${api.application ?? 'apps/api'}/package.json`;
  const packageName = readText(packageFile) ? JSON.parse(readText(packageFile)).name : undefined;
  if (!/^@gigalibs\/[a-z0-9-]+$/.test(packageName ?? '')) {
    fail(where, `${packageFile} must exist and name an @gigalibs package`);
    continue;
  }
  const manifestFile = `modules/${name}/${database.runtimeManifest ?? 'db/runtime-manifest.txt'}`;
  const migrations = (readText(manifestFile) ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const migrationVersion = Number(/^(\d+)_/.exec(migrations.at(-1) ?? '')?.[1]);
  if (!Number.isInteger(migrationVersion) || migrationVersion < 1) {
    fail(where, `${manifestFile} must list at least one NNNNNN_<name>.up.sql migration`);
    continue;
  }
  const resolved = {
    hosting,
    basePath: upstream.basePath ?? '',
    package: packageName,
    directory: `modules/${name}`,
    image: `gigalibs/${upstream.serviceHostname}`,
    component: upstream.serviceHostname,
    title: manifest.metadata?.displayName ?? name,
    workItem: manifest.metadata?.workItem ?? null,
    prefix,
    service: upstream.serviceHostname,
    port: api.port,
    schema: database.defaultSchema,
    migrationVersion,
    audience: gateway.audience,
    appendOnlyTables: tables('appendOnlyTables'),
    readOnlyTables: tables('readOnlyTables'),
  };
  // Listing gate (WI-OI-085d): above PLANNED, a generated module needs a live conformance record for its current code.
  const listed = (manifest.spec.catalog ?? []).filter((entry) => entry.readiness !== 'PLANNED');
  if (listed.length && name !== conformanceModule) {
    const recordFile = `modules/${name}/conformance.json`;
    let record = null;
    try {
      record = JSON.parse(readText(recordFile) ?? 'null');
    } catch {
      record = null;
    }
    const recordedChecks = Array.isArray(record?.checks) ? new Set(record.checks) : new Set();
    const completeRecord =
      record?.module === name &&
      record?.passed === true &&
      record?.live === true &&
      typeof record?.checkedAt === 'string' &&
      Number.isFinite(Date.parse(record.checkedAt)) &&
      Array.isArray(record?.checks) &&
      record.checks.length === generatedModuleConformanceChecks.length &&
      recordedChecks.size === generatedModuleConformanceChecks.length &&
      generatedModuleConformanceChecks.every((checkId) => recordedChecks.has(checkId));
    if (!completeRecord)
      fail(where, `${listed.map((entry) => entry.key).join(', ')} is above PLANNED without ${recordFile}; run \`pnpm module:conformance ${name} --live --record\``);
    else if (record.codeSha256 !== moduleCodeSha256(root, name))
      fail(where, `${recordFile} was made for other code; rerun \`pnpm module:conformance ${name} --live --record\``);
  }
  runtimeIndex[name] = resolved;
  if (hosting === 'service') runtimeFiles.set(`${RUNTIME_DIR}/compose.${name}.yaml`, runtimeOverlay(name, resolved));
}
runtimeFiles.set(`${RUNTIME_DIR}/modules.json`, `${JSON.stringify(runtimeIndex, null, 2)}\n`);
const hosted = Object.entries(runtimeIndex)
  .filter(([, runtime]) => runtime.hosting === 'host')
  .sort(([a], [b]) => a.localeCompare(b));
if (hosted.length) runtimeFiles.set(`${RUNTIME_DIR}/compose.${HOST_SERVICE}.yaml`, hostOverlay(hosted));

// The module host (WI-OI-085e) imports every hosted module, so it must depend on exactly those packages: a hosted
// module it lacks cannot load, and a service module it carries would run twice.
const hostPackageFile = 'apps/module-host/package.json';
const hostDependencies = Object.keys(JSON.parse(readText(hostPackageFile) ?? '{}').dependencies ?? {});
for (const [name, runtime] of Object.entries(runtimeIndex)) {
  if (runtime.hosting === 'host' && !hostDependencies.includes(runtime.package))
    fail(hostPackageFile, `must depend on ${runtime.package} ("workspace:*"), because ${name} runs in the module host`);
  if (runtime.hosting === 'service' && hostDependencies.includes(runtime.package))
    fail(hostPackageFile, `must not depend on ${runtime.package}, because ${name} runs as its own service`);
}
const hostListPath = 'apps/module-host/src/hosted-modules.generated.ts';
const hostListGenerated = [
  '// Generated by `pnpm modules:catalog` (scripts/module-manifests.mjs) from `spec.runtime.hosting: host` in',
  '// modules/*/module.yaml (WI-OI-085e). Do not edit: change the owning manifest and regenerate.',
  "import type { Type } from '@nestjs/common';",
  ...hosted.map(([, runtime], index) => `import { AppModule as Hosted${index} } from '${runtime.package}';`),
  '',
  'export interface HostedModule {',
  '  readonly name: string;',
  '  readonly path: string;',
  '  readonly module: Type<unknown>;',
  '}',
  '',
  hosted.length
    ? [
        'export const hostedModules: readonly HostedModule[] = [',
        ...hosted.map(([name], index) => `  { name: '${name}', path: '${name}', module: Hosted${index} },`),
        '];',
      ].join('\n')
    : 'export const hostedModules: readonly HostedModule[] = [];',
  '',
].join('\n');
if (readText(hostListPath) !== hostListGenerated) {
  if (write && errors.length === 0) writeFileSync(join(root, hostListPath), hostListGenerated);
  else fail(hostListPath, 'out of date; run `pnpm modules:catalog`');
}
const staleRuntime = existsSync(join(root, RUNTIME_DIR))
  ? readdirSync(join(root, RUNTIME_DIR))
      .map((file) => `${RUNTIME_DIR}/${file}`)
      .filter((file) => !runtimeFiles.has(file))
  : [];
const changedRuntime = [...runtimeFiles].filter(([file, content]) => readText(file) !== content);
if (write && errors.length === 0) {
  mkdirSync(join(root, RUNTIME_DIR), { recursive: true });
  for (const [file, content] of changedRuntime) writeFileSync(join(root, file), content);
  for (const file of staleRuntime) rmSync(join(root, file));
} else {
  for (const [file] of changedRuntime) fail(file, 'out of date; run `pnpm modules:catalog`');
  for (const file of staleRuntime)
    fail(file, 'generated runtime file no manifest declares; run `pnpm modules:catalog`');
}

// Pages (WI-OI-083b): each module's `spec.ui.pages` are generated into the shell's route tree. A page renders an
// exported component of the module's web package (`spec.ui.package`) with literal props, or the shell's
// CapabilityStatus for a capability that is not connected yet. Generated files start with PAGE_MARKER; a
// hand-written page at a declared route, or a generated page no manifest declares, fails the audit.
const APP_DIR = 'apps/workflow-platform/app/(app)';
const PAGE_MARKER = '// Generated by `pnpm modules:catalog`';
const expectedPages = new Map();
for (const [name, manifest] of modules) {
  const ui = manifest.spec.ui;
  const pages = ui?.pages;
  if (pages === undefined) continue;
  const where = `modules/${name}/module.yaml spec.ui.pages`;
  if (!Array.isArray(pages)) {
    fail(where, 'must be a list');
    continue;
  }
  pages.forEach((page, index) => {
    const at = `${where}[${index}]`;
    const route = page?.route;
    if (typeof route !== 'string' || !/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(route)) {
      fail(at, 'route must be /segment[/segment…] in lowercase');
      return;
    }
    if (ui.basePath && route !== ui.basePath && !route.startsWith(`${ui.basePath}/`)) {
      fail(at, `route must be under spec.ui.basePath ${ui.basePath}`);
    }
    const file = `${APP_DIR}${route}/page.tsx`;
    if (expectedPages.has(file)) {
      fail(at, `route ${route} is declared twice`);
      return;
    }
    let body;
    if (page.component !== undefined) {
      if (!/^[A-Z][A-Za-z0-9]*$/.test(page.component))
        fail(at, 'component must be an exported component name');
      if (!isText(ui.package)) fail(where, 'spec.ui.package is required for component pages');
      const props = page.props ?? {};
      const validProps =
        typeof props === 'object' &&
        !Array.isArray(props) &&
        Object.entries(props).every(
          ([key, value]) =>
            /^[a-z][A-Za-z0-9]*$/.test(key) &&
            ['string', 'number', 'boolean'].includes(typeof value),
        );
      if (!validProps) fail(at, 'props must map names to strings, numbers or booleans');
      const attributes = validProps
        ? Object.entries(props)
            .map(([key, value]) => ` ${key}={${JSON.stringify(value)}}`)
            .join('')
        : '';
      body = [
        `import { ${page.component} } from '${ui.package}';`,
        '',
        'export default function Page() {',
        `  return <${page.component}${attributes} />;`,
        '}',
      ];
    } else if (page.unavailable !== undefined) {
      const status = page.unavailable;
      if (!isText(status?.title) || !isText(status?.summary))
        fail(at, 'unavailable needs a title and a summary');
      const lines = [
        `      title={${JSON.stringify(status?.title)}}`,
        `      summary={${JSON.stringify(status?.summary)}}`,
      ];
      for (const list of ['availableForTesting', 'blockedActions']) {
        if (status?.[list] === undefined) continue;
        if (!Array.isArray(status[list]) || !status[list].every(isText))
          fail(at, `${list} must be a list of text`);
        else lines.push(`      ${list}={${JSON.stringify(status[list])}}`);
      }
      body = [
        "import { CapabilityStatus } from '@/components/UnavailableCapability';",
        '',
        'export default function Page() {',
        '  return (',
        '    <CapabilityStatus',
        ...lines,
        '    />',
        '  );',
        '}',
      ];
    } else {
      fail(at, 'a page needs a component or an unavailable status');
      return;
    }
    expectedPages.set(
      file,
      [
        `${PAGE_MARKER} from modules/${name}/module.yaml (WI-OI-083). Do not edit.`,
        ...body,
        '',
      ].join('\n'),
    );
  });
}
function* pageFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* pageFiles(path);
    else if (entry.name === 'page.tsx') yield path;
  }
}
const read = (file) =>
  existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null;
const generatedPages = [...pageFiles(join(root, APP_DIR))]
  .map((path) => relative(root, path))
  .filter((file) => read(file)?.startsWith(PAGE_MARKER));
const stalePages = generatedPages.filter((file) => !expectedPages.has(file));
const changedPages = [...expectedPages].filter(([file, content]) => read(file) !== content);
const handWrittenPages = changedPages
  .map(([file]) => file)
  .filter((file) => read(file) !== null && !read(file).startsWith(PAGE_MARKER));
for (const file of handWrittenPages)
  fail(file, 'a hand-written page sits at a route a module manifest declares; remove it');
if (write && errors.length === 0) {
  for (const [file, content] of changedPages) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  for (const file of stalePages) rmSync(join(root, file));
} else {
  for (const [file] of changedPages)
    if (!handWrittenPages.includes(file)) fail(file, 'out of date; run `pnpm modules:catalog`');
  for (const file of stalePages)
    fail(file, 'generated page no manifest declares; run `pnpm modules:catalog`');
}

console.log(
  JSON.stringify(
    {
      solution: solutionName ?? null,
      manifests: modules.size,
      catalogEntries: entries.length,
      gateways: gateways.map((gateway) => `${gateway.module}: ${gateway.routes.length} routes`),
      pages: expectedPages.size,
      generatedModules: Object.keys(runtimeIndex),
      hostedModules: hosted.map(([name]) => name),
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
