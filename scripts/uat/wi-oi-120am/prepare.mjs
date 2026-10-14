#!/usr/bin/env node
// WI-OI-120am, step 1 (run by the session, before the cutover): prepare the new database's roles and the env files that
// point at it. Read-only towards every database. Writes, all mode 600, nothing printed but names and counts:
// - infra/compose/.env.database: the new superuser's password (compose.database.yaml reads it);
// - infra/compose/<env file>.next: each UAT env file with its database URLs moved to uat-postgres:5432 and new passwords;
// - infra/compose/backups/wi-oi-120am/roles.sql: the old cluster's roles, memberships and connect grants, new passwords;
// - infra/compose/backups/wi-oi-120am/prepare.json: what was written, with sha256s, and no secret.
//
//   node scripts/uat/wi-oi-120am/prepare.mjs [--old-container gigalibs-postgres] [--force]
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_ROLE, CARD, SKIPPED_ROLES, connectGrantees, databaseUrls, lossyRoleFeatures, rewriteEnv, rolesSql } from './lib.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : fallback;
};
const OLD = option('--old-container', 'gigalibs-postgres');
// --compose-dir and --project exist for the rehearsal only; the defaults are UAT's.
const PROJECT = option('--project', 'gigalibs-configuration-local');
const NEW_CONTAINER = `${PROJECT}-uat-postgres-1`;
const COMPOSE_DIR = option('--compose-dir', fileURLToPath(new URL('../../../infra/compose/', import.meta.url)));
const OUT = join(COMPOSE_DIR, 'backups', 'wi-oi-120am');
// The deploy tool's env files (WI-OI-120y handoff), in its order.
export const ENV_FILES = ['.env', '.env.modules', '.env.workforce', '.env.geospatial', '.env.module.host',
  '.env.module.product-catalogue', '.env.module.universal-inventory', '.env.module.universal-procurement',
  '.env.module.universal-orders', '.env.module.financial-operations'];
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const write600 = (path, text) => {
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600);
};

const readOnly = (sql) =>
  execFileSync('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', OLD,
    'psql', '-X', '-q', '-U', BOOTSTRAP_ROLE, '-d', 'gigalibs', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
  { input: sql, encoding: 'utf8' }).trim();

const targets = ['.env.database', ...ENV_FILES.map((f) => `${f}.next`)].map((f) => join(COMPOSE_DIR, f));
if (!argv.includes('--force') && targets.some((f) => existsSync(f))) {
  console.error(`REFUSED: ${CARD} outputs already exist (pass --force to replace them before the cutover)`);
  process.exit(1);
}

const roles = JSON.parse(readOnly(`SELECT coalesce(json_agg(r ORDER BY r.rolname), '[]') FROM (
  SELECT rolname, rolsuper, rolcanlogin, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%') r;`));
const memberships = JSON.parse(readOnly(`SELECT coalesce(json_agg(m), '[]') FROM (
  SELECT r.rolname AS role, m.rolname AS member, a.admin_option FROM pg_auth_members a
    JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member WHERE r.rolname NOT LIKE 'pg\\_%') m;`));
const settings = readOnly(`SELECT count(*) FROM pg_db_role_setting;`);
if (settings !== '0') throw new Error(`${CARD}: the old cluster has ${settings} role settings; copy them by hand first`);
const datacl = readOnly(`SELECT datacl::text FROM pg_database WHERE datname = 'gigalibs';`);
const connectGrants = connectGrantees(datacl);
// Security review L4: stop if the old cluster uses anything the role copy would lose.
const lossy = lossyRoleFeatures({
  systemMemberships: JSON.parse(readOnly(`SELECT coalesce(json_agg(m), '[]') FROM (
    SELECT r.rolname AS role, m.rolname AS member FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid
      JOIN pg_roles m ON m.oid = a.member WHERE r.rolname LIKE 'pg\\_%' AND m.rolname NOT LIKE 'pg\\_%') m;`)),
  limitedRoles: JSON.parse(readOnly(`SELECT coalesce(json_agg(r), '[]') FROM (SELECT rolname FROM pg_roles
    WHERE rolname NOT LIKE 'pg\\_%' AND (rolconnlimit <> -1 OR rolvaliduntil IS NOT NULL)) r;`)),
  datacl,
});
if (lossy.length) throw new Error(`${CARD}: the role copy would lose: ${lossy.join('; ')}`);
// Security review H2: the release running before the cutover; --rollback refuses once any service runs another one.
const preCutoverReleaseId = execFileSync('docker', ['inspect', `${PROJECT}-web-1`, '--format',
  '{{index .Config.Labels "com.gigalibs.release-id"}}'], { encoding: 'utf8' }).trim();

const passwords = {};
for (const role of roles) {
  if (role.rolcanlogin && !SKIPPED_ROLES.includes(role.rolname)) passwords[role.rolname] = randomBytes(24).toString('hex');
}

mkdirSync(OUT, { recursive: true, mode: 0o700 });
chmodSync(OUT, 0o700);
const record = { card: CARD, createdAt: new Date().toISOString(), oldContainer: OLD, newContainer: NEW_CONTAINER,
  preCutoverReleaseId, files: {}, sources: {}, envChanges: {} };

write600(join(COMPOSE_DIR, '.env.database'), `# ${CARD}: the superuser password of uat-postgres (compose.database.yaml).\nUAT_DATABASE_SUPERUSER_PASSWORD=${passwords[BOOTSTRAP_ROLE]}\n`);
record.files['.env.database'] = sha256(readFileSync(join(COMPOSE_DIR, '.env.database'), 'utf8'));

for (const file of ENV_FILES) {
  const path = join(COMPOSE_DIR, file);
  if (!existsSync(path)) throw new Error(`${CARD}: ${file} is missing`);
  const text = readFileSync(path, 'utf8');
  // Security review M1: the cutover refuses if a source env file changes after this.
  record.sources[file] = sha256(text);
  for (const url of databaseUrls(text)) {
    if (!passwords[url.user]) throw new Error(`${CARD}: ${file} ${url.name} connects as ${url.user}, which cannot log in`);
  }
  const { text: next, changed } = rewriteEnv(text, { passwords, container: NEW_CONTAINER });
  write600(`${path}.next`, next);
  record.files[`${file}.next`] = sha256(next);
  record.envChanges[file] = changed;
}

const sql = rolesSql({ roles, memberships, connectGrants }, passwords);
write600(join(OUT, 'roles.sql'), sql);
record.files['backups/wi-oi-120am/roles.sql'] = sha256(sql);
record.roles = roles.filter((r) => !SKIPPED_ROLES.includes(r.rolname)).map((r) => ({ name: r.rolname, login: r.rolcanlogin }));
record.skippedRoles = SKIPPED_ROLES.filter((name) => roles.some((r) => r.rolname === name));
write600(join(OUT, 'prepare.json'), `${JSON.stringify(record, null, 2)}\n`);

console.log(JSON.stringify({
  prepared: OUT,
  preCutoverReleaseId,
  roles: record.roles.length,
  loginRolesWithNewPasswords: Object.keys(passwords).length,
  skippedRoles: record.skippedRoles,
  envChanges: record.envChanges,
}, null, 2));
