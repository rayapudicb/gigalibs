#!/usr/bin/env node
// WI-OI-120ak (Security review of release f6123bf, M1): a module's migration job, its API and its code must all expect
// the migration its image ships last. The job compares the shipped directory with its pin before it connects
// (infra/compose/docker/run-module-migrations.mjs), so a job pinned below it stops the deploy; an API whose pin differs
// from its code refuses to start.
//
// The one exception is a hold: a job pinned below its shipped migrations on purpose, so that a deploy of this branch
// stops before a migration that is not reviewed yet. The API and the code may then already expect the newer version.
//
// Usage: node scripts/verify-migration-pins.mjs   (exit 0 when every pin agrees; 1 otherwise)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const MODULES = [
  {
    compose: 'infra/compose/compose.modules.local.yaml',
    job: 'connector-hub-migrations',
    api: 'connector-hub-api',
    apiVariable: 'CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION',
    shipped: { directory: 'modules/universal-connector-hub/db/migrations' },
    code: {
      file: 'modules/universal-connector-hub/apps/api/src/runtime-config.ts',
      pattern: /'CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION',\s*(\d+),\s*\d+,/,
    },
  },
  {
    compose: 'infra/compose/compose.modules.local.yaml',
    job: 'analytics-migrations',
    api: 'analytics-api',
    apiVariable: 'ANALYTICS_EXPECTED_MIGRATION_VERSION',
    shipped: { directory: 'modules/analytics-studio/db/migrations' },
    code: {
      file: 'modules/analytics-studio/apps/api/src/runtime-config.ts',
      pattern: /export const ANALYTICS_SCHEMA_CONTRACT_VERSION = (\d+);/,
    },
  },
  {
    compose: 'infra/compose/compose.modules.local.yaml',
    job: 'cmms-migrations',
    api: 'cmms-api',
    apiVariable: 'CMMS_EXPECTED_MIGRATION_VERSION',
    shipped: { manifest: 'modules/physical-operations-cmms/db/runtime-manifest.txt' },
    code: {
      file: 'modules/physical-operations-cmms/apps/api/src/runtime-config.ts',
      pattern: /export const CMMS_SCHEMA_CONTRACT_VERSION = (\d+);/,
    },
  },
  {
    compose: 'infra/compose/compose.workforce.local.yaml',
    job: 'workforce-migrations',
    api: 'workforce-api',
    apiVariable: 'WORKFORCE_EXPECTED_MIGRATION_VERSION',
    shipped: { directory: 'modules/gigaops/db/runtime-foundation' },
    code: {
      file: 'modules/gigaops/apps/api/src/runtime-config.ts',
      pattern: /export const WORKFORCE_SCHEMA_CONTRACT_VERSION = (\d+);/,
    },
  },
  {
    compose: 'infra/compose/compose.geospatial.local.yaml',
    job: 'geospatial-migrations',
    api: 'geospatial-api',
    apiVariable: 'GEOSPATIAL_EXPECTED_MIGRATION_VERSION',
    shipped: { directory: 'modules/geospatial/db/runtime-foundation' },
    code: {
      file: 'modules/geospatial/apps/api/src/runtime-config.ts',
      pattern: /export const GEOSPATIAL_SCHEMA_CONTRACT_VERSION = (\d+);/,
    },
  },
];

const read = (file) => readFileSync(join(root, file), 'utf8');

/** The lines of one top-level compose service (two-space indented key), or null when it is absent. */
function serviceBlock(composeText, service) {
  const lines = composeText.split('\n');
  const start = lines.findIndex((line) => line === `  ${service}:`);
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^ {2}\S/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

function pinIn(composeText, service, variable) {
  const block = serviceBlock(composeText, service);
  if (!block) return { error: `service ${service} is missing` };
  const line = block.find((entry) => entry.trim().startsWith(`${variable}:`));
  const match = line?.match(/:\s*"?(\d+)"?\s*$/);
  return match ? { value: Number(match[1]) } : { error: `${service} has no numeric ${variable}` };
}

function shippedEnd(shipped) {
  if (shipped.directory) {
    const files = readdirSync(join(root, shipped.directory)).filter((name) =>
      /^\d{6}_.+\.up\.sql$/.test(name),
    );
    return files.length ? Math.max(...files.map((name) => Number(name.slice(0, 6)))) : 0;
  }
  const entries = read(shipped.manifest)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  return entries.length ? Number(entries.at(-1).slice(0, 6)) : 0;
}

const problems = [];
const notes = [];

for (const module of MODULES) {
  const composeText = read(module.compose);
  const job = pinIn(composeText, module.job, 'MODULE_EXPECTED_MIGRATION_VERSION');
  const api = pinIn(composeText, module.api, module.apiVariable);
  const codeMatch = existsSync(join(root, module.code.file))
    ? read(module.code.file).match(module.code.pattern)
    : null;
  const end = shippedEnd(module.shipped);
  for (const pin of [job, api]) if (pin.error) problems.push(`${module.compose}: ${pin.error}`);
  if (!codeMatch)
    problems.push(`${module.code.file}: the expected migration version was not found`);
  if (job.error || api.error || !codeMatch) continue;
  const code = Number(codeMatch[1]);

  const held = module.hold !== undefined && job.value === module.hold && end > module.hold;
  if (job.value !== end && !held) {
    problems.push(
      `${module.job} expects ${job.value}, but its image ships migrations up to ${end}: the job would refuse and stop the deploy`,
    );
  }
  if (held)
    notes.push(
      `${module.job} is held at ${module.hold} (ships up to ${end}): a deploy of this branch stops there`,
    );
  if (api.value !== end)
    problems.push(
      `${module.api} ${module.apiVariable} is ${api.value}; its migrations end at ${end}`,
    );
  if (api.value !== code)
    problems.push(`${module.api} ${module.apiVariable} is ${api.value}; its code expects ${code}`);
}

// Every migration job in compose must be listed above, so a new module cannot skip this check.
const listed = new Set(MODULES.map((module) => module.job));
for (const file of readdirSync(join(root, 'infra/compose')).filter((name) =>
  /^compose.*\.ya?ml$/.test(name),
)) {
  const text = read(join('infra/compose', file));
  for (const [, service] of text.matchAll(/^ {2}([a-z0-9-]+):$/gm)) {
    const block = serviceBlock(text, service);
    if (
      block?.some((line) => line.trim().startsWith('MODULE_EXPECTED_MIGRATION_VERSION:')) &&
      !listed.has(service)
    ) {
      problems.push(
        `infra/compose/${file}: ${service} pins a migration version but is not listed in this check`,
      );
    }
  }
}

for (const note of notes) console.log(`note: ${note}`);
if (problems.length) {
  for (const problem of problems) console.error(`FAIL: ${problem}`);
  process.exit(1);
}
console.log(`Migration pins agree for ${MODULES.length} modules.`);
