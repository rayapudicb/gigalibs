/**
 * A throwaway PostgreSQL 16 for real-database proofs and benchmarks (WI-OI-103c). It never touches the owner's
 * database: a new container with its own anonymous volume, bound to 127.0.0.1 on a random port, removed on exit.
 * All Analytics migrations are applied, and queries run as a non-superuser role so row-level security applies.
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations');
const APPEND_ONLY_TABLES = [
  'raw_record_versions',
  'studio_mapping_versions',
  'report_artifacts',
  'report_deliveries',
  'analytics_lineage_edges',
  'analytics_audit_log',
  'operational_facts',
  'formula_measure_versions',
  'formula_measure_reviews',
];

export interface ThrowawayPostgres {
  readonly adminUrl: string;
  readonly runtimeUrl: string;
  stop(): void;
}

export async function startThrowawayPostgres(name: string): Promise<ThrowawayPostgres> {
  const adminPassword = randomBytes(18).toString('hex');
  const runtimePassword = randomBytes(18).toString('hex');
  execFileSync('docker', [
    'run', '-d', '--rm', '--name', name,
    '-e', `POSTGRES_PASSWORD=${adminPassword}`, '-e', 'POSTGRES_DB=analytics_proof',
    '-p', '127.0.0.1::5432', '--shm-size=1g',
    'postgres:16-alpine',
    // Faster loading only; reads are unaffected. Everything else is the stock configuration of the owner's image.
    '-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off',
  ], { stdio: 'ignore' });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    execFileSync('docker', ['rm', '-f', '-v', name], { stdio: 'ignore' });
  };
  process.once('exit', stop);
  try {
    const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').pop()!;
    const adminUrl = `postgres://postgres:${adminPassword}@127.0.0.1:${port}/analytics_proof`;
    const admin = await connectWhenReady(adminUrl);
    for (const file of readdirSync(MIGRATIONS).filter((entry) => /^\d{6}_.+\.up\.sql$/.test(entry)).sort()) {
      await admin.query(readFileSync(join(MIGRATIONS, file), 'utf8'));
    }
    // The module runtime role: DML only, no superuser, no BYPASSRLS, so forced row-level security applies.
    await admin.query(`CREATE ROLE analytics_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS`);
    await admin.query('GRANT USAGE ON SCHEMA gigalibs_analytics TO analytics_runtime');
    await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gigalibs_analytics TO analytics_runtime');
    await admin.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gigalibs_analytics TO analytics_runtime');
    // As the module migrations job does (MODULE_APPEND_ONLY_TABLES in compose.modules.local.yaml).
    for (const table of APPEND_ONLY_TABLES) {
      await admin.query(`REVOKE UPDATE, DELETE ON gigalibs_analytics.${table} FROM analytics_runtime`);
    }
    await admin.end();
    return { adminUrl, runtimeUrl: `postgres://analytics_runtime:${runtimePassword}@127.0.0.1:${port}/analytics_proof`, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

async function connectWhenReady(url: string): Promise<pg.Client> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('SELECT 1');
      return client;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('The throwaway PostgreSQL did not become ready.');
}
