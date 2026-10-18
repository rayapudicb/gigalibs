#!/usr/bin/env node
// WI-OI-120fw (F2.7): Inventory → Finance relay over HTTP on an isolated database and module host.
// Completes a goods receipt, waits for the outbox relay, and checks Finance inbox, reconciliation, and posting status.
//
//   PROOF_DATABASE_URL=postgresql://… node scripts/verify-inventory-finance-relay-http.mjs
//
// Needs a built module host (`pnpm build`) and never uses the UAT instance.
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlatformContext, signPlatformContextToken } from '../packages/auth-core/dist/index.js';
import { isolatedProofDatabaseUrl, NOT_RUN_EXIT_CODE } from './lib/isolated-proof-database.mjs';

const root = new URL('../', import.meta.url).pathname;
const pgDirectory = readdirSync(join(root, 'node_modules/.pnpm')).find((name) => /^pg@\d/.test(name));
if (!pgDirectory) {
  console.error('NOT RUN: pg package missing; run pnpm install.');
  process.exit(NOT_RUN_EXIT_CODE);
}
const { default: pg } = await import(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg/lib/index.js'));

const adminUrl = isolatedProofDatabaseUrl('WI-OI-120fw Inventory→Finance relay HTTP proof');

const modules = JSON.parse(readFileSync(join(root, 'infra/compose/generated/modules.json'), 'utf8'));
const PROOF_MODULES = ['product-catalogue', 'universal-inventory', 'financial-operations'];
const PORT = Number(process.env.IF2_PROOF_PORT ?? 47922);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 160)})` : ''}`);
}
const ok = (r) => r.status >= 200 && r.status < 300;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
for (const extension of ['pgcrypto', 'ltree', 'btree_gist']) {
  await admin.query(`CREATE EXTENSION IF NOT EXISTS ${extension} WITH SCHEMA public`);
}

