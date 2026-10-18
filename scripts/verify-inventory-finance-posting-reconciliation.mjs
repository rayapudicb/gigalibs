#!/usr/bin/env node
/** WI-OI-120fs: Unit certification for Inventory receipt posting inbox reconciliation (F2.3). */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--root',
    root,
    '--config',
    'vitest.config.ts',
    'modules/financial-operations/apps/api/src/posting/inventory-receipt-posting-reconciliation.test.ts',
    'modules/financial-operations/apps/api/src/posting/inventory-receipt-posting-reconciliation-job.test.ts',
    'modules/financial-operations/apps/api/src/posting/inventory-receipt-posting-status.test.ts',
    'modules/financial-operations/apps/api/src/posting/inventory-receipt-posting-close-guard.test.ts',
    'modules/financial-operations/apps/api/src/posting/subledger-posting-register.test.ts',
  ],
  { cwd: root, stdio: 'inherit', env: process.env },
);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('WI-OI-120fs inventory receipt posting reconciliation unit certification passed.');
