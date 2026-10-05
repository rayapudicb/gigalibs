#!/usr/bin/env node
// WI-OI-120c (U2) HTTP proof. Runs the real module host (apps/module-host/dist) against an isolated PostgreSQL 16
// database and calls it over HTTP with signed platform-context tokens for two tenants, exactly as the web BFF does.
//
//   PROOF_DATABASE_URL=postgresql://<admin>@127.0.0.1:<port>/<isolated db> node scripts/verify-u2-module-host-http.mjs
//
// The database must be isolated (never the UAT instance; scripts/lib/isolated-proof-database.mjs refuses port 5440).
// It installs the five hosted modules with the real migration runner, then checks the U2 outcomes:
//   P1-02 signed-in reads succeed in every module (revocation table shape);
//   tenant isolation: a record created by tenant A is a 404 for tenant B;
//   P1-03 Finance commands write their events (consolidation group, budget structure);
//   P1-09 a second partial allocation of the same order line succeeds.
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlatformContext, signPlatformContextToken } from '../packages/auth-core/dist/index.js';
import { isolatedProofDatabaseUrl } from './lib/isolated-proof-database.mjs';

const root = new URL('../', import.meta.url).pathname;
const pgDirectory = readdirSync(join(root, 'node_modules/.pnpm')).find((name) => /^pg@\d/.test(name));
const { default: pg } = await import(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg/lib/index.js'));

const adminUrl = isolatedProofDatabaseUrl('WI-OI-120c module-host HTTP proof');
const modules = JSON.parse(readFileSync(join(root, 'infra/compose/generated/modules.json'), 'utf8'));
const PORT = Number(process.env.U2_PROOF_PORT ?? 47919);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 160)})` : ''}`);
}

// 1. Database prerequisites the control plane normally installs (20261002000000_database_extensions_foundation).
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
for (const extension of ['pgcrypto', 'ltree', 'btree_gist']) {
  await admin.query(`CREATE EXTENSION IF NOT EXISTS ${extension} WITH SCHEMA public`);
}

// 2. Install every hosted module with the real runner (copied next to a link to pg, which the repo root lacks).
const work = mkdtempSync(join(tmpdir(), 'u2-proof-'));
cpSync(join(root, 'infra/compose/docker/run-module-migrations.mjs'), join(work, 'run.mjs'));
mkdirSync(join(work, 'node_modules'));
symlinkSync(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg'), join(work, 'node_modules/pg'));
const runtimePassword = randomUUID().replaceAll('-', '');
const runtimeUrl = (schema) => {
  const url = new URL(adminUrl);
  url.username = `${schema}_u2proof`;
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

// 3. Start the module host with a throwaway signing key.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const hostEnv = {
  ...process.env,
  NODE_ENV: 'production',
  MODULE_HOST_API_HOST: '127.0.0.1',
  MODULE_HOST_API_PORT: String(PORT),
  MODULE_HOST_CORS_ORIGINS: 'http://127.0.0.1:5180',
};
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
  ready = await fetch(`${BASE}/financial-operations/v1/health/ready`).then((r) => r.ok).catch(() => false);
}
check('module host starts with all five modules', ready, ready ? '' : hostLog.split('\n').slice(-5).join(' | '));

