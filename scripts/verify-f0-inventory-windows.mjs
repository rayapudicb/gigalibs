#!/usr/bin/env node
// WI-OI-120f (F0.5): Inventory's metadata windows end to end over HTTP, on an isolated PostgreSQL database.
// Installs every hosted module with the real runner, starts the real module host with a throwaway signing key, and
// drives the record routes the windows use, signed exactly as the web gateway signs them:
// - Catalogue lookups for the product and unit pickers, per tenant;
// - warehouses with a child location;
// - updates with If-Match;
// - field and permission refusals, and another tenant's records;
// - an item, then a receipt with a line, completed once even when the same request is sent twice;
// - the stock balance and the ledger entry that result.
// Needs PROOF_DATABASE_URL (never the UAT instance) and a built module host (`pnpm build`).
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildPlatformContext, signPlatformContextToken } from '../packages/auth-core/dist/index.js';
import { isolatedProofDatabaseUrl } from './lib/isolated-proof-database.mjs';

const root = new URL('../', import.meta.url).pathname;
const pgDirectory = readdirSync(join(root, 'node_modules/.pnpm')).find((name) => /^pg@\d/.test(name));
const { default: pg } = await import(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg/lib/index.js'));

const adminUrl = isolatedProofDatabaseUrl('WI-OI-120f Inventory metadata windows proof');
const modules = JSON.parse(readFileSync(join(root, 'infra/compose/generated/modules.json'), 'utf8'));
const PORT = Number(process.env.F0_PROOF_PORT ?? 47921);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 180)})` : ''}`);
}

// 1. Extensions the control plane normally installs, then every hosted module with the real runner.
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
for (const extension of ['pgcrypto', 'ltree', 'btree_gist']) await admin.query(`CREATE EXTENSION IF NOT EXISTS ${extension} WITH SCHEMA public`);
const work = mkdtempSync(join(tmpdir(), 'f0-proof-'));
cpSync(join(root, 'infra/compose/docker/run-module-migrations.mjs'), join(work, 'run.mjs'));
mkdirSync(join(work, 'node_modules'));
symlinkSync(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg'), join(work, 'node_modules/pg'));
const runtimePassword = randomUUID().replaceAll('-', '');
const runtimeUrl = (schema) => {
  const url = new URL(adminUrl);
  url.username = `${schema}_f0proof`;
  url.password = runtimePassword;
  return url.toString();
};
for (const [name, module] of Object.entries(modules)) {
  const run = spawnSync(process.execPath, [join(work, 'run.mjs')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: adminUrl,
      MODULE_RUNTIME_DATABASE_URL: runtimeUrl(module.schema),
      MODULE_MIGRATIONS_DIRECTORY: join(root, module.directory, 'db/migrations'),
      MODULE_SCHEMA: module.schema,
      MODULE_EXPECTED_MIGRATION_VERSION: String(module.migrationVersion),
      MODULE_APPEND_ONLY_TABLES: (module.appendOnlyTables ?? []).join(','),
      MODULE_READ_ONLY_TABLES: (module.readOnlyTables ?? []).join(','),
    },
  });
  check(`migrate ${name} to ${module.migrationVersion}`, run.status === 0, `${run.stdout}${run.stderr}`.trim().split('\n').pop());
}

