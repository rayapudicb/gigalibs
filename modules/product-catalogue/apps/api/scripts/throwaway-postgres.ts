import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations/000001_product_catalogue_foundation.up.sql');

export interface ThrowawayPostgres {
  readonly adminUrl: string;
  readonly runtimeUrl: string;
  stop(): void;
}

/** A new anonymous-volume PostgreSQL. It cannot read or modify the owner's local database. */
export async function startThrowawayPostgres(name: string): Promise<ThrowawayPostgres> {
  const adminPassword = randomBytes(18).toString('hex');
  const runtimePassword = randomBytes(18).toString('hex');
  execFileSync('docker', [
    'run', '-d', '--rm', '--name', name,
    '-e', `POSTGRES_PASSWORD=${adminPassword}`, '-e', 'POSTGRES_DB=product_catalogue_proof',
    '-p', '127.0.0.1::5432', 'postgres:16-alpine',
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
    const adminUrl = `postgres://postgres:${adminPassword}@127.0.0.1:${port}/product_catalogue_proof`;
    const admin = await connectWhenReady(adminUrl);
    await admin.query('CREATE TABLE public.unrelated_upgrade_sentinel (id integer PRIMARY KEY, value text NOT NULL)');
    await admin.query("INSERT INTO public.unrelated_upgrade_sentinel VALUES (1, 'preserve-me')");
    await admin.query(readFileSync(MIGRATION, 'utf8'));
    await admin.query(`CREATE ROLE product_catalogue_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS`);
    await admin.query('GRANT USAGE ON SCHEMA gigalibs_product_catalogue TO product_catalogue_runtime');
    await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gigalibs_product_catalogue TO product_catalogue_runtime');
    await admin.query('REVOKE UPDATE, DELETE ON gigalibs_product_catalogue.audit_events FROM product_catalogue_runtime');
    await admin.end();
    return {
      adminUrl,
      runtimeUrl: `postgres://product_catalogue_runtime:${runtimePassword}@127.0.0.1:${port}/product_catalogue_proof`,
      stop,
    };
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
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('The throwaway PostgreSQL did not become ready.');
}
