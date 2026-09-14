import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { prisma } from '../packages/db/dist/index.js';
import { AuditService } from '../packages/audit-nest/dist/audit.service.js';
import { ScimService } from '../apps/playground-api/dist/scim.service.js';

console.log('--- Commencing SCIM 2.0 Inbound Provisioning & Directory Sync Verification ---');

const auditService = new AuditService();
const scimService = new ScimService(auditService);

// 1. Setup real test tenant
const testTenant = await prisma.tenant.create({
  data: {
    slug: `scim-test-${randomBytes(4).toString('hex')}`,
    name: 'Enterprise SCIM Integration Corp',
  },
});
const testTenantId = testTenant.id;
let createdUserId = '';

try {
  // 2. Service Provider Config & Schema Introspection
  console.log('1. Testing SCIM 2.0 ServiceProviderConfig & ResourceTypes...');
  const spConfig = scimService.getServiceProviderConfig();
  assert.equal(spConfig.schemas[0], 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig');
  assert.equal(spConfig.patch.supported, true);
  assert.equal(spConfig.filter.supported, true);

  const resourceTypes = scimService.getResourceTypes();
  assert.equal(resourceTypes.length, 2);
  assert.ok(resourceTypes.some((r) => r.id === 'User'));
  assert.ok(resourceTypes.some((r) => r.id === 'Group'));
  console.log('✔ RFC 7643 discovery schemas valid.');

  // 3. Inbound User Provisioning (JIT / Okta Push)
  console.log('2. Testing Inbound User Provisioning (Okta/Entra ID POST /Users)...');
  const userEmail = `alex.mercer.${randomBytes(4).toString('hex')}@enterprise.internal`;
  const externalId = `okta-ext-${randomBytes(6).toString('hex')}`;

  const scimUser = await scimService.createUser(
    {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      externalId,
      userName: userEmail,
      name: {
        formatted: 'Alex Mercer',
        familyName: 'Mercer',
        givenName: 'Alex',
      },
      displayName: 'Alex Mercer',
      emails: [{ value: userEmail, type: 'work', primary: true }],
      active: true,
      roles: [{ value: 'TENANT_ADMIN', primary: true }],
    },
    testTenantId,
  );

  createdUserId = scimUser.id;
  assert.ok(createdUserId.length > 0);
  assert.equal(scimUser.userName, userEmail);
  assert.equal(scimUser.externalId, externalId);
  assert.equal(scimUser.active, true);
  assert.equal(scimUser.roles[0]?.value, 'TENANT_ADMIN');
  console.log(`✔ User provisioned successfully: ${createdUserId} (${userEmail})`);

  // Verify directly in database
  const dbMember = await prisma.tenantMember.findFirst({
    where: { tenantId: testTenantId, userId: createdUserId },
    include: { user: true },
  });
  assert.ok(dbMember, 'TenantMember must exist in PostgreSQL');
  assert.equal(dbMember.role, 'TENANT_ADMIN');
  assert.equal(dbMember.status, 'ACTIVE');
  console.log('✔ PostgreSQL membership confirmed with role TENANT_ADMIN and status ACTIVE.');

  // 4. Query with Filter (userName eq "...")
  console.log('3. Testing SCIM Filter Query (GET /Users?filter=userName eq "...")...');
  const searchResult = await scimService.listUsers({
    tenantId: testTenantId,
    filter: `userName eq "${userEmail}"`,
  });
  assert.equal(searchResult.totalResults, 1);
  assert.equal(searchResult.Resources[0]?.id, createdUserId);
  console.log('✔ SCIM filter lookup returned exact matching user.');

  // 5. Inbound Deprovisioning / Suspension (Okta Employee Offboarding)
  console.log('4. Testing Inbound Deprovisioning (PATCH /Users/:id active=false)...');
  const deprovisioned = await scimService.patchUser(
    createdUserId,
    {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [
        {
          op: 'replace',
          path: 'active',
          value: false,
        },
      ],
    },
    testTenantId,
  );

  assert.equal(deprovisioned.active, false);

  const suspendedDbMember = await prisma.tenantMember.findFirst({
    where: { tenantId: testTenantId, userId: createdUserId },
  });
  assert.equal(suspendedDbMember?.status, 'SUSPENDED');
  console.log('✔ User suspended in DB; active status set to false.');

  // 6. Group / Role Synchronization
  console.log('5. Testing SCIM Group & Role Synchronization (GET /Groups)...');
  const groupsResult = await scimService.listGroups(testTenantId);
  assert.ok(groupsResult.totalResults >= 6);
  const tenantAdminGroup = groupsResult.Resources.find((g) => g.displayName === 'TENANT_ADMIN');
  assert.ok(tenantAdminGroup);
  console.log(`✔ Groups verified. Found ${groupsResult.totalResults} roles.`);

  // 7. Complete Deprovisioning (DELETE /Users/:id)
  console.log('6. Testing User Deletion / Deprovisioning (DELETE /Users/:id)...');
  await scimService.deleteUser(createdUserId, testTenantId);
  const deletedMember = await prisma.tenantMember.findFirst({
    where: { tenantId: testTenantId, userId: createdUserId },
  });
  assert.equal(deletedMember, null, 'TenantMember must be deleted');
  console.log('✔ User deprovisioned from tenant.');

  console.log(JSON.stringify({
    certification: 'SCIM-2.0-ENTERPRISE-PROVISIONING',
    status: 'passed',
    tenantId: testTenantId,
    protocolCompliance: 'RFC-7643-RFC-7644',
    jitProvisioning: 'verified',
    filterQuery: 'verified',
    patchDeprovisioning: 'verified',
    roleSync: 'verified',
    deleteDeprovisioning: 'verified',
  }, null, 2));

} finally {
  await prisma.$disconnect();
}