// 2. The module host with a throwaway signing key.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const hostEnv = { ...process.env, NODE_ENV: 'production', MODULE_HOST_API_HOST: '127.0.0.1', MODULE_HOST_API_PORT: String(PORT), MODULE_HOST_CORS_ORIGINS: 'http://127.0.0.1:5180' };
for (const module of Object.values(modules)) {
  hostEnv[`${module.prefix}_DATABASE_URL`] = runtimeUrl(module.schema);
  hostEnv[`${module.prefix}_DATABASE_POOL_SIZE`] = '2';
  hostEnv[`${module.prefix}_EXPECTED_MIGRATION_VERSION`] = String(module.migrationVersion);
  hostEnv[`${module.prefix}_PLATFORM_CONTEXT_AUDIENCE`] = module.audience;
  hostEnv[`${module.prefix}_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64`] = publicKeyBase64;
  hostEnv[`${module.prefix}_API_URL`] = `${BASE}${module.basePath}`;
}
let hostLog = '';
const host = spawn(process.execPath, [join(root, 'apps/module-host/dist/main.js')], { env: hostEnv });
host.stdout.on('data', (chunk) => (hostLog += chunk));
host.stderr.on('data', (chunk) => (hostLog += chunk));
let ready = false;
for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  ready = await fetch(`${BASE}/universal-inventory/v1/health/ready`).then((r) => r.ok).catch(() => false);
}
check('module host starts with Inventory on migration 4 and the Catalogue on 2', ready, ready ? '' : hostLog.split('\n').slice(-5).join(' | '));

const tenantA = `f0proof-a-${randomUUID().slice(0, 8)}`;
const tenantB = `f0proof-b-${randomUUID().slice(0, 8)}`;
function token(tenantId, moduleKey, permissions) {
  const module = modules[moduleKey];
  const subject = {
    user: { id: `${tenantId}-user` },
    tenant: { id: tenantId, entitlements: [{ moduleKey: module.catalogKey ?? moduleKey, status: 'ENABLED', version: '1' }] },
    roles: ['TENANT_ADMIN'],
    platformRoles: [],
    permissions,
    authVersion: 1,
    session: { id: randomUUID() },
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
    organizationScope: { mode: 'TENANT' },
  };
  return signPlatformContextToken(buildPlatformContext(subject, module.catalogKey ?? moduleKey, module.audience), privateKeyPem);
}
const ADMIN = ['*'];
async function call(tenantId, moduleKey, method, path, body, headers = {}, permissions = ADMIN) {
  const response = await fetch(`${BASE}${modules[moduleKey].basePath}${path}`, {
    method,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token(tenantId, moduleKey, permissions)}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text, etag: response.headers.get('etag') };
}
const inv = (tenantId, method, path, body, headers, permissions) => call(tenantId, 'universal-inventory', method, path, body, headers, permissions);
const key = () => ({ 'Idempotency-Key': randomUUID() });

