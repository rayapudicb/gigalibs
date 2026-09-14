import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { prisma } from '../packages/db/dist/index.js';
import { AuditService } from '../packages/audit-nest/dist/audit.service.js';
import {
  GENESIS_HASH,
  verifyAuditChain,
} from '../packages/audit-core/dist/index.js';

console.log('--- Commencing Cryptographically Chained Audit Ledger Verification ---');

const auditService = new AuditService();

// Create real test Tenant and User to satisfy DB constraints
const testTenant = await prisma.tenant.create({
  data: {
    slug: `chain-test-${randomBytes(4).toString('hex')}`,
    name: 'Audit Chain Verification Tenant',
  },
});
const testUser = await prisma.user.create({
  data: {
    email: `chain-tester-${randomBytes(4).toString('hex')}@gigalibs.local`,
    name: 'Chain Auditor',
    status: 'ACTIVE',
  },
});

const testTenantId = testTenant.id;
const testUserId = testUser.id;

try {
  console.log(`1. Logging 5 sequential chained audit records for tenant '${testTenantId}'...`);

  // Record 1 (Genesis)
  const log1 = await auditService.log({
    tenantId: testTenantId,
    action: 'CREATE',
    resource: 'invoice',
    resourceId: 'INV-1001',
    before: undefined,
    after: { total: 5000, status: 'DRAFT' },
    userId: testUserId,
  });

  const proof1 = (log1.metadata)?.cryptographicProof;
  assert.equal(proof1.sequence, 1);
  assert.equal(proof1.previousHash, GENESIS_HASH);
  assert.ok(proof1.recordHash.length === 64);
  console.log(`✔ Record 1 sealed (Seq: 1, Prev: ${proof1.previousHash.slice(0, 10)}..., Hash: ${proof1.recordHash.slice(0, 16)}...)`);

  // Record 2
  const log2 = await auditService.log({
    tenantId: testTenantId,
    action: 'UPDATE',
    resource: 'invoice',
    resourceId: 'INV-1001',
    before: { total: 5000, status: 'DRAFT' },
    after: { total: 5000, status: 'PENDING_APPROVAL' },
    userId: testUserId,
  });

  const proof2 = (log2.metadata)?.cryptographicProof;
  assert.equal(proof2.sequence, 2);
  assert.equal(proof2.previousHash, proof1.recordHash);
  assert.ok(proof2.recordHash.length === 64);
  console.log(`✔ Record 2 chained (Seq: 2, Prev: ${proof2.previousHash.slice(0, 10)}..., Hash: ${proof2.recordHash.slice(0, 16)}...)`);

  // Record 3
  const log3 = await auditService.log({
    tenantId: testTenantId,
    action: 'PERMISSION_CHANGE',
    resource: 'role',
    resourceId: 'ROLE-FINANCE',
    before: { canApprove: false },
    after: { canApprove: true },
    userId: testUserId,
  });

  const proof3 = (log3.metadata)?.cryptographicProof;
  assert.equal(proof3.sequence, 3);
  assert.equal(proof3.previousHash, proof2.recordHash);
  console.log(`✔ Record 3 chained (Seq: 3, Prev: ${proof3.previousHash.slice(0, 10)}..., Hash: ${proof3.recordHash.slice(0, 16)}...)`);

  // Record 4
  const log4 = await auditService.log({
    tenantId: testTenantId,
    action: 'UPDATE',
    resource: 'invoice',
    resourceId: 'INV-1001',
    before: { total: 5000, status: 'PENDING_APPROVAL' },
    after: { total: 5000, status: 'APPROVED' },
    userId: testUserId,
  });

  const proof4 = (log4.metadata)?.cryptographicProof;
  assert.equal(proof4.sequence, 4);
  assert.equal(proof4.previousHash, proof3.recordHash);
  console.log(`✔ Record 4 chained (Seq: 4, Prev: ${proof4.previousHash.slice(0, 10)}..., Hash: ${proof4.recordHash.slice(0, 16)}...)`);

  // Record 5
  const log5 = await auditService.log({
    tenantId: testTenantId,
    action: 'STATUS_CHANGE',
    resource: 'invoice',
    resourceId: 'INV-1001',
    before: { total: 5000, status: 'APPROVED' },
    after: { total: 5000, status: 'PAID' },
    userId: testUserId,
  });

  const proof5 = (log5.metadata)?.cryptographicProof;
  assert.equal(proof5.sequence, 5);
  assert.equal(proof5.previousHash, proof4.recordHash);
  console.log(`✔ Record 5 chained (Seq: 5, Prev: ${proof5.previousHash.slice(0, 10)}..., Hash: ${proof5.recordHash.slice(0, 16)}...)`);

  // 2. Verify Chain Integrity via Service
  console.log('2. Verifying full tenant hash chain integrity...');
  const verification = await auditService.verifyTenantChain(testTenantId);
  assert.equal(verification.valid, true);
  assert.equal(verification.totalRecords, 5);
  assert.equal(verification.verifiedCount, 5);
  assert.equal(verification.headHash, proof5.recordHash);
  console.log(`✔ Chain verification PASSED! Head Hash: ${verification.headHash}`);

  // 3. Simulate Database Tampering Detection
  console.log('3. Testing mathematical tamper-detection (Rogue DB modification simulation)...');
  const records = await prisma.auditLog.findMany({
    where: { tenantId: testTenantId },
    orderBy: { createdAt: 'asc' },
  });

  // Tamper with record 3 in-memory
  const tamperedRecords = records.map((r, idx) => {
    if (idx === 2) {
      return {
        ...r,
        after: { canApprove: false, tampered: true }, // Attacker tried to cover tracks
      };
    }
    return r;
  });

  const tamperResult = verifyAuditChain(tamperedRecords);
  assert.equal(tamperResult.valid, false);
  assert.equal(tamperResult.brokenIndex, 2);
  assert.ok(tamperResult.error.includes('Tampering detected'));
  console.log(`✔ Tampering successfully caught at record index 2! Error: ${tamperResult.error}`);

  // 4. Simulate Chain Deletion / Gap Detection
  console.log('4. Testing row-deletion detection (Rogue DB DELETE simulation)...');
  const missingRowRecords = [records[0], records[1], records[3], records[4]]; // Record 2 deleted
  const gapResult = verifyAuditChain(missingRowRecords);
  assert.equal(gapResult.valid, false);
  assert.ok(gapResult.error.includes('Sequence gap') || gapResult.error.includes('Hash chain ruptured'));
  console.log(`✔ Row deletion successfully caught! Error: ${gapResult.error}`);

  console.log(JSON.stringify({
    certification: 'CRYPTOGRAPHIC-CHAINED-AUDIT-LEDGER',
    status: 'passed',
    tenantId: testTenantId,
    recordsSealed: 5,
    finalHeadHash: verification.headHash,
    tamperDetection: 'active-and-verified',
    deletionDetection: 'active-and-verified',
  }, null, 2));

} finally {
  await prisma.$disconnect();
}
