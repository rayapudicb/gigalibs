import { prisma } from '../packages/db/dist/index.js';
import { trialModuleKeys } from '../packages/tenancy-nest/dist/index.js';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const allowedRoles = new Set(['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_AUDITOR']);

async function main() {
  if (required('ALLOW_PLATFORM_AUTHORITY_BOOTSTRAP') !== 'true') {
    throw new Error('ALLOW_PLATFORM_AUTHORITY_BOOTSTRAP must be exactly true.');
  }
  const email = required('PLATFORM_BOOTSTRAP_EMAIL').toLowerCase();
  const role = required('PLATFORM_BOOTSTRAP_ROLE');
  const reason = required('PLATFORM_BOOTSTRAP_REASON');
  const tenantSlug = process.env.PLATFORM_BOOTSTRAP_TENANT_SLUG?.trim();
  if (!allowedRoles.has(role)) throw new Error('PLATFORM_BOOTSTRAP_ROLE is invalid.');
  if (reason.length < 3 || reason.length > 500) {
    throw new Error('PLATFORM_BOOTSTRAP_REASON must contain 3 to 500 characters.');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    throw new Error('The bootstrap target must be an existing active user.');
  }

  const existingOwners = await prisma.platformRoleAssignment.count({
    where: {
      role: 'PLATFORM_OWNER',
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      NOT: { userId: user.id },
    },
  });
  if (existingOwners > 0) {
    throw new Error(
      'An active platform owner already exists. Use the authenticated platform-role administration flow.',
    );
  }

  const result = await prisma.$transaction(async (transaction) => {
    const previous = await transaction.platformRoleAssignment.findUnique({
      where: { userId_role: { userId: user.id, role } },
    });
    const assignment = await transaction.platformRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role } },
      create: { userId: user.id, role, status: 'ACTIVE', reason },
      update: { status: 'ACTIVE', reason, expiresAt: null, revokedAt: null },
    });
    await transaction.auditLog.create({
      data: {
        action: 'PERMISSION_CHANGE',
        resource: 'platform_role_assignment',
        resourceId: assignment.id,
        userId: user.id,
        before: previous
          ? { role: previous.role, status: previous.status, expiresAt: previous.expiresAt }
          : undefined,
        after: { role: assignment.role, status: assignment.status, expiresAt: null },
        metadata: { reason, bootstrap: true },
      },
    });

    let tenant = null;
    if (tenantSlug) {
      tenant = await transaction.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, slug: true, status: true, trialEndsAt: true, features: true },
      });
      if (!tenant) throw new Error(`Tenant '${tenantSlug}' was not found.`);
      for (const moduleKey of trialModuleKeys) {
        await transaction.tenantModuleEntitlement.upsert({
          where: { tenantId_moduleKey: { tenantId: tenant.id, moduleKey } },
          create: {
            tenantId: tenant.id,
            moduleKey,
            status: 'ENABLED',
            source: 'PLATFORM_OVERRIDE',
            reason,
            updatedById: user.id,
          },
          update: {
            status: 'ENABLED',
            source: 'PLATFORM_OVERRIDE',
            endsAt: null,
            reason,
            updatedById: user.id,
          },
        });
      }
      await transaction.tenantModuleEntitlement.updateMany({
        where: { tenantId: tenant.id, moduleKey: { notIn: trialModuleKeys } },
        data: {
          status: 'DISABLED',
          source: 'PLATFORM_OVERRIDE',
          endsAt: null,
          reason: `${reason}; disabled because the module is outside the current UAT gate`,
          updatedById: user.id,
        },
      });
      await transaction.tenant.update({
        where: { id: tenant.id },
        data: { features: trialModuleKeys },
      });
      await transaction.auditLog.create({
        data: {
          action: 'PERMISSION_CHANGE',
          resource: 'tenant_module_entitlement',
          resourceId: tenant.id,
          userId: user.id,
          tenantId: tenant.id,
          before: { moduleKeys: tenant.features },
          after: { moduleKeys: trialModuleKeys },
          metadata: { reason, bootstrap: true, purpose: 'UAT' },
        },
      });
    }
    return { assignment, tenant };
  });

  process.stdout.write(
    `${JSON.stringify({
      user: user.email,
      platformRole: result.assignment.role,
      platformRoleStatus: result.assignment.status,
      tenant: result.tenant?.slug ?? null,
      enabledUatModules: result.tenant ? trialModuleKeys.length : 0,
    })}\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
