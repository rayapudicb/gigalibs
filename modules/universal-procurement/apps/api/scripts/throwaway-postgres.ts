import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations');
const MANIFEST = join(dirname(fileURLToPath(import.meta.url)), '../../../db/runtime-manifest.txt');

export interface ThrowawayPostgres {
  readonly adminUrl: string;
  readonly runtimeUrl: string;
  stop(): void;
}

function migrationFiles(): string[] {
  return readFileSync(MANIFEST, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => join(MIGRATIONS_DIR, name));
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
      'POSTGRES_DB=procurement_proof',
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
    const adminUrl = `postgres://postgres:${adminPassword}@127.0.0.1:${port}/procurement_proof`;
    const admin = await connectWhenReady(adminUrl);
    await admin.query(
      'CREATE TABLE public.unrelated_upgrade_sentinel (id integer PRIMARY KEY, value text NOT NULL)',
    );
    await admin.query("INSERT INTO public.unrelated_upgrade_sentinel VALUES (1, 'preserve-me')");
    await admin.query(`
      CREATE TABLE public.parties (
        id uuid PRIMARY KEY,
        tenant_id varchar(64) NOT NULL,
        code varchar(64) NOT NULL,
        legal_name varchar(255) NOT NULL,
        display_name varchar(255) NOT NULL,
        party_type varchar(32) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'ACTIVE',
        archived_at timestamptz
      )
    `);
    for (const migration of migrationFiles()) {
      await admin.query(readFileSync(migration, 'utf8'));
    }
    await admin.query(
      `CREATE ROLE procurement_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS`,
    );
    await admin.query('GRANT USAGE ON SCHEMA gigalibs_procurement TO procurement_runtime');
    await admin.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gigalibs_procurement TO procurement_runtime',
    );
    await admin.query(
      'REVOKE UPDATE, DELETE ON gigalibs_procurement.audit_events FROM procurement_runtime',
    );
    await admin.query(
      'REVOKE UPDATE, DELETE ON gigalibs_procurement.match_po_receipt_records FROM procurement_runtime',
    );
    await admin.query(
      'REVOKE DELETE ON gigalibs_procurement.match_po_invoice_records FROM procurement_runtime',
    );
    await admin.end();
    return {
      adminUrl,
      runtimeUrl: `postgres://procurement_runtime:${runtimePassword}@127.0.0.1:${port}/procurement_proof`,
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
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for PostgreSQL container at ${url}`);
}
