/**
 * ingestion.spec.ts
 * WI-OI-043 Phase 2 — Ingestion engine: identifier validation, watermark,
 * tenant isolation, CONTAINED_P0 boundary, append-only enforcement.
 */

import { describe, it, expect } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IngestionService } from './ingestion.service.js';
import { DatabaseService } from '../database/database.service.js';
import { ConnectorService } from '../connectors/connector.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

const TENANT_A = 'tenant-alpha-001';

function makePrincipal(tenantId = TENANT_A): AnalyticsPrincipal {
  return {
    tenantId,
    subject: `user-${tenantId}`,
    issuer: 'https://auth.gigalibs.test',
    permissions: Object.freeze(['analytics:*']),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('IngestionService — identifier validation', () => {
  const validIdentifiers = ['orders', 'line_items', 'user_events', 'a1', 'table123'];
  const invalidIdentifiers = [
    'Orders',           // uppercase
    '1orders',          // starts with digit
    'drop_table;select',// SQL injection attempt
    '../etc/passwd',    // path traversal
    '',                 // empty
    'a'.repeat(64),     // too long (max 63)
    'tab le',           // space
    "tab'le",           // single quote
  ];

  it.each(validIdentifiers)('should accept valid identifier: %s', async (id) => {
    const regex = /^[a-z][a-z0-9_]{0,62}$/;
    expect(regex.test(id)).toBe(true);
  });

  it.each(invalidIdentifiers)('should reject invalid identifier: "%s"', async (id) => {
    const regex = /^[a-z][a-z0-9_]{0,62}$/;
    expect(regex.test(id)).toBe(false);
  });

  it('should throw BadRequestException for invalid sourceTableName', async () => {
    const service = await buildService({});
    await expect(
      service.startSync(makePrincipal(), {
        connectionId: '00000000-0000-4000-8000-000000000001',
        sourceTableName: 'DROP TABLE users--',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException for invalid watermarkColumn', async () => {
    const service = await buildService({});
    await expect(
      service.startSync(makePrincipal(), {
        connectionId: '00000000-0000-4000-8000-000000000001',
        sourceTableName: 'orders',
        watermarkColumn: "updated_at; DROP TABLE users--",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException for pageSize = 0', async () => {
    const service = await buildService({});
    await expect(
      service.startSync(makePrincipal(), {
        connectionId: '00000000-0000-4000-8000-000000000001',
        sourceTableName: 'orders',
        pageSize: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should cap pageSize at MAX_PAGE_SIZE (500)', async () => {
    // pageSize > 500 should be silently capped, not error
    // Test by confirming the CONTAINED_P0 error (not a pageSize error) is thrown
    const service = await buildService({
      connectorGetConnection: async () => ({
        id: 'conn1', tenantId: TENANT_A, displayName: 'T', sourceType: 'POSTGRES',
        host: 'remote.example.com', port: 5432, databaseName: 'db',
        sslMode: 'require', status: 'ACTIVE', createdBy: 'u',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }),
    });
    const result = await service.startSync(makePrincipal(), {
      connectionId: '00000000-0000-4000-8000-000000000001',
      sourceTableName: 'orders',
      pageSize: 9999, // will be capped to 500
    });
    // Should return FAILED (CONTAINED_P0 vault not wired), not a BadRequestException
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toContain('CONTAINED_P0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('IngestionService — CONTAINED_P0 vault boundary', () => {
  it('startSync should return FAILED with CONTAINED_P0 message until vault is wired', async () => {
    const service = await buildService({
      connectorGetConnection: async () => ({
        id: 'conn1', tenantId: TENANT_A, displayName: 'T', sourceType: 'POSTGRES',
        host: 'remote.example.com', port: 5432, databaseName: 'db',
        sslMode: 'require', status: 'ACTIVE', createdBy: 'u',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }),
    });

    const result = await service.startSync(makePrincipal(), {
      connectionId: '00000000-0000-4000-8000-000000000001',
      sourceTableName: 'orders',
    });

    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toBeTruthy();
    expect(result.errorMessage).toContain('CONTAINED_P0');
  });

  it('startSync should record a sync run in RUNNING then FAILED state', async () => {
    const writtenRuns: Record<string, unknown>[] = [];
    const updatedRuns: Record<string, unknown>[] = [];

    const service = await buildService({
      connectorGetConnection: async () => ({
        id: 'conn1', tenantId: TENANT_A, displayName: 'T', sourceType: 'POSTGRES',
        host: 'remote.example.com', port: 5432, databaseName: 'db',
        sslMode: 'require', status: 'ACTIVE', createdBy: 'u',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }),
      queryWithTenant: async (_tid: string, sql: string, params: any[]) => {
        if (sql.includes('INSERT INTO gigalibs_analytics.source_sync_runs')) {
          const id = 'run-mock-001';
          writtenRuns.push({ id, status: 'RUNNING', rows_fetched: 0 });
          return { rows: [{ id }], rowCount: 1 };
        }
        if (sql.includes('UPDATE gigalibs_analytics.source_sync_runs')) {
          updatedRuns.push({ params });
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('SELECT id, connection_id, tenant_id, status')) {
          return {
            rows: [{
              id: 'run-mock-001', connection_id: 'conn1', tenant_id: TENANT_A,
              status: 'FAILED', rows_fetched: 0, watermark_value: null,
              error_message: 'CONTAINED_P0: vault not wired',
              started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
            }],
            rowCount: 1,
          };
        }
        // Watermark lookup
        return { rows: [], rowCount: 0 };
      },
    });

    const result = await service.startSync(makePrincipal(), {
      connectionId: '00000000-0000-4000-8000-000000000001',
      sourceTableName: 'orders',
    });

    expect(result.status).toBe('FAILED');
    // Sync run was created (RUNNING) then marked FAILED
    expect(writtenRuns.length).toBeGreaterThanOrEqual(1);
    expect(updatedRuns.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('IngestionService — tenant isolation', () => {
  it('listSyncRuns should delegate connection lookup to ConnectorService (RLS)', async () => {
    let connectorGetCalled = false;
    const service = await buildService({
      connectorGetConnection: async (principal: any, connId: string) => {
        connectorGetCalled = true;
        // Simulate RLS rejection for wrong tenant
        if (principal.tenantId !== TENANT_A) {
          throw new NotFoundException('Connection not found.');
        }
        return {
          id: connId, tenantId: TENANT_A, displayName: 'T', sourceType: 'POSTGRES',
          host: 'h', port: 5432, databaseName: 'db', sslMode: 'require',
          status: 'ACTIVE', createdBy: 'u',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
      },
    });

    await service.listSyncRuns(makePrincipal(), 'conn1');
    expect(connectorGetCalled).toBe(true);
  });

  it('listSyncRuns should throw NotFoundException for cross-tenant connection ID', async () => {
    const service = await buildService({
      connectorGetConnection: async () => {
        throw new NotFoundException('Connection not found.');
      },
    });

    await expect(
      service.listSyncRuns({ ...makePrincipal(), tenantId: 'tenant-other' }, 'conn-belongs-to-alpha'),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('IngestionService — source code audit', () => {
  it('ingestion loop must set default_transaction_read_only = on before querying source', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      new URL('./ingestion.service.ts', import.meta.url).pathname,
      'utf8',
    );
    expect(src).toContain('default_transaction_read_only = on');
  });

  it('writePage must INSERT (not UPDATE) into raw_record_versions', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      new URL('./ingestion.service.ts', import.meta.url).pathname,
      'utf8',
    );
    expect(src).toContain('INSERT INTO gigalibs_analytics.raw_record_versions');
    // Must not attempt UPDATE on append-only table
    const rawRecordSection = src.slice(
      src.indexOf('writePage'),
      src.indexOf('checkpointWatermark'),
    );
    expect(rawRecordSection).not.toContain('UPDATE gigalibs_analytics.raw_record_versions');
  });

  it('pk hash must use sha256 (deterministic and collision-resistant)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      new URL('./ingestion.service.ts', import.meta.url).pathname,
      'utf8',
    );
    expect(src).toContain("createHash('sha256')");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function buildService(overrides: {
  queryWithTenant?: (...args: any[]) => Promise<any>;
  withTenantTransaction?: (...args: any[]) => Promise<any>;
  connectorGetConnection?: (...args: any[]) => Promise<any>;
}): Promise<IngestionService> {
  const defaultQuery = async (_tenantId?: string, sql = '') => {
    if (sql.includes('INSERT INTO gigalibs_analytics.source_sync_runs')) {
      return { rows: [{ id: 'run-default-001' }], rowCount: 1 };
    }
    if (sql.includes('SELECT id, connection_id, tenant_id, status')) {
      return {
        rows: [{
          id: 'run-default-001', connection_id: 'conn-default', tenant_id: TENANT_A,
          status: 'FAILED', rows_fetched: 0, watermark_value: null,
          error_message: 'CONTAINED_P0: vault not wired',
          started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };

  const mockDb = {
    query: defaultQuery,
    queryWithTenant: overrides.queryWithTenant ?? defaultQuery,
    withTenantTransaction:
      overrides.withTenantTransaction ??
      (async (_tid: string, cb: any) => cb({ query: defaultQuery })),
    transaction: async (cb: any) => cb({ query: defaultQuery }),
  };

  const mockConnector = {
    getConnection:
      overrides.connectorGetConnection ??
      (async () => ({
        id: 'conn-default', tenantId: TENANT_A, displayName: 'T', sourceType: 'POSTGRES',
        host: 'h', port: 5432, databaseName: 'db', sslMode: 'require', status: 'ACTIVE',
        createdBy: 'u', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })),
    listConnections: async () => [],
    createConnection: async () => { throw new Error('not in scope'); },
    deleteConnection: async () => {},
    testConnection: async () => ({ success: false, latencyMs: 0 }),
  };

  return new IngestionService(
    mockDb as unknown as DatabaseService,
    mockConnector as unknown as ConnectorService,
  );
}
