#!/usr/bin/env node
// WI-OI-120am, step 2 (owner-run): move UAT onto its own database. Run it from the release worktree.
//
//   node scripts/uat/wi-oi-120am/cutover.mjs              # preflight only; changes nothing
//   node scripts/uat/wi-oi-120am/cutover.mjs --run        # the cutover (UAT is down for a few minutes)
//   node scripts/uat/wi-oi-120am/cutover.mjs --rollback   # only before the new release is deployed
//
// --run, in order, stopping at the first failure:
//  1. starts uat-postgres (compose.database.yaml) and checks it is empty;
//  2. creates the roles (prepare.mjs's roles.sql) in one transaction;
//  3. stops the UAT application services and proves nothing else is connected to the old database;
//  4. takes the final backup of the old database (backup-uat.sh) and verifies it;
//  5. restores it into uat-postgres with --exit-on-error, then drops the roles that do not survive (D2a);
//  6. compares every table's row count, every migration ledger and the catalog between the two databases, and proves
//     the old database had no client and no write during the copy;
//  7. swaps the env files (<file> → <file>.prev, <file>.next → <file>), records cutover.json, deletes roles.sql.
// After step 7 the owner deploys the new release with the deploy tool, which starts everything on uat-postgres.
// --rollback works only while every service still runs the pre-cutover release; after the deploy has recreated any of
// them, it refuses and prints the way forward.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_ROLE, CARD, INVENTORY_SQL, SKIPPED_ROLES, compareInventories, dropSkippedRolesSql } from './lib.mjs';

const argv = process.argv.slice(2);
const mode = argv.includes('--run') ? 'run' : argv.includes('--rollback') ? 'rollback' : 'preflight';
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
// --project, --compose-dir, --backup-script, --compose-override and --volume exist for the rehearsal only.
const PROJECT = option('--project', 'gigalibs-configuration-local');
const NEW = `${PROJECT}-uat-postgres-1`;
const VOLUME = option('--volume', 'gigalibs-uat-database');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const COMPOSE_DIR = option('--compose-dir', join(ROOT, 'infra/compose'));
const OUT = join(COMPOSE_DIR, 'backups/wi-oi-120am');
const OVERRIDE = option('--compose-override');
const ENV_FILES = ['.env', '.env.modules', '.env.workforce', '.env.geospatial', '.env.module.host',
  '.env.module.product-catalogue', '.env.module.universal-inventory', '.env.module.universal-procurement',
  '.env.module.universal-orders', '.env.module.financial-operations'];
// The application services, stopped in this order so that nothing writes during the copy. Redis holds no database data.
const APP_SERVICES = ['web', 'kernel-worker', 'api', 'workforce-api', 'cmms-api', 'geospatial-api', 'connector-hub-api', 'analytics-api', 'module-host'];
// Security review M2: compose interpolation must come from the reviewed env files only, never from the owner's shell.
const SHELL_OVERRIDES = ['UAT_DATABASE_VOLUME', 'UAT_DATABASE_SUPERUSER_PASSWORD', 'RELEASE_ID', 'SOURCE_REVISION',
  'SOURCE_STATE_SHA256', 'PROFILE_KEY', 'EXECUTION_CLASS', 'COMPOSE_PROJECT_NAME', 'COMPOSE_FILE', 'DOCKER_HOST', 'DOCKER_CONTEXT'];
const CLEAN_ENV = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'USER', 'LOGNAME', 'DOCKER_CONFIG']
  .filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]).concat([['LC_ALL', 'C']]));
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const log = (message) => console.log(`${new Date().toISOString().slice(11, 19)}Z ${message}`);
const fail = (message, code = 1) => {
  console.error(`STOPPED: ${message}`);
  process.exit(code);
};
const exec = (cmd, args, options = {}) =>
  spawnSync(cmd, args, { cwd: COMPOSE_DIR, encoding: 'utf8', env: CLEAN_ENV, maxBuffer: 256 * 1024 * 1024, ...options });
