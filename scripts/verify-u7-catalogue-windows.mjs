#!/usr/bin/env node
// WI-OI-120g (U7): the Product Catalogue's metadata windows end to end over HTTP, on an isolated PostgreSQL database.
// Installs every hosted module with the real runner, starts the real module host with a throwaway signing key, and
// drives the record routes the Catalogue's windows use, signed exactly as the web gateway signs them, as two people:
// a maker who builds and submits, and a checker who approves (the maker may not approve their own version).
// - units and a dimension-safe conversion;
// - a category updated with If-Match (a stale version answers 412);
// - an attribute;
// - a product created once per Idempotency-Key, edited, archived and restored with a reason;
// - a catalogue version with an entry: submit, maker's approval refused, checker approves, publish;
// - a price list version with a price (list >= standard >= limit): submit, approve, activate;
// - the price resolves to exactly one answer; another tenant sees nothing.
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

const adminUrl = isolatedProofDatabaseUrl('WI-OI-120g Catalogue metadata windows proof');
const modules = JSON.parse(readFileSync(join(root, 'infra/compose/generated/modules.json'), 'utf8'));
const PORT = Number(process.env.U7_PROOF_PORT ?? 47941);
const BASE = `http://127.0.0.1:${PORT}`;
const CATALOGUE = 'product-catalogue';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 200)})` : ''}`);
}

