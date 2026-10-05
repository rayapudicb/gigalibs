#!/usr/bin/env node
// WI-OI-120h (U19a): the CMMS screen calls that had no gateway route, end to end over HTTP on an isolated database.
// Installs the CMMS schema with the real migration runner, starts the built CMMS API with a throwaway signing key, and
// sends each call as the web gateway would:
// - the path must pass the generated gateway allow-list for its method;
// - the call is signed with only the permission the gateway requires for that route, so a permission the API asks
//   for and the gateway does not grant fails here;
// - lists answer `{ items }`, which is what the screens read;
// - the deletes answer 204 or 200, and PUT updates are applied.
// It also checks that another tenant's record answers 404 and that a read-only user cannot write.
// Needs PROOF_DATABASE_URL (never the UAT instance) and a built CMMS API (`pnpm build`).
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildPlatformContext, signPlatformContextToken } from '../packages/auth-core/dist/index.js';
import { isolatedProofDatabaseUrl } from './lib/isolated-proof-database.mjs';

const root = new URL('../', import.meta.url).pathname;
const pgDirectory = readdirSync(join(root, 'node_modules/.pnpm')).find((name) => /^pg@\d/.test(name));
const { default: pg } = await import(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg/lib/index.js'));

const adminUrl = isolatedProofDatabaseUrl('WI-OI-120h CMMS screen routes proof');
const PORT = Number(process.env.U19A_PROOF_PORT ?? 47931);
const BASE = `http://127.0.0.1:${PORT}`;
const MODULE_KEY = 'asset-maintenance';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 200)})` : ''}`);
}

// The gateway allow-list exactly as the web app was generated with it.
const generated = readFileSync(join(root, 'apps/workflow-platform/lib/generated/module-gateways.ts'), 'utf8');
const start = generated.indexOf('{', generated.indexOf('generatedModuleGateways'));
let depth = 0;
let end = start;
for (let index = start; index < generated.length; index += 1) {
  if (generated[index] === '{') depth += 1;
  else if (generated[index] === '}' && (depth -= 1) === 0) {
    end = index;
    break;
  }
}
const gateway = JSON.parse(generated.slice(start, end + 1))['physical-operations-cmms'];
const routes = gateway.routes.map((route) => ({ pattern: new RegExp(route.pattern), methods: route.methods }));
const gatewayPermission = (method, path) => routes.find((route) => route.pattern.test(path.split('?')[0]))?.methods[method] ?? null;

// CMMS migration settings, as the compose job runs them.
const compose = readFileSync(join(root, 'infra/compose/compose.modules.local.yaml'), 'utf8');
const job = compose.slice(compose.indexOf('\n  cmms-migrations:'), compose.indexOf('\n  cmms-api:'));
const setting = (name) => new RegExp(`${name}: "?([^"\\n]*)"?`).exec(job)?.[1] ?? '';

