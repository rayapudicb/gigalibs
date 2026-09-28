import { execSync } from 'node:child_process';

console.log('=== GigaLibs WI-OI-042 Complete Verification Suite ===\n');

const steps = [
  { name: 'Platform Context Secrets & Crypto', cmd: 'node scripts/verify-platform-context-secrets.mjs' },
  { name: 'Package Dependencies Audit', cmd: 'pnpm audit:package-dependencies' },
  { name: 'SDLC Governance Audit', cmd: 'pnpm audit:sdlc' },
  { name: 'Navigation Boundary Audit', cmd: 'pnpm audit:navigation' },
  { name: 'API Module Boundary Audit', cmd: 'pnpm audit:api-boundary' },
  { name: 'Production Data Integrity Audit', cmd: 'pnpm audit:production-data' },
  { name: 'All Runtime Data Integrity Audit', cmd: 'pnpm audit:all-runtime-data' },
];

let allPassed = true;

for (const step of steps) {
  process.stdout.write(`Running: ${step.name}... `);
  try {
    const output = execSync(step.cmd, { stdio: 'pipe' }).toString();
    console.log('✅ PASSED');
  } catch (err) {
    console.log('❌ FAILED');
    console.error(err.stderr?.toString() || err.message);
    allPassed = false;
  }
}

console.log('\n------------------------------------------------------');
if (allPassed) {
  console.log('Status: ALL REPOSITORY STATIC AUDITS & VERIFICATIONS PASSED');
  process.exit(0);
} else {
  console.error('Status: ONE OR MORE AUDITS FAILED');
  process.exit(1);
}
