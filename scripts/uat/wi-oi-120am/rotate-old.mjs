#!/usr/bin/env node
// WI-OI-120am, card condition C6 (owner-run, after the cutover): every login role of the old database, now for
// development only, gets a new password. The old superuser password is in git history; the old service passwords are in
// the .prev env files. After this, neither opens anything.
//
//   node scripts/uat/wi-oi-120am/rotate-old.mjs            # shows what it would rotate; changes nothing
//   node scripts/uat/wi-oi-120am/rotate-old.mjs --apply    # rotates, in one transaction
//
// The new passwords go only into infra/compose/backups/wi-oi-120am/dev-database.env (mode 600, git-ignored), for the
// owner's local development .env files. Nothing secret is printed. Refuses while any UAT container still uses this database.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_ROLE, CARD, rotateSql } from './lib.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const OLD = option('--container', 'gigalibs-postgres');
const UAT_PROJECT = 'gigalibs-configuration-local';
const OUT = join(fileURLToPath(new URL('../../../infra/compose/', import.meta.url)), 'backups', 'wi-oi-120am');
const CLEAN_ENV = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'USER', 'LOGNAME', 'DOCKER_CONFIG']
  .filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]).concat([['LC_ALL', 'C']]));
const fail = (message) => {
  console.error(`STOPPED: ${message}`);
  process.exit(1);
};
const docker = (args, input) => {
  const r = spawnSync('docker', args, { encoding: 'utf8', env: CLEAN_ENV, input, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) fail(`docker ${args.slice(0, 2).join(' ')} failed: ${String(r.stderr || '').trim().split('\n').pop()}`);
  return r.stdout.trim();
};
const psql = (sql, readOnly) => docker(['exec', '-i', ...(readOnly ? ['-e', 'PGOPTIONS=-c default_transaction_read_only=on'] : []), OLD,
  'psql', '-X', '-q', '-U', BOOTSTRAP_ROLE, '-d', 'gigalibs', '-At', '-v', 'ON_ERROR_STOP=1', ...(readOnly ? [] : ['--single-transaction']), '-f', '-'], sql);

// UAT must no longer use this database: no UAT container may name it, and the new database must be running.
const uat = docker(['ps', '--filter', `label=com.docker.compose.project=${UAT_PROJECT}`, '--format', '{{.Names}}']).split('\n').filter(Boolean);
if (!uat.includes(`${UAT_PROJECT}-uat-postgres-1`)) fail('uat-postgres is not running: the cutover has not happened');
for (const name of uat) {
  const env = docker(['inspect', name, '--format', '{{range .Config.Env}}{{println .}}{{end}}']);
  if (/DATABASE_URL=\S*@host\.docker\.internal:5440\//.test(env) || /CONTROL_POSTGRES_CONTAINER=gigalibs-postgres$/m.test(env)) {
    fail(`${name} still uses the old database`);
  }
}

const loginRoles = psql(`SELECT rolname FROM pg_roles WHERE rolcanlogin ORDER BY rolname;`, true).split('\n').filter(Boolean);
console.log(`${CARD} C6: ${loginRoles.length} login roles on ${OLD}: ${loginRoles.join(', ')}`);
if (!argv.includes('--apply')) {
  console.log('Nothing changed. Run again with --apply to rotate them.');
  process.exit(0);
}

const passwords = Object.fromEntries(loginRoles.map((name) => [name, randomBytes(24).toString('hex')]));
psql(rotateSql(loginRoles, passwords), false);
mkdirSync(OUT, { recursive: true, mode: 0o700 });
const file = join(OUT, 'dev-database.env');
const lines = [
  `# ${CARD} C6 (${new Date().toISOString()}): the development database's new passwords. Copy what you need into your`,
  '# local .env files, then delete this file.',
  `CONTROL_DB_PASSWORD=${passwords[BOOTSTRAP_ROLE]}`,
  `DATABASE_URL=postgresql://${BOOTSTRAP_ROLE}:${passwords[BOOTSTRAP_ROLE]}@localhost:5440/gigalibs`,
  ...loginRoles.filter((n) => n !== BOOTSTRAP_ROLE).map((n) => `${n.toUpperCase()}_PASSWORD=${passwords[n]}`),
];
writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
chmodSync(file, 0o600);
console.log(`ROTATED: ${loginRoles.length} login roles have new passwords; they are in ${file} (mode 600), not printed.`);
console.log('Next: copy CONTROL_DB_PASSWORD and DATABASE_URL into your local .env and apps/playground-api/.env, then delete that file.');
