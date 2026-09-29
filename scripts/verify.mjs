#!/usr/bin/env node
// `pnpm verify`: the mandatory verification in AGENTS.md plus the layer, module-manifest and deployment-profile
// checks, in one command. It prints one line per step and the tail of any failure. The full output goes to a log
// file outside the repository, so reading the result costs a few lines instead of thousands.
// `pnpm verify --audits` skips build and test (for documentation or configuration-only changes).
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  ...['production-data', 'all-runtime-data', 'package-dependencies', 'api-boundary', 'navigation', 'sdlc', 'layers'].map(
    (audit) => ({ name: `audit:${audit}`, cmd: 'pnpm', args: [`audit:${audit}`] }),
  ),
  { name: 'module manifests', cmd: process.execPath, args: ['scripts/module-manifests.mjs', '--check'] },
  {
    name: 'deployment profile',
    cmd: process.execPath,
    args: ['scripts/verify-configuration-local-profile.mjs'],
    knownDrift: KNOWN_PROFILE_DRIFT,
  },
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
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
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
for (const step of steps) {
  const headerLine = logLines + 1;
  write(`=== ${step.name}\n`);
  const started = Date.now();
  const { code, output } = await run(step);
  const seconds = Math.round((Date.now() - started) / 1000);
  let status = code === 0 ? 'PASS' : 'FAIL';
  if (status === 'FAIL' && step.knownDrift && onlyKnownDrift(output, step.knownDrift)) status = 'KNOWN';
  console.log(`${status.padEnd(5)} ${step.name.padEnd(27)} ${String(seconds).padStart(4)} s   log line ${headerLine}`);
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
console.log(
  failed === 0
    ? `RESULT: PASS${known ? ` (${known} known drift)` : ''}`
    : `RESULT: FAIL (${failed} step${failed === 1 ? '' : 's'})`,
);
process.exit(failed === 0 ? 0 : 1);
