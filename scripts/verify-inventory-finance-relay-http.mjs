#!/usr/bin/env node
// WI-OI-120bp (F2.7): Inventory ⇄ Finance signed relays over HTTP on an isolated database and module host.
// Completes a goods receipt, waits for both outbox relays, checks Finance posting, Inventory posting status and period replica.
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
const PROOF_MODULES = Object.entries(modules)
  .filter(([, module]) => module.hosting === 'host')
  .map(([name]) => name);
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
  // Additive migrations grant to the canonical module runtime role. This proof
  // uses its own disposable database, so the canonical role name is isolated.
  url.username = `${schema}_runtime`;
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
  if (run.status !== 0) console.error(run.stderr.slice(-2500));
}

const platformKeys = generateKeyPairSync('ed25519');
const platformPublicBase64 = platformKeys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const platformPrivatePem = platformKeys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

const inventoryToFinanceKeys = generateKeyPairSync('ed25519');
const inventoryToFinancePublicBase64 = inventoryToFinanceKeys.publicKey
  .export({ format: 'der', type: 'spki' })
  .toString('base64');
const inventoryToFinancePrivateBase64 = inventoryToFinanceKeys.privateKey
  .export({ format: 'der', type: 'pkcs8' })
  .toString('base64');

const financeToInventoryKeys = generateKeyPairSync('ed25519');
const financeToInventoryPublicBase64 = financeToInventoryKeys.publicKey
  .export({ format: 'der', type: 'spki' })
  .toString('base64');
const financeToInventoryPrivateBase64 = financeToInventoryKeys.privateKey
  .export({ format: 'der', type: 'pkcs8' })
  .toString('base64');

