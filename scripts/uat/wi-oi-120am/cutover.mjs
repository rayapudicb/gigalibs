#!/usr/bin/env node
// WI-OI-120am, step 2 (owner-run): move UAT onto its own database.
//
//   node scripts/uat/wi-oi-120am/cutover.mjs              # preflight only; changes nothing
//   node scripts/uat/wi-oi-120am/cutover.mjs --run        # the cutover (UAT is down for a few minutes)
//   node scripts/uat/wi-oi-120am/cutover.mjs --rollback   # before the new release is deployed: put everything back
//
// --run, in order, stopping at the first failure:
//  1. starts uat-postgres (compose.database.yaml) and checks it is empty;
//  2. creates the roles (prepare.mjs's roles.sql) in one transaction;
//  3. stops the UAT application services, so nothing writes;
//  4. takes the final backup of the old database (backup-uat.sh) and verifies it;
//  5. restores it into uat-postgres with --exit-on-error, then drops the roles that do not survive (D2a);
//  6. compares every table's row count and every migration ledger between the two databases;
//  7. swaps the env files: <file> → <file>.prev and <file>.next → <file>.
// After step 7 the owner deploys the new release with the deploy tool, which starts everything on uat-postgres.
// Before step 7, nothing the application reads has changed; --rollback restarts the stopped services as they were.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_ROLE, CARD, INVENTORY_SQL, SKIPPED_ROLES, compareInventories, dropSkippedRolesSql } from './lib.mjs';

const argv = process.argv.slice(2);
const mode = argv.includes('--run') ? 'run' : argv.includes('--rollback') ? 'rollback' : 'preflight';
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
// --project, --compose-dir and --backup-script exist for the rehearsal only; the defaults are UAT's.
const PROJECT = option('--project', 'gigalibs-configuration-local');
const NEW = `${PROJECT}-uat-postgres-1`;
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const COMPOSE_DIR = option('--compose-dir', join(ROOT, 'infra/compose'));
const OUT = join(COMPOSE_DIR, 'backups/wi-oi-120am');
const ENV_FILES = ['.env', '.env.modules', '.env.workforce', '.env.geospatial', '.env.module.host',
  '.env.module.product-catalogue', '.env.module.universal-inventory', '.env.module.universal-procurement',
  '.env.module.universal-orders', '.env.module.financial-operations'];