try {
  // 3. The Catalogue's pickers, per tenant.
  const uom = await call(tenantA, 'product-catalogue', 'POST', '/v1/uoms', { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'COUNT' }, key());
  const product = await call(tenantA, 'product-catalogue', 'POST', '/v1/products', {
    code: 'BOLT-M8', name: 'Hex bolt M8', productType: 'GOOD', baseUomId: uom.json?.id, isSold: true, isPurchased: true, isStocked: true,
  }, key());
  check('catalogue: a unit and a product are created for tenant A', uom.status === 201 && product.status === 201, `${uom.status} ${product.status} ${product.text.slice(0, 120)}`);
  const productId = product.json?.id ?? product.json?.product?.id;
  const uomId = uom.json?.id;
  const picked = await call(tenantA, 'product-catalogue', 'GET', '/v1/lookups/catalogue-products?search=bolt');
  check('picker: tenant A finds its product by text', picked.status === 200 && picked.json?.some((option) => option.value === productId && /BOLT-M8/.test(option.label)), picked.text);
  const otherPick = await call(tenantB, 'product-catalogue', 'GET', '/v1/lookups/catalogue-products?search=bolt');
  check("picker: tenant B does not see tenant A's product", otherPick.status === 200 && otherPick.json?.length === 0, otherPick.text);

  // 4. Warehouses: create once per key, a child location, and updates with If-Match.
  const createKey = key();
  const warehouse = await inv(tenantA, 'POST', '/v1/records/inventory.warehouses', { code: 'WH-A', name: 'Main warehouse', 'warehouse-type': 'PHYSICAL' }, createKey);
  check('warehouse: created with version 1 and ETag "1"', warehouse.status === 201 && warehouse.json?.version === 1 && warehouse.etag === '"1"' && warehouse.json?.code === 'WH-A', `${warehouse.etag} ${warehouse.text}`);
  const warehouseId = warehouse.json?.id;
  const replay = await inv(tenantA, 'POST', '/v1/records/inventory.warehouses', { code: 'WH-A', name: 'Main warehouse', 'warehouse-type': 'PHYSICAL' }, createKey);
  check('warehouse: the same Idempotency-Key returns the first answer, not a second warehouse', replay.json?.id === warehouseId, replay.text);
  const reused = await inv(tenantA, 'POST', '/v1/records/inventory.warehouses', { code: 'WH-Z', name: 'Other', 'warehouse-type': 'PHYSICAL' }, createKey);
  check('warehouse: the same key with a different body is refused (409)', reused.status === 409, reused.text);
  const location = await inv(tenantA, 'POST', '/v1/records/inventory.locations', { 'warehouse-id': warehouseId, code: 'RCV-01', name: 'Receiving dock', 'location-type': 'RECEIVING' }, key());
  const children = await inv(tenantA, 'GET', `/v1/records/inventory.locations?parentId=${warehouseId}`);
  check('location: created under the warehouse and listed as its child', location.status === 201 && children.json?.total === 1 && children.json.items[0].code === 'RCV-01', `${location.status} ${children.text.slice(0, 120)}`);
  const locationId = location.json?.id;
  const renamed = await inv(tenantA, 'PATCH', `/v1/records/inventory.warehouses/${warehouseId}`, { name: 'Main warehouse (north)' }, { 'If-Match': '"1"' });
  check('warehouse: an update with the current version succeeds and moves to version 2', renamed.status === 200 && renamed.json?.version === 2, renamed.text);
  const stale = await inv(tenantA, 'PATCH', `/v1/records/inventory.warehouses/${warehouseId}`, { name: 'Overwrite' }, { 'If-Match': '"1"' });
  const noVersion = await inv(tenantA, 'PATCH', `/v1/records/inventory.warehouses/${warehouseId}`, { name: 'Overwrite' });
  check('warehouse: a stale version is refused (412) and a missing one too (428)', stale.status === 412 && noVersion.status === 428, `${stale.status} ${noVersion.status}`);

  // 5. Refusals: system-set and unknown fields, permissions, another tenant.
  const systemField = await inv(tenantA, 'POST', '/v1/records/inventory.warehouses', { code: 'WH-X', name: 'X', 'warehouse-type': 'PHYSICAL', 'is-active': false }, key());
  const unknownField = await inv(tenantA, 'POST', '/v1/records/inventory.warehouses', { code: 'WH-Y', name: 'Y', 'warehouse-type': 'PHYSICAL', 'tenant-id': tenantB }, key());
  check('fields: system-set and unknown fields are refused (400)', systemField.status === 400 && unknownField.status === 400, `${systemField.status} ${unknownField.status}`);
  const readOnlyList = await inv(tenantA, 'GET', '/v1/records/inventory.warehouses', undefined, {}, ['inventory:read']);
  const readOnlyCreate = await inv(tenantA, 'POST', '/v1/records/inventory.warehouses', { code: 'WH-R', name: 'R', 'warehouse-type': 'PHYSICAL' }, key(), ['inventory:read']);
  check('permissions: inventory:read lists but may not create (403)', readOnlyList.status === 200 && readOnlyCreate.status === 403, `${readOnlyList.status} ${readOnlyCreate.status}`);
  const otherRead = await inv(tenantB, 'GET', `/v1/records/inventory.warehouses/${warehouseId}`);
  const otherList = await inv(tenantB, 'GET', '/v1/records/inventory.warehouses');
  check("tenants: tenant B gets 404 for tenant A's warehouse and an empty list", otherRead.status === 404 && otherList.json?.total === 0, `${otherRead.status} ${otherList.text.slice(0, 80)}`);
  const whLabel = await inv(tenantA, 'GET', `/v1/lookups/inventory-warehouses?ids=${warehouseId}`);
  check('picker: the warehouse lookup labels by code and name', whLabel.json?.[0]?.label === 'WH-A — Main warehouse (north)', whLabel.text);

  // 6. An item, then a receipt with a line, completed once.
  const item = await inv(tenantA, 'POST', '/v1/records/inventory.items', { 'product-id': productId, 'default-warehouse-id': warehouseId, 'valuation-method': 'STANDARD', 'reorder-point': '10.000' }, key());
  check('item: the product is stocked in Inventory', item.status === 201 && item.json?.['product-id'] === productId, item.text);
  const receipt = await inv(tenantA, 'POST', '/v1/records/inventory.receipts', { 'warehouse-id': warehouseId, 'external-document-reference': 'ASN-1001' }, key());
  const receiptId = receipt.json?.id;
  const line = await inv(tenantA, 'POST', '/v1/records/inventory.receipt-lines', { 'receipt-id': receiptId, 'product-id': productId, 'uom-id': uomId, 'expected-quantity': '5.000', 'target-location-id': locationId }, key());
  check('receipt: a draft receipt takes a numbered line', receipt.status === 201 && receipt.json?.status === 'DRAFT' && line.status === 201 && line.json?.['line-number'] === 1, `${receipt.status} ${line.status} ${line.text.slice(0, 120)}`);
  const completeKey = key();
  const completed = await inv(tenantA, 'POST', `/v1/records/inventory.receipts/${receiptId}/actions/complete`, {}, completeKey);
  const completedAgain = await inv(tenantA, 'POST', `/v1/records/inventory.receipts/${receiptId}/actions/complete`, {}, completeKey);
  check('receipt: Complete posts once; the same request again replays the answer', completed.status === 200 && completed.json?.status === 'COMPLETED' && completedAgain.json?.status === 'COMPLETED', `${completed.status} ${completedAgain.status} ${completed.text.slice(0, 100)}`);
  const secondComplete = await inv(tenantA, 'POST', `/v1/records/inventory.receipts/${receiptId}/actions/complete`, {}, key());
  check('receipt: a new Complete request on a completed receipt is refused (409)', secondComplete.status === 409, secondComplete.text);
  const lateLine = await inv(tenantA, 'POST', '/v1/records/inventory.receipt-lines', { 'receipt-id': receiptId, 'product-id': productId, 'uom-id': uomId, 'expected-quantity': '1.000' }, key());
  check('receipt: a completed receipt takes no new line (409)', lateLine.status === 409, lateLine.text);

  // 7. What the completed receipt produced.
  const balances = await inv(tenantA, 'GET', '/v1/records/inventory.balances');
  const balance = balances.json?.items?.find((row) => row['product-id'] === productId);
  check('balance: 5 on hand at the receiving location', balance && Number(balance['on-hand-quantity']) === 5 && balance['location-id'] === locationId, balances.text.slice(0, 200));
  const ledger = await inv(tenantA, 'GET', '/v1/records/inventory.ledger');
  check('ledger: exactly one entry, even though Complete was sent twice', ledger.json?.total === 1 && ledger.json.items[0].direction === 'DEBIT', ledger.text.slice(0, 200));
  const ledgerNoRight = await inv(tenantA, 'GET', '/v1/records/inventory.ledger', undefined, {}, ['inventory:read']);
  check('ledger: reading it needs inventory:ledger:read (403 without)', ledgerNoRight.status === 403, ledgerNoRight.text);
} finally {
  host.kill('SIGTERM');
  for (const module of Object.values(modules)) {
    await admin.query(`DROP SCHEMA IF EXISTS ${module.schema} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${module.schema}_f0proof`).catch(() => undefined);
  }
  await admin.end();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