// 1. The CMMS schema with the real runner, from the files the image ships (`db/runtime-manifest.txt`).
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
for (const extension of ['pgcrypto', 'ltree', 'btree_gist']) await admin.query(`CREATE EXTENSION IF NOT EXISTS ${extension} WITH SCHEMA public`);
const work = mkdtempSync(join(tmpdir(), 'u19a-proof-'));
cpSync(join(root, 'infra/compose/docker/run-module-migrations.mjs'), join(work, 'run.mjs'));
mkdirSync(join(work, 'node_modules'));
symlinkSync(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg'), join(work, 'node_modules/pg'));
const migrations = join(root, 'modules/physical-operations-cmms/db');
mkdirSync(join(work, 'migrations'));
for (const file of readFileSync(join(migrations, 'runtime-manifest.txt'), 'utf8').split('\n').map((line) => line.trim())) {
  if (file && !file.startsWith('#')) cpSync(join(migrations, 'migrations', file), join(work, 'migrations', file));
}
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = 'gigalibs_cmms_u19aproof';
runtimeUrl.password = randomUUID().replaceAll('-', '');
const migrate = spawnSync(process.execPath, [join(work, 'run.mjs')], {
  encoding: 'utf8',
  env: {
    ...process.env,
    DATABASE_URL: adminUrl,
    MODULE_RUNTIME_DATABASE_URL: runtimeUrl.toString(),
    MODULE_MIGRATIONS_DIRECTORY: join(work, 'migrations'),
    MODULE_SCHEMA: setting('MODULE_SCHEMA'),
    MODULE_EXPECTED_MIGRATION_VERSION: setting('MODULE_EXPECTED_MIGRATION_VERSION'),
    MODULE_APPEND_ONLY_TABLES: setting('MODULE_APPEND_ONLY_TABLES'),
    MODULE_READ_ONLY_TABLES: setting('MODULE_READ_ONLY_TABLES'),
  },
});
const migrationVersion = setting('MODULE_EXPECTED_MIGRATION_VERSION');
check(`migrate CMMS to ${migrationVersion} with the real runner`, migrate.status === 0, `${migrate.stdout}${migrate.stderr}`.trim().split('\n').pop());

// 2. The built CMMS API with a throwaway signing key.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
let apiLog = '';
const api = spawn(process.execPath, [join(root, 'modules/physical-operations-cmms/apps/api/dist/main.js')], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    CMMS_API_HOST: '127.0.0.1',
    CMMS_API_PORT: String(PORT),
    CMMS_DATABASE_URL: runtimeUrl.toString(),
    CMMS_DATABASE_POOL_SIZE: '2',
    CMMS_EXPECTED_MIGRATION_VERSION: migrationVersion,
    CMMS_CORS_ORIGINS: 'http://127.0.0.1:5180',
    CMMS_PLATFORM_CONTEXT_AUDIENCE: gateway.audience,
    CMMS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  },
});
api.stdout.on('data', (chunk) => (apiLog += chunk));
api.stderr.on('data', (chunk) => (apiLog += chunk));
let ready = false;
for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  ready = await fetch(`${BASE}/v1/health/ready`).then((r) => r.ok).catch(() => false);
}
check(`the built CMMS API starts on migration ${migrationVersion}`, ready, ready ? '' : apiLog.split('\n').slice(-5).join(' | '));
if (!ready) {
  api.kill();
  await admin.end();
  console.log('\nThe CMMS API did not start; no route was checked.');
  process.exit(1);
}

const tenantA = randomUUID();
const tenantB = randomUUID();
function token(tenantId, permissions) {
  const subject = {
    user: { id: randomUUID() },
    tenant: { id: tenantId, entitlements: [{ moduleKey: MODULE_KEY, status: 'ENABLED', version: '1' }] },
    roles: ['MAINTENANCE_PLANNER'],
    platformRoles: [],
    permissions,
    authVersion: 1,
    session: { id: randomUUID() },
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
    organizationScope: { mode: 'TENANT' },
  };
  return signPlatformContextToken(buildPlatformContext(subject, MODULE_KEY, gateway.audience), privateKeyPem);
}

