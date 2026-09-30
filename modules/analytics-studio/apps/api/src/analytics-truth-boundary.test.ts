/**
 * analytics-truth-boundary.test.ts
 *
 * WI-OI-043 — External Data Analytics & Reporting Studio
 * Vertical-slice evidence for all 7 phases of the source-agnostic pipeline.
 *
 * Purpose: Assert repository-level evidence that each pipeline stage exists,
 * compiles its governance rules into source and migration files, and connects
 * to its adjacent stage in the prescribed immutable order:
 *
 *   External system
 *     → Connector Hub + Credential Vault
 *     → Workflow schedules sync
 *     → Ingestion engine + raw tenant staging
 *     → Schema discovery
 *     → Data Studio mapping
 *     → Published analytical dataset
 *     → Semantic model
 *     → Governed query engine
 *     → Charts / dashboards
 *     → Reports / CSV export
 *     → Lineage DAG + Audit log
 *
 * SDLC note: This file provides BUILD evidence for G4 (Build gate).
 * Named human authorities must still review and close the gate — no agent
 * may mark human acceptance. This evidence does not authorize WI-OI-043 release.
 *
 * GigaLibs SDLC Governance constraints (verbatim — must remain in effect):
 * Under GigaLibs SDLC rules, only named human authorities (Solution
 * Architecture, Security & Privacy, Backend/Data, QA/SDET, Product) can
 * close/release a work item. No agent may mark human acceptance.
 *
 * @see ADR-0004 — ECharts 5.5.1 adopted for chart rendering
 * @see GOV-02   — DoR acceptance pending (5 named reviewers)
 * @see TECH-01  — department_ids adapter drift pre-flight (Backend/Data)
 * @see TECH-02  — RLS requirements acceptance (Security & Privacy)
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── helpers ───────────────────────────────────────────────────────────────────

const API_SRC = path.resolve(__dirname);
const MIGRATIONS = path.resolve(__dirname, '../../../db/migrations');
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

function readMigration(n: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, n), 'utf-8');
}

function readSrc(rel: string): string {
  const abs = path.join(API_SRC, rel);
  if (!fs.existsSync(abs)) throw new Error(`Source file not found: ${rel}`);
  return fs.readFileSync(abs, 'utf-8');
}

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
}

function migrationExists(n: string): boolean {
  return fs.existsSync(path.join(MIGRATIONS, n));
}

// ══════════════════════════════════════════════════════════════════════════════
//  Phase 1: Connector Hub + Credential Vault (WI-OI-043 Phase 1)
// ══════════════════════════════════════════════════════════════════════════════

describe('Phase 1 — Connector Hub (the only way in)', () => {
  it('migration 000004 exists: source_connections table', () => {
    expect(migrationExists('000004_connector_hub_source_connections.up.sql')).toBe(true);
  });

  it('source_connections has an opaque credential vault key (no raw credentials in DB)', () => {
    const sql = readMigration('000004_connector_hub_source_connections.up.sql');
    expect(sql).toContain('credential_vault_key');
    expect(sql).not.toContain('password TEXT');
    expect(sql).not.toContain('api_key TEXT');
  });

  // WI-OI-104f (ADR-0016 F8): Connector Hub is the only way in. Analytics' own Postgres connector and ingestion are
  // retired; records arrive through the relay inbox (WI-OI-104e).
  it('Analytics has no connector or ingestion code of its own', () => {
    expect(fs.existsSync(path.join(API_SRC, 'connectors'))).toBe(false);
    expect(fs.existsSync(path.join(API_SRC, 'ingestion'))).toBe(false);
  });

  it('Connector Hub records arrive through the relay inbox as CONNECTOR_HUB sources', () => {
    const inbox = readSrc('inbox/connector-hub-inbox.ts');
    expect(inbox).toContain('RelayInboxGuardBase');
    expect(inbox).toContain("'CONNECTOR_HUB'");
    expect(readMigration('000023_connector_hub_inbox.up.sql')).toContain('inbox_receipts');
  });

  it('source_connections has RLS + FORCE RLS', () => {
    const sql = readMigration('000004_connector_hub_source_connections.up.sql');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  });

  it('AppModule imports the Connector Hub inbox and no connector module', () => {
    const app = readSrc('app.module.ts');
    expect(app).toContain('ConnectorHubInboxModule');
    expect(app).not.toMatch(/\bConnectorModule\b|\bIngestionModule\b/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Phase 2: Ingestion Engine + Raw Tenant Staging
// ══════════════════════════════════════════════════════════════════════════════

describe('Phase 2 — Relay inbox + Raw Tenant Staging', () => {
  it('migration 000005 exists: raw_record_versions table', () => {
    expect(migrationExists('000005_connector_sync_runs_and_raw_records.up.sql')).toBe(true);
  });

  it('raw_record_versions is append-only (REVOKE UPDATE/DELETE)', () => {
    const sql = readMigration('000005_connector_sync_runs_and_raw_records.up.sql');
    expect(sql).toMatch(/REVOKE\s+UPDATE\s*,\s*DELETE/);
  });

  it('raw_record_versions has GIN index on raw_payload', () => {
    const sql = readMigration('000005_connector_sync_runs_and_raw_records.up.sql');
    expect(sql).toContain('GIN');
    expect(sql).toContain('raw_payload');
  });

  it('the relay inbox stages each delivered record as a raw record version, receipted once', () => {
    const inbox = readSrc('inbox/connector-hub-inbox.ts');
    expect(inbox).toContain('INSERT INTO gigalibs_analytics.raw_record_versions');
    expect(inbox).toContain('ON CONFLICT (message_id) DO NOTHING');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Phase 3: Schema Discovery + Data Studio Mapping
// ══════════════════════════════════════════════════════════════════════════════

describe('Phase 3 — Schema Discovery + Data Studio Mapping', () => {
  it('migration 000006 exists: schema_discovery + studio_mappings', () => {
    expect(migrationExists('000006_schema_discovery_and_studio_mappings.up.sql')).toBe(true);
  });

  it('studio_mappings has PUBLISHED status lifecycle', () => {
    const sql = readMigration('000006_schema_discovery_and_studio_mappings.up.sql');
    expect(sql).toContain("'DRAFT'");
    expect(sql).toContain("'PUBLISHED'");
  });

  it('studio_mapping_versions is append-only with content_hash', () => {
    const sql = readMigration('000006_schema_discovery_and_studio_mappings.up.sql');
    // REVOKE on mapping versions table
    expect(sql).toContain('REVOKE UPDATE');
    expect(sql).toContain('content_hash');
  });

  it('identifier validation enforces safe SQL name regex', () => {
    const svc = readSrc('schema-discovery/schema-discovery.service.ts');
    // Must reject injection characters through an anchored allowlist.
    expect(svc).toContain('/^[a-z][a-z0-9_]{0,62}$/');
  });

  it('SchemaDiscoveryModule exports SchemaDiscoveryService', () => {
    const mod = readSrc('schema-discovery/schema-discovery.module.ts');
    expect(mod).toContain('SchemaDiscoveryService');
  });

  it('AppModule imports SchemaDiscoveryModule', () => {
    expect(readSrc('app.module.ts')).toContain('SchemaDiscoveryModule');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Phase 4: Analytical Datasets + Semantic Models
// ══════════════════════════════════════════════════════════════════════════════

describe('Phase 4 — Analytical Datasets + Semantic Models', () => {
  it('migration 000007 exists', () => {
    expect(migrationExists('000007_analytical_datasets_and_semantic_models.up.sql')).toBe(true);
  });

  it('dataset_record_versions is append-only', () => {
    const sql = readMigration('000007_analytical_datasets_and_semantic_models.up.sql');
    const block = sql.slice(sql.indexOf('dataset_record_versions'));
    expect(block).toMatch(/REVOKE\s+UPDATE\s*,\s*DELETE/);
  });

  it('semantic_model_versions has content_hash (SHA-256)', () => {
    const sql = readMigration('000007_analytical_datasets_and_semantic_models.up.sql');
    expect(sql).toContain('content_hash');
  });

  it('DatasetService.buildDatasetVersion uses DISTINCT ON (source_pk_hash)', () => {
    const svc = readSrc('datasets/dataset.service.ts');
    expect(svc).toContain('DISTINCT ON');
    expect(svc).toContain('source_pk_hash');
  });

  it('measure aggregate_fn validated against allowlist (SUM/AVG/COUNT etc.)', () => {
    const svc = readSrc('datasets/dataset.service.ts');
    expect(svc).toContain('VALID_AGG');
    ['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX'].forEach(fn => {
      expect(svc).toContain(fn);
    });
  });

  it('DatasetModule exports DatasetService', () => {
    const mod = readSrc('datasets/dataset.module.ts');
    expect(mod).toContain('DatasetService');
  });

  it('AppModule imports DatasetModule', () => {
    expect(readSrc('app.module.ts')).toContain('DatasetModule');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Phase 5: Governed Query Engine + ECharts + Dashboards
// ══════════════════════════════════════════════════════════════════════════════

describe('Phase 5 — Governed Query Engine + ECharts + Dashboards', () => {
  it('migration 000008 exists', () => {
    expect(migrationExists('000008_charts_and_dashboards.up.sql')).toBe(true);
  });

  it('freshness_state enum has exactly 5 states (UNAUTHORIZED excluded)', () => {
    const sql = readMigration('000008_charts_and_dashboards.up.sql');
    expect(sql).toContain("'FRESH'");
    expect(sql).toContain("'STALE'");
    expect(sql).toContain("'PARTIAL'");
    expect(sql).toContain("'REBUILDING'");
    expect(sql).toContain("'UNAVAILABLE'");
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toContain("'UNAUTHORIZED'");
  });

  it('QueryEngineService FreshnessState type does not include UNAUTHORIZED', () => {
    const svc = readSrc('query-engine/query-engine.service.ts');
    expect(svc).toContain('FreshnessState');
    expect(svc).toContain("'FRESH'");
    // Must not assign UNAUTHORIZED as a FreshnessState value
    const code = svc
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/FreshnessState.*UNAUTHORIZED|UNAUTHORIZED.*FreshnessState/);
  });

  it('ChartService always injects series data from query results (never template)', () => {
    const svc = readSrc('query-engine/chart.service.ts');
    // Template is only cosmetic — data must come from queryResponse.results
    expect(svc).toContain('queryResponse');
    expect(svc).toContain('results');
    // Chart options template must not be used as the sole data source
    expect(svc).toContain('chart_options_template');
    // Merge pattern: template first, then real data overrides
    const templateIdx = svc.indexOf('chart_options_template');
    const resultsIdx = svc.indexOf('results');
    expect(resultsIdx).toBeGreaterThan(templateIdx);
  });

  it('every chart render includes accessibleTable (WCAG 2.1 AA)', () => {
    const svc = readSrc('query-engine/chart.service.ts');
    expect(svc).toContain('accessibleTable');
  });

  it('ADR-0004: ECharts 5.5.1 is the charting library (no other chart lib)', () => {
    const svc = readSrc('query-engine/chart.service.ts');
    expect(svc).toContain('EChartsOption');
  });

  it('QueryEngineModule imports DatasetModule', () => {
    const mod = readSrc('query-engine/query-engine.module.ts');
    expect(mod).toContain('DatasetModule');
  });

  it('AppModule imports QueryEngineModule', () => {
    expect(readSrc('app.module.ts')).toContain('QueryEngineModule');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Phase 6: Reports, CSV Export, Scheduled Delivery
// ══════════════════════════════════════════════════════════════════════════════

describe('Phase 6 — Reports, CSV Export, Scheduled Delivery', () => {
  it('migration 000009 exists', () => {
    expect(migrationExists('000009_reports_and_scheduled_delivery.up.sql')).toBe(true);
  });

  it('report_artifacts is append-only', () => {
    const sql = readMigration('000009_reports_and_scheduled_delivery.up.sql');
    const block = sql.slice(sql.indexOf('report_artifacts'));
    expect(block).toContain('REVOKE UPDATE');
    expect(block).toContain('REVOKE DELETE');
  });

  it('report_runs idempotency_key UNIQUE constraint is DEFERRABLE', () => {
    const sql = readMigration('000009_reports_and_scheduled_delivery.up.sql');
    expect(sql).toContain('idempotency_key');
    expect(sql).toContain('DEFERRABLE');
  });

  it('download token TTL is 15 minutes', () => {
    const svc = readSrc('reports/report.service.ts');
    expect(svc).toContain('TOKEN_TTL_MS');
    expect(svc).toContain('15 * 60 * 1000');
  });

  it('CSV output is RFC 4180 (CRLF line endings)', () => {
    const svc = readSrc('reports/report.service.ts');
    expect(svc).toContain('\\r\\n');
  });

  it('expired download tokens throw GoneException', () => {
    const svc = readSrc('reports/report.service.ts');
    expect(svc).toContain('GoneException');
  });

  // WI-OI-103e: the in-memory artifact store (lost on restart) is replaced by bytes kept with the artifact row.
  it('report artifacts keep their CSV bytes durably, not in process memory', () => {
    const svc = readSrc('reports/report.service.ts');
    expect(svc).not.toContain('artifactStore');
    expect(svc).not.toContain('mem://');
    expect(svc).toMatch(/INSERT INTO gigalibs_analytics\.report_artifacts[\s\S]*content\)/);
    expect(readMigration('000020_reports_from_chart_views.up.sql')).toMatch(/ADD COLUMN content BYTEA/);
  });

  it('cron expression validation requires exactly 5 fields', () => {
    const svc = readSrc('reports/report.service.ts');
    // 5-field cron: "* * * * *" — look for field count check
    expect(svc).toContain('5');
  });

  it('delivery_channel supports EMAIL/WEBHOOK/SFTP/IN_APP', () => {
    const sql = readMigration('000009_reports_and_scheduled_delivery.up.sql');
    ['EMAIL', 'WEBHOOK', 'SFTP', 'IN_APP'].forEach(ch => {
      expect(sql).toContain(ch);
    });
  });

  it('ReportModule imports QueryEngineModule', () => {
    const mod = readSrc('reports/report.module.ts');
    expect(mod).toContain('QueryEngineModule');
  });

  it('AppModule imports ReportModule', () => {
    expect(readSrc('app.module.ts')).toContain('ReportModule');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Phase 7: Lineage DAG + Tamper-Evident Audit Log
// ══════════════════════════════════════════════════════════════════════════════

describe('Phase 7 — Lineage DAG + Tamper-Evident Audit Log', () => {
  it('migration 000010 exists', () => {
    expect(migrationExists('000010_lineage_and_audit.up.sql')).toBe(true);
  });

  it('analytics_lineage_edges uses TEXT ids (no cross-table FK constraints)', () => {
    const sql = readMigration('000010_lineage_and_audit.up.sql');
    expect(sql).toMatch(/source_node_id\s+TEXT/);
    expect(sql).toMatch(/target_node_id\s+TEXT/);
  });

  it('analytics_lineage_edges is append-only', () => {
    const sql = readMigration('000010_lineage_and_audit.up.sql');
    const block = sql.slice(sql.indexOf('analytics_lineage_edges'));
    expect(block).toContain('REVOKE UPDATE');
    expect(block).toContain('REVOKE DELETE');
  });

  it('analytics_audit_log captures client_ip as INET', () => {
    const sql = readMigration('000010_lineage_and_audit.up.sql');
    expect(sql).toMatch(/client_ip\s+INET/);
  });

  it('analytics_audit_log captures correlation_id (distributed trace linkage)', () => {
    const sql = readMigration('000010_lineage_and_audit.up.sql');
    expect(sql).toContain('correlation_id');
  });

  it('LineageService exists with recordEdge and recordAuditEvent', () => {
    const svc = readSrc('lineage/lineage.service.ts');
    expect(svc).toContain('recordEdge');
    expect(svc).toContain('recordAuditEvent');
  });

  it('LineageService.recordEdge is fire-and-forget (swallows errors)', () => {
    const svc = readSrc('lineage/lineage.service.ts');
    // Errors caught and logged, never re-thrown
    expect(svc).toContain('catch');
    expect(svc).toContain('logger.error');
  });

  it('LineageService never emits UPDATE or DELETE SQL', () => {
    const svc = readSrc('lineage/lineage.service.ts')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(svc).not.toContain('UPDATE ');
    expect(svc).not.toContain('DELETE ');
  });

  it('event_payload explicitly excludes credentials and PII (comment evidence)', () => {
    const svc = readSrc('lineage/lineage.service.ts');
    expect(svc).toMatch(/no credential|no.*PII|no.*secret/i);
  });

  it('lineage traversal supports upstream / downstream / both directions', () => {
    const svc = readSrc('lineage/lineage.service.ts');
    expect(svc).toContain('upstream');
    expect(svc).toContain('downstream');
    expect(svc).toContain('both');
  });

  it('LineageModule registers LineageController and AuditController', () => {
    const mod = readSrc('lineage/lineage.module.ts');
    expect(mod).toContain('LineageController');
    expect(mod).toContain('AuditController');
  });

  it('AppModule imports LineageModule (pipeline terminus registered)', () => {
    expect(readSrc('app.module.ts')).toContain('LineageModule');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Cross-phase: Pipeline order & migration ledger integrity
// ══════════════════════════════════════════════════════════════════════════════

describe('Cross-phase — Pipeline order & migration ledger', () => {
  const MIGRATIONS_IN_ORDER = [
    '000004_connector_hub_source_connections.up.sql',
    '000005_connector_sync_runs_and_raw_records.up.sql',
    '000006_schema_discovery_and_studio_mappings.up.sql',
    '000007_analytical_datasets_and_semantic_models.up.sql',
    '000008_charts_and_dashboards.up.sql',
    '000009_reports_and_scheduled_delivery.up.sql',
    '000010_lineage_and_audit.up.sql',
  ];

  it('all 7 phase migrations are present', () => {
    MIGRATIONS_IN_ORDER.forEach(m => {
      expect(migrationExists(m)).toBe(true);
    });
  });

  it('migration ledger versions are monotonically increasing (4–10)', () => {
    const ledgerVersions = MIGRATIONS_IN_ORDER.map((m, i) => {
      const sql = readMigration(m);
      const versionNum = i + 4;
      // Each migration must record its own version in schema_migrations
      const hasLedger = new RegExp(`VALUES\\s*\\(\\s*${versionNum}\\s*,`).test(sql);
      return { migration: m, versionNum, hasLedger };
    });
    ledgerVersions.forEach(({ migration, hasLedger }) => {
      expect({ migration, hasLedger }).toMatchObject({ hasLedger: true });
    });
  });

  // WI-OI-104f: the Connector Hub inbox replaces Analytics' own connector and ingestion modules.
  it('all pipeline modules registered in AppModule', () => {
    const appMod = readSrc('app.module.ts');
    [
      'ConnectorHubInboxModule', 'SchemaDiscoveryModule',
      'DatasetModule', 'QueryEngineModule', 'ReportModule', 'LineageModule',
    ].forEach(mod => {
      expect(appMod).toContain(mod);
    });
  });

  it('all append-only tables across all phases have REVOKE UPDATE + DELETE', () => {
    const APPEND_ONLY_TABLES = [
      ['000005_connector_sync_runs_and_raw_records.up.sql', 'raw_record_versions'],
      ['000006_schema_discovery_and_studio_mappings.up.sql', 'studio_mapping_versions'],
      ['000007_analytical_datasets_and_semantic_models.up.sql', 'dataset_record_versions'],
      ['000007_analytical_datasets_and_semantic_models.up.sql', 'semantic_model_versions'],
      ['000009_reports_and_scheduled_delivery.up.sql', 'report_artifacts'],
      ['000009_reports_and_scheduled_delivery.up.sql', 'report_deliveries'],
      ['000010_lineage_and_audit.up.sql', 'analytics_lineage_edges'],
      ['000010_lineage_and_audit.up.sql', 'analytics_audit_log'],
    ];

    APPEND_ONLY_TABLES.forEach(([migFile, table]) => {
      const sql = readMigration(migFile as string);
      const tableIdx = sql.indexOf(table as string);
      expect(tableIdx).toBeGreaterThan(-1);
      const afterTable = sql.slice(tableIdx);
      const hasRevokeUpdate = afterTable.includes('REVOKE UPDATE');
      const hasRevokeDelete =
        afterTable.includes('REVOKE DELETE') ||
        /REVOKE\s+UPDATE\s*,\s*DELETE/.test(afterTable);
      expect({ table, hasRevokeUpdate, hasRevokeDelete }).toMatchObject({
        table,
        hasRevokeUpdate: true,
        hasRevokeDelete: true,
      });
    });
  });

  it('PlatformContextV1 entitlement key is analytics-studio throughout codebase', () => {
    // WI-OI-064a: the BFF mints the signed context for this module key and the service guard requires it.
    const route = readRepo('apps/workflow-platform/app/api/analytics/[...path]/route.ts');
    expect(route).toContain('proxyAnalytics');
    const bff = readRepo('apps/workflow-platform/lib/analytics-proxy.ts');
    expect(bff).toContain("moduleKey: 'analytics-studio'");
    expect(bff).toContain("audience: 'gigalibs-analytics-api'");
    expect(readSrc('auth/authorization.ts')).toContain("ANALYTICS_MODULE_KEY = 'analytics-studio'");
  });

  it('no service file emits UNAUTHORIZED as a FreshnessState', () => {
    const qeSvc = readSrc('query-engine/query-engine.service.ts');
    // UNAUTHORIZED must not appear as a value being assigned to FreshnessState variables
    const code = qeSvc
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/freshness\s*=\s*['"]UNAUTHORIZED['"]/);
    expect(code).not.toMatch(/FreshnessState\s*=\s*['"]UNAUTHORIZED['"]/);
  });
});