// 1. Extensions the control plane normally installs, then every hosted module with the real runner.
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
for (const extension of ['pgcrypto', 'ltree', 'btree_gist']) await admin.query(`CREATE EXTENSION IF NOT EXISTS ${extension} WITH SCHEMA public`);
const work = mkdtempSync(join(tmpdir(), 'u7-proof-'));
cpSync(join(root, 'infra/compose/docker/run-module-migrations.mjs'), join(work, 'run.mjs'));
mkdirSync(join(work, 'node_modules'));
symlinkSync(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg'), join(work, 'node_modules/pg'));
const runtimePassword = randomUUID().replaceAll('-', '');
const runtimeUrl = (schema) => {
  const url = new URL(adminUrl);
  url.username = `${schema}_u7proof`;
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
  ready = await fetch(`${BASE}${modules[CATALOGUE].basePath}/v1/health/ready`).then((r) => r.ok).catch(() => false);
}
check('module host starts with the Catalogue', ready, ready ? '' : hostLog.split('\n').slice(-5).join(' | '));

const tenantA = `u7proof-a-${randomUUID().slice(0, 8)}`;
const tenantB = `u7proof-b-${randomUUID().slice(0, 8)}`;
const MAKER = 'maker';
const CHECKER = 'checker';
function token(tenantId, user, permissions) {
  const module = modules[CATALOGUE];
  const subject = {
    user: { id: `${tenantId}-${user}` },
    tenant: { id: tenantId, entitlements: [{ moduleKey: module.catalogKey ?? CATALOGUE, status: 'ENABLED', version: '1' }] },
    roles: ['TENANT_ADMIN'],
    platformRoles: [],
    permissions,
    authVersion: 1,
    session: { id: randomUUID() },
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
    organizationScope: { mode: 'TENANT' },
  };
  return signPlatformContextToken(buildPlatformContext(subject, module.catalogKey ?? CATALOGUE, module.audience), privateKeyPem);
}
/** One call to the Catalogue as a user; creates and actions carry a fresh Idempotency-Key unless one is given. */
async function call(method, path, body, { tenantId = tenantA, user = MAKER, headers = {}, permissions = ['*'] } = {}) {
  const writes = method === 'POST' && (path.startsWith('/v1/records/') || path.includes('/actions/'));
  const response = await fetch(`${BASE}${modules[CATALOGUE].basePath}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token(tenantId, user, permissions)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(writes ? { 'Idempotency-Key': randomUUID() } : {}),
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
  return { status: response.status, json, text, etag: response.headers.get('etag') };
}
const record = (entity, values, options) => call('POST', `/v1/records/catalogue.${entity}`, values, options);
const act = (entity, id, action, parameters, options) => call('POST', `/v1/records/catalogue.${entity}/${id}/actions/${action}`, parameters, options);
const shown = (r) => `${r.status} ${r.text.slice(0, 160)}`;

try {
  // 3. Units and a dimension-safe conversion (a child of the "from" unit).
  const each = await record('uoms', { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'COUNT' });
  const box = await record('uoms', { code: 'BOX12', name: 'Box of 12', symbol: 'box', dimension: 'COUNT', 'std-precision': 0 });
  const kilo = await record('uoms', { code: 'KG', name: 'Kilogram', symbol: 'kg', dimension: 'WEIGHT' });
  check('units: each, box and kilogram are created', [each, box, kilo].every((r) => r.status === 201 && r.json?.version === 1), shown(box));
  const conversion = await record('uom-conversions', { 'from-uom-id': box.json?.id, 'to-uom-id': each.json?.id, 'conversion-rate': '12' });
  const children = await call('GET', `/v1/records/catalogue.uom-conversions?parentId=${box.json?.id}`);
  check('units: a box converts to 12 each, listed under the box', conversion.status === 201 && children.json?.total === 1 && Number(children.json.items[0]['conversion-rate']) === 12, `${shown(conversion)} | ${children.text.slice(0, 100)}`);
  const mixed = await record('uom-conversions', { 'from-uom-id': kilo.json?.id, 'to-uom-id': each.json?.id, 'conversion-rate': '3' });
  check('units: a conversion across dimensions without a product is refused (400)', mixed.status === 400, shown(mixed));

  // 4. A category, updated with If-Match.
  const category = await record('categories', { code: 'FASTENERS', name: 'Fasteners' });
  const renamed = await call('PATCH', `/v1/records/catalogue.categories/${category.json?.id}`, { name: 'Fasteners and fixings' }, { headers: { 'If-Match': '"1"' } });
  const stale = await call('PATCH', `/v1/records/catalogue.categories/${category.json?.id}`, { name: 'Overwrite' }, { headers: { 'If-Match': '"1"' } });
  check('categories: an update with the current version succeeds; a stale one is refused (412)', category.status === 201 && renamed.status === 200 && renamed.json?.version === 2 && stale.status === 412, `${shown(renamed)} | ${stale.status}`);
  const attribute = await record('attributes', { code: 'THREAD', name: 'Thread', 'value-type': 'ENUM', 'allowed-values': 'M6, M8, M10' });
  check('attributes: an attribute with a list of values', attribute.status === 201 && attribute.json?.['allowed-values'] === 'M6, M8, M10', shown(attribute));

  // 5. A product: once per Idempotency-Key, edited, archived and restored with a reason.
  const productKey = randomUUID();
  const productBody = { code: 'BOLT-M8', name: 'Hex bolt M8', 'product-type': 'GOOD', 'base-uom-id': each.json?.id, 'category-id': category.json?.id, 'is-sold': true, 'is-purchased': true, 'is-stocked': true };
  const product = await record('products', productBody, { headers: { 'Idempotency-Key': productKey } });
  const again = await record('products', productBody, { headers: { 'Idempotency-Key': productKey } });
  check('products: created as a draft; the same Idempotency-Key returns the first answer', product.status === 201 && product.json?.status === 'DRAFT' && again.json?.id === product.json?.id, `${shown(product)} | ${again.json?.id}`);
  const productId = product.json?.id;
  const activated = await call('PATCH', `/v1/records/catalogue.products/${productId}`, { status: 'ACTIVE', 'display-name': 'Bolt M8 x 40' }, { headers: { 'If-Match': '"1"' } });
  check('products: edited to Active with a display name', activated.status === 200 && activated.json?.status === 'ACTIVE' && activated.json?.version === 2, shown(activated));
  const noReason = await act('products', productId, 'archive', { expectedVersion: 2 });
  const archived = await act('products', productId, 'archive', { expectedVersion: 2, reason: 'Superseded by BOLT-M8-ZN' });
  const staleRestore = await act('products', productId, 'restore', { expectedVersion: 2, reason: 'Stale screen' });
  const restored = await act('products', productId, 'restore', { expectedVersion: 3, reason: 'Still sold' });
  check('products: archive needs a reason; archive and restore move the version; a stale restore is refused',
    noReason.status === 400 && archived.json?.status === 'ARCHIVED' && staleRestore.status === 412 && restored.json?.status === 'DRAFT' && restored.json?.version === 4,
    `${noReason.status} ${archived.json?.status} ${staleRestore.status} ${restored.json?.status} v${restored.json?.version}`);
  const found = await call('GET', '/v1/records/catalogue.products?search=bolt&page=1&pageSize=10');
  check('products: found by text in a paged list', found.status === 200 && found.json?.total === 1 && found.json.items[0].code === 'BOLT-M8', found.text.slice(0, 120));

  // 6. A catalogue version with an entry: submit, the maker's approval refused, the checker approves, publish.
  const catalogue = await record('catalogues', { code: 'TRADE', name: 'Trade catalogue', purpose: 'Distributors' });
  const version = await record('catalogue-versions', { 'catalogue-id': catalogue.json?.id, 'effective-from': '2026-01-01', notes: 'Spring range' });
  const versionId = version.json?.id;
  const statusSet = await record('catalogue-versions', { 'catalogue-id': catalogue.json?.id, status: 'PUBLISHED' });
  check('catalogues: a draft version under the catalogue; its status cannot be written (400)', version.status === 201 && version.json?.status === 'DRAFT' && statusSet.status === 400, `${shown(version)} | ${statusSet.status}`);
  const emptySubmit = await act('catalogue-versions', versionId, 'submit', { expectedVersion: 1, reason: 'Ready' });
  const entry = await record('catalogue-entries', { 'catalogue-version-id': versionId, 'product-id': productId, 'sort-order': 1, 'is-highlighted': true });
  const entries = await call('GET', `/v1/records/catalogue.catalogue-entries?parentId=${versionId}`);
  check('catalogues: an empty version cannot be submitted (409); an entry is added and listed', emptySubmit.status === 409 && entry.status === 201 && entries.json?.total === 1, `${emptySubmit.status} ${shown(entry)}`);
  const submitted = await act('catalogue-versions', versionId, 'submit', { expectedVersion: 1, reason: 'Ready for review' });
  const selfApproved = await act('catalogue-versions', versionId, 'approve', { expectedVersion: 2, reason: 'Looks fine' });
  const approved = await act('catalogue-versions', versionId, 'approve', { expectedVersion: 2, reason: 'Checked' }, { user: CHECKER });
  const published = await act('catalogue-versions', versionId, 'publish', { expectedVersion: 3, reason: 'Go live' }, { user: CHECKER });
  check('catalogues: submit; the maker cannot approve (403); the checker approves and publishes',
    submitted.json?.status === 'SUBMITTED' && selfApproved.status === 403 && approved.json?.status === 'APPROVED' && published.json?.status === 'PUBLISHED',
    `${submitted.json?.status} ${selfApproved.status} ${approved.json?.status} ${shown(published)}`);
  const lateEntry = await record('catalogue-entries', { 'catalogue-version-id': versionId, 'product-id': productId, 'sort-order': 2 });
  check('catalogues: a published version takes no more entries (409)', lateEntry.status === 409, shown(lateEntry));

  // 7. A price-list version with a price: submit, approve (checker), activate; list >= standard >= limit.
  const priceList = await record('price-lists', { code: 'USD-TRADE', name: 'Trade prices', 'currency-code': 'USD', 'price-precision': 2 });
  const priceVersion = await record('price-list-versions', { 'price-list-id': priceList.json?.id, 'effective-from': '2026-01-01' });
  const priceVersionId = priceVersion.json?.id;
  const badPrice = await record('prices', { 'price-list-version-id': priceVersionId, 'product-id': productId, 'uom-id': each.json?.id, 'list-price-minor': '1000', 'standard-price-minor': '1200', 'limit-price-minor': '900' });
  const price = await record('prices', { 'price-list-version-id': priceVersionId, 'product-id': productId, 'uom-id': each.json?.id, 'list-price-minor': '1250', 'standard-price-minor': '1200', 'limit-price-minor': '1000' });
  check('prices: list below standard is refused (400); a valid price is set', priceList.status === 201 && priceVersion.status === 201 && badPrice.status === 400 && price.status === 201, `${badPrice.status} ${shown(price)}`);
  const priceSubmitted = await act('price-list-versions', priceVersionId, 'submit', { expectedVersion: 1, reason: 'Ready' });
  const priceSelf = await act('price-list-versions', priceVersionId, 'approve', { expectedVersion: 2, reason: 'Fine' });
  const priceApproved = await act('price-list-versions', priceVersionId, 'approve', { expectedVersion: 2, reason: 'Checked' }, { user: CHECKER });
  const priceActive = await act('price-list-versions', priceVersionId, 'activate', { expectedVersion: 3, reason: 'Go live' }, { user: CHECKER });
  check('prices: submit; the maker cannot approve (403); the checker approves and activates',
    priceSubmitted.json?.status === 'SUBMITTED' && priceSelf.status === 403 && priceApproved.json?.status === 'APPROVED' && priceActive.json?.status === 'ACTIVATED',
    `${priceSubmitted.json?.status} ${priceSelf.status} ${priceApproved.json?.status} ${shown(priceActive)}`);

  // 8. The price resolves to exactly one answer; with no active price, a clear 404.
  const resolved = await call('POST', '/v1/prices/resolve', { productId, currencyCode: 'USD', effectiveAt: '2026-06-01T00:00:00.000Z' });
  check('resolve: one price, from the active version', resolved.status === 200 && resolved.json?.standardPriceMinor === '1200' && resolved.json?.priceListVersionId === priceVersionId, shown(resolved));
  const before = await call('POST', '/v1/prices/resolve', { productId, currencyCode: 'USD', effectiveAt: '2025-06-01T00:00:00.000Z' });
  check('resolve: before the effective date there is no price (404)', before.status === 404, shown(before));

  // 9. Pickers, permissions and tenants.
  const pickers = await Promise.all(['catalogue-products', 'catalogue-uoms', 'catalogue-categories', 'catalogue-catalogues', 'catalogue-price-lists'].map((key) => call('GET', `/v1/lookups/${key}`)));
  check('pickers: products, units, categories, catalogues and price lists answer', pickers.every((r) => r.status === 200 && r.json?.length >= 1), pickers.map((r) => r.status).join(' '));
  const readOnly = await record('products', { ...productBody, code: 'BOLT-RO' }, { permissions: ['products:read'] });
  const noApprove = await act('price-list-versions', priceVersionId, 'approve', { expectedVersion: 4, reason: 'x' }, { user: CHECKER, permissions: ['pricing:read'] });
  check('permissions: products:read may not create, pricing:read may not approve (403)', readOnly.status === 403 && noApprove.status === 403, `${readOnly.status} ${noApprove.status}`);
  const otherRead = await call('GET', `/v1/records/catalogue.products/${productId}`, undefined, { tenantId: tenantB });
  const otherList = await call('GET', '/v1/records/catalogue.price-lists', undefined, { tenantId: tenantB });
  const otherPick = await call('GET', '/v1/lookups/catalogue-products?search=bolt', undefined, { tenantId: tenantB });
  check("tenants: tenant B gets 404 for tenant A's product, no price lists and no picker options",
    otherRead.status === 404 && otherList.json?.total === 0 && otherPick.json?.length === 0, `${otherRead.status} ${otherList.text.slice(0, 60)} ${otherPick.text}`);
} finally {
  host.kill('SIGTERM');
  for (const module of Object.values(modules)) {
    await admin.query(`DROP SCHEMA IF EXISTS ${module.schema} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${module.schema}_u7proof`).catch(() => undefined);
  }
  await admin.end();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