const work = mkdtempSync(join(tmpdir(), 'if2-proof-'));
cpSync(join(root, 'infra/compose/docker/run-module-migrations.mjs'), join(work, 'run.mjs'));
mkdirSync(join(work, 'node_modules'));
symlinkSync(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg'), join(work, 'node_modules/pg'));
const runtimePassword = randomUUID().replaceAll('-', '');
const runtimeUrl = (schema) => {
  const url = new URL(adminUrl);
  url.username = `${schema}_if2proof`;
  url.password = runtimePassword;
  return url.toString();
};

for (const name of PROOF_MODULES) {
  const module = modules[name];
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

const financeRole = new URL(runtimeUrl(modules['financial-operations'].schema)).username;
await admin.query(
  `GRANT EXECUTE ON FUNCTION gigalibs_inventory.set_receipt_finance_posting_status(character varying, uuid, character varying, character varying) TO ${financeRole}`,
);

const platformKeys = generateKeyPairSync('ed25519');
const platformPublicBase64 = platformKeys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const platformPrivatePem = platformKeys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

const relayKeys = generateKeyPairSync('ed25519');
const relayPublicBase64 = relayKeys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const relayPrivateBase64 = relayKeys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const inventoryDbUrl = runtimeUrl(modules['universal-inventory'].schema);
const hostEnv = {
  ...process.env,
  NODE_ENV: 'production',
  MODULE_HOST_API_HOST: '127.0.0.1',
  MODULE_HOST_API_PORT: String(PORT),
  MODULE_HOST_CORS_ORIGINS: 'http://127.0.0.1:5180',
  FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64: relayPublicBase64,
  FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64: relayPrivateBase64,
  INVENTORY_RELAY_FINANCE_URL: BASE,
  INVENTORY_RELAY_FINANCE_INBOX_PATH: '/financial-operations/internal/v1/inbox',
  INVENTORY_RELAY_INTERVAL_MS: '400',
  FINANCE_INVENTORY_POSTING_DATABASE_URL: inventoryDbUrl,
};

for (const name of PROOF_MODULES) {
  const module = modules[name];
  hostEnv[`${module.prefix}_DATABASE_URL`] = runtimeUrl(module.schema);
  hostEnv[`${module.prefix}_DATABASE_POOL_SIZE`] = '2';
  hostEnv[`${module.prefix}_EXPECTED_MIGRATION_VERSION`] = String(module.migrationVersion);
  hostEnv[`${module.prefix}_PLATFORM_CONTEXT_AUDIENCE`] = module.audience;
  hostEnv[`${module.prefix}_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64`] = platformPublicBase64;
  hostEnv[`${module.prefix}_API_URL`] = `${BASE}${module.basePath}`;
}

let hostLog = '';
const host = spawn(process.execPath, [join(root, 'apps/module-host/dist/main.js')], { env: hostEnv });
host.stdout.on('data', (chunk) => (hostLog += chunk));
host.stderr.on('data', (chunk) => (hostLog += chunk));

let ready = false;
for (let attempt = 0; attempt < 80 && !ready; attempt += 1) {
  await sleep(500);
  const inv = await fetch(`${BASE}/universal-inventory/v1/health/ready`).then((r) => r.ok).catch(() => false);
  const fin = await fetch(`${BASE}/financial-operations/v1/health/ready`).then((r) => r.ok).catch(() => false);
  ready = inv && fin;
}
check('module host ready (Inventory + Finance)', ready, ready ? '' : hostLog.split('\n').slice(-6).join(' | '));

const tenant = `if2-${randomUUID().slice(0, 8)}`;
function token(moduleKey, permissions = ['*']) {
  const module = modules[moduleKey];
  const subject = {
    user: { id: `${tenant}-user` },
    tenant: {
      id: tenant,
      entitlements: PROOF_MODULES.map((key) => ({ moduleKey: key, status: 'ENABLED', version: '1' })),
    },
    roles: ['TENANT_ADMIN'],
    platformRoles: [],
    permissions,
    authVersion: 1,
    session: { id: randomUUID() },
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
    organizationScope: { mode: 'TENANT' },
  };
  return signPlatformContextToken(buildPlatformContext(subject, moduleKey, module.audience), platformPrivatePem);
}
async function call(moduleKey, method, path, body, headers = {}) {
  const response = await fetch(`${BASE}${modules[moduleKey].basePath}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token(moduleKey)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
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
  return { status: response.status, json, text };
}

try {
  if (!ready) throw new Error('host not ready');

  const relays = await call('universal-inventory', 'GET', '/v1/health/relays');
  check('Inventory relay is configured', ok(relays) && relays.json?.relays?.some((r) => r.configured), relays.text.slice(0, 120));

  const book = await call('financial-operations', 'POST', '/v1/books', {
    bookCode: 'IF2-BOOK',
    bookName: 'IF2 proof book',
    legalEntityPartyId: randomUUID(),
    currencyCode: 'USD',
    isPrimary: true,
  });
  check('finance: primary book', ok(book), book.text.slice(0, 120));
  const bookId = book.json?.id;

  const year = await call('financial-operations', 'POST', '/v1/fiscal-years/standard', {
    accountingBookId: bookId,
    year: 2026,
  });
  check('finance: fiscal year 2026', ok(year), year.text.slice(0, 80));
  const period = (year.json?.periods ?? []).find((p) => p.startDate <= '2026-10-18' && p.endDate >= '2026-10-18');

  const account = async (accountCode, accountName, accountClass, accountSubtype, normalBalance) =>
    (
      await call('financial-operations', 'POST', '/v1/accounts', {
        accountingBookId: bookId,
        accountCode,
        accountName,
        accountClass,
        accountSubtype,
        normalBalance,
      })
    ).json?.id;

  const accounts = {
    inventoryGlAccountId: await account('1400', 'Inventory', 'ASSET', 'CURRENT_ASSET', 'DEBIT'),
    grniGlAccountId: await account('2150', 'GRNI', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT'),
    cogsGlAccountId: await account('5000', 'COGS', 'EXPENSE', 'COST_OF_GOODS_SOLD', 'DEBIT'),
    landedCostClearingGlAccountId: await account('2160', 'Landed clearing', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT'),
    purchasePriceVarianceGlAccountId: await account('5100', 'PPV', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'),
    scrapGlAccountId: await account('5200', 'Scrap', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'),
    valuationLossGlAccountId: await account('5300', 'Val loss', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'),
  };
  check('finance: GL accounts for costing', Object.values(accounts).every(Boolean), JSON.stringify(accounts).slice(0, 80));

  const profile = await call('financial-operations', 'POST', '/v1/costing/profiles', {
    code: 'IF2-COST',
    name: 'IF2 default cost',
    costingMethod: 'FIFO',
    ...accounts,
    standardUnitCostScaled: '2500000',
    isDefault: true,
  });
  check('finance: default cost profile with standard cost', ok(profile), profile.text.slice(0, 120));

  const uom = await call('product-catalogue', 'POST', '/v1/uoms', { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'COUNT' }, { 'Idempotency-Key': randomUUID() });
  const product = await call(
    'product-catalogue',
    'POST',
    '/v1/products',
    {
      code: 'IF2-BOLT',
      name: 'IF2 bolt',
      productType: 'GOOD',
      baseUomId: uom.json?.id,
      isSold: true,
      isPurchased: true,
      isStocked: true,
    },
    { 'Idempotency-Key': randomUUID() },
  );
  check('catalogue: product for receipt', ok(uom) && ok(product), `${uom.status} ${product.status}`);

  const warehouse = await call('universal-inventory', 'POST', '/v1/records/inventory.warehouses', {
    code: 'WH-IF2',
    name: 'IF2 warehouse',
    'warehouse-type': 'PHYSICAL',
  }, { 'Idempotency-Key': randomUUID() });
  const warehouseId = warehouse.json?.id;
  const location = await call('universal-inventory', 'POST', '/v1/records/inventory.locations', {
    'warehouse-id': warehouseId,
    code: 'RCV',
    name: 'Receiving',
    'location-type': 'RECEIVING',
  }, { 'Idempotency-Key': randomUUID() });
  check('inventory: warehouse and location', ok(warehouse) && ok(location), warehouse.text.slice(0, 80));

  const receipt = await call('universal-inventory', 'POST', '/v1/records/inventory.receipts', { 'warehouse-id': warehouseId }, { 'Idempotency-Key': randomUUID() });
  const receiptId = receipt.json?.id;
  await call(
    'universal-inventory',
    'POST',
    '/v1/records/inventory.receipt-lines',
    {
      'receipt-id': receiptId,
      'product-id': product.json?.id,
      'uom-id': uom.json?.id,
      'expected-quantity': '4.000',
      'target-location-id': location.json?.id,
    },
    { 'Idempotency-Key': randomUUID() },
  );
  const completed = await call(
    'universal-inventory',
    'POST',
    `/v1/records/inventory.receipts/${receiptId}/actions/complete`,
    {},
    { 'Idempotency-Key': randomUUID() },
  );
  check('inventory: receipt completed', ok(completed) && completed.json?.status === 'COMPLETED', completed.text.slice(0, 100));

  let balanced = false;
  let reconciliation = null;
  for (let attempt = 0; attempt < 45 && !balanced; attempt += 1) {
    await sleep(400);
    const recon = await call('financial-operations', 'GET', '/v1/subledger/inventory/posting-reconciliation');
    reconciliation = recon.json;
    balanced = Boolean(recon.json?.balanced);
  }
  check('finance: posting reconciliation balanced after relay', balanced, JSON.stringify(reconciliation).slice(0, 160));

  const receiptRead = await call('universal-inventory', 'GET', `/v1/records/inventory.receipts/${receiptId}`);
  check(
    'inventory: finance-posting-status POSTED on receipt',
    receiptRead.json?.['finance-posting-status'] === 'POSTED',
    receiptRead.text.slice(0, 120),
  );

  const inbox = await admin.query(
    `SELECT status FROM gigalibs_finance.inbox_receipts
      WHERE tenant_id = $1 AND consumer_name = 'finance.inventory-subledger' AND correlation_id = $2`,
    [tenant, receiptId],
  );
  check('finance: inbox receipt PROCESSED', inbox.rows[0]?.status === 'PROCESSED', JSON.stringify(inbox.rows));

  const outbox = await admin.query(
    `SELECT status FROM gigalibs_inventory.outbox_events
      WHERE tenant_id = $1 AND aggregate_id = $2 AND event_type = 'inventory.receipt.completed.v1'`,
    [tenant, receiptId],
  );
  check('inventory: outbox event PUBLISHED', outbox.rows[0]?.status === 'PUBLISHED', JSON.stringify(outbox.rows));
} finally {
  host.kill('SIGTERM');
  for (const name of PROOF_MODULES) {
    const schema = modules[name].schema;
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${schema}_if2proof`).catch(() => undefined);
  }
  await admin.end();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
