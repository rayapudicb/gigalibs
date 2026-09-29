// `pnpm module:conformance <name> [--live] [--record]` (WI-OI-085d): the checks a generated module must pass before
// it may leave readiness PLANNED.
//   static  manifest and layer audits, required files, SDK guard/database/config, every route guarded with a
//           permission, every write audited, forced RLS and tenant_id on every table, runtime table rules,
//           permission prefix, and the module's own tests;
//   --live  against the running API (its Compose service): health at the schema contract, 401/403 refusals,
//           tenant isolation, idempotency, version conflicts, audit and outbox rows, and RLS as the runtime role.
//           Synthetic tenants `conformance-<run>-a|b` are deleted afterwards;
//   --record writes modules/<name>/conformance.json when every check passed, including --live. The manifest audit
//           requires it, for the current code fingerprint, before a generated module is listed above PLANNED.
import { spawnSync } from 'node:child_process';
import { randomUUID, createPrivateKey } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleCodeSha256 } from './lib/module-code-hash.mjs';

const root = new URL('../', import.meta.url).pathname;
const args = process.argv.slice(2);
const name = args[0];
if (!name || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
  console.error('usage: pnpm module:conformance <name> [--live] [--record]');
  process.exit(2);
}

if (args.includes('--inside')) {
  await liveInside();
  process.exit(0);
}

const yaml = (await import('js-yaml')).default;
const results = [];
const check = (id, label, ok, detail = '') => results.push({ id, label, ok: Boolean(ok), detail });
const moduleRoot = join(root, 'modules', name);
const src = join(moduleRoot, 'apps/api/src');
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

const manifest = existsSync(join(moduleRoot, 'module.yaml'))
  ? yaml.load(read(join(moduleRoot, 'module.yaml')))
  : null;
if (manifest?.spec?.runtime?.generated !== true) {
  console.error(`module:conformance: modules/${name} is not a generated module (spec.runtime.generated).`);
  process.exit(2);
}
const runtime = JSON.parse(read(join(root, 'infra/compose/generated/modules.json')) || '{}')[name];
const schema = manifest.spec.database?.defaultSchema;
const gateway = manifest.spec.gateway ?? {};
const probe = {
  collection: manifest.spec.conformance?.collection ?? 'v1/records',
  create: manifest.spec.conformance?.create ?? { title: 'Conformance probe' },
  update: manifest.spec.conformance?.update ?? { status: 'CLOSED' },
};
const routeFor = (path) => (gateway.routes ?? []).find((route) => route.path === path) ?? {};
const readPermission = routeFor(probe.collection).GET;
const managePermission = routeFor(probe.collection).POST;

function* sourceFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.name.endsWith('.ts')) yield path;
  }
}
const isTest = (file) => /\.(spec|test)\.ts$/.test(file);
const code = [...sourceFiles(src)].filter((file) => !isTest(file));
const tests = [...sourceFiles(src)].filter(isTest);

// ─── Static ───────────────────────────────────────────────────────────────────────────────────────────────
const run = (command, commandArgs) =>
  spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
check(
  'S1',
  'manifest contract audit passes',
  run(process.execPath, ['scripts/module-manifests.mjs', '--write', '--conformance-module', name])
    .status === 0,
);
check('S2', 'layer audit passes', run(process.execPath, ['scripts/verify-layer-boundaries.mjs']).status === 0);
check('S3', 'generated runtime is current', Boolean(runtime), runtime ? '' : 'run pnpm modules:catalog');

