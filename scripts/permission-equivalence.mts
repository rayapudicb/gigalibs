// WI-OI-120q (R1): the equivalence check. Every base role and module role is evaluated against every permission code
// the platform checks, once with each matcher it replaced and once with the one matcher (`permissionMatches`). The
// differences are printed per site; the card lists the ones intended. Run: `pnpm exec tsx scripts/permission-equivalence.mts [--json]`.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';
import { permissionMatches, permissionParts } from '../packages/contracts/src/rbac/permission-match.ts';
import { moduleDefaultRoles } from '../packages/contracts/src/modules/roles.generated.ts';
import { createDefaultRoleHierarchy } from '../packages/rbac-core/src/default-roles.ts';

const root = resolve(import.meta.dirname, '..');
type Grants = readonly string[];
type Rule = (granted: Grants, required: string) => boolean;

// ── The matchers being replaced, frozen as they were before R1 ─────────────────────────────────────────────────────
const family = (code: string) => code.split(/[:.]/)[0];
const legacy = {
  /** web (module-access), renderer (window-model), Analytics and Workforce main guards, kernel module calls. */
  anyFamily: (g: Grants, r: string) => g.includes('*') || g.includes(r) || (/[:.]/.test(r) && r.search(/[:.]/) > 0 && g.includes(`${family(r)}:*`)),
  /** Analytics and Workforce main guards: the module's own wildcard covered every code, and any family's its own. */
  ownOrAnyFamily: (own: string) => (g: Grants, r: string) => g.includes(`${own}:*`) || legacy.anyFamily(g, r),
  /** CMMS, Geospatial, Workforce bookings and time, module SDK guard, Connector Hub: only the module's own wildcard. */
  ownFamily: (own: string) => (g: Grants, r: string) => g.includes('*') || g.includes(`${own}:*`) || g.includes(r),
  /** record dispatcher `holds`, Catalogue and Finance web: the family is everything before the first colon. */
  beforeColon: (g: Grants, r: string) => g.includes('*') || g.includes(r) || g.includes(`${r.slice(0, r.indexOf(':'))}:*`),
  /** Settings → Team and Configuration Studio web: `split(':')[0]`, so a dotted code has no family. */
  splitColon: (g: Grants, r: string) => g.includes('*') || g.includes(r) || g.includes(`${r.split(':')[0]}:*`),
  /** eSignature, Ontology, Saga, Document Scanner guards; the configuration DictionaryRenderer. */
  exact: (g: Grants, r: string) => g.includes('*') || g.includes(r),
  /** control-plane guard and SCIM (`PermissionEvaluator.match`), without a request context. */
  evaluator: (g: Grants, r: string) =>
    g.some((granted) => {
      if (granted === '*' || granted === 'all') return true;
      if (granted === r) return true;
      const [gResource, gAction, gScope] = granted.split(':');
      const [rResource, rAction, rScope] = r.split(':');
      if (gResource !== '*' && gResource !== rResource) return false;
      if (gAction !== '*' && gAction !== rAction) return false;
      if (!gScope || gScope === 'all' || gScope === 'ALL') return true;
      if (gScope === 'own' || gScope === 'OWN') return rScope === 'own' || rScope === 'OWN';
      if (gScope === 'team' || gScope === 'TEAM') return rScope === 'team' || rScope === 'TEAM';
      return false;
    }),
  /** Configuration Studio service (manifest filtering). */
  configurationStudio: (g: Grants, r: string) => {
    const [requiredResource, requiredAction] = r.split(':');
    return g.some((permission) => {
      if (permission === '*' || permission === 'all' || permission === r) return true;
      const [resource, action] = permission.split(':');
      return (resource === '*' || resource === requiredResource) && (action === '*' || action === requiredAction);
    });
  },
};
const unified: Rule = (g, r) => g.some((granted) => permissionMatches(granted, r));

