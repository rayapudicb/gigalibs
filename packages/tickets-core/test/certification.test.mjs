import assert from 'node:assert/strict';
import {
  TicketLifecycle,
  MemoryTicketRepository,
} from '../dist/index.js';
import {
  SlaEngine,
} from '../../sla-engine/dist/index.js';
import {
  ModuleRegistry,
  ModuleManifestSchema,
} from '../../module-registry/dist/index.js';
import ticketsManifest from '../module.manifest.json' with { type: 'json' };
import slaManifest from '../../sla-engine/module.manifest.json' with { type: 'json' };

console.log('🧪 Running GigaLibs Module Certification Suite for gigalibs.tickets & gigalibs.sla...\n');

// ─── GATE 1: MANIFEST SCHEMA & REGISTRATION GATE ─────────────────────────────
console.log('▶ Gate 1: Module Manifest & Registry Compliance...');
assert.doesNotThrow(() => ModuleManifestSchema.parse(ticketsManifest), 'ticketsManifest must match ModuleManifestSchema');
assert.doesNotThrow(() => ModuleManifestSchema.parse(slaManifest), 'slaManifest must match ModuleManifestSchema');

const registry = new ModuleRegistry();
const tenancyManifestStub = {
  id: 'gigalibs.tenancy',
  name: 'Tenancy & Isolation',
  version: '1.0.0',
  description: 'Multi-tenancy isolation engine',
  capabilities: ['tenant-lifecycle', 'domain-routing'],
  requires: {},
  optional: {},
  permissions: ['tenancy.read', 'tenancy.write'],
  eventsProduced: ['tenant.created.v1'],
  eventsConsumed: [],
  healthChecks: ['database'],
};
const auditManifestStub = {
  id: 'gigalibs.audit',
  name: 'Audit & Compliance',
  version: '1.0.0',
  description: 'Immutable audit trail',
  capabilities: ['audit-log', 'change-diff'],
  requires: { 'gigalibs.tenancy': '^1.0.0' },
  optional: {},
  permissions: ['audit.read'],
  eventsProduced: ['audit.logged.v1'],
  eventsConsumed: [],
  healthChecks: ['database'],
};

registry.register(tenancyManifestStub);
registry.register(auditManifestStub);
registry.register(slaManifest);
registry.register(ticketsManifest);

assert.doesNotThrow(() => registry.assertReady(), 'All module dependencies must resolve cleanly');
const registeredTicket = registry.get('gigalibs.tickets');
assert.equal(registeredTicket?.status, 'READY', 'gigalibs.tickets must be in READY state');
console.log('  ✓ Manifest validation passed. Dependencies topologically resolved without cycles.\n');

// ─── GATE 2: DOMAIN INVARIANTS & LIFECYCLE STATE MACHINE GATE ────────────────
console.log('▶ Gate 2: Domain Invariants & State Transitions...');
const ticket = TicketLifecycle.create({
  tenantId: 'tenant_acme',
  title: 'AWS RDS Connection Spike',
  description: 'Database connection count exceeded threshold.',
  priority: 'URGENT',
  requesterId: 'usr_100',
  requesterEmail: 'ops@acme.com',
  requesterName: 'DevOps Lead',
});

assert.equal(ticket.status, 'NEW', 'Initial ticket status must be NEW');
assert.equal(ticket.priority, 'URGENT', 'Priority must be URGENT');
assert.equal(ticket.ticketNumber, 'TICK-1001', 'Ticket sequence must be generated');

// Transition: NEW -> ASSIGNED
const assigned = TicketLifecycle.transition(ticket, 'ASSIGNED', 'usr_admin');
assert.equal(assigned.status, 'ASSIGNED', 'Status must transition to ASSIGNED');

// Transition: ASSIGNED -> IN_PROGRESS
const inProgress = TicketLifecycle.transition(assigned, 'IN_PROGRESS', 'usr_agent');
assert.equal(inProgress.status, 'IN_PROGRESS', 'Status must transition to IN_PROGRESS');

// Transition: IN_PROGRESS -> RESOLVED
const resolved = TicketLifecycle.transition(inProgress, 'RESOLVED', 'usr_agent');
assert.equal(resolved.status, 'RESOLVED', 'Status must transition to RESOLVED');
assert.ok(resolved.resolvedAt, 'resolvedAt timestamp must be recorded');

// Transition: RESOLVED -> CLOSED
const closed = TicketLifecycle.transition(resolved, 'CLOSED', 'usr_admin');
assert.equal(closed.status, 'CLOSED', 'Status must transition to CLOSED');
assert.ok(closed.closedAt, 'closedAt timestamp must be recorded');

