#!/usr/bin/env node
// WI-OI-120al: the owner-run change.
//
//   check (default, read-only):  node scripts/uat/wi-oi-120al/apply.mjs --plan <plan.json>
//   verify the target (read-only): node scripts/uat/wi-oi-120al/apply.mjs --plan <plan.json> --verify
//   apply:  node scripts/uat/wi-oi-120al/apply.mjs --plan <plan.json> --apply --expect-plan-sha256 <sha256> \
//             --container gigalibs-postgres --backup <gigalibs_backup_YYYYMMDD_HHMMSSZ> --backups-dir <dir>
//   revert: the same with --revert instead of --apply; it puts every planned row back to its `before` value, guarded
//           the same way (the plan holds every `before` value), so undoing does not need a full restore.
//
// --apply and --revert need the reviewed plan's sha256, an explicit container, and a verified backup taken after the
// plan snapshot and less than an hour ago. One transaction; it changes nothing if any planned row moved.
// Exit codes: 0 done, 1 refused before touching the database, 2 data moved since the plan (nothing changed),
// 3 psql failed (the state is reported), 4 the read-back differs.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderApplySql, renderCheckSql, validatePlan } from './lib.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const refuse = (message, code = 1) => {
  console.error(`REFUSED: ${message}`);
  process.exit(code);
};
const mode = argv.includes('--apply') ? 'apply' : argv.includes('--revert') ? 'revert' : argv.includes('--verify') ? 'verify' : 'check';
if (argv.includes('--apply') && argv.includes('--revert')) refuse('choose --apply or --revert, not both');

const planFile = option('--plan');
if (!planFile || !existsSync(planFile)) refuse('pass --plan <plan.json> (made by reconcile.mjs)');
const planText = readFileSync(planFile, 'utf8');
const planSha256 = createHash('sha256').update(planText).digest('hex');
const plan = JSON.parse(planText);
const problems = validatePlan(plan);
if (problems.length) refuse(`the plan breaks the reviewed rules: ${problems.slice(0, 5).join('; ')}`);

const writes = mode === 'apply' || mode === 'revert';
if (writes && !argv.includes('--container')) refuse('--apply and --revert need an explicit --container');
// --container is also for the rehearsal on an isolated copy; the owner's run names the UAT database container.
const POSTGRES_CONTAINER = option('--container', 'gigalibs-postgres');

const psql = (sql, readOnly) =>
  execFileSync('docker', [
    'exec', '-i', ...(readOnly ? ['-e', 'PGOPTIONS=-c default_transaction_read_only=on'] : []), POSTGRES_CONTAINER,
    'psql', '-X', '-U', 'gigalibs', '-d', 'gigalibs', '-At', '-F', '|', '-v', 'ON_ERROR_STOP=1',
    ...(readOnly ? [] : ['--single-transaction']), '-f', '-',
  ], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });

const swap = (p) => ({
  ...p,
  entitlements: p.entitlements.map((c) => ({ ...c, before: c.after, after: c.before })),
  members: p.members.map((c) => ({ ...c, before: c.after, after: c.before })),
  tenants: p.tenants.map((c) => ({ ...c, before: c.after, after: c.before })),
});
// `planned` holds the original values, `target` the changed ones; a revert runs the plan the other way round.
const forward = mode === 'revert' ? swap(plan) : plan;
const reverse = swap(forward);

/** How many planned rows hold the given side's values: true when every one does. Read-only. */
function holds(label, side) {
  let all = true;
  for (const line of psql(renderCheckSql(side), true).trim().split('\n')) {
    const [section, planned, matching] = line.split('|');
    const pass = Number(planned) === Number(matching);
    all &&= pass;
    console.log(`${pass ? 'OK  ' : 'DIFF'} ${label} ${section}: ${matching} of ${planned} rows`);
  }
  return all;
}

let target;
try {
  target = psql(`SELECT current_database(), inet_server_port(), (SELECT count(*) FROM public.tenants), now();`, true).trim();
} catch (error) {
  refuse(`cannot reach the database in container ${POSTGRES_CONTAINER}: ${String(error.stderr || error.message).trim().split('\n').pop()}`);
}
console.log(`Container ${POSTGRES_CONTAINER}; database|port|workspaces|time: ${target}`);
console.log(`Plan ${planFile}\n  sha256 ${planSha256}; live snapshot ${plan.liveSnapshotAt}; mode ${mode}`);
console.log(JSON.stringify(plan.summary));

