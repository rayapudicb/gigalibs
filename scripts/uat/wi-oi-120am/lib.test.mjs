// node --test scripts/uat/wi-oi-120am/lib.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { compareInventories, connectGrantees, databaseUrls, dropSkippedRolesSql, lossyRoleFeatures, rewriteEnv, rolesSql, rotateSql } from './lib.mjs';

const env = [
  '# comment with host.docker.internal for the module APIs',
  'CMMS_API_URL=http://host.docker.internal:4200',
  'DATABASE_URL=postgresql://gigalibs:old-secret@host.docker.internal:5440/gigalibs?schema=public',
  'CMMS_DATABASE_URL=postgresql://gigalibs_cmms_runtime:other@host.docker.internal:5440/gigalibs?schema=gigalibs_cmms',
  'CONTROL_POSTGRES_CONTAINER=gigalibs-postgres',
  'OTHER=1',
].join('\n');

test('finds database URLs without exposing passwords', () => {
  assert.deepEqual(databaseUrls(env), [
    { name: 'DATABASE_URL', user: 'gigalibs', endpoint: 'host.docker.internal:5440' },
    { name: 'CMMS_DATABASE_URL', user: 'gigalibs_cmms_runtime', endpoint: 'host.docker.internal:5440' },
  ]);
});

test('moves every database URL to the new database with its new password and keeps every other line', () => {
  const { text, changed } = rewriteEnv(env, {
    passwords: { gigalibs: 'Aaa111', gigalibs_cmms_runtime: 'Bbb222' },
    container: 'gigalibs-configuration-local-uat-postgres-1',
  });
  assert.deepEqual(changed, ['DATABASE_URL', 'CMMS_DATABASE_URL', 'CONTROL_POSTGRES_CONTAINER']);
  const lines = text.split('\n');
  assert.equal(lines[0], '# comment with host.docker.internal for the module APIs');
  assert.equal(lines[1], 'CMMS_API_URL=http://host.docker.internal:4200');
  assert.equal(lines[2], 'DATABASE_URL=postgresql://gigalibs:Aaa111@uat-postgres:5432/gigalibs?schema=public');
  assert.equal(lines[3], 'CMMS_DATABASE_URL=postgresql://gigalibs_cmms_runtime:Bbb222@uat-postgres:5432/gigalibs?schema=gigalibs_cmms');
  assert.equal(lines[4], 'CONTROL_POSTGRES_CONTAINER=gigalibs-configuration-local-uat-postgres-1');
  assert.equal(lines[5], 'OTHER=1');
  assert.doesNotMatch(text, /old-secret|other@/);
});

test('refuses a user with no new password, an unexpected endpoint, and unsafe passwords', () => {
  assert.throws(() => rewriteEnv(env, { passwords: { gigalibs: 'Aaa111' }, container: 'c' }), /no new password for gigalibs_cmms_runtime/);
  assert.throws(() => rewriteEnv('DATABASE_URL=postgresql://gigalibs:x@db.example:5432/gigalibs', { passwords: { gigalibs: 'A1' }, container: 'c' }), /not the old database/);
  assert.throws(() => rewriteEnv(env, { passwords: { gigalibs: 'a@b', gigalibs_cmms_runtime: 'B1' }, container: 'c' }), /URL-safe/);
});

const roles = [
  { rolname: 'gigalibs', rolsuper: true, rolcanlogin: true, rolinherit: true, rolcreaterole: true, rolcreatedb: true, rolreplication: true, rolbypassrls: true },
  { rolname: 'gigalibs_cmms_runtime', rolsuper: false, rolcanlogin: true, rolinherit: true, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false },
  { rolname: 'gigalibs_org_tenant', rolsuper: false, rolcanlogin: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false },
  { rolname: 'rls_test_user', rolsuper: false, rolcanlogin: true, rolinherit: true, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false },
];

