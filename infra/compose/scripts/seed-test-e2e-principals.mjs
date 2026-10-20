#!/usr/bin/env node
/**
 * WI-OI-120bo: idempotent tenant and users for the P2P/O2C E2E on the isolated project gigalibs-test only.
 * Accounts and passwords come from e2e/test.env (written by generate-test-stack-credentials.sh); there are no defaults.
 * It connects through the test stack's host-published Postgres port, so it cannot reach UAT.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const composeDir = join(scriptDir, '..');
const repoRoot = join(composeDir, '../..');
const requireDb = createRequire(join(repoRoot, 'packages/db/package.json'));
const { hashPassword } = createRequire(join(repoRoot, 'packages/auth-core/package.json'))('./dist/index.js');

function readKey(file, key) {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} is missing from ${file}`);
  return line.slice(key.length + 1).replace(/^"(.*)"$/, '$1');
}

const e2eEnv = join(repoRoot, 'e2e/test.env');
if (readKey(e2eEnv, 'GIGALIBS_E2E_TARGET') !== 'test-stack') {
  throw new Error(`${e2eEnv} is not a test-stack file; refusing to seed.`);
}
const hostPort = readKey(join(composeDir, '.env.test'), 'TEST_POSTGRES_HOST_PORT');
const password = readKey(join(composeDir, '.env.test.database'), 'TEST_DATABASE_SUPERUSER_PASSWORD');
process.env.DATABASE_URL = `postgresql://gigalibs:${encodeURIComponent(password)}@127.0.0.1:${hostPort}/gigalibs`;

const { prisma } = requireDb('./dist/index.js');

const TENANT_NAME = readKey(e2eEnv, 'E2E_UAT_TENANT');
const TENANT_SLUG = TENANT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ADMIN = { email: readKey(e2eEnv, 'E2E_UAT_ADMIN_EMAIL'), password: readKey(e2eEnv, 'E2E_UAT_ADMIN_PASSWORD') };
const APPROVER = {
  email: readKey(e2eEnv, 'E2E_UAT_APPROVER_EMAIL'),
  password: readKey(e2eEnv, 'E2E_UAT_APPROVER_PASSWORD'),
};

const MODULE_KEYS = [
  'tenant-access',
  'gigaops',
  'analytics-studio',
  'product-catalogue',
  'universal-procurement',
  'universal-orders',
  'universal-inventory',
  'financial-operations',
];
const TENANT_FEATURES = [...new Set(['dynamic-forms', 'data-export', ...MODULE_KEYS])];

async function ensureUser({ email, password: userPassword }, name) {
  const passwordHash = await hashPassword(userPassword);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, status: 'ACTIVE', emailVerifiedAt: existing.emailVerifiedAt ?? new Date() },
    });
    return existing.id;
  }
  const created = await prisma.user.create({
    data: {
      email,
      name,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      passwordHash,
    },
  });
  return created.id;
}

async function main() {
  const adminId = await ensureUser(ADMIN, 'E2E Admin (test stack)');
  const approverId = await ensureUser(APPROVER, 'E2E Approver (test stack)');

  let tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
  if (tenant) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { features: TENANT_FEATURES },
    });
  } else {
    tenant = await prisma.tenant.create({
      data: {
        slug: TENANT_SLUG,
        name: TENANT_NAME,
        status: 'ACTIVE',
        features: TENANT_FEATURES,
        settings: {
          create: {
            branding: {},
            security: { enforceMfa: false },
            localization: {},
            features: {},
            metadata: { stack: 'gigalibs-test' },
            updatedById: adminId,
          },
        },
      },
    });
  }

  for (const userId of [adminId, approverId]) {
    await prisma.tenantMember.upsert({
      where: { userId_tenantId: { tenantId: tenant.id, userId } },
      create: { tenantId: tenant.id, userId, role: 'TENANT_ADMIN', status: 'ACTIVE' },
      update: { status: 'ACTIVE', role: 'TENANT_ADMIN' },
    });
  }

  const now = new Date();
  for (const moduleKey of MODULE_KEYS) {
    const existing = await prisma.tenantModuleEntitlement.findFirst({
      where: { tenantId: tenant.id, moduleKey },
    });
    if (existing) {
      if (existing.status !== 'ENABLED') {
        await prisma.tenantModuleEntitlement.update({
          where: { id: existing.id },
          data: { status: 'ENABLED', startsAt: now, endsAt: null, updatedById: adminId },
        });
      }
      continue;
    }
    await prisma.tenantModuleEntitlement.create({
      data: {
        tenantId: tenant.id,
        moduleKey,
        status: 'ENABLED',
        source: 'PLAN',
        startsAt: now,
        reason: 'WI-OI-120bo test stack seed',
        updatedById: adminId,
      },
    });
  }

  console.log(
    JSON.stringify({ tenant: TENANT_NAME, admin: ADMIN.email, approver: APPROVER.email, modules: MODULE_KEYS.length }),
  );
}

await main();
await prisma.$disconnect();
