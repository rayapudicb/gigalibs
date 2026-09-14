/**
 * verify-saga-persistent.mjs
 *
 * Certifies the PostgreSQL-backed PrismaSagaService (Phase 3).
 * Creates real Tenant rows, executes forward and compensating sagas, reads back
 * from the saga_instances / saga_steps tables, and asserts full integrity.
 *
 * Requires: DATABASE_URL pointing to a live PostgreSQL instance with the migration
 * packages/db/migrations/20260914000000_add_saga_governor_parenttenant applied.
 */

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { prisma } from '../packages/db/dist/index.js';
import { PrismaSagaService } from '../apps/workflow-platform/lib/prisma-saga-service.ts';

console.log('--- Commencing Durable Saga State Machine Verification (PostgreSQL) ---');

const sagaService = new PrismaSagaService();

// 1. Create a real tenant to satisfy FK constraint
const testTenant = await prisma.tenant.create({
  data: {
    slug: `saga-persist-${randomBytes(4).toString('hex')}`,
    name: 'Saga Persistence Verification Tenant',
  },
});
const tenantId = testTenant.id;
console.log(`Setup: created test tenant '${tenantId}'`);

try {
  // ── Test 1: Happy-path forward saga ──────────────────────────────────────
  console.log('\n1. Testing forward saga (DISPUTE_ESCROW_SETTLEMENT, no failures)...');

  const forward = await sagaService.executeSaga(
    tenantId,
    'DISPUTE_ESCROW_SETTLEMENT',
    { invoiceCode: 'INV-TEST-001', disputedAmountUsd: 12_000_000 },
  );

  assert.equal(forward.status, 'COMPLETED');
  assert.equal(forward.compensationTriggered, false);
  assert.equal(forward.steps.length, 4, 'DISPUTE_ESCROW_SETTLEMENT must have 4 steps');
  assert.ok(forward.steps.every((s) => s.status === 'SUCCESS'), 'All steps must be SUCCESS');
  assert.ok(forward.auditLedgerDigest.length === 64, 'SHA-256 digest must be 64 hex chars');
  console.log(`✔ Forward saga completed: ${forward.sagaId} (digest: ${forward.auditLedgerDigest.slice(0, 16)}...)`);

  // Verify it was persisted to PostgreSQL
  const persisted = await sagaService.getSaga(forward.sagaId);
  assert.ok(persisted, 'Saga must be retrievable from DB');
  assert.equal(persisted.status, 'COMPLETED');
  assert.equal(persisted.steps.length, 4);
  console.log(`✔ Saga durable in PostgreSQL: retrieved ${persisted.steps.length} steps from DB`);

  // ── Test 2: Compensating saga (failure injection at step 3) ──────────────
  console.log('\n2. Testing compensating saga (GRID_CONTINGENCY_FAILOVER, fail at step 3)...');

  const compensated = await sagaService.executeSaga(
    tenantId,
    'GRID_CONTINGENCY_FAILOVER',
    { substation: 'TX-SOUTH-345KV', requestedMw: 900 },
    3, // inject failure
  );

  assert.equal(compensated.status, 'COMPENSATED');
  assert.equal(compensated.compensationTriggered, true);
  assert.equal(compensated.steps.length, 3);
  assert.equal(compensated.steps[2]!.status, 'FAILED');
  assert.equal(compensated.steps[0]!.status, 'COMPENSATED');
  assert.equal(compensated.steps[1]!.status, 'COMPENSATED');
  assert.ok(compensated.auditLedgerDigest.length === 64);
  console.log(`✔ Compensating saga rolled back correctly: ${compensated.sagaId}`);

  // Verify compensation state in DB
  const persistedComp = await sagaService.getSaga(compensated.sagaId);
  assert.equal(persistedComp!.status, 'COMPENSATED');
  assert.equal(persistedComp!.compensationTriggered, true);
  const dbSteps = persistedComp!.steps;
  assert.equal(dbSteps[0]!.status, 'COMPENSATED');
  assert.equal(dbSteps[1]!.status, 'COMPENSATED');
  assert.equal(dbSteps[2]!.status, 'FAILED');
  console.log(`✔ Compensation state durable in PostgreSQL: DB steps confirmed`);

  // ── Test 3: Multi-saga list for tenant ───────────────────────────────────
  console.log('\n3. Testing getSagas(tenantId) returns both sagas from DB...');
  const all = await sagaService.getSagas(tenantId);
  assert.ok(all.length >= 2, `Expected >= 2 sagas, got ${all.length}`);
  const sagaIds = all.map((s) => s.sagaId);
  assert.ok(sagaIds.includes(forward.sagaId), 'Forward saga must appear in list');
  assert.ok(sagaIds.includes(compensated.sagaId), 'Compensated saga must appear in list');
  console.log(`✔ Tenant saga listing returns ${all.length} rows from PostgreSQL`);

  // ── Test 4: TREASURY_RTGS_SETTLEMENT forward ─────────────────────────────
  console.log('\n4. Testing TREASURY_RTGS_SETTLEMENT saga (full forward completion)...');
  const treasury = await sagaService.executeSaga(
    tenantId,
    'TREASURY_RTGS_SETTLEMENT',
    { reference: 'RTGS-2026-XYZ' },
  );
  assert.equal(treasury.status, 'COMPLETED');
  assert.equal(treasury.steps.length, 3);
  console.log(`✔ Treasury RTGS saga completed: ${treasury.sagaId}`);

  console.log('\n' + JSON.stringify({
    certification: 'SAGA-PERSISTENT-POSTGRESQL',
    status: 'PASSED',
    sagas: {
      forward: forward.sagaId,
      compensated: compensated.sagaId,
      treasury: treasury.sagaId,
    },
  }, null, 2));

} finally {
  // Cleanup — cascades to saga_instances and saga_steps via FK
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.$disconnect();
  console.log('\nSetup tenant cleaned up.');
}
