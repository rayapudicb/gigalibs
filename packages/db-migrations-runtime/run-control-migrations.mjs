import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  RETIRED_CROSS_MODULE_MIGRATIONS,
  retiredMigrationAction,
} from './control-migration-policy.mjs';

const { Client } = pg;

// These immutable historical migrations were applied to the original local database before
// ADR-0013/ADR-0016 established module schema ownership. Their routes were subsequently contained
// or removed. A new control-plane database must record the history without executing cross-module
// DDL; canonical CMMS and Workforce migrations own their schemas independently.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const parsed = new URL(databaseUrl);
const schema = parsed.searchParams.get('schema') ?? 'public';
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
  throw new Error('DATABASE_URL schema must be a PostgreSQL identifier.');
}

const configIndex = process.argv.indexOf('--config');
const config = configIndex >= 0 ? process.argv[configIndex + 1] : 'prisma.config.mjs';
if (!config) throw new Error('--config requires a value.');

const prismaCli = fileURLToPath(new URL('./node_modules/prisma/build/index.js', import.meta.url));

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args, '--config', config], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
}

const quotedSchema = `"${schema.replaceAll('"', '""')}"`;
const client = new Client({ connectionString: databaseUrl, application_name: 'gigalibs-control-migrations' });

try {
  await client.connect();
  // Serialize the resolve/deploy sequence. Prisma takes its own deployment lock later; this lock also
  // protects the small pre-deploy history reconciliation window.
  await client.query('SELECT pg_advisory_lock($1, $2)', [109, 1]);

  for (const migrationName of RETIRED_CROSS_MODULE_MIGRATIONS) {
    const table = await client.query('SELECT to_regclass($1) AS name', [`${schema}._prisma_migrations`]);
    let history;
    if (table.rows[0]?.name) {
      history = await client.query(
        `SELECT finished_at, rolled_back_at, logs
           FROM ${quotedSchema}._prisma_migrations
          WHERE migration_name = $1
          ORDER BY started_at DESC
          LIMIT 1`,
        [migrationName],
      );
    }

    const row = history?.rows[0];
    if (retiredMigrationAction(migrationName, row) === 'ALREADY_APPLIED') continue;

    console.log(`Recording retired cross-module migration as applied: ${migrationName}`);
    runPrisma(['migrate', 'resolve', '--applied', migrationName]);
  }

  runPrisma(['migrate', 'deploy']);
} finally {
  try {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [109, 1]);
  } finally {
    await client.end();
  }
}