const required = ['main.ts', 'app.module.ts', 'config.ts', 'database.service.ts', 'authorization.ts', 'health.controller.ts'];
const missing = required.filter((file) => !existsSync(join(src, file)));
check('S4', 'required API files exist', missing.length === 0, missing.join(', '));
check('S5', 'the guard is the SDK signed-context guard', /extends\s+SignedContextGuardBase\b/.test(read(join(src, 'authorization.ts'))));
check('S6', 'the database is the SDK module database', /extends\s+ModuleDatabase\b/.test(read(join(src, 'database.service.ts'))));
check('S7', 'runtime configuration comes from the SDK loader', /loadModuleRuntimeConfig\(/.test(read(join(src, 'config.ts'))));
const copied = code.filter((file) => /verifyPlatformContextToken|createPublicKey|jsonwebtoken|from 'jose'/.test(read(file)));
check('S8', 'no copied token verification', copied.length === 0, copied.map((file) => relative(root, file)).join(', '));

const unguarded = [];
for (const file of code.filter((file) => file.endsWith('.controller.ts'))) {
  const text = read(file);
  if (/@Controller\(\s*'v1\/health'\s*\)/.test(text)) continue;
  if (!/@UseGuards\(\s*AuthorizationGuard\s*\)/.test(text)) unguarded.push(`${relative(root, file)}: controller without AuthorizationGuard`);
  for (const [, block, method] of text.matchAll(/((?:\s*@\w+\((?:[^()]|\([^()]*\))*\)\s*)+)(?:async\s+)?(\w+)\s*\(/g)) {
    if (/@(Get|Post|Patch|Put|Delete)\(/.test(block) && !/@RequirePermissions\(/.test(block))
      unguarded.push(`${relative(root, file)}: ${method} has no @RequirePermissions`);
  }
}
check('S9', 'every route is guarded and names a permission', unguarded.length === 0, unguarded.join('; '));

const writePattern = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+\$\{SCHEMA\}\.(?!audit_events|outbox_events)\w+/;
const unaudited = code.filter((file) => writePattern.test(read(file)) && !/recordMutation\(/.test(read(file)));
check('S10', 'every write records audit and outbox', unaudited.length === 0, unaudited.map((file) => relative(root, file)).join(', '));

const migrations = read(join(moduleRoot, 'db/runtime-manifest.txt'))
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const sql = migrations.map((file) => read(join(moduleRoot, 'db/migrations', file))).join('\n');
const tables = new Map();
for (const [, table, body] of sql.matchAll(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${schema}\\.(\\w+)\\s*\\(([\\s\\S]*?)\\n\\);`, 'g')))
  if (table !== 'schema_migrations') tables.set(table, body);
const forced = new Set([...sql.matchAll(new RegExp(`ALTER TABLE ${schema}\\.(\\w+) FORCE ROW LEVEL SECURITY`, 'g'))].map(([, t]) => t));
const policed = new Set([...sql.matchAll(new RegExp(`CREATE POLICY \\w+ ON ${schema}\\.(\\w+)`, 'g'))].map(([, t]) => t));
for (const [, list, body] of sql.matchAll(/FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([^\]]*)\]\s+LOOP([\s\S]*?)END\s+LOOP/g)) {
  const names = [...list.matchAll(/'(\w+)'/g)].map(([, t]) => t);
  if (/FORCE ROW LEVEL SECURITY/.test(body)) names.forEach((t) => forced.add(t));
  if (/CREATE POLICY/.test(body) && /current_setting\(''app\.tenant_id''/.test(body)) names.forEach((t) => policed.add(t));
}
const weak = [...tables].filter(([table, body]) => !/\btenant_id\b/.test(body) || !forced.has(table) || !policed.has(table));
check('S11', 'every table has tenant_id, forced RLS and a tenant policy', tables.size > 0 && weak.length === 0, weak.map(([t]) => t).join(', ') || `${migrations.length} migrations`);

const rt = manifest.spec.runtime;
check('S12', 'audit is append-only and revocations read-only', (rt.appendOnlyTables ?? []).includes('audit_events') && (rt.readOnlyTables ?? []).includes('auth_revocation_events'));
const prefix = /PERMISSION_PREFIX\s*=\s*'([^']+)'/.exec(read(join(src, 'config.ts')))?.[1];
const permissions = [
  ...(gateway.routes ?? []).flatMap((route) => ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].flatMap((m) => route[m] ?? [])),
  ...(manifest.spec.catalog ?? []).map((entry) => entry.requiredPermission),
].flat().filter(Boolean);
const foreign = permissions.filter((permission) => !prefix || !permission.startsWith(`${prefix}.`));
check('S13', 'every permission uses the module prefix', prefix && foreign.length === 0, foreign.join(', '));
const moduleBuild = run('pnpm', [
  '--filter',
  `${runtime?.package ?? `@gigalibs/${name}-api`}...`,
  'build',
]);
const moduleTests =
  moduleBuild.status === 0
    ? run('pnpm', ['exec', 'vitest', 'run', `modules/${name}`])
    : { status: 1 };
check(
  'S14',
  'the module and its dependencies build and its tests pass',
  tests.length > 0 && moduleBuild.status === 0 && moduleTests.status === 0,
  `${tests.length} test files; build exit ${moduleBuild.status}; test exit ${moduleTests.status}`,
);
check('S15', 'the probe routes are declared', readPermission && managePermission && routeFor(`${probe.collection}/{id}`).PATCH, probe.collection);

// ─── Live ─────────────────────────────────────────────────────────────────────────────────────────────────
let live = false;
if (args.includes('--live')) {
  live = true;
  const env = Object.fromEntries(
    read(join(root, 'infra/compose', `.env.module.${name}`))
      .split('\n')
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  const container = `gigalibs-configuration-local-${runtime?.service}-1`;
  const health = spawnSync('docker', ['inspect', '-f', '{{.State.Health.Status}}', container], { encoding: 'utf8' }).stdout.trim();
  const imageIdentity = spawnSync(
    'docker',
    [
      'inspect',
      '-f',
      '{{index .Config.Labels "org.opencontainers.image.revision"}}|{{index .Config.Labels "com.gigalibs.source-state-sha256"}}',
      container,
    ],
    { encoding: 'utf8' },
  ).stdout.trim();
  const currentRevision = run('git', ['rev-parse', 'HEAD']).stdout.trim();
  const currentState = run(process.execPath, ['scripts/compute-source-state-sha256.mjs']).stdout.trim();
  check(
    'L0',
    'the module API container is healthy and runs the current source identity',
    health === 'healthy' && imageIdentity === `${currentRevision}|${currentState}`,
    `${container}: ${health || 'absent'}; identity ${imageIdentity || 'absent'}`,
  );
  const profile = JSON.parse(read(join(root, 'config/deployment-profiles/configuration-local-development-v1.json')));
  const runId = randomUUID().slice(0, 8);
  const tenants = { a: `conformance-${runId}-a`, b: `conformance-${runId}-b` };
  let inside = { checks: [] };
  if (health === 'healthy') {
    const result = spawnSync(
      'docker',
      [
        'run', '--rm', '--network', 'gigalibs-configuration-local', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '-v', `${root}:/repo:ro`, '-w', '/repo',
        ...Object.entries({
          CONFORMANCE_API_URL: `http://${runtime.service}:${runtime.port}`,
          CONFORMANCE_PRIVATE_KEY_B64: env[`${runtime.prefix}_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64`] ?? '',
          CONFORMANCE_AUDIENCE: runtime.audience,
          CONFORMANCE_MODULE_KEY: gateway.catalogKey,
          CONFORMANCE_READ: readPermission,
          CONFORMANCE_MANAGE: managePermission,
          CONFORMANCE_VERSION: String(runtime.migrationVersion),
          CONFORMANCE_SCHEMA: schema,
          CONFORMANCE_PROBE: JSON.stringify(probe),
          CONFORMANCE_TENANTS: JSON.stringify(tenants),
        }).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
        profile.artifactPolicy.baseImage,
        'node', 'scripts/module-conformance.mjs', name, '--inside',
      ],
      { encoding: 'utf8' },
    );
    try {
      inside = JSON.parse(result.stdout.trim().split('\n').pop());
    } catch {
      const lines = `${result.stderr}\n${result.stdout}`.split('\n').filter((line) => /Error|error/.test(line));
      check('L1', 'the live runner reported', false, (lines[0] ?? `exit ${result.status}`).slice(0, 300));
    }
  }
  for (const item of inside.checks) check(item.id, item.label, item.ok, item.detail);

  const psqlErrors = [];
  const psql = (statement) => {
    const result = spawnSync(
      'docker',
      ['exec', 'gigalibs-postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'gigalibs', '-d', 'gigalibs', '-tAc', statement],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) {
      psqlErrors.push((result.stderr || result.stdout || `psql exit ${result.status}`).trim().slice(0, 300));
      return '';
    }
    return result.stdout.trim();
  };
  if (inside.aggregateId) {
    const id = inside.aggregateId;
    const count = (table, column, tenant) =>
      Number(psql(`SELECT count(*) FROM ${schema}.${table} WHERE tenant_id = '${tenant}' AND ${column} = '${id}'`));
    check('L20', 'each change wrote an audit row', count('audit_events', 'entity_id', tenants.a) >= inside.mutations, `${count('audit_events', 'entity_id', tenants.a)} rows`);
    check('L21', 'each change wrote an outbox fact', count('outbox_events', 'aggregate_id', tenants.a) >= inside.mutations, `${count('outbox_events', 'aggregate_id', tenants.a)} rows`);
    const role = `${schema}_runtime`;
    const asRole = (tenant) =>
      psql(`BEGIN; SET LOCAL ROLE ${role}; ${tenant ? `SELECT set_config('app.tenant_id', '${tenant}', true);` : ''} SELECT count(*) FROM ${schema}.audit_events; COMMIT;`).split('\n').filter((line) => /^\d+$/.test(line.trim())).at(-1);
    check('L22', 'RLS hides every row from the runtime role without a tenant', asRole(null) === '0', `rows: ${asRole(null)}`);
    check('L23', 'RLS shows the runtime role only its tenant', asRole(tenants.b) === '0' && Number(asRole(tenants.a)) >= inside.mutations, `tenant B rows: ${asRole(tenants.b)}`);
  }
  // Synthetic tenants are removed from every table that carries tenant_id.
  const cleanupErrorCount = psqlErrors.length;
  const tenantTables = psql(
    `SELECT string_agg(table_name, ',') FROM information_schema.columns WHERE table_schema = '${schema}' AND column_name = 'tenant_id'`,
  )
    .split(',')
    .filter(Boolean);
  const cleanupCounts = tenantTables
    .map((table) => psql(`WITH d AS (DELETE FROM ${schema}.${table} WHERE tenant_id IN ('${tenants.a}', '${tenants.b}') RETURNING 1) SELECT count(*) FROM d`))
    .map((value) => Number(value));
  const cleanupOk =
    psqlErrors.length === cleanupErrorCount &&
    tenantTables.length > 0 &&
    cleanupCounts.every(Number.isFinite);
  const cleaned = cleanupCounts.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  check(
    'L99',
    'conformance tenants removed',
    cleanupOk,
    cleanupOk
      ? `${cleaned} rows deleted from ${tenantTables.length} tenant tables`
      : psqlErrors.at(-1) ?? 'no tenant-scoped tables found',
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────────────────────────────────
const failed = results.filter((result) => !result.ok);
for (const result of results)
  console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.id.padEnd(4)} ${result.label}${result.detail ? ` (${result.detail})` : ''}`);
console.log(failed.length ? `${failed.length} of ${results.length} checks failed.` : `All ${results.length} checks passed${live ? ' (static and live)' : ' (static)'}.`);
if (args.includes('--record')) {
  if (failed.length || !live) {
    console.error('Not recorded: --record needs every check to pass, including --live.');
    process.exit(1);
  }
  const recordFile = join(moduleRoot, 'conformance.json');
  writeFileSync(
    recordFile,
    `${JSON.stringify({ module: name, passed: true, live: true, checkedAt: new Date().toISOString(), codeSha256: moduleCodeSha256(root, name), checks: results.map((r) => r.id) }, null, 2)}\n`,
  );
  const listingAudit = run(process.execPath, ['scripts/module-manifests.mjs']);
  if (listingAudit.status !== 0) {
    unlinkSync(recordFile);
    console.error(listingAudit.stdout || listingAudit.stderr);
    console.error('Not recorded: the ordinary listing audit rejected the new conformance record.');
    process.exit(1);
  }
  console.log(`Recorded modules/${name}/conformance.json.`);
}
process.exit(failed.length ? 1 : 0);

// ─── Live runner (inside a container on the Compose network) ──────────────────────────────────────────────
async function liveInside() {
  const env = process.env;
  // The module's own @gigalibs/auth-core (its ES module entry), linked inside the read-only repository mount.
  const packageDir = join(root, 'modules', name, 'apps/api/node_modules/@gigalibs/auth-core');
  const manifestOfPackage = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  const entry = join(packageDir, manifestOfPackage.exports?.['.']?.import ?? manifestOfPackage.main);
  const { signPlatformContextToken } = await import(pathToFileURL(entry).href);
  const privateKey = createPrivateKey({ key: Buffer.from(env.CONFORMANCE_PRIVATE_KEY_B64, 'base64'), format: 'der', type: 'pkcs8' })
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const { publicKey: _unused, privateKey: strangerKey } = (await import('node:crypto')).generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const tenants = JSON.parse(env.CONFORMANCE_TENANTS);
  const probeSpec = JSON.parse(env.CONFORMANCE_PROBE);
  const base = `${env.CONFORMANCE_API_URL}/${probeSpec.collection}`;
  const checks = [];
  const ok = (id, label, pass, detail = '') => checks.push({ id, label, ok: Boolean(pass), detail });
  const now = () => Math.floor(Date.now() / 1000);
  const token = (tenant, scopes, overrides = {}, key = privateKey) =>
    signPlatformContextToken(
      {
        iss: 'gigalibs-control-plane',
        aud: env.CONFORMANCE_AUDIENCE,
        sub: `conformance-user-${tenant}`,
        tenant_id: tenant,
        session_id: `conformance-session-${tenant}`,
        auth_version: 1,
        roles: ['TENANT_ADMIN'],
        granted_scopes: scopes,
        persona_type: 'TENANT_ADMIN',
        org_scope: { mode: 'FLAT_TENANT' },
        entitlement: { module_key: env.CONFORMANCE_MODULE_KEY, status: 'ENABLED', version: 'v1' },
        iat: now(),
        exp: now() + 60,
        jti: randomUUID(),
        ...overrides,
      },
      key,
    );
  const both = [env.CONFORMANCE_READ, env.CONFORMANCE_MANAGE];
  const call = async (url, bearer, init = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  };

  const liveHealth = await call(`${env.CONFORMANCE_API_URL}/v1/health/live`);
  ok('L1', 'liveness answers', liveHealth.status === 200);
  const ready = await call(`${env.CONFORMANCE_API_URL}/v1/health/ready`);
  ok('L2', 'readiness is at the schema contract', ready.status === 200 && ready.body?.migrationVersion === Number(env.CONFORMANCE_VERSION) && ready.body?.schema === env.CONFORMANCE_SCHEMA, JSON.stringify(ready.body).slice(0, 120));
  ok('L3', 'no signed context is refused (401)', (await call(base)).status === 401);
  ok('L4', 'a context signed with another key is refused (401)', (await call(base, token(tenants.a, both, {}, strangerKey))).status === 401);
  ok('L5', 'a context for another audience is refused (401)', (await call(base, token(tenants.a, both, { aud: 'gigalibs-cmms-api' }))).status === 401);
  ok('L6', "another module's entitlement is refused (403)", (await call(base, token(tenants.a, both, { entitlement: { module_key: 'asset-maintenance', status: 'ENABLED', version: 'v1' } }))).status === 403);
  const readerOnly = await call(base, token(tenants.a, [env.CONFORMANCE_READ]), { method: 'POST', body: JSON.stringify({ requestKey: randomUUID(), ...probeSpec.create }) });
  ok('L7', 'a reader cannot write (403)', readerOnly.status === 403);

  const requestKey = randomUUID();
  const createBody = JSON.stringify({ requestKey, ...probeSpec.create });
  const created = await call(base, token(tenants.a, both), { method: 'POST', body: createBody });
  ok('L8', 'tenant A creates (201)', created.status === 201 && created.body?.id, `status ${created.status}`);
  const id = created.body?.id;
  const replay = await call(base, token(tenants.a, both), { method: 'POST', body: createBody });
  ok('L9', 'a repeated request key replays the same result', replay.status === 200 && replay.body?.id === id && replay.headers.get('idempotency-replayed') === 'true', `status ${replay.status}`);
  const listB = await call(base, token(tenants.b, both));
  const itemsB = Array.isArray(listB.body?.items) ? listB.body.items : [];
  ok('L10', "tenant B does not see tenant A's records", listB.status === 200 && !itemsB.some((item) => item.id === id));
  ok('L11', "tenant B cannot read tenant A's record (404)", (await call(`${base}/${id}`, token(tenants.b, both))).status === 404);
  ok('L12', "tenant B cannot change tenant A's record (404)", (await call(`${base}/${id}`, token(tenants.b, both), { method: 'PATCH', body: JSON.stringify({ version: 1, ...probeSpec.update }) })).status === 404);
  const stale = await call(`${base}/${id}`, token(tenants.a, both), { method: 'PATCH', body: JSON.stringify({ version: 99, ...probeSpec.update }) });
  ok('L13', 'a stale version is refused (409)', stale.status === 409);
  const updated = await call(`${base}/${id}`, token(tenants.a, both), { method: 'PATCH', body: JSON.stringify({ version: created.body?.version, ...probeSpec.update }) });
  ok('L14', 'tenant A updates with the current version', updated.status === 200 && updated.body?.version === (created.body?.version ?? 0) + 1, `status ${updated.status}`);
  console.log(JSON.stringify({ checks, aggregateId: id, mutations: 2 }));
}
