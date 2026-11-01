#!/usr/bin/env node
/** Loads UAT compose env (optional tunnel via run-seed wrapper) and boots the module host once to surface startup errors. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const composeDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(composeDir, '../..');

const envFiles = [
  '.env',
  '.env.modules',
  '.env.workforce',
  '.env.geospatial',
  '.env.module.host',
  '.env.database',
  '.env.module.business-partners',
  '.env.module.financial-operations',
  '.env.module.product-catalogue',
  '.env.module.universal-procurement',
  '.env.module.universal-orders',
  '.env.module.universal-inventory',
  '.env.module.universal-manufacturing',
  '.env.module.process-safety-screening',
  '.env.module.project-operations',
  '.env.module.universal-returns',
];

for (const file of envFiles) {
  const path = join(composeDir, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index);
    if (process.env[key] === undefined) process.env[key] = line.slice(index + 1);
  }
}

if (process.env.UAT_PG_TUNNEL_HOST) {
  const urlKeys = Object.keys(process.env).filter((key) => key.endsWith('DATABASE_URL'));
  for (const key of urlKeys) {
    try {
      const url = new URL(process.env[key]);
      if (url.hostname === 'uat-postgres') {
        url.hostname = process.env.UAT_PG_TUNNEL_HOST;
        url.port = process.env.UAT_PG_TUNNEL_PORT ?? '5442';
        process.env[key] = url.toString();
      }
    } catch {
      /* ignore malformed */
    }
  }
}

process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';
process.env.MODULE_HOST_API_HOST ??= '0.0.0.0';
process.env.MODULE_HOST_API_PORT ??= '4790';
process.env.MODULE_HOST_CORS_ORIGINS ??= process.env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:5180';
const { spawnSync } = await import('node:child_process');
const main = join(repoRoot, 'apps/module-host/dist/main.js');
const result = spawnSync(process.execPath, [main], {
  cwd: join(repoRoot, 'apps/module-host'),
  env: process.env,
  stdio: 'inherit',
  timeout: 12_000,
});
if (result.signal === 'SIGTERM' || result.status === 143) {
  console.log('Module host started (stopped probe after 12s).');
  process.exit(0);
}
process.exit(result.status ?? 1);
