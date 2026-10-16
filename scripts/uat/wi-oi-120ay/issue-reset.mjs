#!/usr/bin/env node
// WI-OI-120ay: the owner-run assisted reset of a platform owner login on UAT.
//
//   check (default, read-only):
//     node scripts/uat/wi-oi-120ay/issue-reset.mjs --container <postgres container> --email <platform owner login>
//   issue the one-time link:
//     node scripts/uat/wi-oi-120ay/issue-reset.mjs --container <postgres container> --email <platform owner login> \
//       --apply --origin <web origin> --backup <gigalibs_backup_YYYYMMDD_HHMMSSZ> [--backups-dir <dir>]
//   after the reset (read-only): the same as check, with --verify.
//
// It does what the product's `issuePasswordReset` does, which needs a platform owner signed in: it closes the login's
// open reset credentials, stores the digest of a new one-time token for 30 minutes, and audits it, in one guarded
// transaction. The link is printed once, here only. The owner then chooses the password on the product's reset page,
// which checks it, hashes it, revokes the login's sessions and audits the reset. No password passes through this script.
// Exit codes: 0 done, 1 refused before any change, 3 psql failed (nothing written), 4 the read-back differs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VALID_MINUTES,
  checkedEmail,
  issueSql,
  issuedSql,
  newId,
  newToken,
  resetLink,
  targetSql,
  usedSql,
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

const container = option('--container');
if (!container) refuse('pass --container <the UAT postgres container>');
const email = checkedEmail(option('--email'));
if (!email) refuse('pass --email <the platform owner login>');
const psql = (sql, readOnly = true) =>
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
      ...(readOnly ? [] : ['--single-transaction']),
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
  );
const lines = (text) =>
  text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'));
/** Prints check|expected|found rows and says whether every one holds. */
const holds = (sql) => {
  let all = true;
  for (const [check, expected, found] of lines(psql(sql))) {
    const pass = Number(expected) === Number(found);
    all &&= pass;
    console.log(`${pass ? 'OK  ' : 'DIFF'} ${check}: ${found} (expected ${expected})`);
  }
  return all;
};

let target;
try {
  target = lines(psql(targetSql(email)));
} catch (error) {
  refuse(
    `cannot read the database in ${container}: ${String(error.stderr || error.message)
      .trim()
      .split('\n')
      .pop()}`,
  );
}
if (target.length !== 1) refuse(`${email} is not one active platform owner on this database`);
const [[, openCredentials, liveSessions]] = target;
console.log(
  `Login ${email}: active platform owner; open reset credentials ${openCredentials}; live sessions ${liveSessions}.`,
);

if (mode === 'verify') {
  const done = holds(usedSql(email));
  console.log(
    done
      ? 'VERIFIED: the owner reset the password through the product.'
      : 'NOT YET: the link has not been used.',
  );
  process.exit(done ? 0 : 4);
}
if (mode === 'check') {
  console.log('CHECK PASSED: nothing changed (read-only).');
  process.exit(0);
}

const origin = option('--origin');
if (!origin || !/^https?:\/\/[^/]+$/.test(origin))
  refuse('pass --origin <the UAT web origin>, for example http://127.0.0.1:5180');

// A fresh, verified, restorable backup first.
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
for (const table of ['users', 'password_reset_credentials', 'audit_logs', 'sessions']) {
  if (!listing.includes(`TABLE DATA public ${table} `))
    refuse(`backup ${backup} does not list the data of ${table}`);
}
console.log(`Backup ${backup} verified (checksum, metadata, restorable listing).`);

const { token, digest } = newToken();
const credentialId = newId();
try {
  psql(issueSql({ email, digest, credentialId, auditId: newId() }), false);
} catch (error) {
  console.error(
    `psql failed, nothing written: ${String(error.stderr || error.message)
      .trim()
      .split('\n')
      .slice(-2)
      .join(' / ')}`,
  );
  process.exit(3);
}
if (!holds(issuedSql({ email, credentialId }))) {
  console.error('WRITTEN, BUT the read-back differs: report this output. The link is not shown.');
  process.exit(4);
}
console.log(`
ISSUED. Open this link once, within ${VALID_MINUTES} minutes, and choose the new password there.
Do not paste it anywhere: it lets whoever opens it set this login's password.

  ${resetLink(origin, token)}
`);
process.exit(0);
