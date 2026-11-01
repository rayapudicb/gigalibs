#!/usr/bin/env node
/**
 * Host-side runner for WI-OI-131 Playwright fixtures: tunnels uat-postgres, then seeds Analytics.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TUNNEL_NAME = 'uat-pg-tun-analytics-e2e';
const composeDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(composeDir, '../..');

function readEnvKey(key) {
  const candidates = [
    join(composeDir, '.env'),
    join(composeDir, '.env.modules'),
    join(composeDir, '.env.test.modules'),
  ];
  for (const file of candidates) {
    try {
      const line = readFileSync(file, 'utf8')
        .split('\n')
        .find((entry) => entry.startsWith(`${key}=`));
      if (line) return line.slice(key.length + 1).replace(/^"(.*)"$/, '$1');
    } catch {
      // try next file
    }
  }
  throw new Error(`${key} missing from infra/compose/.env or .env*.modules (run module credential generation).`);
}

function hostUrl(raw) {
  const url = new URL(raw);
  url.hostname = process.env.UAT_PG_TUNNEL_HOST ?? '127.0.0.1';
  url.port = process.env.UAT_PG_TUNNEL_PORT ?? '5442';
  return url.toString();
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts });
}

spawnSync('docker', ['rm', '-f', TUNNEL_NAME], { stdio: 'ignore' });
const port = process.env.UAT_PG_TUNNEL_PORT ?? '5442';
const tun = sh('docker', [
  'run',
  '-d',
  '--name',
  TUNNEL_NAME,
  '--network',
  'gigalibs-configuration-local',
  '-p',
  `127.0.0.1:${port}:${port}`,
  'alpine/socat',
  `TCP-LISTEN:${port},fork,reuseaddr`,
  'TCP:uat-postgres:5432',
]);
if (tun.status !== 0) {
  console.error(tun.stderr || tun.stdout || 'Failed to start uat-postgres tunnel (is Docker up?)');
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: hostUrl(readEnvKey('DATABASE_URL')),
  ANALYTICS_DATABASE_URL: hostUrl(readEnvKey('ANALYTICS_DATABASE_URL')),
};
const result = sh('pnpm', ['--filter', '@gigalibs/db', 'build'], { cwd: repoRoot, env, stdio: 'inherit' });
if (result.status !== 0) {
  spawnSync('docker', ['rm', '-f', TUNNEL_NAME], { stdio: 'ignore' });
  process.exit(result.status ?? 1);
}
const seed = sh('pnpm', ['--filter', '@gigalibs/analytics-api', 'seed:module-analytics-e2e'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});
spawnSync('docker', ['rm', '-f', TUNNEL_NAME], { stdio: 'ignore' });
process.exit(seed.status ?? 1);
