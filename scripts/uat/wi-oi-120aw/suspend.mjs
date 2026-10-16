#!/usr/bin/env node
// WI-OI-120aw: the owner-run suspension of the certification and test workspaces on UAT.
//
//   check (default, read-only):
//     node scripts/uat/wi-oi-120aw/suspend.mjs --container <postgres container>
//   apply (the owner's platform login; the password comes from GIGALIBS_PLATFORM_PASSWORD, never the command line):
//     node scripts/uat/wi-oi-120aw/suspend.mjs --container <postgres container> --apply --origin <web origin> \
//       --email <platform owner login> --backup <gigalibs_backup_YYYYMMDD_HHMMSSZ> [--sign-in-tenant <kept slug>]
//   verify (read-only): the same as check, with --verify.
//
// Suspensions go through the product's own route (PATCH /platform/tenants/:id/status), signed in as the owner: each is
// audited with its reason, revokes the workspace's sessions, and is undone with Reactivate. Only the approved plan
// (APPROVED_PLAN_SHA256) is accepted. A rerun skips workspaces already suspended. The dead letters of workspaces that
// do not exist are then deleted in one guarded transaction. Reads use a read-only database session.
// Exit codes: 0 done, 1 refused before any change, 2 the data moved since the plan (nothing more changed),
// 3 a request or psql failed part-way (the progress is reported; rerun to resume), 4 the read-back differs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_PLAN_SHA256,
  CookieJar,
  DEAD_LETTERS,
  classify,
  deadLetterCountSql,
  deadLetterDeleteSql,
  parseCsv,
  retryAfterSeconds,
  sessionTenantSql,
  statusSql,
  suspendReason,
  validatePlan,
  verifySql,
} from './lib.mjs';

const argv = process.argv.slice(2);
const option = (name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};
const refuse = (message, code = 1) => {
  console.error(`REFUSED: ${message}`);
  process.exit(code);
};
const mode = argv.includes('--apply') ? 'apply' : argv.includes('--verify') ? 'verify' : 'check';
// Leave room under the lowest request budget (60 a minute) for the page's own calls.
const PAUSE_MS = 1_100;

const planFile = resolve(dirname(fileURLToPath(import.meta.url)), 'plan-2026-10-15.csv');
const planText = readFileSync(planFile, 'utf8');
const planSha256 = createHash('sha256').update(planText).digest('hex');
if (planSha256 !== APPROVED_PLAN_SHA256)
  refuse(`the plan is not the approved one (sha256 ${planSha256})`);
const plan = parseCsv(planText);
const problems = validatePlan(plan);
if (problems.length)
  refuse(`the plan breaks the reviewed rules: ${problems.slice(0, 5).join('; ')}`);
const rows = plan.rows;

const container = option('--container');
if (!container) refuse('pass --container <the UAT postgres container>');
const psql = (sql, { readOnly = true, variables = {} } = {}) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      ...(readOnly ? ['-e', 'PGOPTIONS=-c default_transaction_read_only=on'] : []),
      container,
      'psql',
      '-X',
      '-U',
      'gigalibs',
      '-d',
      'gigalibs',
      '-At',
      '-F',
      '|',
      '-v',
      'ON_ERROR_STOP=1',
      ...Object.entries(variables).flatMap(([name, value]) => ['-v', `${name}=${value}`]),
      ...(readOnly ? [] : ['--single-transaction']),
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
  );
const lines = (text) =>
  text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'));

let target;
try {
  target = psql('SELECT current_database(), (SELECT count(*) FROM public.tenants), now();').trim();
} catch (error) {
  refuse(
    `cannot reach the database in ${container}: ${String(error.stderr || error.message)
      .trim()
      .split('\n')
      .pop()}`,
  );
}
console.log(`Container ${container}; database|workspaces|time: ${target}`);
console.log(`Plan ${planFile}\n  sha256 ${planSha256} (approved); mode ${mode}`);

const readState = () => {
  const live = new Map(
    lines(psql(statusSql(rows.map((row) => row.id)))).map(([id, status]) => [id, status]),
  );
  return classify(rows, live);
};
const deadLetters = () =>
  new Map(lines(psql(deadLetterCountSql())).map(([schema, count]) => [schema, Number(count)]));
