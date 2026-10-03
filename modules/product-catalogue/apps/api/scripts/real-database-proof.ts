import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { OrganizationReplica, type ModuleCommandContext, type ModulePrincipal, type ReplicaUnit } from '@gigalibs/module-sdk';
import pg from 'pg';
import { CatalogueService } from '../src/catalogue/catalogue.service.js';
import { DatabaseService } from '../src/database.service.js';
import { startThrowawayPostgres } from './throwaway-postgres.js';

const step = (message: string) => console.log(`== ${message}`);
const versionId = 'product-proof-version-1';
const units: ReplicaUnit[] = [
  { unit_id: 'unit-a', parent_unit_id: null, code: 'UNIT-A', name: 'Unit A', sort_order: 0, status: 'ACTIVE', holds_records: true, type_code: 'OPERATING_UNIT' },
  { unit_id: 'unit-b', parent_unit_id: null, code: 'UNIT-B', name: 'Unit B', sort_order: 1, status: 'ACTIVE', holds_records: true, type_code: 'OPERATING_UNIT' },
];
const checksum = `sha256:${createHash('sha256').update(units
  .toSorted((left, right) => left.unit_id.localeCompare(right.unit_id, 'en', { usage: 'sort' }))
  .map((unit) => `${unit.unit_id}>${unit.parent_unit_id ?? ''}#${unit.sort_order}`).join('\n')).digest('hex')}`;
const header = { tree_id: 'tree-primary', tree_kind: 'PRIMARY' as const, version_number: 1, checksum };

const principal = (tenantId: string, subject: string, organization: ModulePrincipal['organization']): ModulePrincipal => ({
  tenantId, subject, sessionId: `session-${subject}`, authVersion: 1, permissions: ['*'], roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN', organization, departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' },
});
const context = (p: ModulePrincipal, suffix = randomUUID()): ModuleCommandContext => ({ principal: p, correlationId: `proof:${suffix}` });
const tenant = (tenantId: string, subject: string) => principal(tenantId, subject, { mode: 'TENANT', tree_version: versionId });
const scoped = (tenantId: string, subject: string, unit: string) => principal(tenantId, subject, {
  mode: 'UNITS', tree_version: versionId, read_roots: [unit], write_roots: [unit],
});

const postgres = await startThrowawayPostgres(`gigalibs-product-catalogue-proof-${process.pid}`);
const db = new DatabaseService({
  databaseUrl: postgres.runtimeUrl, databasePoolSize: 5, expectedMigrationVersion: 1,
  platformContextAudience: 'proof', platformContextPublicKey: 'proof', corsOrigins: [], apiHost: '127.0.0.1', apiPort: 0,
} as never);

