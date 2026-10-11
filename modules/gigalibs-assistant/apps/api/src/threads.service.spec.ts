import { describe, expect, it, vi } from 'vitest';
import type { ModuleCommandContext, ModulePrincipal } from '@gigalibs/module-sdk';
import { ThreadsService } from './threads.service.js';
import type { DatabaseService } from './database.service.js';

const THREAD_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = 'user-a';

function context(tenantId = 'tenant-a', subject = OWNER_ID, permissions = ['assistant:thread:read', 'assistant:thread:write']): ModuleCommandContext {
  return {
    principal: { tenantId, subject, permissions, sessionId: 'session-a', authVersion: 1, roles: [],
      persona: 'OPERATIONS_SUPERVISOR', departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' } } as ModulePrincipal,
    correlationId: 'proof-a',
  };
}

function database(rows: (sql: string) => unknown[]) {
  const statements: Array<{ tenantId: string; sql: string; values?: unknown[] }> = [];
  const db = {
    withTenantTransaction: vi.fn(async <T>(tenantId: string, operation: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<T>) =>
      operation({ query: async (sql, values) => { statements.push({ tenantId, sql, values }); return { rows: rows(sql) }; } })),
  } as unknown as DatabaseService;
  return { service: new ThreadsService(db), statements };
}

describe('Assistant private thread boundary', () => {
  it('does not treat wildcard or assistant:* as a private-history grant', async () => {
    const proof = database(() => []);
    await expect(proof.service.list(context('tenant-a', OWNER_ID, ['*', 'assistant:*']))).rejects.toThrow(/Exact Assistant thread permission/);
    expect(proof.statements).toHaveLength(0);
  });

  it('fails closed before any history query when the tenant has no published policy', async () => {
    const proof = database(() => []);
    await expect(proof.service.list(context())).rejects.toThrow(/published tenant policy/);
    expect(proof.statements.map((item) => item.sql)).not.toContain(expect.stringContaining('FROM assistant_threads'));
  });

  it('binds actor and tenant, and refuses a guessed thread instead of returning a different owner', async () => {
    const proof = database((sql) => sql.includes('FROM tenant_policies')
      ? [{ source_manifest_version: 'v1', source_checksum: 'a'.repeat(64), retention_days: 30 }]
      : []);
    await expect(proof.service.get(context('tenant-a', 'user-b'), THREAD_ID)).rejects.toThrow(/not found/);
    expect(proof.statements.find((item) => item.sql.includes('app.actor_id'))?.values).toEqual(['user-b']);
    expect(proof.statements.find((item) => item.sql.includes('FROM assistant_threads'))?.values).toEqual(['tenant-a', 'user-b', THREAD_ID, 30]);
  });

  it('requires a stable idempotency key and rejects unknown create fields', async () => {
    const proof = database(() => []);
    await expect(proof.service.create(context(), 'A private thread')).rejects.toThrow(/Idempotency-Key/);
    expect(proof.statements).toHaveLength(0);
  });

  it('keeps retries idempotent and detects a different payload under the same key', async () => {
    const row = {
      id: THREAD_ID, tenant_id: 'tenant-a', owner_user_id: OWNER_ID, title: 'Prior title', version: 1,
      policy_version: 'v1', policy_checksum: 'a'.repeat(64), expires_at: new Date('2030-01-01T00:00:00Z'),
      created_at: new Date('2026-10-10T00:00:00Z'), updated_at: new Date('2026-10-10T00:00:00Z'),
      request_sha256: '0'.repeat(64),
    };
    const proof = database((sql) => {
      if (sql.includes('FROM tenant_policies')) return [{ source_manifest_version: 'v1', source_checksum: 'a'.repeat(64), retention_days: 30 }];
      if (sql.includes('INSERT INTO assistant_threads')) return [];
      if (sql.includes('FROM assistant_threads')) return [row];
      return [];
    });
    await expect(proof.service.create(context(), 'New title', 'idempotent-key-1')).rejects.toThrow(/different request/);
  });

  it('rejects stale message versions before insertion', async () => {
    const row = {
      id: THREAD_ID, tenant_id: 'tenant-a', owner_user_id: OWNER_ID, title: 'Thread', version: 4,
      policy_version: 'v1', policy_checksum: 'a'.repeat(64), expires_at: new Date('2030-01-01T00:00:00Z'),
      created_at: new Date('2026-10-10T00:00:00Z'), updated_at: new Date('2026-10-10T00:00:00Z'),
      request_sha256: '0'.repeat(64),
    };
    const proof = database((sql) => {
      if (sql.includes('FROM tenant_policies')) return [{ source_manifest_version: 'v1', source_checksum: 'a'.repeat(64), retention_days: 30 }];
      if (sql.includes('FROM assistant_threads')) return [row];
      return [];
    });
    await expect(proof.service.appendUserMessage(context(), THREAD_ID, { content: 'Hello', expectedVersion: 3 }, 'idempotent-key-2')).rejects.toThrow(/version changed/);
    expect(proof.statements.some((item) => item.sql.includes('INSERT INTO assistant_messages'))).toBe(false);
  });

  it('refuses a new message when the published policy changed after the thread was created', async () => {
    const row = {
      id: THREAD_ID, tenant_id: 'tenant-a', owner_user_id: OWNER_ID, title: 'Thread', version: 1,
      policy_version: 'v1', policy_checksum: 'a'.repeat(64), expires_at: new Date('2030-01-01T00:00:00Z'),
      created_at: new Date('2026-10-10T00:00:00Z'), updated_at: new Date('2026-10-10T00:00:00Z'),
      request_sha256: '0'.repeat(64),
    };
    const proof = database((sql) => {
      if (sql.includes('FROM tenant_policies')) return [{ source_manifest_version: 'v2', source_checksum: 'b'.repeat(64), retention_days: 7 }];
      if (sql.includes('FROM assistant_threads')) return [row];
      return [];
    });
    await expect(proof.service.appendUserMessage(context(), THREAD_ID, { content: 'Hello', expectedVersion: 1 }, 'idempotent-key-3'))
      .rejects.toThrow(/policy changed/);
    expect(proof.statements.some((item) => item.sql.includes('INSERT INTO assistant_messages'))).toBe(false);
    expect(proof.statements.find((item) => item.sql.includes('FROM assistant_threads'))?.values)
      .toEqual(['tenant-a', OWNER_ID, THREAD_ID, 7]);
  });

  it('shows the shorter current retention deadline instead of the stale original deadline', async () => {
    const row = {
      id: THREAD_ID, tenant_id: 'tenant-a', owner_user_id: OWNER_ID, title: 'Thread', version: 1,
      policy_version: 'v1', policy_checksum: 'a'.repeat(64), expires_at: new Date('2026-11-09T00:00:00Z'),
      created_at: new Date('2026-10-10T00:00:00Z'), updated_at: new Date('2026-10-10T00:00:00Z'),
      request_sha256: '0'.repeat(64),
    };
    const proof = database((sql) => {
      if (sql.includes('FROM tenant_policies')) return [{ source_manifest_version: 'v2', source_checksum: 'b'.repeat(64), retention_days: 7 }];
      if (sql.includes('FROM assistant_threads')) return [row];
      return [];
    });
    await expect(proof.service.get(context(), THREAD_ID)).resolves.toMatchObject({ expiresAt: '2026-10-17T00:00:00.000Z' });
  });
});