const report = (state, letters) => {
  console.log(
    `Plan: KEEP ${state.keep.length}, SUSPEND ${rows.length - state.keep.length}: to suspend ${state.todo.length}, ` +
      `already suspended ${state.done.length}, moved ${state.moved.length}, missing ${state.missing.length}.`,
  );
  for (const row of state.moved)
    console.log(`  MOVED   ${row.slug}: planned ${row.status}, now ${row.live}`);
  for (const row of state.missing) console.log(`  MISSING ${row.slug}`);
  for (const row of state.keepMoved)
    console.log(`  KEPT, CHANGED ELSEWHERE ${row.slug}: planned ${row.status}, now ${row.live}`);
  for (const { schema, expected } of DEAD_LETTERS) {
    console.log(
      `Dead letters without a workspace in ${schema}: ${letters.get(schema)} (planned ${expected}, or 0 once deleted)`,
    );
  }
};
// The deletion is one transaction, so the dead letters are either all as planned or all gone.
const lettersDone = (letters) => DEAD_LETTERS.every(({ schema }) => letters.get(schema) === 0);
const lettersReady = (letters) =>
  lettersDone(letters) ||
  DEAD_LETTERS.every(({ schema, expected }) => letters.get(schema) === expected);

/** Prints the read-back and says whether every check holds. */
function verify() {
  let all = true;
  for (const [check, expected, found] of lines(psql(verifySql(rows, planSha256)))) {
    const pass = Number(expected) === Number(found);
    all &&= pass;
    console.log(`${pass ? 'OK  ' : 'DIFF'} ${check}: ${found} (expected ${expected})`);
  }
  return all;
}

const state = readState();
const letters = deadLetters();
report(state, letters);

if (mode === 'verify') {
  const done = verify();
  console.log(
    done
      ? 'VERIFIED: the suspension and the dead-letter clean-up are complete.'
      : 'NOT COMPLETE: see the counts above.',
  );
  process.exit(done ? 0 : 4);
}
const ready = state.moved.length === 0 && state.missing.length === 0 && lettersReady(letters);
if (mode === 'check') {
  console.log(
    ready
      ? 'CHECK PASSED: nothing changed (read-only).'
      : 'CHECK FAILED: the data moved since the plan; it needs the owner again.',
  );
  process.exit(ready ? 0 : 2);
}
if (!ready) refuse('the data moved since the plan; nothing was changed.', 2);

// --apply: a fresh, verified, restorable backup first.
const backup = option('--backup');
const backupsDir = resolve(option('--backups-dir') ?? 'infra/compose/backups');
const named = backup?.match(/^gigalibs_backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})Z$/);
if (!named) refuse('pass --backup gigalibs_backup_YYYYMMDD_HHMMSSZ, taken just before this run');
const dump = `${backupsDir}/${backup}.dump`;
for (const file of [dump, `${dump}.sha256`, `${backupsDir}/${backup}.json`])
  if (!existsSync(file)) refuse(`${file} is missing`);
const got = createHash('sha256').update(readFileSync(dump)).digest('hex');
if (readFileSync(`${dump}.sha256`, 'utf8').trim().split(/\s+/)[0] !== got)
  refuse(`backup checksum mismatch for ${backup}`);
const meta = JSON.parse(readFileSync(`${backupsDir}/${backup}.json`, 'utf8'));
if (meta.sha256 !== got || meta.database !== 'gigalibs')
  refuse(`backup metadata does not match ${backup}`);
const takenAt = Date.UTC(+named[1], +named[2] - 1, +named[3], +named[4], +named[5], +named[6]);
if (!(Date.now() - takenAt < 60 * 60 * 1000))
  refuse('the backup must be less than an hour old; take a new one');
const listing = execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--network',
    'none',
    '-v',
    `${backupsDir}:/b:ro`,
    'postgres:16-alpine',
    'pg_restore',
    '--list',
    `/b/${backup}.dump`,
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
for (const table of [
  'public tenants',
  'public sessions',
  'public audit_logs',
  ...DEAD_LETTERS.map(({ schema }) => `${schema} outbox_events`),
]) {
  if (!listing.includes(`TABLE DATA ${table} `))
    refuse(`backup ${backup} does not list the data of ${table}`);
}
console.log(`Backup ${backup} verified (checksum, metadata, restorable listing).`);

// Sign in as the owner, the way the browser does.
const origin = option('--origin');
if (!origin || !/^https?:\/\/[^/]+$/.test(origin))
  refuse('pass --origin <the UAT web origin>, for example http://127.0.0.1:5180');