try {
  await db.onModuleInit();
  const replica = new OrganizationReplica('gigalibs_product_catalogue');
  for (const tenantId of ['tenant-a', 'tenant-b']) {
    await db.withTenantTransaction(tenantId, async (client) => {
      await replica.receivePage(client, tenantId, versionId, header, units);
      await replica.complete(client, tenantId, versionId, header, units.length);
    });
  }
  const catalogue = new CatalogueService(db);
  const maker = scoped('tenant-a', 'maker-a', 'unit-a');
  const checker = scoped('tenant-a', 'checker-a', 'unit-a');
  const sibling = scoped('tenant-a', 'sibling-b', 'unit-b');
  const tenantAdmin = tenant('tenant-a', 'tenant-admin');
  const outsider = tenant('tenant-b', 'tenant-b-admin');

  step('1. empty install, runtime role and organization replica are ready');
  assert.equal(await db.currentTenantScope('tenant-a'), 'tenant-a');
  const admin = new pg.Client({ connectionString: postgres.adminUrl });
  await admin.connect();
  assert.equal((await admin.query('SELECT value FROM public.unrelated_upgrade_sentinel WHERE id=1')).rows[0]?.value, 'preserve-me');
  await admin.end();

  step('2. idempotent UOM creation and exact decimal conversion');
  const uomKey = randomUUID();
  const each = await catalogue.createUom(context(tenantAdmin), { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'COUNT', stdPrecision: 2, costingPrecision: 4 }, uomKey);
  const replay = await catalogue.createUom(context(tenantAdmin), { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'COUNT', stdPrecision: 2, costingPrecision: 4 }, uomKey);
  assert.equal(replay.replayed, true);
  const pack = await catalogue.createUom(context(tenantAdmin), { code: 'PACK', name: 'Pack', symbol: 'pk', dimension: 'COUNT', stdPrecision: 2, costingPrecision: 4 }, randomUUID());
  await catalogue.createConversion(context(tenantAdmin), { fromUomId: pack.result.id, toUomId: each.result.id, conversionRate: '0.1' }, randomUUID());
  const converted = await catalogue.resolveConversion(tenantAdmin, { fromUomId: pack.result.id, toUomId: each.result.id, quantity: '0.2' });
  assert.equal(converted.resultQuantity, '0.02');

  step('3. tenant and sibling organization isolation');
  const created = await catalogue.createProduct(context(maker), {
    code: 'SERVICE-A', name: 'Unit A service', productType: 'SERVICE', baseUomId: each.result.id,
    isSold: true, isPurchased: false, isStocked: false, owningUnitId: 'unit-a', orgUnitIds: ['unit-a'],
  }, randomUUID());
  const product = created.result;
  assert.equal((await catalogue.listProducts(maker, { limit: 50 })).totalCount, 1);
  assert.equal((await catalogue.listProducts(sibling, { limit: 50 })).totalCount, 0);
  await assert.rejects(catalogue.getProduct(sibling, product.id), /not found/i);
  const otherUom = await catalogue.createUom(context(outsider), { code: 'EA', name: 'Each', symbol: 'ea', dimension: 'COUNT', stdPrecision: 2, costingPrecision: 4 }, randomUUID());
  await catalogue.createProduct(context(outsider), { code: 'TENANT-B', name: 'Tenant B only', productType: 'SERVICE', baseUomId: otherUom.result.id, isSold: true, isPurchased: false, isStocked: false }, randomUUID());
  assert.equal((await catalogue.listProducts(tenantAdmin, { limit: 50 })).totalCount, 1);

  step('4. optimistic concurrency and explicit shared ownership');
  const updated = await catalogue.updateProduct(context(maker), product.id, { expectedVersion: 1, name: 'Unit A service v2' });
  assert.equal(updated.version, 2);
  await assert.rejects(catalogue.updateProduct(context(maker), product.id, { expectedVersion: 1, name: 'stale' }), /changed by/i);
  await assert.rejects(catalogue.updateProduct(context(maker), product.id, { expectedVersion: 2, owningUnitId: null }), /tenant-wide authority/i);
  const shared = await catalogue.updateProduct(context(tenantAdmin), product.id, { expectedVersion: 2, owningUnitId: null, orgUnitIds: [] });
  assert.equal(shared.owningUnitId, null);

  step('5. maker-checker catalogue publication and immutable entries');
  const cat = await catalogue.createCatalogue(context(tenantAdmin), { code: 'PUBLIC', name: 'Public catalogue' }, randomUUID());
  const catVersion = await catalogue.createCatalogueVersion(context(tenantAdmin), cat.result.id, {
    effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: '2027-01-01T00:00:00.000Z', notes: 'Proof',
  }, randomUUID());
  await catalogue.addCatalogueEntry(context(tenantAdmin), cat.result.id, catVersion.result.id, { productId: product.id, sortOrder: 0, isHighlighted: true, displayOverrides: {} }, randomUUID());
  const submittedCatalogue = await catalogue.transitionCatalogue(context(tenantAdmin), cat.result.id, catVersion.result.id, 1, 'Ready', 'SUBMITTED');
  await assert.rejects(catalogue.transitionCatalogue(context(tenantAdmin), cat.result.id, catVersion.result.id, submittedCatalogue.version, 'Self approval', 'APPROVED'), /maker cannot approve/i);
  const approvedCatalogue = await catalogue.transitionCatalogue(context(principal('tenant-a', 'checker-tenant', { mode: 'TENANT', tree_version: versionId })), cat.result.id, catVersion.result.id, submittedCatalogue.version, 'Checked', 'APPROVED');
  const publishedCatalogue = await catalogue.transitionCatalogue(context(tenantAdmin), cat.result.id, catVersion.result.id, approvedCatalogue.version, 'Publish', 'PUBLISHED');
  assert.match(publishedCatalogue.checksum, /^sha256:[0-9a-f]{64}$/);
  await assert.rejects(catalogue.addCatalogueEntry(context(tenantAdmin), cat.result.id, catVersion.result.id, { productId: product.id, sortOrder: 1, isHighlighted: false, displayOverrides: {} }, randomUUID()), /Only draft/i);

  step('6. governed price activation, exact quantity break and overlap refusal');
  const priceList = await catalogue.createPriceList(context(maker), { code: 'UNIT-A-USD', name: 'Unit A USD', currencyCode: 'USD', orgUnitId: 'unit-a' }, randomUUID());
  const priceVersion = await catalogue.createPriceListVersion(context(maker), priceList.result.id, { effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: '2027-01-01T00:00:00.000Z' }, randomUUID());
  await catalogue.setPrice(context(maker), priceList.result.id, priceVersion.result.id, { productId: product.id, uomId: each.result.id, minQuantity: '1', listPriceMinor: '1200', standardPriceMinor: '1000', limitPriceMinor: '900' }, randomUUID());
  const submittedPrice = await catalogue.transitionPrice(context(maker), priceList.result.id, priceVersion.result.id, 1, 'Ready', 'SUBMITTED');
  const approvedPrice = await catalogue.transitionPrice(context(checker), priceList.result.id, priceVersion.result.id, submittedPrice.version, 'Checked', 'APPROVED');
  const activePrice = await catalogue.transitionPrice(context(maker), priceList.result.id, priceVersion.result.id, approvedPrice.version, 'Activate', 'ACTIVATED');
  assert.match(activePrice.checksum, /^sha256:[0-9a-f]{64}$/);
  const resolved = await catalogue.resolvePrice(maker, { productId: product.id, uomId: each.result.id, quantity: '4', currencyCode: 'USD', orgUnitId: 'unit-a', effectiveAt: '2026-06-01T00:00:00.000Z' });
  assert.equal(resolved.standardPriceMinor, '1000');
  await assert.rejects(catalogue.resolvePrice(sibling, { productId: product.id, quantity: '1', orgUnitId: 'unit-a', effectiveAt: '2026-06-01T00:00:00.000Z' }), /not found/i);

  const overlap = await catalogue.createPriceListVersion(context(maker), priceList.result.id, { effectiveFrom: '2026-06-01T00:00:00.000Z', effectiveTo: '2026-12-01T00:00:00.000Z' }, randomUUID());
  await catalogue.setPrice(context(maker), priceList.result.id, overlap.result.id, { productId: product.id, uomId: each.result.id, minQuantity: '1', listPriceMinor: '1300', standardPriceMinor: '1100', limitPriceMinor: '950' }, randomUUID());
  const overlapSubmitted = await catalogue.transitionPrice(context(maker), priceList.result.id, overlap.result.id, 1, 'Ready', 'SUBMITTED');
  const overlapApproved = await catalogue.transitionPrice(context(checker), priceList.result.id, overlap.result.id, overlapSubmitted.version, 'Checked', 'APPROVED');
  await assert.rejects(catalogue.transitionPrice(context(maker), priceList.result.id, overlap.result.id, overlapApproved.version, 'Activate', 'ACTIVATED'), /overlaps/i);

  step('7. immutable consumer snapshots, audit, outbox and forced RLS');
  const snapshot = await catalogue.productSnapshot(context(tenantAdmin), product.id);
  await catalogue.updateProduct(context(tenantAdmin), product.id, { expectedVersion: 3, name: 'Renamed after snapshot' });
  assert.equal(snapshot.payload.name, 'Unit A service v2');
  await db.withTenantTransaction('tenant-a', async (client) => {
    assert.equal((await client.query("SELECT count(*)::int AS count FROM products WHERE tenant_id='tenant-b'")).rows[0]?.count, 0);
    assert.ok(Number((await client.query('SELECT count(*)::int AS count FROM audit_events')).rows[0]?.count) >= 1);
    assert.ok(Number((await client.query('SELECT count(*)::int AS count FROM outbox_events')).rows[0]?.count) >= 1);
  });

  step('8. revocation takes effect on the next authorization lookup');
  await db.withTenantTransaction('tenant-a', (client) => client.query(
    `INSERT INTO auth_revocation_events (id,tenant_id,revocation_type,session_id,reason) VALUES ($1,$2,'SESSION',$3,$4)`,
    ['revoke-proof', 'tenant-a', maker.sessionId, 'proof'],
  ));
  assert.equal(await db.isContextRevoked({ tenantId: 'tenant-a', subject: maker.subject, sessionId: maker.sessionId, authVersion: 1 }), true);

  console.log('PRODUCT CATALOGUE REAL DATABASE PROOF PASSED');
} finally {
  await db.onModuleDestroy();
  postgres.stop();
}
