#!/usr/bin/env node
/**
 * WI-OI-120hi: host-side probe for infra/compose/.env DATABASE_URL before compose rebuild/up.
 * Rewrites host.docker.internal → 127.0.0.1 (containers still use host.docker.internal).
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const composeDir = join(scriptDir, '..');
const repoRoot = join(composeDir, '../..');
const envFile = join(composeDir, '.env');

const require = createRequire(join(repoRoot, 'packages/db/package.json'));
const pg = require('pg');

function readDatabaseUrl() {
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is missing from infra/compose/.env');
  return line.slice('DATABASE_URL='.length);
}

function loopbackUrl(raw) {
  const url = new URL(raw);
  if (url.hostname === 'host.docker.internal') url.hostname = '127.0.0.1';
  return url;
}

const raw = readDatabaseUrl();
const probe = loopbackUrl(raw);

const client = new pg.Client({ connectionString: probe.toString() });
try {
  await client.connect();
  await client.query('SELECT 1');
  console.log(
    `Control database reachable at ${probe.hostname}:${probe.port || '5432'} (user ${decodeURIComponent(probe.username)}).`,
  );
} catch (error) {
  const code = error?.code ?? 'UNKNOWN';
  if (code === '28P01') {
    console.error(
      'PostgreSQL rejected DATABASE_URL credentials (28P01). Align infra/compose/.env with the running dev database (see infra/compose/README.md) or re-run generate-credentials.sh on a fresh database.',
    );
  } else if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    console.error(
      `Cannot reach PostgreSQL at ${probe.hostname}:${probe.port || '5432'} (${code}). Start docker/docker-compose.dev.yml postgres or fix DATABASE_URL.`,
    );
  } else {
    console.error(`DATABASE_URL probe failed (${code}): ${error.message}`);
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
