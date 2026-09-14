/**
 * verify-governor-persistent.mjs
 *
 * Certifies the PostgreSQL-backed GovernorPersistentService (Phase 4).
 * Creates real Tenant rows, exercises token bucket consumption, burst throttling,
 * multi-tenant isolation, and tier configuration — all verified against the
 * tenant_rate_buckets table in PostgreSQL.
 *
 * Requires: DATABASE_URL pointing to a live PostgreSQL instance with the migration
 * packages/db/migrations/20260914000000_add_saga_governor_parenttenant applied.
 */

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { prisma } from '../packages/db/dist/index.js';
import { GovernorPersistentService } from '../apps/playground-api/src/governor-persistent.service.ts';

console.log('--- Commencing Durable Governor Rate Limiter Verification (PostgreSQL) ---');

const governor = new GovernorPersistentService();

// Create two real tenants
const tenantFree = await prisma.tenant.create({
  data: {
    slug: `gov-free-${randomBytes(4).toString('hex')}`,
    name: 'Governor Free Tier Test Tenant',
  },
});
const tenantEnterprise = await prisma.tenant.create({
  data: {
    slug: `gov-ent-${randomBytes(4).toString('hex')}`,
    name: 'Governor Enterprise Tier Test Tenant',
  },
});

console.log(`Setup: tenants created — free=${tenantFree.id}, ent=${tenantEnterprise.id}`);

try {
  // 1. Tier configuration ────────────────────────────────────────────────────
  console.log('\n1. Testing tier assignment (persisted to PostgreSQL)...');
  await governor.setTenantTier(tenantFree.id, 'FREE');
  await governor.setTenantTier(tenantEnterprise.id, 'ENTERPRISE');

  const freeTier = await governor.getTenantTier(tenantFree.id);
  const entTier = await governor.getTenantTier(tenantEnterprise.id);
  assert.equal(freeTier, 'FREE');
  assert.equal(entTier, 'ENTERPRISE');
  console.log('✔ Tier overrides written and read back from tenant_rate_buckets');

  // 2. Quota status from DB ──────────────────────────────────────────────────
  console.log('\n2. Testing quota status resolution...');
  const freeQuota = await governor.getQuotaStatus(tenantFree.id);
  assert.equal(freeQuota.tier, 'FREE');
  assert.equal(freeQuota.config.requestsPerMinute, 60);
  assert.equal(freeQuota.config.burstCapacity, 20);
  assert.equal(freeQuota.config.maxDbQueriesPerRequest, 50);

  const entQuota = await governor.getQuotaStatus(tenantEnterprise.id);
  assert.equal(entQuota.tier, 'ENTERPRISE');
  assert.equal(entQuota.config.requestsPerMinute, 6000);
  assert.equal(entQuota.config.burstCapacity, 1000);
  console.log('✔ Quota configurations resolved correctly from PostgreSQL');

  // 3. Token consumption — burst capacity of FREE is 20 ─────────────────────
  console.log('\n3. Testing token bucket: consuming 20 tokens (FREE burst cap)...');
  // Reset to fresh bucket (setTenantTier already sets tokens = burstCapacity)
  await governor.setTenantTier(tenantFree.id, 'FREE');

  let lastDecision;
  for (let i = 1; i <= 20; i++) {
    lastDecision = await governor.consumeRequest(tenantFree.id, 'FREE');
    assert.equal(lastDecision.allowed, true, `Request ${i} must be allowed`);
  }
  console.log(`✔ All 20 FREE burst tokens consumed. Remaining: ${lastDecision.remaining}`);

  // 4. Throttle on 21st request ──────────────────────────────────────────────
  console.log('\n4. Testing throttle enforcement on 21st request...');
  const throttled = await governor.consumeRequest(tenantFree.id, 'FREE');
  assert.equal(throttled.allowed, false);
  assert.equal(throttled.remaining, 0);
  assert.ok(throttled.retryAfterSeconds >= 1, 'Retry-After must be >= 1s');
  console.log(`✔ Request 21 throttled correctly. Retry-After: ${throttled.retryAfterSeconds}s`);

  // 5. Multi-tenant isolation ────────────────────────────────────────────────
  console.log('\n5. Testing multi-tenant isolation (throttled FREE must NOT affect ENTERPRISE)...');
  const entDecision = await governor.consumeRequest(tenantEnterprise.id, 'ENTERPRISE');
  assert.equal(entDecision.allowed, true);
  assert.equal(entDecision.tier, 'ENTERPRISE');
  assert.ok(entDecision.remaining >= 999, 'Enterprise tenant must have tokens available');
  console.log(`✔ ENTERPRISE tenant unaffected by throttled FREE tenant. Remaining: ${entDecision.remaining}`);

  // 6. Persistence across reset ─────────────────────────────────────────────
  console.log('\n6. Testing persistence: resetTenant clears DB row...');
  await governor.resetTenant(tenantFree.id);
  const afterReset = await governor.getQuotaStatus(tenantFree.id);
  // After reset no row exists, so available tokens should be at default burst cap
  assert.equal(afterReset.availableTokens, 20, 'After reset availableTokens must equal burst cap');
  console.log('✔ Reset removes DB row; next quota check returns fresh burst capacity');

  // 7. Verify bucket row in PostgreSQL ──────────────────────────────────────
  console.log('\n7. Verifying tenant_rate_buckets rows directly in PostgreSQL...');
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tenant_id, tier, tokens, last_refill_timestamp_ms FROM tenant_rate_buckets WHERE tenant_id = $1`,
    tenantEnterprise.id,
  );
  assert.ok(Array.isArray(rows) && rows.length === 1, 'Enterprise bucket row must exist in DB');
  const bucketRow = rows[0];
  assert.equal(bucketRow.tier, 'ENTERPRISE');
  assert.ok(Number(bucketRow.tokens) >= 0, 'Tokens must be non-negative');
  assert.ok(BigInt(bucketRow.last_refill_timestamp_ms) > 0n, 'Timestamp must be set');
  console.log(`✔ DB row confirmed: tier=${bucketRow.tier}, tokens=${Number(bucketRow.tokens).toFixed(2)}`);

  console.log('\n' + JSON.stringify({
    certification: 'GOVERNOR-PERSISTENT-POSTGRESQL',
    status: 'PASSED',
    tenants: { free: tenantFree.id, enterprise: tenantEnterprise.id },
    assertions: 7,
  }, null, 2));

} finally {
  await prisma.tenant.delete({ where: { id: tenantFree.id } }).catch(() => {});
  await prisma.tenant.delete({ where: { id: tenantEnterprise.id } }).catch(() => {});
  await prisma.$disconnect();
  console.log('\nSetup tenants cleaned up.');
}