const hostEnv = {
  ...process.env,
  NODE_ENV: 'production',
  MODULE_HOST_API_HOST: '127.0.0.1',
  MODULE_HOST_API_PORT: String(PORT),
  MODULE_HOST_CORS_ORIGINS: 'http://127.0.0.1:5180',
  FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64: inventoryToFinancePublicBase64,
  FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64: inventoryToFinancePrivateBase64,
  INVENTORY_RELAY_FINANCE_URL: BASE,
  INVENTORY_RELAY_FINANCE_INBOX_PATH: '/financial-operations/internal/v1/inbox',
  INVENTORY_RELAY_INTERVAL_MS: '400',
  INVENTORY_INBOX_RELAY_PUBLIC_KEY_BASE64: financeToInventoryPublicBase64,
  FINANCE_INVENTORY_INBOX_RELAY_PRIVATE_KEY_BASE64: financeToInventoryPrivateBase64,
  FINANCE_RELAY_INVENTORY_URL: BASE,
  FINANCE_RELAY_INVENTORY_INBOX_PATH: '/universal-inventory/internal/v1/inbox',
  FINANCE_INVENTORY_RELAY_INTERVAL_MS: '400',
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
host.stdout.on('data', (chunk) => {
  hostLog += chunk;
  if (hostLog.length > 200_000) hostLog = hostLog.slice(-200_000);
});
host.stderr.on('data', (chunk) => {
  hostLog += chunk;
  if (hostLog.length > 200_000) hostLog = hostLog.slice(-200_000);
});

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

  const invRelays = await call('universal-inventory', 'GET', '/v1/health/relays');
  check(
    'Inventory → Finance relay configured',
    ok(invRelays) &&
      invRelays.json?.relays?.some(
        (r) => r.relay?.includes('inventory') && r.relay?.includes('gigalibs-finance-inbox') && r.state !== 'not-configured',
      ),
    invRelays.text.slice(0, 120),
  );
  const finRelays = await call('financial-operations', 'GET', '/v1/health/relays');
  check(
    'Finance → Inventory relay configured',
    ok(finRelays) &&
      finRelays.json?.relays?.some(
        (r) => r.relay?.includes('finance') && r.relay?.includes('gigalibs-inventory-inbox') && r.state !== 'not-configured',
      ),
    finRelays.text.slice(0, 120),
  );

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
  if (!period?.id) throw new Error('Expected an October 2026 fiscal period from standard year generation.');

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

  // The receipt fact must name an active owning unit and its explicit Finance
  // cost profile. The isolated fixture receives one synthetic organization version.
  const orgUnitId = 'unit-if2-proof';
  await admin.query(
    `INSERT INTO gigalibs_inventory.org_replica_versions
       (tenant_id, version_id, tree_id, tree_kind, version_number, checksum, status, unit_count, ready_at)
     VALUES ($1, 'if2-proof-v1', 'if2-proof-tree', 'PRIMARY', 1, $2, 'READY', 1, now())`,
    [tenant, `sha256:${'0'.repeat(64)}`],
  );
  await admin.query(
    `INSERT INTO gigalibs_inventory.org_replica_units
       (tenant_id, version_id, unit_id, code, name, sort_order, status, holds_records, type_code)
     VALUES ($1, 'if2-proof-v1', $2, $2, 'IF2 proof unit', 0, 'ACTIVE', true, 'OPERATING_UNIT')`,
    [tenant, orgUnitId],
  );
  await admin.query(
    `INSERT INTO gigalibs_inventory.org_replica_closure
       (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth)
     VALUES ($1, 'if2-proof-v1', $2, $2, 0)`,
    [tenant, orgUnitId],
  );
  const valuation = await call('universal-inventory', 'PUT', '/v1/valuation-settings', {
    orgUnitId, valuationMethod: 'FIFO', financeCostProfileId: profile.json?.id,
  });
  check('inventory: owning-unit Finance cost profile', ok(valuation), valuation.text.slice(0, 120));

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

  const productCost = await call(
    'financial-operations',
    'POST',
    '/v1/costing/product-standard-costs',
    {
      costProfileId: profile.json?.id,
      productId: product.json?.id,
      standardUnitCostScaled: '2500000',
      effectiveFrom: '2026-01-01',
      changeReason: 'WI-OI-120bq F2.7 proof seed',
    },
    { 'Idempotency-Key': randomUUID() },
  );
  check('finance: per-product standard cost (H3)', ok(productCost), productCost.text.slice(0, 120));

  const warehouse = await call('universal-inventory', 'POST', '/v1/records/inventory.warehouses', {
    code: 'WH-IF2',
    name: 'IF2 warehouse',
    'warehouse-type': 'PHYSICAL',
    'org-unit-id': orgUnitId,
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

  async function waitForReceiptFinancePosted(targetReceiptId) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await sleep(500);
      const receiptRead = await call('universal-inventory', 'GET', `/v1/records/inventory.receipts/${targetReceiptId}`);
      if (receiptRead.json?.['finance-posting-status'] === 'POSTED') return true;
    }
    return false;
  }

  async function completeGoodsReceipt(productId, quantity) {
    const draft = await call(
      'universal-inventory',
      'POST',
      '/v1/records/inventory.receipts',
      { 'warehouse-id': warehouseId },
      { 'Idempotency-Key': randomUUID() },
    );
    const id = draft.json?.id;
    await call(
      'universal-inventory',
      'POST',
      '/v1/records/inventory.receipt-lines',
      {
        'receipt-id': id,
        'product-id': productId,
        'uom-id': uom.json?.id,
        'expected-quantity': quantity,
        'target-location-id': location.json?.id,
      },
      { 'Idempotency-Key': randomUUID() },
    );
    const done = await call(
      'universal-inventory',
      'POST',
      `/v1/records/inventory.receipts/${id}/actions/complete`,
      {},
      { 'Idempotency-Key': randomUUID() },
    );
    check('inventory: receipt completed', ok(done) && done.json?.status === 'COMPLETED', done.text.slice(0, 100));
    return id;
  }

  check('inventory: finance-posting-status POSTED (product A)', await waitForReceiptFinancePosted(receiptId), receiptId);

  const barcode = await call('universal-inventory', 'POST', '/v1/barcodes/resolve', { rawCode: 'RCV' });
  check('inventory: scanner resolves an owned locator', ok(barcode) &&
    barcode.json?.matchedEntityId === location.json?.id, barcode.text.slice(0, 100));
  const atp = await call('universal-inventory', 'POST', '/v1/atp/check', {
    requestKey: randomUUID(), warehouseId, productId: product.json?.id,
    uomId: uom.json?.id, requestedQuantity: '1.000000',
  });
  check('inventory: exact ATP over signed HTTP', ok(atp) && atp.json?.decision === 'AVAILABLE', atp.text.slice(0, 100));
  const staging = await call('universal-inventory', 'POST', '/v1/records/inventory.locations', {
    'warehouse-id': warehouseId, code: 'STAGE', name: 'Stage', 'location-type': 'STAGING',
  }, { 'Idempotency-Key': randomUUID() });
  const moved = await call('universal-inventory', 'POST', '/v1/movements', {
    documentType: 'IF2_PROOF_PUTAWAY', reason: 'PUTAWAY', correlationId: randomUUID(),
    idempotencyKey: randomUUID(), sourceWarehouseId: warehouseId,
    sourceLocationId: location.json?.id, targetWarehouseId: warehouseId,
    targetLocationId: staging.json?.id, productId: product.json?.id,
    uomId: uom.json?.id, quantity: '1.000000', stockStatus: 'AVAILABLE',
  });
  check('inventory: signed internal putaway movement', ok(staging) && ok(moved), moved.text.slice(0, 100));
  const reversed = await call('universal-inventory', 'POST',
    `/v1/movements/${moved.json?.transaction?.id}/reverse`);
  check('inventory: signed counter-movement restores putaway', ok(reversed) &&
    reversed.json?.transaction?.documentReferenceId === moved.json?.transaction?.id,
    reversed.text.slice(0, 100));

  const productB = await call(
    'product-catalogue',
    'POST',
    '/v1/products',
    {
      code: 'IF2-WASHER',
      name: 'IF2 washer',
      productType: 'GOOD',
      baseUomId: uom.json?.id,
      isSold: true,
      isPurchased: true,
      isStocked: true,
    },
    { 'Idempotency-Key': randomUUID() },
  );
  check('catalogue: second product (H3)', ok(productB), productB.text.slice(0, 80));
  const productBCost = await call(
    'financial-operations',
    'POST',
    '/v1/costing/product-standard-costs',
    {
      costProfileId: profile.json?.id,
      productId: productB.json?.id,
      standardUnitCostScaled: '4000000',
      effectiveFrom: '2026-01-01',
      changeReason: 'WI-OI-120bq two-product proof',
    },
    { 'Idempotency-Key': randomUUID() },
  );
  check('finance: second per-product standard cost (H3)', ok(productBCost), productBCost.text.slice(0, 120));
  const receiptBId = await completeGoodsReceipt(productB.json?.id, '2.000');
  check('inventory: finance-posting-status POSTED (product B)', await waitForReceiptFinancePosted(receiptBId), receiptBId);

  const layerCosts = await admin.query(
    `SELECT product_id, unit_cost_scaled::text AS unit_cost_scaled
       FROM gigalibs_finance.inventory_cost_layers
      WHERE tenant_id = $1 AND product_id = ANY($2::uuid[])
      ORDER BY product_id, created_at DESC`,
    [tenant, [product.json?.id, productB.json?.id]],
  );
  const costA = layerCosts.rows.find((row) => row.product_id === product.json?.id)?.unit_cost_scaled;
  const costB = layerCosts.rows.find((row) => row.product_id === productB.json?.id)?.unit_cost_scaled;
  check(
    'finance: two products post at different standard unit costs (H3)',
    costA === '2500000' && costB === '4000000' && costA !== costB,
    JSON.stringify({ costA, costB }),
  );

  const mismatchedProfile = await call('financial-operations', 'POST', '/v1/costing/profiles', {
    code: 'IF2-MISMATCH', name: 'IF2 mismatch proof', costingMethod: 'STANDARD',
    ...accounts, standardUnitCostScaled: '2500000', isDefault: false,
  });
  check('finance: alternate method profile for rejection proof', ok(mismatchedProfile),
    mismatchedProfile.text.slice(0, 100));
  await call('universal-inventory', 'PUT', '/v1/valuation-settings', {
    orgUnitId, valuationMethod: 'FIFO', financeCostProfileId: mismatchedProfile.json?.id,
  });
  const mismatchedReceiptId = await completeGoodsReceipt(product.json?.id, '1.000');
  let mismatchRejected = false;
  for (let attempt = 0; attempt < 40 && !mismatchRejected; attempt += 1) {
    await sleep(500);
    const read = await call('universal-inventory', 'GET',
      `/v1/records/inventory.receipts/${mismatchedReceiptId}`);
    mismatchRejected = read.json?.['finance-posting-status'] === 'POSTING_REJECTED' &&
      read.json?.['finance-posting-rejection-code'] === 'FINANCE_COST_METHOD_MISMATCH';
  }
  check('inventory: mismatched organization cost method rejected', mismatchRejected, mismatchedReceiptId);
  await call('universal-inventory', 'PUT', '/v1/valuation-settings', {
    orgUnitId, valuationMethod: 'FIFO', financeCostProfileId: profile.json?.id,
  });
  const republished = await call('universal-inventory', 'POST',
    `/v1/receipts/${mismatchedReceiptId}/retry-posting`, { requestKey: randomUUID() });
  check('inventory: safe Finance retry republishes the receipt fact', ok(republished) &&
    republished.json?.financePostingStatus === 'AWAITING_POSTING', republished.text.slice(0, 100));
  check('inventory: corrected profile posts after replay',
    await waitForReceiptFinancePosted(mismatchedReceiptId), mismatchedReceiptId);

  const productC = await call(
    'product-catalogue',
    'POST',
    '/v1/products',
    {
      code: 'IF2-NOCOST',
      name: 'IF2 no cost yet',
      productType: 'GOOD',
      baseUomId: uom.json?.id,
      isSold: true,
      isPurchased: true,
      isStocked: true,
    },
    { 'Idempotency-Key': randomUUID() },
  );
  check('catalogue: product without standard cost (H2)', ok(productC), productC.text.slice(0, 80));
  const receiptCId = await completeGoodsReceipt(productC.json?.id, '1.000');

  let inboxFailed = false;
  let failedMessageId = null;
  for (let attempt = 0; attempt < 120 && !inboxFailed; attempt += 1) {
    await sleep(500);
    const inboxRow = await admin.query(
      `SELECT message_id, status, last_error_code
         FROM gigalibs_finance.inbox_receipts
        WHERE tenant_id = $1 AND consumer_name = 'finance.inventory-subledger' AND correlation_id = $2`,
      [tenant, receiptCId],
    );
    if (inboxRow.rows[0]?.status === 'FAILED' && inboxRow.rows[0]?.last_error_code === 'FINANCE_STANDARD_COST_MISSING') {
      inboxFailed = true;
      failedMessageId = inboxRow.rows[0]?.message_id;
    }
  }
  check('finance: missing standard cost → inbox FAILED (H2/H3)', inboxFailed, failedMessageId ?? receiptCId);

  const lockWhileFailed = await call('financial-operations', 'PUT', `/v1/fiscal-periods/${period.id}/status`, {
    status: 'LOCKED',
  });
  check(
    'finance: period lock refused while failed receipt posting in period (H2)',
    lockWhileFailed.status === 409,
    lockWhileFailed.text.slice(0, 160),
  );

  const productCCost = await call(
    'financial-operations',
    'POST',
    '/v1/costing/product-standard-costs',
    {
      costProfileId: profile.json?.id,
      productId: productC.json?.id,
      standardUnitCostScaled: '1000000',
      effectiveFrom: '2026-01-01',
      changeReason: 'WI-OI-120bq retry after cost added',
    },
    { 'Idempotency-Key': randomUUID() },
  );
  check('finance: standard cost added for retry (H2)', ok(productCCost), productCCost.text.slice(0, 120));

  const retried = await call(
    'financial-operations',
    'POST',
    `/v1/subledger/inventory/postings/${failedMessageId}/retry`,
    { reason: 'WI-OI-120bq F2.7 proof retry after standard cost' },
  );
  check('finance: subledger retry after cost fix (H2)', ok(retried), retried.text.slice(0, 120));
  check(
    'inventory: finance-posting-status POSTED after retry (H2)',
    await waitForReceiptFinancePosted(receiptCId),
    receiptCId,
  );

  let balanced = false;
  let reconciliation = null;
  for (let attempt = 0; attempt < 45 && !balanced; attempt += 1) {
    await sleep(400);
    const recon = await call('financial-operations', 'GET', '/v1/subledger/inventory/posting-reconciliation');
    reconciliation = recon.json;
    balanced = Boolean(recon.json?.balanced);
  }
  check('finance: posting reconciliation balanced after relay', balanced, JSON.stringify(reconciliation).slice(0, 160));

  let replicaReady = false;
  for (let attempt = 0; attempt < 45 && !replicaReady; attempt += 1) {
    await sleep(400);
    const meta = await admin.query(
      `SELECT initial_sync_completed_at FROM gigalibs_inventory.finance_period_replica_meta WHERE tenant_id = $1`,
      [tenant],
    );
    replicaReady = Boolean(meta.rows[0]?.initial_sync_completed_at);
  }
  check('inventory: fiscal period replica initial sync after snapshot-completed', replicaReady, JSON.stringify({ tenant }));

  let financeOutcomePublished = false;
  for (let attempt = 0; attempt < 120 && !financeOutcomePublished; attempt += 1) {
    await sleep(500);
    const financeOutbox = await admin.query(
      `SELECT status FROM gigalibs_finance.outbox_events
        WHERE tenant_id = $1 AND event_type = 'finance.inventory-receipt.posting-outcome.v1'
          AND aggregate_id = $2`,
      [tenant, receiptId],
    );
    financeOutcomePublished = financeOutbox.rows[0]?.status === 'PUBLISHED';
  }
  check('finance: posting-outcome outbox PUBLISHED', financeOutcomePublished, receiptId);

  let cutoffConfirmed = false;
  for (let attempt = 0; attempt < 90 && !cutoffConfirmed; attempt += 1) {
    await sleep(500);
    const row = await admin.query(
      `SELECT 1 FROM gigalibs_finance.inventory_posting_cutoff_confirmations
        WHERE tenant_id = $1 AND fiscal_period_id = $2 AND undelivered_receipt_count = 0`,
      [tenant, period.id],
    );
    cutoffConfirmed = (row.rowCount ?? 0) > 0;
  }
  check('finance: inventory posting cutoff confirmed (M3)', cutoffConfirmed, period.id);

  const locked = await call('financial-operations', 'PUT', `/v1/fiscal-periods/${period.id}/status`, { status: 'LOCKED' });
  check('finance: lock fiscal period covering receipt date', ok(locked), locked.text.slice(0, 100));

  let periodLockedOnReplica = false;
  for (let attempt = 0; attempt < 45 && !periodLockedOnReplica; attempt += 1) {
    await sleep(400);
    const row = await admin.query(
      `SELECT status FROM gigalibs_inventory.finance_fiscal_period_replica
        WHERE tenant_id = $1 AND fiscal_period_id = $2`,
      [tenant, period.id],
    );
    periodLockedOnReplica = row.rows[0]?.status === 'LOCKED';
  }
  check('inventory: replicated period LOCKED after finance lock', periodLockedOnReplica, period.id);

  const receiptAfterLock = await call('universal-inventory', 'POST', '/v1/records/inventory.receipts', { 'warehouse-id': warehouseId }, { 'Idempotency-Key': randomUUID() });
  const receipt2Id = receiptAfterLock.json?.id;
  await call(
    'universal-inventory',
    'POST',
    '/v1/records/inventory.receipt-lines',
    {
      'receipt-id': receipt2Id,
      'product-id': product.json?.id,
      'uom-id': uom.json?.id,
      'expected-quantity': '1.000',
      'target-location-id': location.json?.id,
    },
    { 'Idempotency-Key': randomUUID() },
  );
  const blocked = await call(
    'universal-inventory',
    'POST',
    `/v1/records/inventory.receipts/${receipt2Id}/actions/complete`,
    {},
    { 'Idempotency-Key': randomUUID() },
  );
  check(
    'inventory: completion refused when replicated period is locked',
    blocked.status === 422 || blocked.status === 400,
    blocked.text.slice(0, 160),
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