const run = (cmd, args, options = {}) => {
  const result = exec(cmd, args, options);
  if (result.status !== 0) fail(`${cmd} ${args.slice(0, 3).join(' ')} … failed: ${String(result.stderr || '').trim().split('\n').slice(-2).join(' / ')}`);
  return result.stdout ?? '';
};
const psql = (container, sql, { database = 'gigalibs', readOnly = false, single = false } = {}) => run('docker', [
  'exec', '-i', ...(readOnly ? ['-e', 'PGOPTIONS=-c default_transaction_read_only=on'] : []), container,
  'psql', '-X', '-q', '-U', BOOTSTRAP_ROLE, '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', ...(single ? ['--single-transaction'] : []), '-f', '-',
], { input: sql });
const readEnv = (key) => readFileSync(join(COMPOSE_DIR, '.env'), 'utf8').split('\n').find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);
const inspect = (name, format) => {
  const r = exec('docker', ['inspect', name, '--format', format]);
  return r.status === 0 ? r.stdout.trim() : null;
};
const containerState = (name) => inspect(name, '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}') ?? 'absent';
const releaseOf = (service) => inspect(`${PROJECT}-${service}-1`, '{{index .Config.Labels "com.gigalibs.release-id"}}');
const COMPOSE_DB = ['compose', '--project-name', PROJECT, '--env-file', '.env', '--env-file', '.env.database',
  '-f', 'compose.database.yaml', ...(OVERRIDE ? ['-f', OVERRIDE] : [])];

// Security review H1: client sessions on the old database other than this check's own, and its cumulative row writes.
const OTHER_CLIENTS_SQL = `SELECT count(*) FROM pg_stat_activity WHERE datname = 'gigalibs' AND backend_type = 'client backend' AND pid <> pg_backend_pid();`;
const WRITES_SQL = `SELECT coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) FROM pg_stat_user_tables;`;
const otherClients = (container) => Number(psql(container, OTHER_CLIENTS_SQL, { readOnly: true }).trim());
const writes = (container) => psql(container, WRITES_SQL, { readOnly: true }).trim();

// ---------------------------------------------------------------------------------------------------- preflight ---
function preflight() {
  const problems = [];
  for (const key of SHELL_OVERRIDES) if (process.env[key] !== undefined) problems.push(`unset ${key} in this shell first`);
  const prepared = existsSync(join(OUT, 'prepare.json')) ? JSON.parse(readFileSync(join(OUT, 'prepare.json'), 'utf8')) : null;
  if (!prepared || prepared.card !== CARD) problems.push('prepare.mjs has not been run (backups/wi-oi-120am/prepare.json)');
  for (const [file, digest] of Object.entries(prepared?.files ?? {})) {
    const path = join(COMPOSE_DIR, file);
    if (!existsSync(path)) problems.push(`${file} is missing`);
    else if (sha256(readFileSync(path, 'utf8')) !== digest) problems.push(`${file} changed since prepare.mjs`);
  }
  // Security review M1: a change to a source env file after prepare would be silently undone by the swap.
  for (const [file, digest] of Object.entries(prepared?.sources ?? {})) {
    const path = join(COMPOSE_DIR, file);
    if (!existsSync(path) || sha256(readFileSync(path, 'utf8')) !== digest) problems.push(`${file} changed since prepare.mjs; run prepare.mjs --force again`);
  }
  if (!existsSync(join(COMPOSE_DIR, 'compose.database.yaml'))) problems.push('compose.database.yaml is missing');
  for (const file of ENV_FILES) {
    if (existsSync(join(COMPOSE_DIR, `${file}.prev`))) problems.push(`${file}.prev exists: a cutover already swapped the env files`);
    if (!existsSync(join(COMPOSE_DIR, `${file}.next`))) problems.push(`${file}.next is missing`);
  }
  const old = readEnv('CONTROL_POSTGRES_CONTAINER');
  if (old === NEW) problems.push('.env already names the new database');
  if (!old || !containerState(old).startsWith('running')) problems.push(`the old database container ${old} is not running`);
  const newState = containerState(NEW);
  // Security review L6: a leftover volume would skip initdb and keep someone else's roles.
  if (newState === 'absent' && exec('docker', ['volume', 'inspect', VOLUME]).status === 0) {
    problems.push(`the volume ${VOLUME} already exists without its container; remove it first (it holds no UAT data yet)`);
  }
  if (newState !== 'absent') {
    const tables = exec('docker', ['exec', NEW, 'psql', '-X', '-U', BOOTSTRAP_ROLE, '-d', 'gigalibs', '-At', '-c',
      "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"]);
    if (tables.status === 0 && tables.stdout.trim() !== '0') problems.push(`${NEW} already holds ${tables.stdout.trim()} tables`);
  }
  for (const name of APP_SERVICES) {
    if (containerState(`${PROJECT}-${name}-1`) === 'absent') problems.push(`${name} is not deployed`);
    else if (prepared && releaseOf(name) !== prepared.preCutoverReleaseId) problems.push(`${name} runs another release than at prepare.mjs`);
  }
  const backupScript = option('--backup-script', join(ROOT, '.pi/handoff/proof-scripts/backup-uat.sh'));
  if (!existsSync(backupScript)) problems.push('backup-uat.sh is missing');
  return { problems, prepared, old, newState, backupScript };
}

