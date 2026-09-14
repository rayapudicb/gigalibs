import { describe, it, expect } from 'vitest';
import { MultiTenantBrokerManager } from '../src/multi-tenant-manager.js';

describe('MultiTenantBrokerManager', () => {
  it('declaratively provisions tenant infrastructure across Redis, RabbitMQ, and Kafka', () => {
    const manager = new MultiTenantBrokerManager();
    const profile = manager.provisionTenant('defense', 'ENTERPRISE_DEDICATED');

    expect(profile.tenantId).toBe('defense');
    expect(profile.tier).toBe('ENTERPRISE_DEDICATED');
    expect(profile.status).toBe('ACTIVE');
    expect(profile.rabbitmq.vhost).toBe('/vhost_defense');
    expect(profile.kafka.topics).toContain('t.defense.events');
    expect(profile.redis.keyspacePrefix).toBe('t:defense:');
    expect(profile.fipsSha256Receipt).toBeDefined();
    expect(profile.fipsSha256Receipt.length).toBe(64);
  });

  it('enforces distributed locking via Redis with automatic release', async () => {
    const manager = new MultiTenantBrokerManager();
    manager.provisionTenant('energy');

    const lock1 = await manager.acquireDistributedLock('energy', 'invoice_4920', 5000);
    expect(lock1).not.toBeNull();

    // Secondary acquisition attempt should fail while lock1 is held
    const lock2 = await manager.acquireDistributedLock('energy', 'invoice_4920', 5000);
    expect(lock2).toBeNull();

    // Release lock1
    const released = await lock1!.release();
    expect(released).toBe(true);

    // Now acquisition succeeds
    const lock3 = await manager.acquireDistributedLock('energy', 'invoice_4920', 5000);
    expect(lock3).not.toBeNull();
    await lock3!.release();
  });

  it('dispatches transactional tasks to tenant-scoped RabbitMQ queue', async () => {
    const manager = new MultiTenantBrokerManager();
    manager.provisionTenant('treasury');

    const result = await manager.dispatchTransactionalTask('treasury', 'reconcile_dts_ledger', {
      batchId: 'BATCH-2026-901',
      totalAmountUsd: 1420500.0,
    });

    expect(result.status).toBe('QUEUED');
    expect(result.taskId).toMatch(/^task-/);
    expect(result.sha256Receipt.length).toBe(64);
  });

  it('appends immutable event to Kafka topic with SHA-256 seal', async () => {
    const manager = new MultiTenantBrokerManager();
    manager.provisionTenant('defense');

    const result = await manager.appendAuditStream('defense', 'CONTRACT-9901', 'contract.signed', {
      vendor: 'Lockheed Martin',
      obligatedAmountUsd: 85000000.0,
    });

    expect(result.topic).toBe('t.defense.contract.signed');
    expect(result.offset).toBeGreaterThan(0);
    expect(result.sha256Seal.length).toBe(64);
  });
});