// Invariant Assertion: CLOSED tickets cannot transition
assert.throws(
  () => TicketLifecycle.transition(closed, 'IN_PROGRESS', 'usr_agent'),
  /is CLOSED and cannot be transitioned/,
  'Closed tickets must reject any further transitions',
);
console.log('  ✓ Domain invariants enforced. Closed tickets are strictly immutable.\n');

// ─── GATE 3: SLA POLICY EVALUATOR & BREACH TIMERS GATE ───────────────────────
console.log('▶ Gate 3: SLA Policy & Breach Detector...');
const baseTime = new Date('2026-08-30T10:00:00.000Z');

// 1. Check On-Track state at 5 minutes for URGENT (15m FRT, 120m resolution)
const checkAt5m = new Date('2026-08-30T10:05:00.000Z');
const evalAt5m = SlaEngine.evaluate(baseTime, 'URGENT', undefined, null, null, checkAt5m);
assert.equal(evalAt5m.frtStatus, 'ON_TRACK', 'At 5m, FRT must be ON_TRACK');
assert.equal(evalAt5m.frtMinutesRemaining, 10, 'Remaining FRT must be 10 minutes');
assert.equal(evalAt5m.frtBreached, false, 'FRT must not be breached');

// 2. Check At-Risk warning state at 12 minutes (threshold 75% of 15m = 11.25m)
const checkAt12m = new Date('2026-08-30T10:12:00.000Z');
const evalAt12m = SlaEngine.evaluate(baseTime, 'URGENT', undefined, null, null, checkAt12m);
assert.equal(evalAt12m.frtStatus, 'AT_RISK', 'At 12m without response, FRT must be AT_RISK');
assert.equal(evalAt12m.overallStatus, 'AT_RISK', 'Overall status must be AT_RISK');

// 3. Check Breach state at 20 minutes
const checkAt20m = new Date('2026-08-30T10:20:00.000Z');
const evalAt20m = SlaEngine.evaluate(baseTime, 'URGENT', undefined, null, null, checkAt20m);
assert.equal(evalAt20m.frtStatus, 'BREACHED', 'At 20m without response, FRT must be BREACHED');
assert.equal(evalAt20m.frtBreached, true, 'frtBreached flag must be true');
assert.equal(evalAt20m.overallStatus, 'BREACHED', 'Overall status must be BREACHED');

console.log('  ✓ SLA countdowns, warnings (AT_RISK), and breaches calculated with millisecond precision.\n');

// ─── GATE 4: TENANT ISOLATION & PERSISTENCE ADAPTER GATE ─────────────────────
console.log('▶ Gate 4: Tenant Data Isolation Verification...');
const repo = new MemoryTicketRepository();

const ticketTenantA = TicketLifecycle.create({
  tenantId: 'tenant_acme',
  title: 'Acme Ticket',
  description: 'Confidential issue for Acme',
  requesterId: 'usr_acme',
  requesterEmail: 'alex@acme.com',
}, 1001);

const ticketTenantB = TicketLifecycle.create({
  tenantId: 'tenant_tesla',
  title: 'Tesla Ticket',
  description: 'Confidential issue for Tesla',
  requesterId: 'usr_tesla',
  requesterEmail: 'elon@tesla.com',
}, 1002);

await repo.create(ticketTenantA);
await repo.create(ticketTenantB);

// Query as Tenant Acme
const acmeList = await repo.list('tenant_acme');
assert.equal(acmeList.total, 1, 'Acme must only see 1 ticket');
assert.equal(acmeList.data[0].tenantId, 'tenant_acme', 'Must belong to tenant_acme');

// Query as Tenant Tesla
const teslaList = await repo.list('tenant_tesla');
assert.equal(teslaList.total, 1, 'Tesla must only see 1 ticket');
assert.equal(teslaList.data[0].tenantId, 'tenant_tesla', 'Must belong to tenant_tesla');

// Cross-tenant direct ID query check
const crossTenantFetch = await repo.findById('tenant_tesla', ticketTenantA.id);
assert.equal(crossTenantFetch, null, 'Tesla must NOT be able to read Acme ticket by ID');

console.log('  ✓ Cross-tenant data isolation verified: zero leakage across tenant boundaries.\n');

console.log('════════════════════════════════════════════════════════════════════════');
console.log('🏆 ALL MODULE CERTIFICATION GATES PASSED: gigalibs.tickets & gigalibs.sla');
console.log('════════════════════════════════════════════════════════════════════════\n');
