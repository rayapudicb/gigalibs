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

const urlsToTry = [
  process.env.DATABASE_URL,
  'postgresql://gigalibs_dev_runtime@127.0.0.1:5432/gigalibs_dev_runtime',
  'postgresql://gigalibs:gigalibs_dev@127.0.0.1:5440/gigalibs',
  'postgresql://postgres:postgres@127.0.0.1:5432/textfly',
].filter(Boolean);

let connected = false;

for (const url of urlsToTry) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    console.log(`Connected to PostgreSQL at ${new URL(url).host}/${new URL(url).pathname.replace('/', '')}`);

    // Check tenants table
    const tenantsRes = await client.query('SELECT id, name, slug, features FROM tenants;');
    console.log(`Found ${tenantsRes.rows.length} tenant(s):`);
    for (const t of tenantsRes.rows) {
      const currentFeatures = t.features || [];
      console.log(`Tenant ${t.slug} (${t.id}) features:`, currentFeatures);
      if (!currentFeatures.includes('communications-textfly')) {
        const updatedFeatures = [...currentFeatures, 'communications-textfly'];
        await client.query('UPDATE tenants SET features = $1 WHERE id = $2;', [updatedFeatures, t.id]);
        console.log(`✓ Updated tenant ${t.slug} features with 'communications-textfly'.`);

        // Also add entitlement record
        try {
          await client.query(`
            INSERT INTO tenant_module_entitlements ("id", "tenantId", "moduleKey", "status", "source", "reason", "updatedAt")
            VALUES (gen_random_uuid(), $1, 'communications-textfly', 'ENABLED', 'PLATFORM_OVERRIDE', 'Omnichannel Communications (TextFly) integration', NOW())
            ON CONFLICT ("tenantId", "moduleKey") DO UPDATE SET status = 'ENABLED', updatedAt = NOW();
          `, [t.id]);
          console.log(`✓ Enabled tenant_module_entitlement for ${t.slug}`);
        } catch (entErr) {
          console.log(`Notice: Entitlement table update skipped: ${entErr.message}`);
        }
      } else {
        console.log(`✓ Tenant ${t.slug} already has 'communications-textfly' enabled.`);
      }
    }

    await client.end();
    connected = true;
    break;
  } catch (err) {
    try { await client.end(); } catch {}
  }
}

if (!connected) {
  console.log('PostgreSQL server not directly reachable via script on local ports. Database update skipped.');
}
