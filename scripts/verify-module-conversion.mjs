// WI-OI-120s (S16): is a module's move onto metadata windows complete? For each converted module (or the ones named),
// compares its windows (`modules/<module>/dictionary/*.window.json`) with what its record dispatcher registers, its
// gateway, its pages and its module roles. Needs a build (`pnpm build`): it loads the module's dispatcher from dist.
//   node scripts/verify-module-conversion.mjs [<module> ...]
// A module joins CONVERTED when its first window ships; the conversion kit (docs/guides/module-conversion-kit.md)
// lists the steps. KNOWN holds findings the owner has seen and that a later card closes; they print, they do not fail.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { conversionFindings } from './lib/conversion-check.mjs';

const root = resolve(import.meta.dirname, '..');
const { moduleWindowBaselines, moduleDefaultRoles, holdsPermission } = await import(pathToFileURL(join(root, 'packages/contracts/dist/index.js')).href);
const { executableCapabilityFindings, entityRules } = await import(pathToFileURL(join(root, 'packages/configuration-core/dist/index.js')).href);

/** Converted modules: where their record dispatcher is built. */
const CONVERTED = {
  'product-catalogue': { dispatcher: 'apps/api/dist/catalogue/catalogue-record-adapters.js', factory: 'catalogueRecordDispatcher' },
  'universal-inventory': { dispatcher: 'apps/api/dist/inventory/inventory-record-adapters.js', factory: 'inventoryRecordDispatcher' },
  'financial-operations': { dispatcher: 'apps/api/dist/finance/finance-record-adapters.js', factory: 'financeRecordDispatcher' },
  'physical-operations-cmms': { dispatcher: 'apps/api/dist/work-orders/cmms-record-adapters.js', factory: 'cmmsRecordDispatcher' },
};

/** Findings seen by the owner and closed by a named later card. */
const KNOWN = {};

/** A stand-in for a module's domain services: building the dispatcher only registers adapters, it calls nothing. */
const stub = new Proxy(function stub() {}, { get: (_target, key) => (key === 'then' ? undefined : stub), apply: () => stub });

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const modules = requested.length > 0 ? requested : Object.keys(CONVERTED);
const baselines = moduleWindowBaselines();

// Lookups another converted module serves are usable everywhere (the window client routes them to that module).
const servedLookups = new Map();
const described = new Map();
for (const [name, { dispatcher, factory }] of Object.entries(CONVERTED)) {
  const path = join(root, 'modules', name, dispatcher);
  if (!existsSync(path)) continue;
  const records = (await import(pathToFileURL(path).href))[factory](stub, stub);
  const description = records.describe();
  described.set(name, description);
  for (const resolver of description.resolvers) servedLookups.set(resolver.key, name);
}

let failures = 0;
for (const name of modules) {
  if (!CONVERTED[name]) {
    console.log(`FAIL ${name}: not in CONVERTED (scripts/verify-module-conversion.mjs)`);
    failures += 1;
    continue;
  }
  const description = described.get(name);
  if (!description) {
    console.log(`FAIL ${name}: ${CONVERTED[name].dispatcher} is not built; run pnpm build`);
    failures += 1;
    continue;
  }
  const manifest = yaml.load(readFileSync(join(root, 'modules', name, 'module.yaml'), 'utf8'));
  const windows = baselines.filter((baseline) => baseline.definition.moduleKey === name);
  const roles = moduleDefaultRoles.filter((role) => (manifest.spec.catalog ?? []).some((entry) => entry.key === role.catalogKey));
  const { findings, permissions } = conversionFindings({
    windows,
    description,
    manifest,
    roles,
    servedLookups: new Set(servedLookups.keys()),
    engine: { executableCapabilityFindings, entityRules, holdsPermission },
  });

  const known = new Set(KNOWN[name] ?? []);
  const open = findings.filter((finding) => !known.has(finding));
  const seen = findings.filter((finding) => known.has(finding));
  for (const finding of open) console.log(`FAIL ${name}: ${finding}`);
  for (const finding of seen) console.log(`KNOWN ${name}: ${finding}`);
  for (const stale of [...known].filter((finding) => !findings.includes(finding))) {
    console.log(`FAIL ${name}: KNOWN finding no longer occurs; remove it from KNOWN: ${stale}`);
    failures += 1;
  }
  failures += open.length;
  console.log(`${open.length === 0 ? 'PASS' : 'FAIL'} ${name}: ${windows.length} windows, ${description.entities.length} record types, ${permissions.length} permissions`);
}
process.exit(failures > 0 ? 1 : 0);