// --------------------------------------------------------------------------------------------------------- swap ---
// Security review L5: all ten files move, or none do.
function swapEnvFiles(direction) {
  const steps = ENV_FILES.flatMap((file) => {
    const active = join(COMPOSE_DIR, file);
    return direction === 'forward'
      ? [[active, `${active}.prev`], [`${active}.next`, active]]
      : [[active, `${active}.next`], [`${active}.prev`, active]];
  });
  const done = [];
  try {
    for (const [from, to] of steps) {
      if (!existsSync(from) || existsSync(to)) throw new Error(`cannot move ${from.split('/').pop()} to ${to.split('/').pop()}`);
      renameSync(from, to);
      done.push([from, to]);
    }
  } catch (error) {
    for (const [from, to] of done.reverse()) renameSync(to, from);
    fail(`env swap undone: ${error.message}`);
  }
  for (const file of ENV_FILES) chmodSync(join(COMPOSE_DIR, file), 0o600);
}

// --------------------------------------------------------------------------------------------------------- main ---
const pre = preflight();
log(`${CARD} ${mode}. Old database: ${pre.old}; new: ${NEW} (${pre.newState}).`);

if (mode === 'rollback') {
  // Security review H2: after the deploy has recreated a service, putting the env back would split UAT across two databases.
  const moved = APP_SERVICES.filter((name) => pre.prepared && releaseOf(name) !== pre.prepared.preCutoverReleaseId);
  if (moved.length) {
    fail(`refused: ${moved.join(', ')} already run the new release on uat-postgres. Do not put the env files back. Roll forward:
  fix the cause and run the deploy tool's --deploy again with the cutover's final backup; the old database and that
  backup stay untouched as the disaster copy.`);
  }
  if (existsSync(join(COMPOSE_DIR, '.env.prev'))) {
    swapEnvFiles('back');
    log('env files restored (the .next files are kept)');
  }
  for (const name of [...APP_SERVICES].reverse()) {
    if (containerState(`${PROJECT}-${name}-1`).startsWith('exited')) run('docker', ['start', `${PROJECT}-${name}-1`]);
  }
  log('application services started with the configuration they had before the cutover.');
  log(`Before another attempt: docker rm -f ${NEW} && docker volume rm ${VOLUME} (the new database only; the old one is untouched).`);
  process.exit(0);
}

if (pre.problems.length) fail(`preflight: ${pre.problems.join('; ')}`);
log('preflight passed: prepared files intact, source env files unchanged, old database running, new database absent, env files not swapped.');
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

// 3. Writes stop, and nothing else is connected.
for (const name of APP_SERVICES) run('docker', ['stop', '--time', '30', `${PROJECT}-${name}-1`]);
let clients = otherClients(pre.old);
for (let i = 0; i < 15 && clients > 0; i += 1) { spawnSync('sleep', ['2']); clients = otherClients(pre.old); }
if (clients > 0) fail(`${clients} other client(s) are still connected to the old database (a development server or bridge?). Stop them, then run --rollback or retry.`);
const writesBefore = writes(pre.old);
log(`3. stopped: ${APP_SERVICES.join(', ')}; no other client is connected to the old database.`);

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

// 6. Compare, and prove the old database stayed quiet.
const oldInventory = psql(pre.old, INVENTORY_SQL, { readOnly: true });
const newInventory = psql(NEW, INVENTORY_SQL, { readOnly: true });
const { differences, tables, ledgers, catalogChecks } = compareInventories(oldInventory, newInventory);
if (differences.length) fail(`the databases differ (${differences.length}): ${differences.slice(0, 5).join('; ')}. Run --rollback.`);
if (otherClients(pre.old) > 0 || writes(pre.old) !== writesBefore) fail('the old database was written to or connected to during the copy. Run --rollback, find the writer, retry.');
log(`6. ${tables} tables have equal row counts, ${ledgers} migration ledgers and ${catalogChecks} catalog checks are identical; the old database had no client and no write during the copy.`);

// 7. Swap, record, clean up.
swapEnvFiles('forward');
writeFileSync(join(OUT, 'cutover.json'), `${JSON.stringify({ card: CARD, completedAt: new Date().toISOString(), finalBackup: backup, tables, ledgers, catalogChecks, preCutoverReleaseId: pre.prepared.preCutoverReleaseId }, null, 2)}\n`, { mode: 0o600 });
unlinkSync(join(OUT, 'roles.sql'));
log('7. env files now point at uat-postgres (the previous ones are kept as <file>.prev, mode 600); cutover.json written; roles.sql deleted.');
log(`NEXT: deploy the new release with the deploy tool: --deploy --backup ${backup}. Until then UAT stays down; --rollback restores it.`);
