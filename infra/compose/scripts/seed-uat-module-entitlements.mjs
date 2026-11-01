#!/usr/bin/env node
/**
 * Enable every entitlement-eligible sidebar module on the UAT tenant (5180 manual testing).
 * Skips CONTAINED catalog entries (AR, spend, TextFly, etc.). Does not print credentials.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const composeDir = join(scriptDir, '..');
const repoRoot = join(composeDir, '../..');

function loadCatalog() {
  const catalogPath = join(repoRoot, 'packages/contracts/src/modules/catalog.generated.ts');
  const source = readFileSync(catalogPath, 'utf8');
  const entries = [];
  const blockRe = /key: '([^']+)'[\s\S]*?readiness: '(CONTAINED|PLANNED|REVIEW|AVAILABLE)'[\s\S]*?entitlementEligible: (true|false)/g;
  let match;
  while ((match = blockRe.exec(source)) !== null) {
    entries.push({
      key: match[1],
      readiness: match[2],
      entitlementEligible: match[3] === 'true',
    });
  }
  if (entries.length < 20) throw new Error('catalog parse failed; regenerate module manifests.');
  return entries;
}

function readKey(file, key) {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} is missing from ${file}`);
  return line.slice(key.length + 1).replace(/^"(.*)"$/, '$1');
}

const baseEnv = join(composeDir, '.env');
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = readKey(baseEnv, 'DATABASE_URL');
}
const { prisma } = await import(join(repoRoot, 'packages/db/dist/index.js'));

const TENANT_NAME = process.env.E2E_UAT_TENANT ?? 'GigaLibs Global Enterprise';

const EXCLUDE = new Set([
  'accounts-receivable',
  'spend-management',
  'communications-textfly',
  'data-contracts',
  'tax-configuration',
  'multi-currency',
  'autonomous-recovery',
  'rule-studio',
  'cryptographic-esign',
  'ai-document-scanner',
  'operational-ontology',
  'distributed-saga',
]);

const MODULE_KEYS = loadCatalog().filter(
  (module) =>
    module.entitlementEligible &&
    module.readiness !== 'CONTAINED' &&
    !EXCLUDE.has(module.key),
).map((module) => module.key);

const TENANT_FEATURES = [...new Set(['dynamic-forms', 'data-export', 'tenant-access', ...MODULE_KEYS])];

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
  if (!tenant) {
    console.error(`No tenant named "${TENANT_NAME}"; create it or set E2E_UAT_TENANT.`);
    process.exit(1);
  }
  const admin = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
    select: { userId: true },
  });
  const updatedById = admin?.userId ?? tenant.id;

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { features: TENANT_FEATURES },
  });

  const now = new Date();
  for (const moduleKey of MODULE_KEYS) {
    const existing = await prisma.tenantModuleEntitlement.findFirst({
      where: { tenantId: tenant.id, moduleKey },
    });
    if (existing) {
      if (existing.status !== 'ENABLED') {
        await prisma.tenantModuleEntitlement.update({
          where: { id: existing.id },
          data: { status: 'ENABLED', startsAt: now, endsAt: null, updatedById },
        });
      }
      continue;
    }
    await prisma.tenantModuleEntitlement.create({
      data: {
        tenantId: tenant.id,
        moduleKey,
        status: 'ENABLED',
        source: 'PLATFORM_OVERRIDE',
        reason: 'UAT convergence manual test (seed-uat-module-entitlements.mjs)',
        startsAt: now,
        updatedById,
      },
    });
  }

  console.log(
    JSON.stringify({
      tenant: TENANT_NAME,
      entitlements: MODULE_KEYS.length,
      uatPreviewHint: 'Set GIGALIBS_UAT_PREVIEW=enabled in infra/compose/.env for PLANNED modules in the sidebar.',
    }),
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