test('recreates roles, memberships and connect grants; skips the test role; one superuser only', () => {
  const sql = rolesSql({
    roles,
    memberships: [{ role: 'gigalibs_org_tenant', member: 'gigalibs', admin_option: false }, { role: 'gigalibs_org_tenant', member: 'rls_test_user', admin_option: false }],
    connectGrants: ['gigalibs', 'gigalibs_cmms_runtime', 'rls_test_user'],
  }, { gigalibs_cmms_runtime: "Pw'1" });
  assert.match(sql, /CREATE ROLE "gigalibs_cmms_runtime" WITH NOSUPERUSER LOGIN INHERIT .* NOBYPASSRLS PASSWORD 'Pw''1';/);
  assert.match(sql, /CREATE ROLE "gigalibs_org_tenant" WITH NOSUPERUSER NOLOGIN NOINHERIT /);
  assert.match(sql, /GRANT "gigalibs_org_tenant" TO "gigalibs";/);
  assert.match(sql, /GRANT CONNECT ON DATABASE "gigalibs" TO "gigalibs_cmms_runtime";/);
  // The test role exists only for the restore's grants: it cannot log in and gets no membership or connect grant.
  assert.match(sql, /CREATE ROLE "rls_test_user" WITH NOSUPERUSER NOLOGIN NOINHERIT .*; -- for the restore's grants only/);
  assert.doesNotMatch(sql, /TO "rls_test_user"|CREATE ROLE "gigalibs" /);
  assert.equal((sql.match(/rls_test_user/g) ?? []).length, 1);
  const drop = dropSkippedRolesSql();
  assert.match(drop, /pg_shdepend .* d\.deptype = 'o'/s);
  assert.match(drop, /RAISE EXCEPTION .*rls_test_user owns objects/);
  // A failing CREATE ROLE must not reach the server log with its password.
  assert.ok(sql.indexOf('SET log_min_error_statement = panic;') < sql.indexOf('CREATE ROLE'));
  assert.match(drop, /DROP OWNED BY "rls_test_user";\nDROP ROLE "rls_test_user";/);
  assert.throws(() => rolesSql({ roles: [{ ...roles[1], rolsuper: true }], memberships: [], connectGrants: [] }, { gigalibs_cmms_runtime: 'x' }), /superuser/);
  assert.throws(() => rolesSql({ roles: [roles[1]], memberships: [], connectGrants: [] }, {}), /no new password/);
  assert.throws(() => rolesSql({ roles: [{ ...roles[1], rolname: 'bad"name' }], memberships: [], connectGrants: [] }, { 'bad"name': 'x' }), /unexpected role name/);
});

test('reads CONNECT grantees from a database ACL', () => {
  assert.deepEqual(connectGrantees('{=Tc/gigalibs,gigalibs=CTc/gigalibs,gigalibs_cmms_runtime=c/gigalibs,reader=T/gigalibs}'), ['', 'gigalibs', 'gigalibs_cmms_runtime'].filter(Boolean));
});

test('compares inventories exactly', () => {
  const a = 'count|public.tenants|320\ncount|gigalibs_cmms.assets|10\nledger|gigalibs_cmms.schema_migrations|abc\n';
  assert.deepEqual(compareInventories(a, a), { differences: [], tables: 2, ledgers: 1, catalogChecks: 0 });
  const b = 'count|public.tenants|319\ncount|gigalibs_cmms.assets|10\nledger|gigalibs_cmms.schema_migrations|abd\ncount|public.extra|0\n';
  assert.deepEqual(compareInventories(a, b).differences, [
    'count|public.tenants: 320 → 319',
    'ledger|gigalibs_cmms.schema_migrations: abc → abd',
    'count|public.extra: only in the new database',
  ]);
});

test('refuses role features the copy would lose', () => {
  const clean = { systemMemberships: [], limitedRoles: [], datacl: '{=Tc/gigalibs,gigalibs=CTc/gigalibs,gigalibs_cmms_runtime=c/gigalibs}' };
  assert.deepEqual(lossyRoleFeatures(clean), []);
  assert.deepEqual(lossyRoleFeatures({ ...clean, systemMemberships: [{ role: 'pg_read_all_data', member: 'x' }] }), ['x is a member of pg_read_all_data']);
  assert.deepEqual(lossyRoleFeatures({ ...clean, limitedRoles: [{ rolname: 'y' }] }), ['y has a connection limit or an expiry']);
  assert.match(lossyRoleFeatures({ ...clean, datacl: '{=c/gigalibs,gigalibs=CTc/gigalibs}' }).join(), /PUBLIC holds =c\/gigalibs/);
  assert.match(lossyRoleFeatures({ ...clean, datacl: '{=Tc/gigalibs,gigalibs=CTc/gigalibs,z=CTc/gigalibs}' }).join(), /z holds CTc/);
});

test('rotates every login role and never logs a failing statement', () => {
  const sql = rotateSql(['gigalibs', 'rls_test_user'], { gigalibs: 'Aa1', rls_test_user: "B'2" });
  assert.ok(sql.indexOf('SET log_min_error_statement = panic;') < sql.indexOf('ALTER ROLE'));
  assert.match(sql, /ALTER ROLE "gigalibs" WITH PASSWORD 'Aa1';/);
  assert.match(sql, /ALTER ROLE "rls_test_user" WITH PASSWORD 'B''2';/);
  assert.throws(() => rotateSql(['gigalibs'], {}), /no new password/);
});