if (mode === 'verify') {
  const done = holds('target', reverse);
  console.log(done ? 'VERIFIED: every planned row holds its target value.' : 'NOT AT TARGET: see the counts above.');
  process.exit(done ? 0 : 4);
}
const ready = holds(mode === 'revert' ? 'applied' : 'planned', forward);
if (mode === 'check') {
  console.log(ready ? 'CHECK PASSED: nothing changed (read-only).' : 'CHECK FAILED: the data moved since the plan; rebuild it and have it reviewed again.');
  process.exit(ready ? 0 : 2);
}

if (option('--expect-plan-sha256') !== planSha256) refuse(`--expect-plan-sha256 must be the reviewed plan's sha256 (${planSha256} for this file)`);
if (!ready) refuse('the data moved since the plan; nothing was changed. Rebuild the plan and have it reviewed again.', 2);

const backup = option('--backup');
const backupsDir = resolve(option('--backups-dir', 'infra/compose/backups'));
const named = backup?.match(/^gigalibs_backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})Z$/);
if (!named) refuse('pass --backup gigalibs_backup_YYYYMMDD_HHMMSSZ, taken just before this run');
const dump = `${backupsDir}/${backup}.dump`;
for (const file of [dump, `${dump}.sha256`, `${backupsDir}/${backup}.json`]) if (!existsSync(file)) refuse(`${file} is missing`);
const got = createHash('sha256').update(readFileSync(dump)).digest('hex');
if (readFileSync(`${dump}.sha256`, 'utf8').trim().split(/\s+/)[0] !== got) refuse(`backup checksum mismatch for ${backup}`);
const meta = JSON.parse(readFileSync(`${backupsDir}/${backup}.json`, 'utf8'));
// Both backup scripts' metadata: one names the file, the other its timestamp.
const namesIt = meta.backupFile === `${backup}.dump` || `gigalibs_backup_${meta.timestamp}` === backup;
if (!namesIt || meta.sha256 !== got || meta.database !== 'gigalibs') refuse(`backup metadata does not match ${backup}`);
const takenAt = Date.UTC(+named[1], +named[2] - 1, +named[3], +named[4], +named[5], +named[6]);
if (!(takenAt >= Date.parse(plan.liveSnapshotAt))) refuse('the backup must be taken after the plan snapshot');
if (!(Date.now() - takenAt < 60 * 60 * 1000)) refuse('the backup must be less than an hour old; take a new one');
const listing = execFileSync('docker', [
  'run', '--rm', '--network', 'none', '-v', `${backupsDir}:/b:ro`, 'postgres:16-alpine', 'pg_restore', '--list', `/b/${backup}.dump`,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
for (const table of ['tenant_members', 'tenant_module_entitlements', 'tenants']) {
  if (!listing.includes(`TABLE DATA public ${table} `)) refuse(`backup ${backup} does not list the data of ${table}`);
}
console.log(`Backup ${backup} verified (checksum, metadata, restorable listing). Writing in one transaction…`);

try {
  psql(renderApplySql(forward, { planSha256, mode }), false);
} catch (error) {
  console.error(`psql failed: ${String(error.stderr || error.message).trim().split('\n').slice(-3).join(' / ')}`);
  const unchanged = holds(mode === 'revert' ? 'applied' : 'planned', forward);
  const reached = !unchanged && holds('target', reverse);
  console.error(unchanged ? 'STATE: unchanged (the transaction rolled back).' : reached ? 'STATE: at target despite the error; report this output.' : 'STATE: neither; report this output now.');
  process.exit(3);
}
const done = holds('target', reverse);
console.log(done ? `${mode === 'revert' ? 'REVERTED' : 'APPLIED'}: every planned row holds its target value (plan ${planSha256}).` : 'WRITTEN, BUT the read-back differs: report this output.');
process.exit(done ? 0 : 4);