// ── Where each code is checked ─────────────────────────────────────────────────────────────────────────────────────
const MODULE_API_RULES: Record<string, Array<[string, Rule]>> = {
  'physical-operations-cmms': [['CMMS API (cmms:*)', legacy.ownFamily('cmms')]],
  geospatial: [['Geospatial API (maps:*)', legacy.ownFamily('maps')]],
  gigaops: [
    ['Workforce API', legacy.ownOrAnyFamily('workforce')],
    ['Workforce bookings and time (workforce:*)', legacy.ownFamily('workforce')],
  ],
  'analytics-studio': [['Analytics API', legacy.ownOrAnyFamily('analytics')]],
  'universal-connector-hub': [['Connector Hub API (connections:*)', legacy.ownFamily('connections')]],
  'universal-orders': [['Orders API guard (orders:*)', legacy.ownFamily('orders')], ['Orders record dispatcher', legacy.beforeColon]],
  'universal-procurement': [['Procurement API guard (procurement:*)', legacy.ownFamily('procurement')], ['Procurement record dispatcher', legacy.beforeColon]],
  'product-catalogue': [['Catalogue API guard (products:*)', legacy.ownFamily('products')], ['Catalogue dispatcher and web', legacy.beforeColon]],
  'financial-operations': [['Finance API guard (finance:*)', legacy.ownFamily('finance')], ['Finance dispatcher and web', legacy.beforeColon]],
  'universal-inventory': [['Inventory API guard (inventory:*)', legacy.ownFamily('inventory')], ['Inventory record dispatcher', legacy.beforeColon]],
  esignature: [['eSignature API (esign:*)', legacy.ownFamily('esign')]],
  // Exact only before R1; the owner chose to include them (2026-10-06), so family wildcards now count here.
  ontology: [['Ontology API', legacy.exact]],
  'saga-orchestrator': [['Saga API', legacy.exact]],
  'document-scanner': [['Document Scanner API', legacy.exact]],
  // Exact only (not even `*`) before R1; converted with the owner's "include them" (2026-10-06). None ships an image.
  'accounts-receivable': [['AR API (exact, no *)', (g, r) => g.includes(r)]],
  'spend-management': [['Spend API (exact, no *)', (g, r) => g.includes(r)]],
  'tax-configuration': [['Tax API (exact, no *)', (g, r) => g.includes(r)]],
  'autonomous-recovery-studio': [['Recovery API (recovery:*)', (g, r) => g.includes(r) || g.includes('recovery:*')]],
  'multi-currency': [['Currency API (currency:*)', (g, r) => g.includes(r) || g.includes('currency:*')]],
};
const PERMISSION_KEYS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'permission', 'permissions', 'requiredPermission', 'readPermission', 'writePermission']);

const codes = new Map<string, Set<string>>(); // code → owners (module directory, 'core', 'control')
const malformed = new Set<string>(); // in a permission position but not a code: unreachable even for `*`
const add = (code: unknown, owner: string) => {
  if (typeof code !== 'string' || code === '*') return;
  if (!permissionParts(code)) {
    malformed.add(`${owner}: ${code}`);
    return;
  }
  if (!codes.has(code)) codes.set(code, new Set());
  codes.get(code)!.add(owner);
};
function walk(value: unknown, owner: string, key?: string): void {
  if (Array.isArray(value)) return value.forEach((item) => walk(item, owner, key));
  if (value && typeof value === 'object') {
    // A manifest's `roles` grant codes; they are not checks. Grants are added from the generated roles below.
    for (const [childKey, child] of Object.entries(value)) if (childKey !== 'roles') walk(child, owner, childKey);
    return;
  }
  if (key && PERMISSION_KEYS.has(key)) add(value, owner);
}

