/**
 * Seeds Analytics for WI-OI-131 Playwright proof on a non-production compose/UAT database.
 * Attributes facts with e2e-wi-131-* event ids. Run only on disposable/local analytics DB.
 *
 * Usage (from repo root, analytics-api on compose network reachable):
 *   E2E_UAT_TENANT="GigaLibs Global Enterprise" pnpm seed:module-analytics-e2e
 * (Host runner rewrites DATABASE_URL / ANALYTICS_DATABASE_URL via Docker tunnel to uat-postgres.)
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODULE_ANALYTICS_FACT_V1,
  TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2,
  type ModuleAnalyticsFactIngestV1,
} from '@gigalibs/contracts';
import type { RelayEnvelope } from '@gigalibs/module-sdk';
import { DatabaseService } from '../src/database/database.service.js';
import { DatasetService } from '../src/datasets/dataset.service.js';
import { ModuleMeasureCompilerService } from '../src/datasets/module-measure-compiler.service.js';
import { EntitlementSnapshotInboxService } from '../src/inbox/entitlement-snapshot-inbox.service.js';
import { ModuleFactIngestorService } from '../src/inbox/module-fact-ingestor.service.js';
import { ANALYTICS_SCHEMA_CONTRACT_VERSION } from '../src/runtime-config.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '../../../../..');

function readComposeEnv(key: string): string | undefined {
  const candidates = [
    join(repoRoot, 'infra/compose/.env'),
    join(repoRoot, 'infra/compose/.env.modules'),
    join(repoRoot, 'infra/compose/.env.test.modules'),
  ];
  for (const envPath of candidates) {
    try {
      const line = readFileSync(envPath, 'utf8')
        .split('\n')
        .find((entry) => entry.startsWith(`${key}=`));
      if (line) return line.slice(key.length + 1).replace(/^"(.*)"$/, '$1');
    } catch {
      // try next file
    }
  }
  return undefined;
}

async function resolveTenantId(tenantName: string): Promise<string> {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = readComposeEnv('DATABASE_URL');
  }
  const { prisma } = await import(join(repoRoot, 'packages/db/dist/index.js'));
  const tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
  await prisma.$disconnect();
  if (!tenant) throw new Error(`No tenant named "${tenantName}" in control-plane DB.`);
  return tenant.id;
}

function factEnvelope(tenantId: string, fact: ModuleAnalyticsFactIngestV1): RelayEnvelope {
  return {
    messageId: fact.eventId,
    tenantId,
    eventType: MODULE_ANALYTICS_FACT_V1,
    aggregateType: 'module-analytics-fact',
    aggregateId: fact.aggregateId,
    aggregateVersion: fact.aggregateVersion,
    correlationId: 'e2e-wi-131-seed',
    causationId: null,
    schemaVersion: 1,
    payload: fact,
    occurredAt: fact.occurredAt,
  };
}

const cmmsFact = (tenantId: string): ModuleAnalyticsFactIngestV1 => ({
  catalogModuleKey: 'asset-maintenance',
  sourceKey: 'cmms-downtime',
  eventId: `e2e-wi-131-cmms-${tenantId.slice(0, 8)}`,
  aggregateId: `e2e-downtime-${tenantId.slice(0, 8)}`,
  aggregateVersion: 1,
  occurredAt: '2026-10-29T10:00:00.000Z',
  factSchemaVersion: 1,
  factKind: 'UPSERT',
  dataOrigin: 'PRODUCTION',
  ownerUnitId: 'e2e-org-unit-wi-131',
  fact: {
    event_id: `e2e-wi-131-cmms-${tenantId.slice(0, 8)}`,
    occurred_at: '2026-10-29T10:00:00.000Z',
    owning_unit_id: 'e2e-org-unit-wi-131',
    duration_minutes: 42,
    failure_code: 'E2E_WI_131',
    asset_id: 'e2e-asset-wi-131',
    downtime_id: 'e2e-downtime-wi-131',
  },
});

const workforceFact = (tenantId: string): ModuleAnalyticsFactIngestV1 => ({
  catalogModuleKey: 'gigaops',
  sourceKey: 'workforce-positions',
  eventId: `e2e-wi-131-wf-${tenantId.slice(0, 8)}`,
  aggregateId: randomUUID(),
  aggregateVersion: 1,
  occurredAt: '2026-10-29T08:00:00.000Z',
  factSchemaVersion: 1,
  factKind: 'UPSERT',
  dataOrigin: 'PRODUCTION',
  ownerUnitId: 'e2e-org-unit-wi-131',
  fact: {
    entity_id: randomUUID(),
    effective_from: '2026-10-01',
    organization_unit_id: 'e2e-org-unit-wi-131',
    status: 'OPEN',
    code: 'E2E-WI-131',
    fte: 1,
    tenant_shared: true,
  },
});

async function main() {
  const tenantName = process.env.E2E_UAT_TENANT ?? 'GigaLibs Global Enterprise';
  if (!process.env.ANALYTICS_DATABASE_URL) {
    process.env.ANALYTICS_DATABASE_URL = readComposeEnv('ANALYTICS_DATABASE_URL');
  }
  const databaseUrl = process.env.ANALYTICS_DATABASE_URL ?? readComposeEnv('ANALYTICS_DATABASE_URL');
  if (!databaseUrl) throw new Error('ANALYTICS_DATABASE_URL is required.');

  const tenantId = await resolveTenantId(tenantName);
  const db = new DatabaseService({
    databaseUrl,
    databasePoolSize: 5,
    expectedMigrationVersion: ANALYTICS_SCHEMA_CONTRACT_VERSION,
  } as never);
  await db.onModuleInit();

  const entitlement = new EntitlementSnapshotInboxService(db);
  const snapshotVersion = Math.floor(Date.now() / 1000);
  const snapshotEnvelope = {
    messageId: `e2e-wi-131-entitlements-${snapshotVersion}`,
    tenantId,
    eventType: TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2,
    aggregateType: 'tenant-entitlements',
    aggregateId: tenantId,
    aggregateVersion: snapshotVersion,
    correlationId: 'e2e-wi-131-seed',
    causationId: null,
    schemaVersion: 1,
    payload: {
      tenantId,
      snapshotVersion,
      enabledModuleKeys: ['asset-maintenance', 'gigaops', 'analytics-studio'],
      modules: [
        { catalogModuleKey: 'asset-maintenance', status: 'ENABLED' },
        { catalogModuleKey: 'gigaops', status: 'ENABLED' },
        { catalogModuleKey: 'analytics-studio', status: 'ENABLED' },
      ],
    },
    occurredAt: new Date().toISOString(),
  };
  const entitlementResult = await entitlement.receive(snapshotEnvelope);
  console.log('entitlement snapshot', entitlementResult);

  const datasets = new DatasetService(db);
  const compiler = new ModuleMeasureCompilerService(db, datasets);
  const ingestor = new ModuleFactIngestorService(db, compiler);

  for (const fact of [cmmsFact(tenantId), workforceFact(tenantId)]) {
    const envelope = factEnvelope(tenantId, fact);
    const result = await ingestor.ingest('e2e-wi-131-seed', envelope, fact);
    console.log(fact.sourceKey, result);
  }

  await db.onModuleDestroy();
  console.log(JSON.stringify({ tenant: tenantName, tenantId, snapshotVersion }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
