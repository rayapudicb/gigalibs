#!/usr/bin/env node
/** WI-OI-120bo: probe the gigalibs-test Postgres on its host-published port (never UAT). */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const composeDir = join(scriptDir, '..');
const repoRoot = join(composeDir, '../..');
const baseEnv = join(composeDir, '.env.test');
const dbEnv = join(composeDir, '.env.test.database');

const require = createRequire(join(repoRoot, 'packages/db/package.json'));
const pg = require('pg');

function readKey(file, key) {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} is missing from ${file}`);
  return line.slice(key.length + 1);
}

const hostPort = readKey(baseEnv, 'TEST_POSTGRES_HOST_PORT');
const password = readKey(dbEnv, 'TEST_DATABASE_SUPERUSER_PASSWORD');
const probe = `postgresql://gigalibs:${encodeURIComponent(password)}@127.0.0.1:${hostPort}/gigalibs`;

const client = new pg.Client({ connectionString: probe });
try {
  await client.connect();
  await client.query('SELECT 1');
  console.log(`Test database reachable at 127.0.0.1:${hostPort} (project gigalibs-test).`);
} catch (error) {
  const code = error?.code ?? 'UNKNOWN';
  console.error(`Test DATABASE_URL probe failed (${code}): ${error.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
