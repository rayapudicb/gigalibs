#!/usr/bin/env node
// `pnpm verify`: the mandatory verification in AGENTS.md plus the layer, module-manifest and deployment-profile
// checks, in one command. It prints one line per step and the tail of any failure. The full output goes to a log
// file outside the repository, so reading the result costs a few lines instead of thousands.
// `pnpm verify --audits` skips build and test (for documentation or configuration-only changes).
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NOT_RUN_EXIT_CODE } from './lib/isolated-proof-database.mjs';

const auditsOnly = process.argv.includes('--audits');
// The deployment-profile verifier reports this drift until the owner decides it (see `.pi/NOW.md`).
const KNOWN_PROFILE_DRIFT = /WORKFORCE_API_URL/;

const steps = [
  ...(auditsOnly
    ? []
    : [
        { name: 'build', cmd: 'pnpm', args: ['build'], stopOnFail: true },
        { name: 'test', cmd: 'pnpm', args: ['test'] },
      ]),
  ...['production-data', 'all-runtime-data', 'package-dependencies', 'api-boundary', 'navigation', 'sdlc', 'layers', 'design-tokens'].map(
    (audit) => ({ name: `audit:${audit}`, cmd: 'pnpm', args: [`audit:${audit}`] }),
  ),
  { name: 'module manifests', cmd: process.execPath, args: ['scripts/module-manifests.mjs', '--check'] },
  // WI-OI-120ak (re-review of f41702b, Low): releases are cut locally and never run GitHub CI, so the migration pin
  // check also runs here.
  { name: 'migration pins', cmd: process.execPath, args: ['scripts/verify-migration-pins.mjs'] },
  // WI-OI-120s (S16): every committed window is what its module's dictionary/windows.mjs produces, and every converted
  // module's windows match its dispatcher, gateway, pages and module roles (the latter needs the build).
  { name: 'module windows (S16)', cmd: process.execPath, args: ['scripts/generate-windows.mjs', '--check'] },
  ...(auditsOnly ? [] : [{ name: 'module conversions (S16)', cmd: process.execPath, args: ['scripts/verify-module-conversion.mjs'] }]),
  {
    name: 'deployment profile',
    cmd: process.execPath,
    args: ['scripts/verify-configuration-local-profile.mjs'],
    knownDrift: KNOWN_PROFILE_DRIFT,
  },
  { name: 'financial-operations', cmd: process.execPath, args: ['scripts/verify-financial-operations.mjs'] },
  { name: 'treasury-reconciliation', cmd: process.execPath, args: ['scripts/verify-treasury-reconciliation.mjs'] },
  { name: 'fixed-assets', cmd: process.execPath, args: ['scripts/verify-fixed-assets.mjs'] },
  { name: 'consolidation', cmd: process.execPath, args: ['scripts/verify-consolidation.mjs'] },
  { name: 'inventory-costing', cmd: process.execPath, args: ['scripts/verify-inventory-costing.mjs'] },
  { name: 'budgeting-commitment-control', cmd: process.execPath, args: ['scripts/verify-budgeting-and-commitment-control.mjs'] },
  { name: 'period-close-forecasting', cmd: process.execPath, args: ['scripts/verify-period-close-and-forecasting.mjs'] },
  { name: 'module-host-http (U2)', cmd: process.execPath, args: ['scripts/verify-u2-module-host-http.mjs'] },
  // WI-OI-120f (F0.5): Inventory's metadata windows over HTTP through the module host (needs PROOF_DATABASE_URL).
  { name: 'inventory-windows (F0.5)', cmd: process.execPath, args: ['scripts/verify-f0-inventory-windows.mjs'] },
  // WI-OI-120h (U19a): every CMMS screen call reaches the built CMMS API through the gateway allow-list (needs
  // PROOF_DATABASE_URL).
  { name: 'cmms-screen-routes (U19a)', cmd: process.execPath, args: ['scripts/verify-u19a-cmms-screen-routes.mjs'] },
  // WI-OI-120g (U7): the Catalogue's metadata windows over HTTP through the module host, maker and checker (needs
  // PROOF_DATABASE_URL).
  { name: 'catalogue-windows (U7)', cmd: process.execPath, args: ['scripts/verify-u7-catalogue-windows.mjs'] },
  // WI-OI-120l (U12): the general ledger's windows over HTTP through the module host: drafts, maker and checker,
  // locked periods, reversal and reports (needs PROOF_DATABASE_URL).
  { name: 'general-ledger (U12)', cmd: process.execPath, args: ['scripts/verify-u12-general-ledger.mjs'] },
];

const logDir = join(tmpdir(), 'gigalibs-verify');
mkdirSync(logDir, { recursive: true });
const log = join(logDir, `verify-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
writeFileSync(log, '');
let logLines = 0;
const write = (text) => {
  appendFileSync(log, text);
  logLines += (text.match(/\n/g) ?? []).length;
};
const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');

function run(step) {
  return new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
        pnpm_config_verify_deps_before_run: 'false',
      },
    });
    let output = '';
    const collect = (chunk) => {
      const text = plain(chunk.toString());
      output += text;
      write(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => resolve({ code: 1, output: String(error) }));
    child.on('close', (code) => resolve({ code, output }));
  });
}

/** True when a failing profile report contains only violations that match the known drift. */
function onlyKnownDrift(output, pattern) {
  const start = output.indexOf('{');
  if (start < 0) return false;
  try {
    const violations = JSON.parse(output.slice(start)).violations ?? [];
    return violations.length > 0 && violations.every((v) => pattern.test(`${v.code} ${v.message}`));
  } catch {
    return false;
  }
}

console.log(`verify: full log ${log}`);
let failed = 0;
let known = 0;
let notRun = 0;
for (const step of steps) {
  const headerLine = logLines + 1;
  write(`=== ${step.name}\n`);
  const started = Date.now();
  const { code, output } = await run(step);
  const seconds = Math.round((Date.now() - started) / 1000);
  // A finance proof without an isolated PROOF_DATABASE_URL does not run; it is reported, never counted as a pass
  // (WI-OI-120a; scripts/lib/isolated-proof-database.mjs).
  let status = code === 0 ? 'PASS' : code === NOT_RUN_EXIT_CODE ? 'NOT RUN' : 'FAIL';
  if (status === 'FAIL' && step.knownDrift && onlyKnownDrift(output, step.knownDrift)) status = 'KNOWN';
  console.log(`${status.padEnd(7)} ${step.name.padEnd(27)} ${String(seconds).padStart(4)} s   log line ${headerLine}`);
  if (status === 'NOT RUN') {
    notRun += 1;
    console.log('        needs PROOF_DATABASE_URL (an isolated database, never the UAT instance)');
  }
  if (status === 'KNOWN') {
    known += 1;
    console.log('      only the known WORKFORCE_API_URL drift');
  }
  if (status === 'FAIL') {
    failed += 1;
    for (const line of output.split('\n').filter((l) => l.trim()).slice(-12)) console.log(`      ${line.slice(0, 200)}`);
    if (step.stopOnFail) {
      console.log(`      stopped: the remaining steps need a passing ${step.name}`);
      break;
    }
  }
}
const notes = [known ? `${known} known drift` : '', notRun ? `${notRun} not run` : ''].filter(Boolean).join('; ');
console.log(
  failed === 0
    ? `RESULT: ${notRun ? 'PASS for the steps that ran' : 'PASS'}${notes ? ` (${notes})` : ''}`
    : `RESULT: FAIL (${failed} step${failed === 1 ? '' : 's'}${notes ? `; ${notes}` : ''})`,
);
process.exit(failed === 0 ? 0 : 1);
