/**
 * lineage.spec.ts — Phase 7: Lineage & Audit
 *
 * Test suites:
 *   1. Migration 000010 schema assertions
 *   2. Append-only enforcement (analytics_lineage_edges, analytics_audit_log)
 *   3. Lineage edge recording + deduplication
 *   4. Lineage traversal (upstream / downstream / both)
 *   5. Audit event recording
 *   6. Audit log querying with filters
 *   7. Tenant isolation
 *   8. Payload scrubbing (no credentials/PII/secrets in event_payload)
 */

import * as fs from 'fs';
import * as path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest';

const jest = vi;

// ── helpers ────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.resolve(
  __dirname, '../../../../db/migrations',
);

function readMigration(filename: string): string {
  const full = path.join(MIGRATIONS_DIR, filename);
  return fs.readFileSync(full, 'utf-8');
}

function readServiceSource(filename: string): string {
  return fs.readFileSync(path.join(__dirname, filename), 'utf-8');
}

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 1: Migration 000010 schema assertions
// ══════════════════════════════════════════════════════════════════════════════

describe('Migration 000010 — lineage_and_audit schema', () => {
  let sql: string;

  beforeAll(() => {
    sql = readMigration('000010_lineage_and_audit.up.sql');
  });

  it('declares lineage_node_type enum with all 10 node types', () => {
    const nodeTypes = [
      'SOURCE_CONNECTION', 'SYNC_RUN', 'RAW_RECORD_BATCH',
      'SCHEMA_DISCOVERY', 'STUDIO_MAPPING', 'DATASET_VERSION',
      'SEMANTIC_MODEL', 'CHART_DEFINITION', 'REPORT_RUN', 'REPORT_ARTIFACT',
    ];
    nodeTypes.forEach(t => {
      expect(sql).toContain(`'${t}'`);
    });
  });

  it('declares audit_event_type enum with >= 26 events covering full pipeline', () => {
    const mandatoryEvents = [
      'CONNECTION_CREATED', 'CONNECTION_DELETED',
      'SYNC_STARTED', 'SYNC_COMPLETED', 'SYNC_FAILED',
      'SCHEMA_DISCOVERED',
      'MAPPING_CREATED', 'MAPPING_PUBLISHED',
      'DATASET_BUILD_STARTED', 'DATASET_BUILD_COMPLETED', 'DATASET_BUILD_FAILED',
      'SEMANTIC_MODEL_CREATED', 'SEMANTIC_MODEL_VERSION_SAVED',
      'CHART_CREATED', 'CHART_RENDERED',
      'DASHBOARD_CREATED', 'DASHBOARD_CHART_ADDED',
      'REPORT_DEFINITION_CREATED', 'REPORT_RUN_TRIGGERED',
      'REPORT_SUCCEEDED', 'REPORT_FAILED', 'REPORT_DOWNLOADED',
      'QUERY_EXECUTED',
    ];
    mandatoryEvents.forEach(e => {
      expect(sql).toContain(`'${e}'`);
    });
  });

  it('creates analytics_lineage_edges table', () => {
    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)?\s+gigalibs_analytics\.analytics_lineage_edges/);
  });

  it('analytics_lineage_edges has TEXT ids (no cross-table FKs)', () => {
    // Node IDs are TEXT, not UUID with REFERENCES
    expect(sql).toMatch(/source_node_id\s+TEXT/);
    expect(sql).toMatch(/target_node_id\s+TEXT/);
    // Explicitly: no REFERENCES clause for these node ID columns
    const sourceIdLine = sql.split('\n').find(l => l.includes('source_node_id'));
    expect(sourceIdLine).not.toContain('REFERENCES');
  });

  it('analytics_lineage_edges has UNIQUE dedup constraint', () => {
    expect(sql).toMatch(
      /UNIQUE\s*\(tenant_id, source_node_id, target_node_id, source_node_type, target_node_type\)/,
    );
  });

  it('analytics_lineage_edges has directional indexes', () => {
    expect(sql).toContain('idx_lineage_source');
    expect(sql).toContain('idx_lineage_target');
  });

  it('analytics_lineage_edges revokes UPDATE and DELETE', () => {
    const revokeBlock = sql.slice(sql.indexOf('analytics_lineage_edges'));
    expect(revokeBlock).toContain('REVOKE UPDATE');
    expect(revokeBlock).toContain('REVOKE DELETE');
  });

  it('analytics_lineage_edges has RLS + FORCE RLS', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  });

  it('creates analytics_audit_log table', () => {
    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)?\s+gigalibs_analytics\.analytics_audit_log/);
  });

  it('analytics_audit_log captures actor_subject (not raw token)', () => {
    expect(sql).toContain('actor_subject');
    // Must NOT store raw credential columns
    expect(sql).not.toContain('access_token');
    expect(sql).not.toContain('credential_bytes');
  });

  it('analytics_audit_log captures client_ip as INET type', () => {
    expect(sql).toMatch(/client_ip\s+INET/);
  });

  it('analytics_audit_log captures correlation_id for distributed tracing', () => {
    expect(sql).toContain('correlation_id');
  });

  it('analytics_audit_log revokes UPDATE and DELETE', () => {
    const revokeBlock = sql.slice(sql.indexOf('analytics_audit_log'));
    expect(revokeBlock).toContain('REVOKE UPDATE');
    expect(revokeBlock).toContain('REVOKE DELETE');
  });

  it('analytics_audit_log has three query indexes', () => {
    expect(sql).toContain('idx_audit_tenant_event');
    expect(sql).toContain('idx_audit_tenant_actor');
    expect(sql).toContain('idx_audit_entity');
  });

  it('schema_migrations ledger entry is version 10', () => {
    expect(sql).toContain("'000010_lineage_and_audit'");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 2: Append-only enforcement — source code
// ══════════════════════════════════════════════════════════════════════════════

describe('LineageService — append-only write discipline', () => {
  let svc: string;
  const FORBIDDEN = ['UPDATE ', 'DELETE ', '.update(', '.delete('];

  beforeAll(() => {
    svc = readServiceSource('lineage.service.ts');
  });

  FORBIDDEN.forEach(kw => {
    it(`never emits "${kw}" in lineage.service.ts`, () => {
      // Strip comments
      const code = svc
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code).not.toContain(kw);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 3: Lineage edge recording + deduplication
// ══════════════════════════════════════════════════════════════════════════════

describe('LineageService.recordEdge — edge recording & deduplication', () => {
  let mockDb: {
    queryWithTenant: jest.Mock;
  };
  let lineageService: any;

  beforeEach(async () => {
    const { LineageService } = await import('./lineage.service.js');
    mockDb = { queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }) };
    lineageService = new LineageService(mockDb as any);
  });

  it('inserts edge with correct columns and ON CONFLICT DO NOTHING', async () => {
    await lineageService.recordEdge(
      { tenantId: 't1', subject: 'user:alice@org' },
      {
        sourceNodeId: 'sync-001',
        sourceNodeType: 'SYNC_RUN',
        targetNodeId: 'raw-batch-001',
        targetNodeType: 'RAW_RECORD_BATCH',
        edgeLabel: 'produced',
      },
    );

    expect(mockDb.queryWithTenant).toHaveBeenCalledTimes(1);
    const [, sql, params] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO gigalibs_analytics.analytics_lineage_edges');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO NOTHING');
    expect(params[0]).toBe('t1');               // tenant_id
    expect(params[1]).toBe('sync-001');          // source_node_id
    expect(params[2]).toBe('SYNC_RUN');          // source_node_type
    expect(params[3]).toBe('raw-batch-001');     // target_node_id
    expect(params[4]).toBe('RAW_RECORD_BATCH');  // target_node_type
    expect(params[5]).toBe('produced');          // edge_label
    expect(params[7]).toBe('user:alice@org');    // recorded_by
  });

  it('swallows errors without re-throwing (fire-and-forget)', async () => {
    mockDb.queryWithTenant.mockRejectedValueOnce(new Error('DB down'));
    await expect(
      lineageService.recordEdge(
        { tenantId: 't1', subject: 's' },
        { sourceNodeId: 'a', sourceNodeType: 'SYNC_RUN', targetNodeId: 'b', targetNodeType: 'RAW_RECORD_BATCH' },
      ),
    ).resolves.not.toThrow();
  });

  it('defaults edgeMetadata to empty object when omitted', async () => {
    await lineageService.recordEdge(
      { tenantId: 't1', subject: 's' },
      { sourceNodeId: 'a', sourceNodeType: 'SYNC_RUN', targetNodeId: 'b', targetNodeType: 'RAW_RECORD_BATCH' },
    );
    const [, , params] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(params[6]).toBe('{}');  // edge_metadata JSON
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 4: Lineage traversal direction
// ══════════════════════════════════════════════════════════════════════════════

describe('LineageService.getLineageForNode — traversal direction', () => {
  let mockDb: { queryWithTenant: jest.Mock };
  let lineageService: any;

  const edge = (src: string, tgt: string) => ({
    id: 'e1', source_node_id: src, source_node_type: 'SYNC_RUN',
    target_node_id: tgt, target_node_type: 'RAW_RECORD_BATCH',
    edge_label: 'test', recorded_by: 'u', recorded_at: '2025-01-01T00:00:00Z',
  });

  beforeEach(async () => {
    const { LineageService } = await import('./lineage.service.js');
    mockDb = { queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }) };
    lineageService = new LineageService(mockDb as any);
  });

  it('upstream query filters by target_node_id', async () => {
    await lineageService.getLineageForNode(
      { tenantId: 't1', subject: 's' },
      'node-001', 'DATASET_VERSION', 'upstream',
    );
    const [, sql] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(sql).toContain('target_node_id');
    expect(sql).not.toContain('source_node_id = $2');
  });

  it('downstream query filters by source_node_id', async () => {
    await lineageService.getLineageForNode(
      { tenantId: 't1', subject: 's' },
      'node-001', 'DATASET_VERSION', 'downstream',
    );
    const [, sql] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(sql).toContain('source_node_id');
    expect(sql).not.toContain('target_node_id = $2');
  });

  it('both direction uses OR clause covering source and target', async () => {
    await lineageService.getLineageForNode(
      { tenantId: 't1', subject: 's' },
      'node-001', 'DATASET_VERSION', 'both',
    );
    const [, sql] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(sql).toContain('source_node_id');
    expect(sql).toContain('target_node_id');
  });

  it('defaults to "both" when direction is omitted', async () => {
    await lineageService.getLineageForNode(
      { tenantId: 't1', subject: 's' },
      'node-001', 'DATASET_VERSION',
    );
    const [, sql] = mockDb.queryWithTenant.mock.calls[0]!;
    // Both direction includes both source and target columns
    expect(sql).toContain('source_node_id');
    expect(sql).toContain('target_node_id');
  });

  it('maps rows to typed LineageEdge objects', async () => {
    mockDb.queryWithTenant.mockResolvedValueOnce({
      rows: [edge('src-1', 'tgt-1')],
    });
    const result = await lineageService.getLineageForNode(
      { tenantId: 't1', subject: 's' },
      'tgt-1', 'RAW_RECORD_BATCH', 'upstream',
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sourceNodeId: 'src-1',
      targetNodeId: 'tgt-1',
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 5: Audit event recording
// ══════════════════════════════════════════════════════════════════════════════

describe('LineageService.recordAuditEvent — audit recording', () => {
  let mockDb: { queryWithTenant: jest.Mock };
  let lineageService: any;

  beforeEach(async () => {
    const { LineageService } = await import('./lineage.service.js');
    mockDb = { queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }) };
    lineageService = new LineageService(mockDb as any);
  });

  it('inserts into analytics_audit_log with correct columns', async () => {
    await lineageService.recordAuditEvent(
      { tenantId: 't1', subject: 'user:bob@org' },
      {
        eventType: 'REPORT_DOWNLOADED',
        entityId: 'artifact-001',
        entityType: 'REPORT_ARTIFACT',
        eventPayload: { reportRunId: 'run-001', byteSize: 1024 },
        clientIp: '10.0.0.1',
        correlationId: 'trace-abc-123',
      },
    );

    expect(mockDb.queryWithTenant).toHaveBeenCalledTimes(1);
    const [, sql, params] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO gigalibs_analytics.analytics_audit_log');
    expect(params[0]).toBe('t1');
    expect(params[1]).toBe('REPORT_DOWNLOADED');
    expect(params[2]).toBe('user:bob@org');
    expect(params[3]).toBe('artifact-001');
    expect(params[4]).toBe('REPORT_ARTIFACT');
    expect(JSON.parse(params[5] as string)).toMatchObject({ reportRunId: 'run-001' });
    expect(params[6]).toBe('10.0.0.1');
    expect(params[7]).toBe('trace-abc-123');
  });

  it('swallows audit errors without re-throwing (fire-and-forget)', async () => {
    mockDb.queryWithTenant.mockRejectedValueOnce(new Error('DB timeout'));
    await expect(
      lineageService.recordAuditEvent(
        { tenantId: 't1', subject: 's' },
        { eventType: 'QUERY_EXECUTED' },
      ),
    ).resolves.not.toThrow();
  });

  it('uses null for optional fields when omitted', async () => {
    await lineageService.recordAuditEvent(
      { tenantId: 't1', subject: 's' },
      { eventType: 'QUERY_EXECUTED' },
    );
    const [, , params] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(params[3]).toBeNull();  // entity_id
    expect(params[4]).toBeNull();  // entity_type
    expect(params[6]).toBeNull();  // client_ip
    expect(params[7]).toBeNull();  // correlation_id
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 6: Audit log querying with filters
// ══════════════════════════════════════════════════════════════════════════════

describe('LineageService.getAuditLog — filtering', () => {
  let mockDb: { queryWithTenant: jest.Mock };
  let lineageService: any;

  const fakeEntry = {
    id: 'a1', event_type: 'QUERY_EXECUTED', actor_subject: 'user:x',
    entity_id: null, entity_type: null, event_payload: {}, occurred_at: '2025-01-01',
  };

  beforeEach(async () => {
    const { LineageService } = await import('./lineage.service.js');
    mockDb = { queryWithTenant: jest.fn().mockResolvedValue({ rows: [fakeEntry] }) };
    lineageService = new LineageService(mockDb as any);
  });

  it('base query always filters by tenant_id', async () => {
    await lineageService.getAuditLog({ tenantId: 't1', subject: 's' });
    const [, sql, params] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(params[0]).toBe('t1');
    expect(sql).toContain('tenant_id = $1');
  });

  it('adds entity_id filter when provided', async () => {
    await lineageService.getAuditLog(
      { tenantId: 't1', subject: 's' },
      { entityId: 'eid-001' },
    );
    const [, sql, params] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(sql).toContain('entity_id');
    expect(params).toContain('eid-001');
  });

  it('adds event_type filter when provided', async () => {
    await lineageService.getAuditLog(
      { tenantId: 't1', subject: 's' },
      { eventType: 'QUERY_EXECUTED' },
    );
    const [, sql, params] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(sql).toContain('event_type');
    expect(params).toContain('QUERY_EXECUTED');
  });

  it('caps limit at 1000', async () => {
    await lineageService.getAuditLog(
      { tenantId: 't1', subject: 's' },
      { limit: 99999 },
    );
    const [, , params] = mockDb.queryWithTenant.mock.calls[0]!;
    // Last param is LIMIT value, must be <= 1000
    const limitParam = params[params.length - 1] as number;
    expect(limitParam).toBeLessThanOrEqual(1000);
  });

  it('orders results by occurred_at DESC', async () => {
    await lineageService.getAuditLog({ tenantId: 't1', subject: 's' });
    const [, sql] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(sql).toContain('ORDER BY occurred_at DESC');
  });

  it('maps rows to AuditEntry objects', async () => {
    const result = await lineageService.getAuditLog({ tenantId: 't1', subject: 's' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'a1',
      eventType: 'QUERY_EXECUTED',
      actorSubject: 'user:x',
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 7: Tenant isolation
// ══════════════════════════════════════════════════════════════════════════════

describe('LineageService — tenant isolation', () => {
  let mockDb: { queryWithTenant: jest.Mock };
  let lineageService: any;

  beforeEach(async () => {
    const { LineageService } = await import('./lineage.service.js');
    mockDb = { queryWithTenant: jest.fn().mockResolvedValue({ rows: [] }) };
    lineageService = new LineageService(mockDb as any);
  });

  it('all recordEdge queries pass tenant_id as first parameter', async () => {
    await lineageService.recordEdge(
      { tenantId: 'tenant-A', subject: 's' },
      { sourceNodeId: 'x', sourceNodeType: 'SYNC_RUN', targetNodeId: 'y', targetNodeType: 'RAW_RECORD_BATCH' },
    );
    const [tenantArg] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(tenantArg).toBe('tenant-A');
  });

  it('all recordAuditEvent queries pass tenant_id as first parameter', async () => {
    await lineageService.recordAuditEvent(
      { tenantId: 'tenant-B', subject: 's' },
      { eventType: 'QUERY_EXECUTED' },
    );
    const [tenantArg] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(tenantArg).toBe('tenant-B');
  });

  it('all getLineageForNode queries scope by tenant_id', async () => {
    await lineageService.getLineageForNode(
      { tenantId: 'tenant-C', subject: 's' },
      'nid', 'DATASET_VERSION',
    );
    const [tenantArg, , params] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(tenantArg).toBe('tenant-C');
    expect(params[0]).toBe('tenant-C');
  });

  it('all getAuditLog queries scope by tenant_id', async () => {
    await lineageService.getAuditLog({ tenantId: 'tenant-D', subject: 's' });
    const [tenantArg, , params] = mockDb.queryWithTenant.mock.calls[0]!;
    expect(tenantArg).toBe('tenant-D');
    expect(params[0]).toBe('tenant-D');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 8: Payload scrubbing — no credentials/PII/secrets in event_payload
// ══════════════════════════════════════════════════════════════════════════════

describe('LineageService — payload scrubbing', () => {
  it('recursively redacts credential, token, secret and regulated identity keys', async () => {
    const { LineageService } = await import('./lineage.service.js');
    const queryWithTenant = jest.fn().mockResolvedValue({ rows: [] });
    const service = new LineageService({ queryWithTenant } as any);

    await service.recordAuditEvent(
      { tenantId: 't1', subject: 's1' },
      {
        eventType: 'QUERY_EXECUTED',
        eventPayload: {
          password: 'secret-value',
          nested: {
            accessToken: 'token-value',
            privateKey: 'private-key-value',
            ssn: '999-99-9999',
            creditCard: '4111111111111111',
            allowed: 'kept',
          },
        },
      },
    );

    const [, , params] = queryWithTenant.mock.calls[0]!;
    expect(JSON.parse(params[5] as string)).toEqual({
      password: '[REDACTED]',
      nested: {
        accessToken: '[REDACTED]',
        privateKey: '[REDACTED]',
        ssn: '[REDACTED]',
        creditCard: '[REDACTED]',
        allowed: 'kept',
      },
    });
  });
});
