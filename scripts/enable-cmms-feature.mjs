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

    const tenantsRes = await client.query('SELECT id, name, slug, features FROM tenants;');
    console.log(`Found ${tenantsRes.rows.length} tenant(s):`);
    for (const t of tenantsRes.rows) {
      const currentFeatures = t.features || [];
      if (!currentFeatures.includes('asset-maintenance')) {
        const updatedFeatures = [...currentFeatures, 'asset-maintenance'];
        await client.query('UPDATE tenants SET features = $1 WHERE id = $2;', [updatedFeatures, t.id]);
        console.log(`✓ Updated tenant ${t.slug} features with 'asset-maintenance'.`);
      } else {
        console.log(`✓ Tenant ${t.slug} already has 'asset-maintenance' enabled.`);
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
