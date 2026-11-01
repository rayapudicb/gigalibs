#!/usr/bin/env node
/**
 * Host-side runner: uat-postgres is not on the host DNS. Starts a short-lived
 * socat tunnel on 127.0.0.1:5442 → uat-postgres:5432, runs the seed, then stops it.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TUNNEL_NAME = 'uat-pg-tun';
const composeDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(composeDir, '../..');
const line = readFileSync(join(composeDir, '.env'), 'utf8')
  .split('\n')
  .find((entry) => entry.startsWith('DATABASE_URL='));
if (!line) throw new Error('DATABASE_URL missing from infra/compose/.env');
const url = new URL(line.slice('DATABASE_URL='.length));
url.hostname = process.env.UAT_PG_TUNNEL_HOST ?? '127.0.0.1';
url.port = process.env.UAT_PG_TUNNEL_PORT ?? '5442';

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return r;
}

spawnSync('docker', ['rm', '-f', TUNNEL_NAME], { stdio: 'ignore' });
const tun = sh('docker', [
  'run',
  '-d',
  '--name',
  TUNNEL_NAME,
  '--network',
  'gigalibs-configuration-local',
  '-p',
  `127.0.0.1:${url.port}:${url.port}`,
  'alpine/socat',
  `TCP-LISTEN:${url.port},fork,reuseaddr`,
  'TCP:uat-postgres:5432',
]);
if (tun.status !== 0) {
  console.error(tun.stderr || tun.stdout || 'Failed to start uat-postgres tunnel (is Docker up?)');
  process.exit(1);
}

const probe = sh('docker', ['exec', TUNNEL_NAME, 'true']);
if (probe.status !== 0) {
  spawnSync('docker', ['rm', '-f', TUNNEL_NAME], { stdio: 'ignore' });
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: url.toString() };
for (const script of [
  'infra/compose/scripts/seed-uat-module-entitlements.mjs',
  'infra/compose/scripts/seed-uat-module-access.mjs',
]) {
  const result = spawnSync('pnpm', ['exec', 'tsx', script], { cwd: repoRoot, env, stdio: 'inherit' });
  if (result.status !== 0) {
    spawnSync('docker', ['rm', '-f', TUNNEL_NAME], { stdio: 'ignore' });
    process.exit(result.status ?? 1);
  }
}
spawnSync('docker', ['rm', '-f', TUNNEL_NAME], { stdio: 'ignore' });
process.exit(0);