const tenantA = `u2proof-a-${randomUUID().slice(0, 8)}`;
const tenantB = `u2proof-b-${randomUUID().slice(0, 8)}`;
function token(tenantId, moduleKey) {
  const module = modules[moduleKey];
  const subject = {
    user: { id: `${tenantId}-admin` },
    tenant: { id: tenantId, entitlements: [{ moduleKey, status: 'ENABLED', version: '1' }] },
    roles: ['TENANT_ADMIN'],
    platformRoles: [],
    permissions: ['*'],
    authVersion: 1,
    session: { id: randomUUID() },
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
    organizationScope: { mode: 'TENANT' },
  };
  return signPlatformContextToken(buildPlatformContext(subject, moduleKey, module.audience), privateKeyPem);
}
async function call(tenantId, moduleKey, method, path, body, extraHeaders = {}) {
  const response = await fetch(`${BASE}${modules[moduleKey].basePath}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token(tenantId, moduleKey)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
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
const ok = (r) => r.status >= 200 && r.status < 300;

try {
  if (ready) {
    // P1-02: signed-in reads succeed in every module.
    for (const [moduleKey, path] of [
      ['universal-inventory', '/v1/warehouses'],
      ['universal-orders', '/v1/orders'],
      ['universal-procurement', '/v1/requisitions'],
      ['financial-operations', '/v1/books'],
      ['product-catalogue', '/v1/products'],
    ]) {
      const r = await call(tenantA, moduleKey, 'GET', path);
      check(`signed-in read ${moduleKey} ${path}`, ok(r), `${r.status} ${r.text.slice(0, 120)}`);
    }

    // Product Catalogue: a create retried with the same Idempotency-Key is applied once.
    const uom = await call(tenantA, 'product-catalogue', 'POST', '/v1/uoms',
      { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'COUNT' }, { 'Idempotency-Key': randomUUID() });
    check('catalogue: create unit of measure', ok(uom), `${uom.status} ${uom.text.slice(0, 140)}`);
    if (uom.json?.id) {
      const productKey = randomUUID();
      const product = { code: 'U2-PROD-1', name: 'U2 proof product', productType: 'GOOD', baseUomId: uom.json.id,
        isSold: true, isPurchased: true, isStocked: true };
      const first = await call(tenantA, 'product-catalogue', 'POST', '/v1/products', product, { 'Idempotency-Key': productKey });
      const retry = await call(tenantA, 'product-catalogue', 'POST', '/v1/products', product, { 'Idempotency-Key': productKey });
      check('catalogue: create product', ok(first), `${first.status} ${first.text.slice(0, 140)}`);
      check('catalogue: the retried create returns the same product', ok(retry) && retry.json?.id === first.json?.id, `${retry.status} ${retry.json?.id} vs ${first.json?.id}`);
      const count = await admin.query(`SELECT count(*)::int AS n FROM gigalibs_product_catalogue.products WHERE tenant_id = $1 AND code = 'U2-PROD-1'`, [tenantA]);
      check('catalogue: exactly one product stored', count.rows[0].n === 1, count.rows[0].n);
    }

    // Tenant isolation on a created record.
    const warehouse = await call(tenantA, 'universal-inventory', 'POST', '/v1/warehouses', {
      code: 'WH-U2', name: 'U2 proof warehouse', warehouseType: 'PHYSICAL',
    });
    check('tenant A creates a warehouse', ok(warehouse), `${warehouse.status} ${warehouse.text.slice(0, 120)}`);
    const warehouseId = warehouse.json?.id ?? warehouse.json?.data?.id;
    if (warehouseId) {
      const own = await call(tenantA, 'universal-inventory', 'GET', `/v1/warehouses/${warehouseId}`);
      const other = await call(tenantB, 'universal-inventory', 'GET', `/v1/warehouses/${warehouseId}`);
      check('tenant A reads its warehouse', ok(own), own.status);
      check("tenant B cannot see tenant A's warehouse (404)", other.status === 404, other.status);
    }

    // P1-03: Finance commands write their events.
    const book = await call(tenantA, 'financial-operations', 'POST', '/v1/books', {
      bookCode: 'U2-BOOK', bookName: 'U2 proof book', legalEntityPartyId: randomUUID(), currencyCode: 'USD', isPrimary: true,
    });
    check('finance: create accounting book', ok(book), `${book.status} ${book.text.slice(0, 120)}`);
    const bookId = book.json?.id;
    const cta = bookId
      ? await call(tenantA, 'financial-operations', 'POST', '/v1/accounts', {
          accountingBookId: bookId, accountCode: '3900', accountName: 'Cumulative translation adjustment',
          accountClass: 'EQUITY', accountSubtype: 'EQUITY', normalBalance: 'CREDIT',
        })
      : { status: 0, text: 'no book' };
    check('finance: create CTA account', ok(cta), `${cta.status} ${cta.text.slice(0, 120)}`);
    if (bookId && cta.json?.id) {
      const group = await call(tenantA, 'financial-operations', 'POST', '/v1/consolidation/groups', {
        code: 'U2-GROUP', name: 'U2 proof group', reportingCurrency: 'USD', parentEntityId: bookId, ctaGlAccountId: cta.json.id,
      });
      check('finance: create consolidation group (was failing on a missing outbox table)', ok(group), `${group.status} ${group.text.slice(0, 160)}`);
      const budget = await call(tenantA, 'financial-operations', 'POST', '/v1/budgeting/structures', {
        code: 'U2-BUDGET', name: 'U2 proof budget', budgetType: 'OPERATING_OPEX', accountingBookId: bookId,
      });
      check('finance: create budget structure (was failing on outbox NOT NULL columns)', ok(budget), `${budget.status} ${budget.text.slice(0, 160)}`);
      const events = await admin.query(
        `SELECT event_type, aggregate_type, aggregate_version FROM gigalibs_finance.outbox_events
          WHERE tenant_id = $1 AND event_type IN ('finance.consolidation.group.created.v1', 'finance.budget.structure.created.v1')`,
        [tenantA],
      );
      check('finance: both events are in the outbox with aggregate and version', events.rows.length === 2 && events.rows.every((row) => row.aggregate_type && row.aggregate_version >= 1), JSON.stringify(events.rows));
    }

    // P0-09: costing posts its journal and its event in one transaction. A forced failure of the event write, after
    // the journal is posted, must leave neither a journal nor a cost layer (before U2 the journal stayed committed).
    if (bookId) {
      const year = await call(tenantA, 'financial-operations', 'POST', '/v1/fiscal-years/standard', {
        accountingBookId: bookId, year: 2026,
      });
      check('finance: create fiscal year 2026 with its twelve periods (new route)', ok(year) && year.json?.periods?.length === 12, `${year.status} ${year.text.slice(0, 120)}`);
      const period = (year.json?.periods ?? []).find((p) => p.startDate <= '2026-10-05' && p.endDate >= '2026-10-05');
      check('finance: a period covers the proof date', Boolean(period), `${(year.json?.periods ?? []).length} periods`);
      if (period) {
        const lock = await call(tenantA, 'financial-operations', 'POST', '/v1/close/subledgers/lock', {
          accountingBookId: bookId, fiscalPeriodId: period.id, subledgerType: 'AP', lockStatus: 'SOFT_LOCKED',
        });
        check('close: lock a subledger (event write was missing its type and aggregate)', ok(lock), `${lock.status} ${lock.text.slice(0, 140)}`);
        const lockEvents = await admin.query(
          `SELECT event_type, aggregate_type FROM gigalibs_finance.outbox_events WHERE tenant_id = $1 AND event_type = 'finance.subledger_lock.updated.v1'`,
          [tenantA],
        );
        check('close: the lock event is in the outbox with its type and aggregate', lockEvents.rows.length === 1 && lockEvents.rows[0].aggregate_type === 'subledger_lock', JSON.stringify(lockEvents.rows));
      }
      const account = async (accountCode, accountName, accountClass, accountSubtype, normalBalance) =>
        (await call(tenantA, 'financial-operations', 'POST', '/v1/accounts', {
          accountingBookId: bookId, accountCode, accountName, accountClass, accountSubtype, normalBalance,
        })).json?.id;
      const accounts = {
        inventoryGlAccountId: await account('1400', 'Inventory', 'ASSET', 'CURRENT_ASSET', 'DEBIT'),
        grniGlAccountId: await account('2150', 'Goods received not invoiced', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT'),
        cogsGlAccountId: await account('5000', 'Cost of goods sold', 'EXPENSE', 'COST_OF_GOODS_SOLD', 'DEBIT'),
        landedCostClearingGlAccountId: await account('2160', 'Landed cost clearing', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT'),
        purchasePriceVarianceGlAccountId: await account('5100', 'Purchase price variance', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'),
        scrapGlAccountId: await account('5200', 'Inventory scrap', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'),
        valuationLossGlAccountId: await account('5300', 'Inventory valuation loss', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT'),
      };
      check('finance: costing accounts created', Object.values(accounts).every(Boolean), JSON.stringify(accounts).slice(0, 120));
      const profile = await call(tenantA, 'financial-operations', 'POST', '/v1/costing/profiles', {
        code: 'U2-COST', name: 'U2 proof cost profile', costingMethod: 'FIFO', ...accounts, isDefault: true,
      });
      check('costing: create cost profile', ok(profile), `${profile.status} ${profile.text.slice(0, 160)}`);
      if (profile.json?.id && period) {
        const productId = randomUUID();
        const receiptLayer = (receiptRef) =>
          call(tenantA, 'financial-operations', 'POST', '/v1/costing/receipt-layers', {
            costProfileId: profile.json.id, productId, warehouseId: 'WH-U2', receiptRef,
            receiptDate: '2026-10-05T10:00:00.000Z', quantity: '10', unitCostScaled: '2500000', postGlJournal: true,
            bookId, periodId: period.id,
          });
        await admin.query(`CREATE OR REPLACE FUNCTION gigalibs_finance.u2proof_fail_cost_layer_event() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.aggregate_type = 'cost_layer' THEN RAISE EXCEPTION 'U2 proof: forced event failure'; END IF;
            RETURN NEW;
          END $$`);
        await admin.query(`CREATE TRIGGER u2proof_fail_cost_layer_event BEFORE INSERT ON gigalibs_finance.outbox_events
          FOR EACH ROW EXECUTE FUNCTION gigalibs_finance.u2proof_fail_cost_layer_event()`);
        let forced;
        try {
          forced = await receiptLayer('U2-ATOMIC');
        } finally {
          await admin.query('DROP TRIGGER IF EXISTS u2proof_fail_cost_layer_event ON gigalibs_finance.outbox_events');
          await admin.query('DROP FUNCTION IF EXISTS gigalibs_finance.u2proof_fail_cost_layer_event()');
        }
        check('costing: the forced event failure fails the command', forced.status >= 400, forced.status);
        const leftovers = await admin.query(
          `SELECT (SELECT count(*) FROM gigalibs_finance.gl_journals WHERE tenant_id = $1 AND description LIKE '%U2-ATOMIC%')::int AS journals,
                  (SELECT count(*) FROM gigalibs_finance.inventory_cost_layers WHERE tenant_id = $1 AND receipt_ref = 'U2-ATOMIC')::int AS layers`,
          [tenantA],
        );
        check('costing: a failed command leaves no journal and no cost layer (P0-09)', leftovers.rows[0].journals === 0 && leftovers.rows[0].layers === 0, JSON.stringify(leftovers.rows[0]));
        const posted = await receiptLayer('U2-POSTED');
        check('costing: receipt layer posts', ok(posted), `${posted.status} ${posted.text.slice(0, 160)}`);
        const journal = await admin.query(
          `SELECT j.source_document_type, j.total_debit_minor, j.total_credit_minor,
                  (SELECT count(*) FROM gigalibs_finance.outbox_events o
                    WHERE o.tenant_id = j.tenant_id AND o.aggregate_type = 'cost_layer')::int AS events
             FROM gigalibs_finance.gl_journals j WHERE j.tenant_id = $1 AND j.description LIKE '%U2-POSTED%'`,
          [tenantA],
        );
        const row = journal.rows[0];
        check('costing: one balanced journal linked to its cost layer, and one event',
          journal.rows.length === 1 && row.source_document_type === 'INVENTORY_COST_LAYER' && row.total_debit_minor === row.total_credit_minor && row.events === 1,
          JSON.stringify(journal.rows));
      }
    }

    // P1-09: a second partial allocation of the same order line succeeds.
    const warehouseForOrder = warehouseId ?? randomUUID();
    const order = await call(tenantA, 'universal-orders', 'POST', '/v1/orders', {
      orgUnitId: 'u2-org', customerPartyId: randomUUID(), customerName: 'U2 proof customer', currencyCode: 'USD',
      warehouseId: warehouseForOrder,
      lines: [{ productId: randomUUID(), productCode: 'U2-PROD', productName: 'U2 proof product', orderedQuantity: '5',
        uomId: randomUUID(), unitPriceMinor: '1000', warehouseId: warehouseForOrder }],
    });
    check('orders: create order', ok(order), `${order.status} ${order.text.slice(0, 160)}`);
    const orderId = order.json?.id;
    const readBack = orderId ? await call(tenantA, 'universal-orders', 'GET', `/v1/orders/${orderId}`) : undefined;
    const lineId = order.json?.lines?.[0]?.id ?? readBack?.json?.lines?.[0]?.id;
    check('orders: the order and its line can be read back', Boolean(orderId && lineId), readBack ? `${readBack.status} ${readBack.text.slice(0, 120)}` : 'no order id');
    if (orderId && lineId) {
      const confirm = await call(tenantA, 'universal-orders', 'POST', `/v1/orders/${orderId}/confirm`, {});
      check('orders: confirm order', ok(confirm), `${confirm.status} ${confirm.text.slice(0, 160)}`);
      const allocation = { orderId, orderLineId: lineId, warehouseId: warehouseForOrder, allocatedQuantity: '1' };
      const first = await call(tenantA, 'universal-orders', 'POST', `/v1/orders/${orderId}/allocate`, allocation);
      const second = await call(tenantA, 'universal-orders', 'POST', `/v1/orders/${orderId}/allocate`, allocation);
      check('orders: first partial allocation', ok(first), `${first.status} ${first.text.slice(0, 160)}`);
      check('orders: second partial allocation of the same line (was always failing)', ok(second), `${second.status} ${second.text.slice(0, 160)}`);
      const versions = await admin.query(
        `SELECT aggregate_version FROM gigalibs_orders.outbox_events
          WHERE tenant_id = $1 AND aggregate_type = 'sales_order_line' AND aggregate_id = $2 ORDER BY aggregate_version`,
        [tenantA, lineId],
      );
      check('orders: allocation events carry versions 1 and 2', versions.rows.map((row) => row.aggregate_version).join(',') === '1,2', JSON.stringify(versions.rows));
    }
  }
} finally {
  host.kill('SIGTERM');
  await admin.end();
  rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  const errors = hostLog.split('\n').filter((line) => /error|exception|violat|failed/i.test(line)).slice(-12);
  if (errors.length) console.log(`\nModule host errors:\n${errors.join('\n')}`);
}
console.log(`\nRESULT: ${failed.length === 0 ? 'PASS' : 'FAIL'} (${results.length - failed.length}/${results.length} checks)`);
process.exit(failed.length === 0 ? 0 : 1);