for (const directory of readdirSync(join(root, 'modules'))) {
  const manifest = join(root, 'modules', directory, 'module.yaml');
  if (existsSync(manifest)) walk(yaml.load(readFileSync(manifest, 'utf8')), directory);
  const dictionary = join(root, 'modules', directory, 'dictionary');
  if (existsSync(dictionary))
    for (const file of readdirSync(dictionary).filter((name) => name.endsWith('.json')))
      walk(JSON.parse(readFileSync(join(dictionary, file), 'utf8')), directory);
}
walk(yaml.load(readFileSync(join(root, 'platform', 'core.yaml'), 'utf8')), 'core');
function* sources(directory: string): Generator<string> {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'node_modules' && name !== 'dist') yield* sources(path);
    } else if (/\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) yield path;
  }
}
const DECORATOR = /@(?:Require)?Permissions?\(([^)]*)\)/g;
function scanDecorators(directory: string, owner: string): void {
  for (const file of sources(directory))
    for (const match of readFileSync(file, 'utf8').matchAll(DECORATOR))
      for (const literal of match[1]!.matchAll(/'([^']+)'/g)) add(literal[1], owner);
}
scanDecorators(join(root, 'apps', 'playground-api', 'src'), 'control');
for (const directory of readdirSync(join(root, 'modules'))) {
  const apps = join(root, 'modules', directory, 'apps');
  if (!existsSync(apps)) continue;
  for (const app of readdirSync(apps)) if (existsSync(join(apps, app, 'src'))) scanDecorators(join(apps, app, 'src'), directory);
}

// ── Who holds what ─────────────────────────────────────────────────────────────────────────────────────────────────
const hierarchy = createDefaultRoleHierarchy();
const roles: Array<[string, Grants]> = [];
for (const name of ['SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'GUEST'])
  roles.push([name, hierarchy.resolveUserPermissions([name])]);
for (const role of moduleDefaultRoles) roles.push([`${role.catalogKey}/${role.key}`, role.permissions]);
for (const [, grants] of roles) for (const grant of grants) add(grant, 'grant');
// `--probe` adds grant sets no shipped role holds, to show each intended behaviour change (the card's list).
if (process.argv.includes('--probe'))
  roles.push(
    ['probe/all', ['all']],
    ['probe/*:read', ['*:read']],
    ['probe/organization:*', ['organization:*']],
    ['probe/two-part', ['analytics:connectors', 'parties:identifiers', 'configuration:read']],
    ['probe/colon-spelling', ['cmms:work-orders:read', 'maps:nodes:read', 'workforce:time:punch']],
    ['probe/family-wildcards', ['uoms:*', 'catalogues:*', 'esign:*', 'ontology:*', 'cmms:*', 'maps:*']],
    ...['products', 'finance', 'inventory', 'orders', 'procurement', 'connections', 'cmms', 'maps', 'workforce', 'esign', 'analytics'].map(
      (own): [string, Grants] => [`probe/${own}:* alone`, [`${own}:*`]],
    ),
  );

// ── Compare ────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Difference { site: string; role: string; code: string; before: boolean; after: boolean }
const differences: Difference[] = [];
for (const [code, owners] of codes) {
  const sites: Array<[string, Rule]> = [['web and renderer', legacy.anyFamily]];
  // Every code can gate a field of a workspace's own dictionary form. Exact only before R1; included by the owner's
  // decision (2026-10-06), so the differences here are intended: a family wildcard now shows those fields.
  sites.push(['configuration DictionaryRenderer', legacy.exact]);
  for (const owner of owners) sites.push(...(MODULE_API_RULES[owner] ?? []));
  if (owners.has('control')) sites.push(['control-plane guard', legacy.evaluator], ['Configuration Studio service', legacy.configurationStudio]);
  if (owners.has('core')) sites.push(['Settings and Studio web', legacy.splitColon]);
  for (const [role, grants] of roles) {
    const after = unified(grants, code);
    for (const [site, rule] of sites) {
      const before = rule(grants, code);
      if (before !== after) differences.push({ site, role, code, before, after });
    }
  }
}

if (malformed.size > 0) {
  console.error(`Permission positions holding something that is not a permission code:\n${[...malformed].join('\n')}`);
  process.exitCode = 1;
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ roles: roles.length, codes: codes.size, differences }, null, 2));
} else {
  console.log(`${roles.length} roles × ${codes.size} permission codes; ${differences.length} differences`);
  for (const d of differences.sort((a, b) => a.site.localeCompare(b.site) || a.role.localeCompare(b.role) || a.code.localeCompare(b.code)))
    console.log(`${d.after ? 'GAINS' : 'LOSES'}  ${d.site.padEnd(40)} ${d.role.padEnd(44)} ${d.code}`);
}
