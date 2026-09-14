import assert from 'node:assert/strict';
import { sagaOrchestratorStore } from '../apps/workflow-platform/lib/saga-orchestrator.ts';
import { eventFabricQueueStore } from '../apps/workflow-platform/lib/event-fabric-queue.ts';

console.log('--- Commencing Saga Orchestration & Event Fabric Verification ---');

// 1. Verify Forward Saga Execution (Happy Path)
console.log('1. Testing Forward Distributed Saga (No Failures)...');
const forwardSaga = sagaOrchestratorStore.executeSaga(
  'defense',
  'DISPUTE_ESCROW_SETTLEMENT',
  { invoiceCode: 'INV-DOD-2026-TEST', disputedAmountUsd: 15000000 },
);

assert.equal(forwardSaga.status, 'COMPLETED');
assert.equal(forwardSaga.compensationTriggered, false);
assert.equal(forwardSaga.steps.length, 4);
assert.ok(forwardSaga.steps.every((s) => s.status === 'SUCCESS'));
assert.ok(forwardSaga.auditLedgerDigest.length === 64, 'SHA-256 digest must be 64 hex characters');
console.log(`✔ Forward saga completed successfully: ${forwardSaga.sagaId} (Digest: ${forwardSaga.auditLedgerDigest.slice(0, 16)}...)`);

// 2. Verify Compensating Saga Execution (Rollback on Failure)
console.log('2. Testing Compensating Distributed Saga (Failure at Step 3 with Auto-Rollback)...');
const compensatedSaga = sagaOrchestratorStore.executeSaga(
  'energy',
  'GRID_CONTINGENCY_FAILOVER',
  { substation: 'CA-SOUTH-500KV', requestedMw: 1800 },
  3, // Fail at step 3
);

assert.equal(compensatedSaga.status, 'COMPENSATED');
assert.equal(compensatedSaga.compensationTriggered, true);
assert.equal(compensatedSaga.steps[2].status, 'FAILED');
assert.equal(compensatedSaga.steps[0].status, 'COMPENSATED');
assert.equal(compensatedSaga.steps[1].status, 'COMPENSATED');
assert.ok(compensatedSaga.auditLedgerDigest.length === 64);
console.log(`✔ Compensating saga safely executed backward rollback: ${compensatedSaga.sagaId}`);

// 3. Verify Event Fabric Ingestion (CloudEvents 1.0)
console.log('3. Testing Event Fabric CloudEvents 1.0 Enqueueing...');
const testData = {
  contractId: 'CONT-2026-X99',
  vendor: 'Lockheed Martin',
  amountUsd: 42000000,
};

const queued = eventFabricQueueStore.enqueueEvent(
  'defense',
  'urn:gigalibs:test:service',
  'com.gigalibs.contract.sealed',
  testData,
  'DEFENSE-CONTRACT-SEAL',
);

assert.equal(queued.status, 'SUCCESS');
assert.equal(queued.cloudEvent.specversion, '1.0');
assert.equal(queued.cloudEvent.source, 'urn:gigalibs:test:service');
assert.equal(queued.cloudEvent.type, 'com.gigalibs.contract.sealed');
assert.ok(queued.cloudEvent.fipsSha256Checksum.length === 64);
console.log(`✔ Event Fabric CloudEvent ingested and sealed: ${queued.id}`);

// 4. Verify Dead-Letter Queue (DLQ) & Event Replay
console.log('4. Testing Dead-Letter Queue (DLQ) Recovery & Event Replay...');
const initialQueue = eventFabricQueueStore.getEvents();
const dlqItem = initialQueue.find((i) => i.status === 'DEAD_LETTER');
assert.ok(dlqItem, 'Initial DLQ item must exist in seed data');

const replayResult = eventFabricQueueStore.replayEvent(dlqItem.id);
assert.equal(replayResult.success, true);
assert.equal(replayResult.event.status, 'SUCCESS');
assert.ok(replayResult.event.auditTrail.some((entry) => entry.message.includes('Manual replay executed')));
console.log(`✔ DLQ Event ${dlqItem.id} replayed and committed with audit trail.`);

// 5. Verify Event Fabric Queue Stats
console.log('5. Testing Event Fabric Aggregated Metrics...');
const stats = eventFabricQueueStore.getStats();
assert.ok(stats.totalIngested > 0);
assert.ok(stats.deliveredCount > 0);
assert.ok(stats.successRatePercent > 90);
assert.equal(stats.brokerHealth, 'HEALTHY');
console.log(`✔ Event Fabric Stats verified: ${stats.totalIngested} ingested, ${stats.successRatePercent}% delivery rate.`);

console.log(JSON.stringify({
  certification: 'SAGA-ORCHESTRATION-AND-EVENT-FABRIC',
  status: 'passed',
  sagas: { forwardCompleted: forwardSaga.sagaId, compensated: compensatedSaga.sagaId },
  eventFabric: { ingestedEvent: queued.id, replayedEvent: dlqItem.id, stats },
}, null, 2));
