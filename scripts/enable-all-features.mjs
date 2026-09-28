import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from '../packages/db/node_modules/pg/lib/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile?.(resolve(root, 'apps/playground-api/.env'));
} catch {}
try {
  process.loadEnvFile?.(resolve(root, '.env'));
} catch {}

const trialModuleKeys = [
  'tenant-access',
  'personal-security',
  'workflow-definitions',
  'execution-runs',
  'exceptions-recovery',
  'approval-queue',
  'value-ledger',
  'data-contracts',
  'connections',
  'invoice-matching',
  'accounts-receivable',
  'spend-management',
  'tax-configuration',
  'multi-currency',
  'autonomous-recovery',
  'rule-studio',
  'dynamic-forms',
  'connector-hub',
  'analytics-studio',
  'asset-maintenance',
  'esignature',
  'operational-ontology',
  'saga-orchestrator',
  'reports',
  'master-data',
  'solution-packs',
  'communications-textfly',
];

const urlsToTry = [
  process.env.DATABASE_URL,
  'postgresql://gigalibs:gigalibs_dev@127.0.0.1:5440/gigalibs',
  'postgresql://gigalibs_dev_runtime@127.0.0.1:5432/gigalibs_dev_runtime',
].filter(Boolean);

let connected = false;

for (const url of urlsToTry) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    console.log(
      `Connected to PostgreSQL at ${new URL(url).host}/${new URL(url).pathname.replace('/', '')}`,
    );

    const tenantsRes = await client.query('SELECT id, name, slug, features FROM tenants;');
    console.log(`Found ${tenantsRes.rows.length} tenant(s). Updating features...`);

    for (const t of tenantsRes.rows) {
      const currentFeatures = new Set(t.features || []);
      for (const k of trialModuleKeys) {
        currentFeatures.add(k);
      }
      const updatedFeatures = Array.from(currentFeatures);

      await client.query('UPDATE tenants SET features = $1 WHERE id = $2;', [
        updatedFeatures,
        t.id,
      ]);
      console.log(
        `✓ Updated tenant ${t.slug} (${t.id}) with all ${updatedFeatures.length} features.`,
      );

      for (const k of trialModuleKeys) {
        await client.query(
          `
          INSERT INTO tenant_module_entitlements
            ("id", "tenantId", "moduleKey", "status", "source", "reason", "updatedById", "updatedAt")
          VALUES
            (gen_random_uuid(), $1, $2, 'ENABLED', 'PLATFORM_OVERRIDE', 'Automated local enablement', 'local-development-bootstrap', NOW())
          ON CONFLICT ("tenantId", "moduleKey") DO UPDATE SET
            status = 'ENABLED',
            source = 'PLATFORM_OVERRIDE',
            "endsAt" = NULL,
            reason = 'Automated local enablement',
            "updatedById" = 'local-development-bootstrap',
            "updatedAt" = NOW();
        `,
          [t.id, k],
        );
      }
    }

    const membersRes = await client.query('SELECT id, role, permissions FROM tenant_members;');
    console.log(`Found ${membersRes.rows.length} tenant member(s). Ensuring permissions...`);
    for (const m of membersRes.rows) {
      const perms = new Set(m.permissions || []);
      perms.add('*');
      await client.query('UPDATE tenant_members SET permissions = $1 WHERE id = $2;', [
        Array.from(perms),
        m.id,
      ]);
    }
    console.log('✓ All tenant members granted wildcard access.');

    await client.end();
    connected = true;
  } catch (err) {
    try {
      await client.end();
    } catch {}
  }
}

if (!connected) {
  console.log('Could not connect to PostgreSQL to update tenant features.');
}
