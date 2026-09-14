import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  GovernorService,
  GovernorQueryLimitExceededError,
  GovernorTimeoutExceededError,
} from '../apps/playground-api/dist/governor.service.js';
import { nextGovernorStore } from '../apps/workflow-platform/lib/governor.ts';

console.log('--- Commencing Multi-Tenant Governor Limits & Noisy-Neighbor Throttling Verification ---');

const governorService = new GovernorService();

// 1. Quota & Tier Resolution
console.log('1. Testing Quota and Tier Resolution...');
const tenantFree = `tenant-free-${randomBytes(4).toString('hex')}`;
const tenantEnterprise = `tenant-ent-${randomBytes(4).toString('hex')}`;

governorService.setTenantTier(tenantFree, 'FREE');
governorService.setTenantTier(tenantEnterprise, 'ENTERPRISE');

const freeQuota = governorService.getQuotaStatus(tenantFree);
assert.equal(freeQuota.tier, 'FREE');
assert.equal(freeQuota.config.requestsPerMinute, 60);
assert.equal(freeQuota.config.burstCapacity, 20);
assert.equal(freeQuota.config.maxDbQueriesPerRequest, 50);

const entQuota = governorService.getQuotaStatus(tenantEnterprise);
assert.equal(entQuota.tier, 'ENTERPRISE');
assert.equal(entQuota.config.requestsPerMinute, 6000);
assert.equal(entQuota.config.burstCapacity, 1000);
assert.equal(entQuota.config.maxDbQueriesPerRequest, 2000);
console.log('✔ Multi-tier configurations correctly established.');

// 2. Token-Bucket Rate Consumption & Burst Throttling
console.log('2. Testing Noisy-Neighbor Throttling under Burst Traffic (Capacity: 20)...');
let lastDecision;
for (let i = 1; i <= 20; i++) {
  lastDecision = governorService.consumeRequest(tenantFree);
  assert.equal(lastDecision.allowed, true, `Request ${i} should be allowed`);
  assert.equal(lastDecision.remaining, 20 - i);
}
console.log(`✔ First 20 requests consumed tokens cleanly. Remaining: ${lastDecision.remaining}`);

// Request 21 must be throttled (HTTP 429)
const throttledDecision = governorService.consumeRequest(tenantFree);
assert.equal(throttledDecision.allowed, false);
assert.equal(throttledDecision.remaining, 0);
assert.ok(throttledDecision.retryAfterSeconds >= 1, 'Retry-After must be >= 1s');
console.log(`✔ Request 21 strictly throttled! Retry-After: ${throttledDecision.retryAfterSeconds}s`);

// 3. Multi-Tenant Noisy-Neighbor Isolation
console.log('3. Testing Multi-Tenant Isolation (Throttled Tenant A must NOT affect Tenant B)...');
const entDecision = governorService.consumeRequest(tenantEnterprise);
assert.equal(entDecision.allowed, true);
assert.equal(entDecision.tier, 'ENTERPRISE');
assert.ok(entDecision.remaining >= 999);
console.log(`✔ Isolated Tenant B unaffected by noisy Neighbor A (Remaining: ${entDecision.remaining})`);

// 4. Execution Budget: Database Query Limiting
console.log('4. Testing Database Query Budget (Runaway N+1 Join / Loop Prevention)...');
const budget = governorService.createExecutionBudget(tenantFree, 'FREE'); // limit is 50 queries

// Record 50 queries (allowed)
for (let q = 1; q <= 50; q++) {
  const count = budget.recordQuery(`SELECT * FROM documents WHERE id = ${q}`);
  assert.equal(count, q);
}
console.log('✔ 50 database queries executed within Free-tier budget.');

// 51st query must throw GovernorQueryLimitExceededError
let queryErrorThrown = false;
try {
  budget.recordQuery('SELECT * FROM documents WHERE id = 51');
} catch (err) {
  if (err instanceof GovernorQueryLimitExceededError) {
    queryErrorThrown = true;
    assert.equal(err.statusCode, 429);
    assert.equal(err.code, 'GOVERNOR_QUERY_LIMIT_EXCEEDED');
    assert.equal(err.queryCount, 51);
    assert.equal(err.maxAllowed, 50);
    console.log(`✔ Runaway query attack intercepted! Error: ${err.message}`);
  }
}
assert.ok(queryErrorThrown, 'Expected GovernorQueryLimitExceededError on 51st query');

// 5. Next.js Execution Plane Governor Parity
console.log('5. Testing Next.js Execution Plane Store Parity...');
const nextTenant = `next-tenant-${randomBytes(4).toString('hex')}`;
nextGovernorStore.setTenantTier(nextTenant, 'STANDARD');
const nextDec = nextGovernorStore.consume(nextTenant);
assert.equal(nextDec.allowed, true);
assert.equal(nextDec.tier, 'STANDARD');
assert.equal(nextDec.limit, 300);
console.log(`✔ Next.js execution plane governor parity certified (Tier: ${nextDec.tier}, Limit: ${nextDec.limit} rpm)`);

console.log(JSON.stringify({
  certification: 'MULTI-TENANT-GOVERNOR-LIMITS',
  status: 'passed',
  burstProtection: 'verified',
  noisyNeighborIsolation: 'verified',
  queryBudgetEnforcement: 'verified',
  nextParity: 'verified',
}, null, 2));
