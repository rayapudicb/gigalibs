import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations');
const MANIFEST = join(dirname(fileURLToPath(import.meta.url)), '../../../db/runtime-manifest.txt');

/** The module's migrations in manifest order (the same set the image ships); comment and blank lines skipped. */
function migrationFiles(): string[] {
  return readFileSync(MANIFEST, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((name) => join(MIGRATIONS_DIR, name));
}

export interface ThrowawayPostgres {
  readonly adminUrl: string;
  readonly runtimeUrl: string;
  stop(): void;
}

/** A new anonymous-volume PostgreSQL. It cannot read or modify the owner's local database. */
export async function startThrowawayPostgres(name: string): Promise<ThrowawayPostgres> {
  const adminPassword = randomBytes(18).toString('hex');
  const runtimePassword = randomBytes(18).toString('hex');
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      name,
      '-e',
      `POSTGRES_PASSWORD=${adminPassword}`,
      '-e',
      'POSTGRES_DB=inventory_proof',
      '-p',
      '127.0.0.1::5432',
      'postgres:16-alpine',
      '-c',
      'fsync=off',
      '-c',
      'synchronous_commit=off',
      '-c',
      'full_page_writes=off',
    ],
    { stdio: 'ignore' },
  );
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    execFileSync('docker', ['rm', '-f', '-v', name], { stdio: 'ignore' });
  };
  process.once('exit', stop);
  try {
    const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' })
      .trim()
      .split(':')
      .pop()!;
    const adminUrl = `postgres://postgres:${adminPassword}@127.0.0.1:${port}/inventory_proof`;
    const admin = await connectWhenReady(adminUrl);
    await admin.query(
      'CREATE TABLE public.unrelated_upgrade_sentinel (id integer PRIMARY KEY, value text NOT NULL)',
    );
    await admin.query("INSERT INTO public.unrelated_upgrade_sentinel VALUES (1, 'preserve-me')");
    // The runtime role must exist before the migrations run: inventory migrations GRANT to it and define its RLS.
    await admin.query(
      `CREATE ROLE gigalibs_inventory_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS`,
    );
    for (const migration of migrationFiles()) {
      await admin.query(readFileSync(migration, 'utf8'));
    }
    await admin.query('GRANT USAGE ON SCHEMA gigalibs_inventory TO gigalibs_inventory_runtime');
    await admin.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gigalibs_inventory TO gigalibs_inventory_runtime',
    );
    await admin.query(
      'REVOKE UPDATE, DELETE ON gigalibs_inventory.audit_events FROM gigalibs_inventory_runtime',
    );
    await admin.query(
      'REVOKE UPDATE, DELETE ON gigalibs_inventory.stock_ledger_transactions FROM gigalibs_inventory_runtime',
    );
    await admin.query(
      'REVOKE UPDATE, DELETE ON gigalibs_inventory.stock_ledger_entries FROM gigalibs_inventory_runtime',
    );
    await admin.end();
    return {
      adminUrl,
      runtimeUrl: `postgres://gigalibs_inventory_runtime:${runtimePassword}@127.0.0.1:${port}/inventory_proof`,
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
      return client;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Throwaway PostgreSQL did not accept connections at ${url}.`);
}
