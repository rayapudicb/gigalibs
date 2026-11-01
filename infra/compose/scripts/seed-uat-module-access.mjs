#!/usr/bin/env node
/**
 * Grant each entitled module's catalog `requiredPermission` to TENANT_ADMIN members on the UAT tenant.
 * Platform inspection covers some modules (e.g. inventory); PLANNED modules without it stay locked on /modules until this runs.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const composeDir = join(scriptDir, '..');
const repoRoot = join(composeDir, '../..');

function loadCatalogPermissions() {
  const catalogPath = join(repoRoot, 'packages/contracts/src/modules/catalog.generated.ts');
  const source = readFileSync(catalogPath, 'utf8');
  const permissions = [];
  const blockRe =
    /key: '([^']+)'[\s\S]*?entitlementEligible: (true|false)[\s\S]*?requiredPermission: '([^']+)'/g;
  let match;
  while ((match = blockRe.exec(source)) !== null) {
    if (match[2] === 'true' && match[1] !== 'platform-control') permissions.push(match[3]);
  }
  if (permissions.length < 15) throw new Error('catalog permission parse failed');
  return permissions;
}

/** Every permission the BFF gateway may require (manifest routes), not only the sidebar `requiredPermission`. */
function loadGatewayPermissions() {
  const gatewayPath = join(repoRoot, 'apps/workflow-platform/lib/generated/module-gateways.ts');
  const source = readFileSync(gatewayPath, 'utf8');
  const permissions = [];
  for (const match of source.matchAll(/"(GET|POST|PATCH|PUT|DELETE)": "([^"]+)"/g)) {
    permissions.push(match[2]);
  }
  if (permissions.length < 40) throw new Error('gateway permission parse failed');
  return permissions;
}

/** WI-OI-131: module analytics sources declare read permissions outside the BFF gateway table. */
function loadModuleAnalyticsPermissions() {
  const sourcesPath = join(repoRoot, 'packages/contracts/src/analytics/module-sources.generated.ts');
  const source = readFileSync(sourcesPath, 'utf8');
  const permissions = [];
  for (const match of source.matchAll(/requiredReadPermission": "([^"]+)"/g)) {
    permissions.push(match[1]);
  }
  if (permissions.length < 1) throw new Error('module analytics permission parse failed');
  return permissions;
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
const MODULE_PERMISSIONS = [
  ...new Set([...loadCatalogPermissions(), ...loadGatewayPermissions(), ...loadModuleAnalyticsPermissions()]),
];

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME } });
  if (!tenant) {
    console.error(`No tenant named "${TENANT_NAME}"`);
    process.exit(1);
  }
  const admins = await prisma.tenantMember.findMany({
    where: { tenantId: tenant.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
    select: { id: true, userId: true, permissions: true, user: { select: { email: true } } },
  });
  if (admins.length === 0) {
    console.error(`No TENANT_ADMIN on "${TENANT_NAME}"`);
    process.exit(1);
  }
  let updated = 0;
  for (const admin of admins) {
    const merged = [...new Set([...admin.permissions, ...MODULE_PERMISSIONS])];
    const unchanged =
      merged.length === admin.permissions.length &&
      merged.every((permission) => admin.permissions.includes(permission));
    if (unchanged) continue;
    await prisma.tenantMember.update({
      where: { id: admin.id },
      data: { permissions: merged },
    });
    updated += 1;
  }
  console.log(
    JSON.stringify({
      tenant: TENANT_NAME,
      tenantAdmins: admins.length,
      tenantAdminsUpdated: updated,
      permissionsGranted: MODULE_PERMISSIONS.length,
      hint: 'Sign out and sign in again so the session picks up new permissions.',
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