const email = option('--email');
const password = process.env.GIGALIBS_PLATFORM_PASSWORD ?? '';
if (!email || !password)
  refuse(
    'pass --email and set GIGALIBS_PLATFORM_PASSWORD (read it with read -rs; never on the command line)',
  );
const jar = new CookieJar();
const call = async (path, { method = 'GET', body } = {}) => {
  const response = await fetch(new URL(path, origin), {
    method,
    headers: {
      Origin: origin,
      Accept: 'application/json',
      ...(jar.size ? { Cookie: jar.header() } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  jar.take(response.headers.getSetCookie());
  const payload = await response.json().catch(() => null);
  return { status: response.status, retryAfter: response.headers.get('retry-after'), payload };
};
const detail = (payload) =>
  String(
    payload?.detail ??
      payload?.message?.message ??
      payload?.message ??
      payload?.error ??
      'no detail',
  ).slice(0, 300);

const login = await call('/api/auth/login', { method: 'POST', body: { email, password } });
if (login.status !== 200) refuse(`sign-in answered ${login.status}: ${detail(login.payload)}`);
if (login.payload?.requiresMfa)
  refuse('this login asks for MFA, which the script does not handle; nothing was changed');
const kept = new Map(state.keep.map((row) => [row.slug, row.id]));
const signInTenant = option('--sign-in-tenant');
if (signInTenant && !kept.has(signInTenant))
  refuse(`--sign-in-tenant must be a kept workspace: ${[...kept.keys()].join(', ')}`);
if (signInTenant) {
  const selected = await call('/api/auth/select-tenant', {
    method: 'POST',
    body: { tenantId: kept.get(signInTenant) },
  });
  if (selected.status !== 200)
    refuse(`choosing ${signInTenant} answered ${selected.status}: ${detail(selected.payload)}`);
}
// Suspending the workspace this session belongs to would revoke the session part-way.
const sessionTenant = psql(sessionTenantSql(), { variables: { email } }).trim();
if (rows.some((row) => row.action === 'SUSPEND' && row.id === sessionTenant)) {
  refuse(
    `the session belongs to a workspace being suspended; pass --sign-in-tenant (${[...kept.keys()].join(', ')})`,
  );
}
const authority = await call('/api/control/platform/tenants');
if (authority.status !== 200)
  refuse(`the login has no platform authority (${authority.status}: ${detail(authority.payload)})`);
console.log(`Signed in with platform authority; session workspace ${sessionTenant || 'none'}.`);

const signOut = () => call('/api/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
let suspended = 0;
for (const row of state.todo) {
  let answer;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    answer = await call(`/api/control/platform/tenants/${encodeURIComponent(row.id)}/status`, {
      method: 'PATCH',
      body: { status: 'SUSPENDED', reason: suspendReason(row, planSha256) },
    });
    if (answer.status !== 429) break;
    const wait = retryAfterSeconds(answer.retryAfter);
    console.log(`  rate limited; waiting ${wait} s`);
    await new Promise((done) => setTimeout(done, wait * 1000));
  }
  if (answer.status !== 200 || answer.payload?.status !== 'SUSPENDED') {
    console.error(`FAILED at ${row.slug}: ${answer.status} ${detail(answer.payload)}`);
    console.error(
      `Suspended ${suspended} of ${state.todo.length} in this run; rerun the same command to resume.`,
    );
    await signOut();
    process.exit(3);
  }
  suspended += 1;
  if (suspended % 25 === 0 || suspended === state.todo.length)
    console.log(`  suspended ${suspended} of ${state.todo.length}`);
  await new Promise((done) => setTimeout(done, PAUSE_MS));
}
await signOut();

if (lettersDone(deadLetters())) console.log('Dead letters: already deleted.');
else {
  try {
    psql(deadLetterDeleteSql(), { readOnly: false });
  } catch (error) {
    console.error(
      `Dead letters: psql failed, nothing deleted: ${String(error.stderr || error.message)
        .trim()
        .split('\n')
        .slice(-2)
        .join(' / ')}`,
    );
    process.exit(3);
  }
  console.log(
    `Dead letters deleted: ${DEAD_LETTERS.map(({ schema, expected }) => `${schema} ${expected}`).join(', ')}.`,
  );
}

const done = verify();
console.log(
  done
    ? `APPLIED: ${suspended} suspended in this run; the read-back holds (plan ${planSha256}).`
    : 'WRITTEN, BUT the read-back differs: report this output.',
);
process.exit(done ? 0 : 4);