// The application services, stopped in this order so that nothing writes during the copy. Redis holds no database data.
const APP_SERVICES = ['web', 'kernel-worker', 'api', 'workforce-api', 'cmms-api', 'geospatial-api', 'connector-hub-api', 'analytics-api', 'module-host'];
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const log = (message) => console.log(`${new Date().toISOString().slice(11, 19)}Z ${message}`);
const fail = (message, code = 1) => {
  console.error(`STOPPED: ${message}`);
  process.exit(code);
};
const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { cwd: COMPOSE_DIR, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.status !== 0) fail(`${cmd} ${args.slice(0, 3).join(' ')} … failed: ${String(result.stderr || '').trim().split('\n').slice(-2).join(' / ')}`);
  return result.stdout ?? '';
};
const psql = (container, sql, { database = 'gigalibs', readOnly = false, single = false } = {}) => run('docker', [
  'exec', '-i', ...(readOnly ? ['-e', 'PGOPTIONS=-c default_transaction_read_only=on'] : []), container,
  'psql', '-X', '-q', '-U', BOOTSTRAP_ROLE, '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', ...(single ? ['--single-transaction'] : []), '-f', '-',
], { input: sql });
const readEnv = (key) => readFileSync(join(COMPOSE_DIR, '.env'), 'utf8').split('\n').find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);
const containerState = (name) => {
  const r = spawnSync('docker', ['inspect', name, '--format', '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'absent';
};
const COMPOSE_DB = ['compose', '--project-name', PROJECT, '--env-file', '.env', '--env-file', '.env.database', '-f', 'compose.database.yaml'];

// ---------------------------------------------------------------------------------------------------- preflight ---
function preflight() {
  const problems = [];
  const prepared = existsSync(join(OUT, 'prepare.json')) ? JSON.parse(readFileSync(join(OUT, 'prepare.json'), 'utf8')) : null;
  if (!prepared || prepared.card !== CARD) problems.push('prepare.mjs has not been run (backups/wi-oi-120am/prepare.json)');
  for (const [file, digest] of Object.entries(prepared?.files ?? {})) {
    const path = join(COMPOSE_DIR, file);
    if (!existsSync(path)) problems.push(`${file} is missing`);
    else if (sha256(readFileSync(path, 'utf8')) !== digest) problems.push(`${file} changed since prepare.mjs`);
  }
  if (!existsSync(join(COMPOSE_DIR, 'compose.database.yaml'))) problems.push('compose.database.yaml is missing');
  for (const file of ENV_FILES) if (existsSync(join(COMPOSE_DIR, `${file}.prev`))) problems.push(`${file}.prev exists: a cutover already swapped the env files`);
  const old = readEnv('CONTROL_POSTGRES_CONTAINER');
  if (old === NEW) problems.push('.env already names the new database');
  if (!old || !containerState(old).startsWith('running')) problems.push(`the old database container ${old} is not running`);
  const newState = containerState(NEW);
  if (newState !== 'absent') {
    const tables = spawnSync('docker', ['exec', NEW, 'psql', '-X', '-U', BOOTSTRAP_ROLE, '-d', 'gigalibs', '-At', '-c',
      "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"], { encoding: 'utf8' });
    if (tables.status === 0 && tables.stdout.trim() !== '0') problems.push(`${NEW} already holds ${tables.stdout.trim()} tables`);
  }
  for (const name of APP_SERVICES) if (containerState(`${PROJECT}-${name}-1`) === 'absent') problems.push(`${name} is not deployed`);
  const backupScript = option('--backup-script', join(ROOT, '.pi/handoff/proof-scripts/backup-uat.sh'));
  if (!existsSync(backupScript)) problems.push('backup-uat.sh is missing');
  return { problems, prepared, old, newState, backupScript };
}

// -------------------------------------------------------------------------------------------------------- swap ---
function swapEnvFiles(direction) {
  for (const file of ENV_FILES) {
    const active = join(COMPOSE_DIR, file);
    if (direction === 'forward') {
      renameSync(active, `${active}.prev`);
      renameSync(`${active}.next`, active);
    } else {
      renameSync(active, `${active}.next`);
      renameSync(`${active}.prev`, active);
    }
    chmodSync(active, 0o600);
  }
}

// --------------------------------------------------------------------------------------------------------- main ---
const pre = preflight();
log(`${CARD} ${mode}. Old database: ${pre.old}; new: ${NEW} (${pre.newState}).`);

if (mode === 'rollback') {
  const swapped = existsSync(join(COMPOSE_DIR, '.env.prev'));
  const newLabel = spawnSync('docker', ['inspect', `${PROJECT}-web-1`, '--format', '{{.Created}}'], { encoding: 'utf8' }).stdout.trim();
  if (swapped) {
    swapEnvFiles('back');
    log('env files restored (the .next files are kept)');
  }
  for (const name of [...APP_SERVICES].reverse()) {
    const state = containerState(`${PROJECT}-${name}-1`);
    if (state.startsWith('exited')) run('docker', ['start', `${PROJECT}-${name}-1`]);
  }
  log(`application services started with the configuration they had before the cutover (web created ${newLabel}).`);
  log('If the new release was already deployed, this is not enough: redeploy the previous release with the deploy tool.');
  log(`Before another attempt: docker rm -f ${NEW} && docker volume rm ${process.env.UAT_DATABASE_VOLUME ?? 'gigalibs-uat-database'} (the new database only; the old one is untouched).`);
  process.exit(0);
}

if (pre.problems.length) fail(`preflight: ${pre.problems.join('; ')}`);
log('preflight passed: prepared files intact, old database running, new database absent or empty, env files not swapped.');
if (mode === 'preflight') process.exit(0);

// 1. The new database.
run('docker', [...COMPOSE_DB, 'up', '-d', '--no-deps', '--pull', 'never', 'uat-postgres']);
for (let i = 0; i < 60 && !containerState(NEW).includes('healthy'); i += 1) spawnSync('sleep', ['2']);
if (!containerState(NEW).startsWith('running healthy')) fail(`${NEW} did not become healthy`);
const empty = psql(NEW, "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');").trim();
if (empty !== '0') fail(`${NEW} is not empty (${empty} tables)`);
log(`1. ${NEW} is running, healthy and empty.`);

// 2. Roles.
psql(NEW, readFileSync(join(OUT, 'roles.sql'), 'utf8'), { database: 'postgres', single: true });
log(`2. roles created: ${psql(NEW, "SELECT count(*) FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%';", { readOnly: true }).trim()}.`);

// 3. Writes stop.
for (const name of APP_SERVICES) run('docker', ['stop', '--time', '30', `${PROJECT}-${name}-1`]);
log(`3. stopped: ${APP_SERVICES.join(', ')}.`);

// 4. Final backup of the old database.
const backupOut = run('bash', [pre.backupScript]);
const backup = backupOut.match(/backup (gigalibs_backup_\d{8}_\d{6}Z) in place/)?.[1];
if (!backup) fail('the final backup did not report its name; run --rollback');
log(`4. final backup ${backup} taken and verified.`);

// 5. Restore.
const dump = readFileSync(join(COMPOSE_DIR, 'backups', `${backup}.dump`));
run('docker', ['exec', '-i', NEW, 'pg_restore', '-U', BOOTSTRAP_ROLE, '-d', 'gigalibs', '--exit-on-error'], { input: dump });
log('5. restored into the new database with no error.');
psql(NEW, dropSkippedRolesSql(), { single: true });
log(`5b. removed the roles that do not survive (owner decision D2a): ${SKIPPED_ROLES.join(', ')}.`);

// 6. Compare.
const oldInventory = psql(pre.old, INVENTORY_SQL, { readOnly: true });
const newInventory = psql(NEW, INVENTORY_SQL, { readOnly: true });
const { differences, tables, ledgers } = compareInventories(oldInventory, newInventory);
if (differences.length) fail(`the databases differ (${differences.length}): ${differences.slice(0, 5).join('; ')}. Run --rollback.`);
log(`6. ${tables} tables have equal row counts and ${ledgers} migration ledgers are identical.`);

// 7. Swap.
swapEnvFiles('forward');
log('7. env files now point at uat-postgres (the previous ones are kept as <file>.prev).');
log('NEXT: deploy the new release with the deploy tool (check, then deploy). Until then UAT stays down; --rollback restores it.');
