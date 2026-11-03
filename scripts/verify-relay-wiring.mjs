// WI-OI-160 (ADR-0039 §5): `pnpm audit:relays` — every relay in config/relay-wiring.json is set on the services it
// names in the Compose files the UAT stack runs, every relay variable a service carries belongs to a declared relay
// (a key on the wrong service fails, QA-046), and every declared name is one the code reads. Relays marked
// not-wired are listed with their reason. Names only: values are secrets and never read.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { checkRelayWiring } from './lib/relay-wiring.mjs';

const root = new URL('../', import.meta.url).pathname;
const yaml = createRequire(import.meta.url)('js-yaml');

// The Compose files `up-convergence-full-uat.sh` combines.
const COMPOSE_FILES = [
  'infra/compose/compose.yaml',
  'infra/compose/compose.modules.local.yaml',
  'infra/compose/compose.workforce.local.yaml',
  'infra/compose/compose.geospatial.local.yaml',
  'infra/compose/generated/compose.module-host.yaml',
];
const CODE_ROOTS = ['apps/playground-api/src', 'apps/module-host/src', 'modules', 'packages'];

const servicesEnv = {};
for (const file of COMPOSE_FILES) {
  const document = yaml.load(readFileSync(join(root, file), 'utf8'));
  for (const [service, definition] of Object.entries(document?.services ?? {})) {
    const environment = definition?.environment ?? {};
    const names = Array.isArray(environment) ? environment.map((entry) => String(entry).split('=')[0]) : Object.keys(environment);
    servicesEnv[service] = [...new Set([...(servicesEnv[service] ?? []), ...names])];
  }
}

const codeNames = new Set();
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path);
    else if (/\.ts$/.test(entry) && !/\.(test|spec)\.ts$/.test(entry))
      // Every upper-case setting name the code mentions: a declared name must be one of them (catches typos).
      for (const [, name] of readFileSync(path, 'utf8').matchAll(/['"`]([A-Z][A-Z0-9_]{3,})['"`]/g)) codeNames.add(name);
  }
}
for (const directory of CODE_ROOTS) walk(join(root, directory));

const registry = JSON.parse(readFileSync(join(root, 'config/relay-wiring.json'), 'utf8'));
const result = checkRelayWiring(registry, servicesEnv, codeNames);
const summary = {
  status: result.violations.length === 0 ? 'passed' : 'failed',
  wired: result.wired.length,
  notWired: result.notWired,
  violations: result.violations.map(([code, message]) => ({ code, message })),
};
if (result.violations.length > 0) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(summary, null, 2));
