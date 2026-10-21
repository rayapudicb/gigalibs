#!/usr/bin/env node
/**
 * WI-OI-120hi: host-side probe for infra/compose/.env DATABASE_URL before compose rebuild/up.
 * Rewrites host.docker.internal → 127.0.0.1 (containers still use host.docker.internal).
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const composeDir = join(scriptDir, '..');
const repoRoot = join(composeDir, '../..');

const require = createRequire(join(repoRoot, 'packages/db/package.json'));
const pg = require('pg');

function envSuffix() {
  const branch = execSync('git symbolic-ref --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  return branch.startsWith('release/') ? '' : '.test';
}

function readEnvValue(file, key) {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} is missing from ${file}`);
  return line.slice(key.length + 1);
}

/** Host probe URL: UAT release worktree uses .env + 5440; main uses .env.test + published test-postgres port. */
function probeDatabaseUrl() {
  const suffix = envSuffix();
  const envFile = join(composeDir, `.env${suffix}`);
  const raw = readEnvValue(envFile, 'DATABASE_URL');
  const url = new URL(raw);
  if (suffix === '.test') {
    const hostPort = readEnvValue(envFile, 'TEST_POSTGRES_HOST_PORT');
    url.hostname = '127.0.0.1';
    url.port = hostPort;
    if (url.hostname === 'test-postgres') url.hostname = '127.0.0.1';
  } else if (url.hostname === 'host.docker.internal') {
    url.hostname = '127.0.0.1';
  }
  return url;
}

const probe = probeDatabaseUrl();

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
      'PostgreSQL rejected DATABASE_URL credentials (28P01). On main use gigalibs-test (.env.test + generate-test-stack-credentials.sh); on release/* use infra/compose/.env vs port 5440 (see README.md).',
    );
  } else if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    console.error(
      `Cannot reach PostgreSQL at ${probe.hostname}:${probe.port || '5432'} (${code}). Start test-postgres (gigalibs-test) or dev postgres and fix DATABASE_URL.`,
    );
  } else {
    console.error(`DATABASE_URL probe failed (${code}): ${error.message}`);
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
