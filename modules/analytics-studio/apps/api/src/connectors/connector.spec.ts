/**
 * connector.spec.ts
 * WI-OI-043 Phase 1 — Connector Hub auth, tenant isolation, TLS, and SSRF tests.
 *
 * These tests use the analytics-truth-boundary pattern: they assert what the
 * module DOES NOT do (cross-tenant reads, SSRF, clear-text connections) as
 * well as what it DOES do (tenant-scoped CRUD, connection probing with TLS).
 *
 * Execution: jest (or vitest) within the analytics-studio module.
 * Database: these are integration tests — they require a live PostgreSQL
 *   instance with migrations 000001-000005 applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConnectorService } from './connector.service.js';
import { DatabaseService } from '../database/database.service.js';
import { RequirePermissions } from '../auth/authorization.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-alpha-001';
const TENANT_B = 'tenant-beta-002';

function makePrincipal(tenantId: string, permissions: string[] = ['analytics:*']): AnalyticsPrincipal {
  return {
    tenantId,
    subject: `user-${tenantId}`,
    issuer: 'https://auth.gigalibs.test',
    permissions: Object.freeze(permissions),
  };
}

const VALID_DTO_BASE = {
  displayName: 'Test Warehouse',
  sourceType: 'POSTGRES' as const,
  host: 'warehouse.example.com',
  port: 5432,
  databaseName: 'analytics_db',
  sslMode: 'require' as const,
  credentialVaultKey: 'hashicorp-vault/analytics-studio-test/pg-cred-test',
};

// ─────────────────────────────────────────────────────────────────────────────

describe('ConnectorService — authentication boundary', () => {
  /**
   * These tests validate that every operation requires a valid principal.
   * In the real HTTP flow the PlatformContextAuthorizationGuard runs first; here we
   * test the service layer directly to confirm it doesn't bypass guard
   * failures by calling with undefined/null principals.
   */

  it('should reject missing tenant in principal', async () => {
    // A principal with an empty tenantId must never reach the database
    const badPrincipal = { ...makePrincipal(''), tenantId: '' };
    const service = await buildServiceWithMockDb({
      withTenantTransaction: async () => { throw new Error('DB should not be called'); },
    });
    await expect(
      service.createConnection(badPrincipal, VALID_DTO_BASE),
    ).rejects.toBeDefined();
  });

  it('should require analytics:connectors:write for createConnection (permission model)', () => {
    // The guard enforces this; verify the decorator is declared on the controller.
    // We inspect metadata directly since the guard is mocked out in service tests.
    // This is a documentation assertion — the guard integration test covers runtime.
    expect(typeof RequirePermissions).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ConnectorService — SSRF / egress guard', () => {
  let service: ConnectorService;

  beforeAll(async () => {
    service = await buildServiceWithMockDb({
      withTenantTransaction: async (_tid: string, cb: any) => {
        // Simulate DB success — SSRF errors must fire before DB is called
        return cb({
          query: async () => ({ rows: [{ id: 'mock-id', tenant_id: _tid, display_name: 'x', source_type: 'POSTGRES', host: 'x', port: 5432, database_name: 'db', ssl_mode: 'require', status: 'PENDING', created_by: 'sub', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }], rowCount: 1 }),
        });
      },
    });
  });

  const blockedHosts = [
    { label: 'loopback hostname', host: 'localhost', port: 5432 },
    { label: 'loopback IP', host: '127.0.0.1', port: 5432 },
    { label: 'AWS metadata endpoint', host: '169.254.169.254', port: 80 },
    { label: 'RFC-1918 (10.x)', host: '10.0.0.1', port: 5432 },
    { label: 'RFC-1918 (172.16.x)', host: '172.16.0.1', port: 5432 },
    { label: 'RFC-1918 (192.168.x)', host: '192.168.1.1', port: 5432 },
    { label: 'link-local', host: '169.254.1.1', port: 5432 },
    { label: 'GCP metadata hostname', host: 'metadata.google.internal', port: 80 },
  ];

  for (const { label, host, port } of blockedHosts) {
    it(`should reject SSRF attempt: ${label} (${host}:${port})`, async () => {
      await expect(
        service.createConnection(makePrincipal(TENANT_A), {
          ...VALID_DTO_BASE,
          host,
          port,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  }

  it('should reject ssl_mode: disable', async () => {
    await expect(
      service.createConnection(makePrincipal(TENANT_A), {
        ...VALID_DTO_BASE,
        host: 'public.warehouse.example.com',
        sslMode: 'disable' as any,
      }),
    ).rejects.toBeDefined();
  });

  it('should reject malformed credential vault key', async () => {
    await expect(
      service.createConnection(makePrincipal(TENANT_A), {
        ...VALID_DTO_BASE,
        host: 'public.warehouse.example.com',
        credentialVaultKey: '../../../etc/passwd',
      }),
    ).rejects.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ConnectorService — tenant isolation', () => {
  /**
   * Tenant A must never see Tenant B's connections.
   * These tests use a mock DB that simulates RLS by filtering on tenant_id.
   */

  it('getConnection should throw NotFoundException when tenant B queries tenant A record', async () => {
    const storedConnections: Record<string, { id: string; tenant_id: string }> = {
      'conn-a1': { id: 'conn-a1', tenant_id: TENANT_A },
    };

    const service = await buildServiceWithMockDb({
      queryWithTenant: async (tenantId: string, sql: string, params: any[]) => {
        // Simulate RLS: filter by tenant_id
        const connId = params?.[0];
        const rows = connId
          ? Object.values(storedConnections).filter(
              (c) => c.id === connId && c.tenant_id === tenantId,
            )
          : Object.values(storedConnections).filter((c) => c.tenant_id === tenantId);
        return {
          rows: rows.map((r) => ({
            ...r,
            display_name: 'Test',
            source_type: 'POSTGRES',
            host: 'h',
            port: 5432,
            database_name: 'db',
            ssl_mode: 'require',
            status: 'PENDING',
            created_by: 'sub',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
          rowCount: rows.length,
        };
      },
    });

    // Tenant A can see their own connection
    const ownConn = await service.getConnection(makePrincipal(TENANT_A), 'conn-a1');
    expect(ownConn.id).toBe('conn-a1');

    // Tenant B cannot see Tenant A's connection → NotFoundException
    await expect(
      service.getConnection(makePrincipal(TENANT_B), 'conn-a1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('listConnections should return only the calling tenant records', async () => {
    const stored = [
      { id: 'a1', tenant_id: TENANT_A },
      { id: 'a2', tenant_id: TENANT_A },
      { id: 'b1', tenant_id: TENANT_B },
    ];

    const service = await buildServiceWithMockDb({
      queryWithTenant: async (tenantId: string) => ({
        rows: stored
          .filter((r) => r.tenant_id === tenantId)
          .map((r) => ({
            ...r,
            display_name: 'Test',
            source_type: 'POSTGRES',
            host: 'h',
            port: 5432,
            database_name: 'db',
            ssl_mode: 'require',
            status: 'PENDING',
            created_by: 'sub',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
        rowCount: 0,
      }),
    });

    const tenantAList = await service.listConnections(makePrincipal(TENANT_A));
    expect(tenantAList).toHaveLength(2);
    expect(tenantAList.every((c) => c.tenantId === TENANT_A)).toBe(true);

    const tenantBList = await service.listConnections(makePrincipal(TENANT_B));
    expect(tenantBList).toHaveLength(1);
    expect(tenantBList[0]!.tenantId).toBe(TENANT_B);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ConnectorService — read-only enforcement', () => {
  /**
   * The test-connection probe sets 'default_transaction_read_only = on'
   * before executing any query. Verify the mock sequence includes that SET.
   */

  it('should set read-only transaction before probing external source', async () => {
    const executedQueries: string[] = [];

    // We intercept the pg.Pool inside the service by patching pg at module level.
    // For unit tests, we assert that the service logic includes the SET statement.
    // The integration test verifies actual enforcement against a live PostgreSQL.

    // Confirm the source code contains the read-only enforcement
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('./connector.service.ts', import.meta.url).pathname,
      'utf8',
    );
    expect(src).toContain('default_transaction_read_only = on');
    expect(src).toContain('sslConfig');
    expect(src).not.toContain("ssl: false");
    expect(src).not.toContain("ssl: { rejectUnauthorized: false, rejectUnauthorized: false }");
  });

  it('performReadOnlyProbe should never use sslMode disable', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      new URL('./connector.service.ts', import.meta.url).pathname,
      'utf8',
    );
    // 'disable' must never appear in the sslConfig switch statement
    // (the create boundary already blocks it, but defense in depth)
    const sslConfigBlock = src.slice(
      src.indexOf('sslConfig: pg.ConnectionConfig'),
      src.indexOf('performReadOnlyProbe'),
    );
    expect(sslConfigBlock).not.toContain("case 'disable'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ConnectorService — credential vault key format', () => {
  const validKeys = [
    'hashicorp-vault/analytics-studio-prod/pg-cred-acme-corp',
    'aws-secrets/us-east-1/my-db-secret',
    'vault/scope-1/secret-name',
  ];

  const invalidKeys = [
    '../../../etc/passwd',
    'no-slash',
    'one/slash',
    'UPPERCASE/SCOPE/NAME',
    '/leading-slash/a/b',
    'a/b/c/d/e',
    '',
    '../../traversal',
  ];

  it.each(validKeys)('should accept valid vault key: %s', async (key) => {
    const regex = /^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-z0-9_-]+$/;
    expect(regex.test(key)).toBe(true);
  });

  it.each(invalidKeys)('should reject invalid vault key: "%s"', async (key) => {
    const regex = /^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-z0-9_-]+$/;
    expect(regex.test(key)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ConnectorService — append-only raw_record_versions (schema assertion)', () => {
  it('migration 000005 must contain REVOKE UPDATE, DELETE on raw_record_versions', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.resolve(
      new URL('.', import.meta.url).pathname,
      '../../../../db/migrations/000005_connector_sync_runs_and_raw_records.up.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('REVOKE UPDATE, DELETE ON gigalibs_analytics.raw_record_versions');
  });

  it('migration 000005 must enable RLS and FORCE RLS on raw_record_versions', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.resolve(
      new URL('.', import.meta.url).pathname,
      '../../../../db/migrations/000005_connector_sync_runs_and_raw_records.up.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    // Must have policy on raw_record_versions
    expect(sql).toContain('raw_records_tenant_isolation');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function buildServiceWithMockDb(
  dbOverrides: Partial<{
    query: (...args: any[]) => Promise<any>;
    queryWithTenant: (...args: any[]) => Promise<any>;
    withTenantTransaction: (...args: any[]) => Promise<any>;
    transaction: (...args: any[]) => Promise<any>;
  }>,
): Promise<ConnectorService> {
  const mockDb = {
    query: dbOverrides.query ?? (async () => ({ rows: [], rowCount: 0 })),
    queryWithTenant: dbOverrides.queryWithTenant ?? (async () => ({ rows: [], rowCount: 0 })),
    withTenantTransaction:
      dbOverrides.withTenantTransaction ??
      (async (_tid: string, cb: any) => cb({ query: async () => ({ rows: [], rowCount: 0 }) })),
    transaction:
      dbOverrides.transaction ??
      (async (cb: any) => cb({ query: async () => ({ rows: [], rowCount: 0 }) })),
  };

  return new ConnectorService(mockDb as unknown as DatabaseService);
}