/** One screen call: allowed by the gateway for its method, signed with only the permission the gateway requires. */
async function screen(method, path, body, { tenantId = tenantA, permissions } = {}) {
  const required = gatewayPermission(method, path);
  const granted = permissions ?? (required ? [required].flat().slice(0, 1) : []);
  const response = await fetch(`${BASE}/${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token(tenantId, granted)}`,
      'X-Correlation-Id': randomUUID(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text, routed: Boolean(required) };
}
const success = (r) => r.routed && r.status >= 200 && r.status < 300;
const listed = (r, minimum = 1) => success(r) && Array.isArray(r.json?.items) && r.json.items.length >= minimum;
const shown = (r) => `${r.routed ? '' : 'NOT ROUTED '}${r.status} ${r.text.slice(0, 160)}`;

try {
  // 3. Spaces: the tree and a space's assets answer { items }; the CAD layer reaches `cad-layers`.
  const site = await screen('POST', 'v1/spaces', { code: 'SITE-1', name: 'Proof plant', spaceType: 'SITE' });
  check('spaces: create a site', success(site) && site.json?.id, shown(site));
  const tree = await screen('GET', 'v1/spaces/tree');
  check('spaces: the tree answers { items } with the site', listed(tree) && tree.json.items[0].id === site.json?.id, shown(tree));
  const cad = await screen('POST', `v1/spaces/${site.json?.id}/cad-layers`, { cadLayer: { type: 'FeatureCollection', features: [] } });
  check('spaces: upload a CAD layer', success(cad), shown(cad));
  check("spaces: the screen's old `cad-layer` path is not routed", !gatewayPermission('POST', `v1/spaces/${site.json?.id}/cad-layer`));

  // 4. Classifications and spec definitions.
  const pumps = await screen('POST', 'v1/classifications', { code: 'PUMP', name: 'Pumps' });
  check('classifications: create', success(pumps) && pumps.json?.id, shown(pumps));
  const classTree = await screen('GET', 'v1/classifications/tree');
  check('classifications: the tree answers { items }', listed(classTree), shown(classTree));
  const oneClass = await screen('GET', `v1/classifications/${pumps.json?.id}`);
  check('classifications: read one', success(oneClass) && oneClass.json?.code === 'PUMP', shown(oneClass));
  const renamed = await screen('PATCH', `v1/classifications/${pumps.json?.id}`, { expectedVersion: oneClass.json?.version, description: 'Centrifugal pumps' });
  check('classifications: update', success(renamed), shown(renamed));
  const flow = await screen('POST', 'v1/classifications/spec-definitions', {
    classificationId: pumps.json?.id, attributeKey: 'flow_rate', label: 'Flow rate', dataType: 'NUMBER', uom: 'm3/h',
  });
  check('classifications: add a spec definition', success(flow) && flow.json?.id, shown(flow));
  const specDefs = await screen('GET', `v1/classifications/${pumps.json?.id}/spec-definitions`);
  check('classifications: spec definitions answer { items }', listed(specDefs), shown(specDefs));

  // 5. Assets: specs (PUT), the equipment tree, the space's assets and a status cascade.
  const pump = await screen('POST', 'v1/assets', { assetTag: 'P-101', name: 'Feed pump', classificationId: pumps.json?.id, spaceId: site.json?.id });
  check('assets: create a pump in the site', success(pump) && pump.json?.id, shown(pump));
  const inSpace = await screen('GET', `v1/spaces/${site.json?.id}/assets`);
  check("spaces: a space's assets answer { items } with the pump", listed(inSpace) && inSpace.json.items.some((a) => a.id === pump.json?.id), shown(inSpace));
  const setSpecs = await screen('PUT', `v1/assets/${pump.json?.id}/specs`, { specs: [{ specDefinitionId: flow.json?.id, valueNumber: 12.5 }] });
  check('assets: set specs with PUT', success(setSpecs), shown(setSpecs));
  const specs = await screen('GET', `v1/assets/${pump.json?.id}/specs`);
  check('assets: specs answer { items } with the value', listed(specs) && JSON.stringify(specs.json.items).includes('12.5'), shown(specs));
  const equipment = await screen('GET', `v1/assets/${pump.json?.id}/equipment-tree`);
  check('assets: the equipment tree', success(equipment) && equipment.json?.id === pump.json?.id, shown(equipment));

  // 6. Job plans, meter triggers and telemetry.
  const plan = await screen('POST', 'v1/job-plans', {
    code: 'JP-PUMP', title: 'Pump inspection', classificationId: pumps.json?.id, tasks: [{ sequence: 1, label: 'Check the seals' }],
  });
  check('job plans: create', success(plan) && plan.json?.id, shown(plan));
  const plans = await screen('GET', `v1/job-plans?classificationId=${pumps.json?.id}`);
  check('job plans: list answers { items }', listed(plans), shown(plans));
  const onePlan = await screen('GET', `v1/job-plans/${plan.json?.id}`);
  check('job plans: read one', success(onePlan), shown(onePlan));
  const planUpdate = await screen('PATCH', `v1/job-plans/${plan.json?.id}`, { expectedVersion: onePlan.json?.version, title: 'Pump inspection (quarterly)' });
  check('job plans: update', success(planUpdate), shown(planUpdate));
  const meter = await screen('POST', 'v1/meters', { assetId: pump.json?.id, name: 'Run hours', unit: 'h', readingType: 'COUNTER' });
  check('meters: create a run-hours meter', success(meter) && meter.json?.id, shown(meter));
  const trigger = await screen('POST', 'v1/meters/triggers', {
    meterId: meter.json?.id, triggerType: 'USAGE_INTERVAL', intervalValue: 500, workOrderTitle: 'Service the pump', jobPlanId: plan.json?.id,
  });
  check('meter triggers: create', success(trigger) && trigger.json?.id, shown(trigger));
  const triggers = await screen('GET', `v1/meters/triggers?meterId=${meter.json?.id}`);
  check('meter triggers: list answers { items }', listed(triggers), shown(triggers));
  const triggerUpdate = await screen('PATCH', `v1/meters/triggers/${trigger.json?.id}`, { expectedVersion: trigger.json?.version, workOrderPriority: 'MEDIUM' });
  check('meter triggers: update', success(triggerUpdate), shown(triggerUpdate));
  const telemetry = await screen('POST', 'v1/meters/telemetry/batch', { readings: [{ meterId: meter.json?.id, requestKey: randomUUID(), value: 10 }] });
  check('meters: a telemetry batch is ingested', success(telemetry) && telemetry.json?.processedCount === 1, shown(telemetry));
  const triggerDelete = await screen('DELETE', `v1/meters/triggers/${trigger.json?.id}`);
  check('meter triggers: DELETE answers 204', triggerDelete.routed && triggerDelete.status === 204, shown(triggerDelete));

  // 7. Failure codes.
  const codes = {};
  for (const [type, code, description] of [['PROBLEM', 'LEAK', 'Seal leak'], ['CAUSE', 'WEAR', 'Seal wear'], ['REMEDY', 'RESEAL', 'Replace the seal']]) {
    const created = await screen('POST', 'v1/failure-codes', { type, code, description, classificationId: pumps.json?.id });
    check(`failure codes: create a ${type.toLowerCase()} code`, success(created) && created.json?.id, shown(created));
    codes[type] = created.json;
  }
  const problems = await screen('GET', 'v1/failure-codes?type=PROBLEM');
  check('failure codes: list answers { items }', listed(problems), shown(problems));
  const hierarchy = await screen('GET', 'v1/failure-codes/tree');
  check('failure codes: the tree answers { items }', listed(hierarchy), shown(hierarchy));
  const codeUpdate = await screen('PATCH', `v1/failure-codes/${codes.PROBLEM?.id}`, { expectedVersion: codes.PROBLEM?.version, description: 'Mechanical seal leak' });
  check('failure codes: update', success(codeUpdate), shown(codeUpdate));

  // 8. A work order: apply the job plan and record the failure attribution, both with the work order's version.
  const order = await screen('POST', 'v1/work-orders', { requestKey: randomUUID(), type: 'REACTIVE', title: 'Fix the seal leak', assetId: pump.json?.id });
  check('work orders: create one for the pump', success(order) && order.json?.id, shown(order));
  const applied = await screen('POST', `v1/job-plans/${plan.json?.id}/apply-to-work-order/${order.json?.id}`, { expectedVersion: order.json?.version });
  check('job plans: apply to the work order', success(applied), shown(applied));
  const stale = await screen('POST', `v1/work-orders/${order.json?.id}/failure-attribution`, {
    expectedVersion: order.json?.version, failureProblemId: codes.PROBLEM?.id,
  });
  check('work orders: an attribution against the old version is refused (409)', stale.status === 409, shown(stale));
  const attributed = await screen('POST', `v1/work-orders/${order.json?.id}/failure-attribution`, {
    expectedVersion: order.json?.version + 1, failureProblemId: codes.PROBLEM?.id, failureCauseId: codes.CAUSE?.id, failureRemedyId: codes.REMEDY?.id,
  });
  check('work orders: record the failure attribution against the new version', success(attributed), shown(attributed));
  const after = await screen('GET', `v1/work-orders/${order.json?.id}`);
  check('work orders: the job plan tasks, the codes and two new versions are on the order', success(after)
    && after.json?.version === order.json?.version + 2
    && JSON.stringify(after.json).includes('Check the seals')
    && after.json?.failureProblemId === codes.PROBLEM?.id, shown(after));
  const withoutVersion = await screen('POST', `v1/job-plans/${plan.json?.id}/apply-to-work-order/${order.json?.id}`, {});
  check('job plans: applying without the version (the old screen call) is refused', withoutVersion.status === 400, shown(withoutVersion));

  // 9. Storerooms, balances (PUT), issue and return to the work order, and its TCO.
  const seal = await screen('POST', 'v1/parts', { partNumber: 'SEAL-01', name: 'Mechanical seal', currencyCode: 'USD', unitCost: 40 });
  check('parts: create a seal', success(seal) && seal.json?.id, shown(seal));
  const store = await screen('POST', 'v1/parts/storerooms', { code: 'MAIN', name: 'Main store' });
  check('storerooms: create', success(store) && store.json?.id, shown(store));
  const stores = await screen('GET', 'v1/parts/storerooms');
  check('storerooms: list answers { items }', listed(stores), shown(stores));
  const storeUpdate = await screen('PATCH', `v1/parts/storerooms/${store.json?.id}`, { expectedVersion: store.json?.version, description: 'Main stores' });
  check('storerooms: update', success(storeUpdate), shown(storeUpdate));
  const balance = await screen('PUT', 'v1/parts/balances', { partId: seal.json?.id, storeroomId: store.json?.id, quantityOnHand: 10 });
  check('balances: set with PUT', success(balance), shown(balance));
  const balances = await screen('GET', `v1/parts/balances?partId=${seal.json?.id}`);
  check('balances: list answers { items } with 10 on hand', listed(balances) && JSON.stringify(balances.json.items).includes('10'), shown(balances));
  const issueKey = randomUUID();
  const issue = { partId: seal.json?.id, quantity: 2, storeroomId: store.json?.id, idempotencyKey: issueKey };
  const issued = await screen('POST', `v1/parts/work-orders/${order.json?.id}/issue`, issue);
  check('parts: issue two seals to the work order', success(issued), shown(issued));
  const reissued = await screen('POST', `v1/parts/work-orders/${order.json?.id}/issue`, issue);
  const afterIssue = await screen('GET', `v1/parts/balances?partId=${seal.json?.id}`);
  check('parts: the same issue sent twice takes stock once (8 left)', success(reissued) && reissued.json?.movement?.id === issued.json?.movement?.id
    && afterIssue.json?.items?.[0]?.quantityOnHand === 8, `${shown(reissued)} | ${shown(afterIssue)}`);
  const returned = await screen('POST', `v1/parts/work-orders/${order.json?.id}/return`, { partId: seal.json?.id, quantity: 1, storeroomId: store.json?.id, idempotencyKey: randomUUID() });
  check('parts: return one seal', success(returned), shown(returned));
  const tco = await screen('GET', `v1/parts/work-orders/${order.json?.id}/tco`);
  check('parts: the work order TCO', success(tco), shown(tco));

  // 10. Deletes of records nothing depends on, and a status cascade.
  const spareCode = await screen('POST', 'v1/failure-codes', { type: 'PROBLEM', code: 'SPARE', description: 'Spare code' });
  const codeDelete = await screen('DELETE', `v1/failure-codes/${spareCode.json?.id}`);
  check('failure codes: DELETE answers 204', codeDelete.routed && codeDelete.status === 204, shown(codeDelete));
  const spareStore = await screen('POST', 'v1/parts/storerooms', { code: 'SPARE', name: 'Spare store' });
  const storeDelete = await screen('DELETE', `v1/parts/storerooms/${spareStore.json?.id}`);
  check('storerooms: DELETE answers 204', storeDelete.routed && storeDelete.status === 204, shown(storeDelete));
  const spareClass = await screen('POST', 'v1/classifications', { code: 'SPARE', name: 'Spare class' });
  const classDelete = await screen('DELETE', `v1/classifications/${spareClass.json?.id}`);
  check('classifications: DELETE succeeds', success(classDelete), shown(classDelete));
  const spareSpace = await screen('POST', 'v1/spaces', { code: 'SPARE', name: 'Spare space', spaceType: 'ZONE' });
  const spaceDelete = await screen('DELETE', `v1/spaces/${spareSpace.json?.id}`);
  check('spaces: DELETE succeeds', success(spaceDelete), shown(spaceDelete));
  // A cascade changes the asset's descendants, so the pump gets a motor first.
  const motor = await screen('POST', 'v1/assets', { assetTag: 'M-101', name: 'Pump motor', parentAssetId: pump.json?.id });
  const cascade = await screen('POST', `v1/assets/${pump.json?.id}/cascade-status`, { targetStatus: 'OFFLINE', reason: 'Proof shutdown' });
  check("assets: cascade a status to the pump's motor", success(motor) && success(cascade) && cascade.json?.affectedCount === 1, shown(cascade));

  // 11. Refusals.
  const otherTenant = await screen('GET', `v1/classifications/${pumps.json?.id}`, undefined, { tenantId: tenantB });
  check("another tenant's classification answers 404", otherTenant.status === 404, shown(otherTenant));
  const readOnly = await screen('POST', 'v1/classifications', { code: 'NOPE', name: 'Refused' }, { permissions: ['cmms.assets.read'] });
  check('a read-only user cannot create a classification (403)', readOnly.status === 403, shown(readOnly));
} finally {
  api.kill();
  await admin.end();
}
const serverErrors = apiLog.split('\n').filter((line) => /error|exception/i.test(line) && !/"level":30/.test(line));
if (process.env.U19A_PROOF_SHOW_API_ERRORS && serverErrors.length) console.log(`\nCMMS API errors:\n${serverErrors.slice(0, 40).join('\n')}`);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
