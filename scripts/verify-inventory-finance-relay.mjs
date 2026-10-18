#!/usr/bin/env node
/** WI-OI-120fr: Unit certification for Inventory→Finance relay consumer and E2 posting policy (isolated; no UAT). */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(label, args) {
  console.log(`\n== ${label}`);
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('@gigalibs/posting-rules tests', ['--filter', '@gigalibs/posting-rules', 'test']);
run('Finance inventory inbox + posting context tests', [
  'exec',
  'vitest',
  'run',
  '--root',
  root,
  '--config',
  'vitest.config.ts',
  'modules/financial-operations/apps/api/src/subledger/inventory-inbox.test.ts',
  'modules/financial-operations/apps/api/src/posting/finance-posting-context.test.ts',
]);
console.log('\nWI-OI-120fr inventory–finance relay posting unit certification passed.');
