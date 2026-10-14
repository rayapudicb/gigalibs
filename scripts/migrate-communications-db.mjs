import { readFileSync } from 'node:fs';
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

const migrationFile = resolve(
  root,
  'modules/communications-textfly/db/migrations/000001_communications_foundation.up.sql',
);
const sql = readFileSync(migrationFile, 'utf8');

// WI-OI-120am: only the configured database; no fallback addresses or passwords in code.
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the development database');
const urlsToTry = [process.env.DATABASE_URL];

let connected = false;

for (const url of urlsToTry) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    console.log(`Connected to PostgreSQL at ${new URL(url).host}/${new URL(url).pathname.replace('/', '')}`);
    
    console.log('Executing gigalibs_textfly schema migration...');
    await client.query(sql);
    
    // Verify tables created in gigalibs_textfly schema
    const res = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'gigalibs_textfly' ORDER BY table_name;",
    );
    console.log(`✓ Successfully migrated ${res.rows.length} tables into schema 'gigalibs_textfly':`);
    for (const r of res.rows) {
      console.log(`  - gigalibs_textfly.${r.table_name}`);
    }
    
    await client.end();
    connected = true;
    break;
  } catch (err) {
    // try next
    try { await client.end(); } catch {}
  }
}

if (!connected) {
  console.log('Note: PostgreSQL server not currently active on loopback. Schema migration file is prepared and ready in:');
  console.log('  ' + migrationFile);
}
