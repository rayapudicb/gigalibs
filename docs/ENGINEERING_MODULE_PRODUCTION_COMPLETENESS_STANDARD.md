# Engineering Module Production Completeness Standard

**Status:** Adopted engineering strategy gate  
**Effective date:** 1 September 2026  
**Source:** Incorporated from the user-supplied `Engineering_Module_Production_Completeness_Prompt.md`  
**Applies to:** Every GigaLibs module, adapter, solution pack, application, and release profile

> This document is a quality and evidence standard. It defines the work required when an implementation task is authorized; it does not by itself authorize code, infrastructure, deployment, credential, or external-system changes.

## 1. Delivery lifecycle

The mandatory delivery lifecycle is:

```text
Intake
  → Ready
  → Architecture & Security
  → Build
  → Module Production Completeness
  → Verify/UAT
  → Release
```

The **Module Production Completeness** gate proves that a module is a real, connected, persistent, secure, configurable, operable, and testable capability. A rendered UI, HTTP 200 response, passing unit test, successful toast, or module manifest is not sufficient evidence.

## 2. Governing principles

1. Inspect the actual repository and runtime; do not infer completion from names, screenshots, comments, manifests, or demo behavior.
2. Treat every user action and sub-flow as auditable: create, view, edit, archive/delete, approve/reject, assign, search, filter, sort, paginate, import, export, upload, download, retry, cancel, notify, audit, and permission denial.
3. Trace the full vertical slice from business outcome to persisted and observable result.
4. Never replace a failed dependency with silent mock data or fake success.
5. Keep test fixtures and sandbox behavior isolated so they cannot be enabled in production.
6. Do not create parallel APIs, tables, or modules merely to avoid completing the intended design.
7. Preserve working behavior and unrelated changes.
8. Do not claim Done, Certified, compliant, live, real-time, or production-ready without versioned evidence.
9. Do not release while any P0 or P1 completeness gap remains open.
10. Every deferred item requires impact, owner, target release, dependency, containment, and approval.

## 3. Scope discovery

The module inventory must be derived and reconciled from:

- requirements, BRDs, FSDs, user journeys, acceptance criteria, and approved decisions;
- navigation, routes, pages, tabs, forms, modals, buttons, tables, filters, exports, and settings;
- frontend components, hooks, stores, clients, feature flags, and permission checks;
- backend routes, controllers, services, repositories, workers, schedulers, and adapters;
- API, event, WebSocket/SSE, queue, and webhook contracts;
- database models, migrations, constraints, indexes, seeds, and fixtures;
- infrastructure, secrets, environment configuration, deployment artifacts, monitoring, and runbooks; and
- module manifests, dependency declarations, package metadata, and release artifacts.

Document mismatches between product documentation, navigation, code, runtime, schema, and release configuration. Never silently select the most favorable source.

## 4. Required end-to-end trace

Every action must be traced across this chain:

```text
Business outcome
  → user and role
  → UI control
  → frontend handler and state
  → API request
  → authentication
  → RBAC/object authorization
  → tenant isolation
  → validation
  → controller
  → service/domain rule
  → database transaction
  → tables/constraints/indexes
  → event/job/webhook
  → consumer/recipient
  → response
  → UI refresh or real-time update
  → audit record
  → logs/metrics/traces/alerts
```

Each link receives one status:

- **Runtime verified**
- **Implemented but incomplete**
- **Present but disconnected**
- **Mock/demo/stub only**
- **Missing**
- **Blocked by external dependency**
- **Not applicable**, with a reason

## 5. Anti-demo enforcement

Search all production execution paths for:

- mock, dummy, fake, sample, fixture, static, stub, placeholder, prototype, TODO, FIXME, temporary, and demo behavior;
- hard-coded tenants, users, roles, permissions, dates, totals, statuses, tokens, URLs, counters, chart values, and API responses;
- static arrays or JSON replacing repositories and APIs;
- local or session storage acting as the system of record;
- in-memory stores that lose state after restart;
- artificial timers, random success, simulated progress, and `Promise.resolve` substitutes;
- controls with no handler, empty/console-only handlers, and dead routes;
- success displayed before confirmed commit;
- catch blocks returning sample data, tokens, or success;
- development flags bypassing authentication, authorization, billing, validation, audit, persistence, or integration;
- fake upload, export, notification, webhook, email, payment, signature, workflow, or background-job behavior; and
- backend methods returning constants, placeholder IDs, empty collections, or unimplemented responses.

Every finding must be classified as:

- test-only and safely isolated;
- development-only and impossible to enable in production; or
- production-reachable and prohibited.

Production code must fail explicitly and observably when a required dependency fails. Silent fallback to demo behavior is a release blocker.

## 6. API completeness controls

For every server-side action, verify:

- the intended API exists and the frontend calls it;
- method, path, version, request schema, response schema, status code, and error model match;
- authentication, RBAC, object authorization, and tenant scope are enforced server-side;
- validation and business invariants execute server-side;
- CRUD or domain-command coverage is complete;
- pagination, filtering, sorting, search, bulk limits, and export limits are bounded;
- retryable creates and commands are idempotent;
- concurrent updates use versions, locks, or conflict responses;
- external calls have timeouts, retry policy, circuit behavior, and deliberate error mapping;
- published OpenAPI and generated clients match runtime;
- no orphan, duplicated, shadow, or unused route remains; and
- negative cases fail deliberately without data leakage.

## 7. Database and migration controls

Compare requirements, UI fields, API contracts, domain models, repository queries, event payloads, schema, and migration history. Verify:

- required tables, relationships, junctions, columns, enums, and ownership fields exist;
- types, precision, time zones, length, nullability, and defaults are correct;
- primary, foreign, unique, check, and tenant-safe composite constraints exist;
- status, version, idempotency, audit, correlation, actor, timestamp, and archive fields are justified and present;
- indexes support tenant filters, joins, searches, ordering, and uniqueness;
- local, test, UAT, and production schema definitions do not drift;
- migrations are ordered, forward-safe, repeatable where required, and verified against realistic data;
- backfills and compatibility windows are defined;
- destructive changes have approved compatibility and forward-fix/rollback plans; and
- queries are protected from races, duplicates, N+1 behavior, unbounded reads, and cross-tenant access.

Never modify an already deployed migration in place. Do not add generic fields without a traced requirement.

## 8. Transaction and real-time controls

### 8.1 Database and business transactions

- define the atomic boundary for every multi-step write;
- roll back partial failure;
- prevent duplicate submission with idempotency keys or domain uniqueness;
- handle concurrent writes with versioning or locking;
- keep totals, balances, and states consistent;
- emit external side effects only after commit;
- use a transactional outbox or equivalent for reliable publication; and
- provide retry, deduplication, DLQ, poison-message handling, compensation, and replay safety.

### 8.2 Real-time user and system updates

- prove WebSocket, SSE, polling, queue, and webhook paths are real and connected;
- define event name, version, producer, consumer, tenant scope, authorization, correlation, and ordering;
- publish only committed and authorized state;
- support reconnect, resubscribe, heartbeat, missed-event recovery, deduplication, and out-of-order handling;
- provide an authoritative API resync path;
- test multiple tenants, users, devices, and sessions; and
- measure delivery latency and failure.

Timers and local state are not real-time infrastructure.

## 9. Production-grade vertical-slice procedure

For each authorized module implementation:

1. Confirm business outcome, roles, rules, contracts, and acceptance criteria.
2. Add safe migrations, constraints, indexes, and backfills.
3. Implement domain rules, authorization, tenant guards, repositories, and transactions.
4. Implement APIs, jobs, events, webhooks, and adapters.
5. Connect every UI action to confirmed backend behavior.
6. remove production-reachable mocks, fallbacks, placeholders, and hard-coded business data.
7. Implement loading, empty, validation, conflict, denied, dependency-failure, retry, and recovery states.
8. Add correlation-aware logs, metrics, traces, audit records, and alertable failures.
9. Add unit, contract, integration, migration, authorization, tenant-isolation, concurrency, retry, event, accessibility, performance, and E2E tests as applicable.
10. Run against real supported infrastructure and prove persistence across refresh and restart.

## 10. Mandatory evidence deliverables

Every completeness review must maintain these linked deliverables:

### A. Executive gap summary

Total audited modules and counts by status, highest risks, and release recommendation.

### B. Module Production Completeness Matrix

For every module/submodule: outcome, role, action, frontend entry, API, service, schema, transaction, event/real-time path, authorization, validation/retry, mock finding, tests, telemetry/audit, status, impact, owner, priority, dependency, target release, and next action.

### C. API Gap Register

Missing, mismatched, unused, duplicated, disconnected, unsecured, non-idempotent, and incomplete APIs, with exact callers and corrections.

### D. Database Schema Gap Register

Missing or incorrect tables, columns, relations, constraints, indexes, migrations, and backfills, including compatibility and verification.

### E. Mock/Demo/Stub Inventory

Every finding with location, runtime reachability, impact, permitted/prohibited classification, and replacement action.

### F. Transaction and Real-Time Matrix

Atomic boundary, idempotency/concurrency, producer, broker/channel, consumer, delivery guarantee, retries/DLQ/replay, UI resync, tenant authorization, and evidence.

### G. Implementation and Verification Record

Changed files, migration IDs, contract changes, tests, executed commands, results, screenshots/logs where useful, residual risk, and requirement/release traceability.

### H. Prioritized Remediation Backlog

- **P0:** security/tenant leakage, data loss/corruption, unsafe migration, critical financial/transaction failure, fake success, or release blocker;
- **P1:** broken critical journey, missing API/persistence, production-reachable mock, unreliable transaction/event, or required-role failure;
- **P2:** incomplete secondary path, resilience, observability, scale, accessibility, or significant error-handling gap;
- **P3:** low-risk polish or maintainability improvement.

## 11. Definition of Done

A module is Done only when every applicable condition is evidenced:

- all user actions are connected end to end;
- real data survives refresh, retry, concurrency, and service restart;
- schema, constraints, indexes, migrations, and target environment match;
- APIs and events match consumers;
- positive and negative auth, RBAC, object, and tenant-isolation tests pass;
- multi-step writes are atomic and retry-safe;
- real-time updates originate from committed server state and recover after disconnect;
- production-reachable mock, fake, stub, hard-coded business data, and silent fallback inventory is zero;
- failure, timeout, empty, offline, retry, and recovery paths work;
- audit and telemetry identify actor, tenant, action, outcome, and correlation;
- automated tests and runtime evidence support the claim; and
- requirement, code, migration, test, ticket, evidence, and release are traceable.

Coverage percentages, HTTP 200 responses, screenshots, and demos are supporting evidence only.

## 12. CI/CD enforcement

The build or release must fail when applicable if:

- production bundles import fixtures, demo repositories, mock services, or test data;
- hard-coded identities, secrets, fake success, or insecure bypasses are introduced;
- API implementation and published contracts drift;
- database models and migrations drift;
- migration-forward, compatibility, or backfill validation fails;
- integration tests do not use supported real database/queue equivalents;
- authorization, isolation, negative, retry, concurrency, event, migration, accessibility, or performance tests fail;
- tests are skipped or ignored without an owned exception;
- production TODOs lack an owner, impact, ticket, and expiry;
- required audit, telemetry, SBOM, vulnerability, provenance, or release evidence is absent; or
- any P0/P1 item remains open.

## 13. Gate entry and exit controls

### Definition of Ready

- Every action maps to API, data, event/job, permission, and acceptance contracts.
- Schema, migration, backfill, index, and compatibility risks are reviewed.
- Transaction, idempotency, concurrency, retry, and recovery rules are defined.
- Any sandbox behavior is isolated from production by design.

### Build gate

- No feature is implemented with production-reachable mock data, fake success, local-only persistence, or placeholder integration.
- UI, API, service, database, event/job, audit, and telemetry form one vertical slice.
- Schema changes use reviewed migrations.
- Security is server-side; hiding UI controls is not authorization.

### Module Production Completeness exit

- Completeness matrix has no unexplained or unowned link.
- API and schema registers reconcile with code.
- Production-reachable mock/demo/stub inventory is zero.
- transaction, concurrency, retry, and recovery tests pass.
- data remains correct after refresh, restart, retry, and concurrent execution.
- evidence is attached to the canonical engineering tracker.

### Verify/UAT

- Every applicable role and critical action is exercised.
- Negative, denied, isolation, validation, dependency-failure, retry, reconnect, and recovery cases are covered.
- UAT uses deployed services and real schema with no silent fallback.

### Release

- Artifact and target schema/migration state match.
- API/event contracts match deployed consumers.
- No P0/P1, fake-success path, production mock, or unapproved exception remains.
- forward-fix/rollback, backfill validation, monitoring, alerting, and runbooks are ready.

## 14. Ownership and cadence

- **Driver:** module engineer
- **Approver:** engineering manager or architecture owner
- **Contributors:** frontend, backend, database, QA, security, and infrastructure/SRE owners
- **Informed:** product/business stakeholders and release owner

Review the matrix during daily delivery tracking and formally during the weekly engineering-strategy review. The canonical tracker—not chat, screenshots, or verbal status—is the source of truth.

## 15. Release decision

Every review ends with one decision:

- **Go:** all applicable gates pass and no P0/P1 remains;
- **Conditional Go:** only explicitly approved, contained, time-bounded lower-risk gaps remain; or
- **No-Go:** any P0/P1, production-reachable fake behavior, security/isolation failure, schema mismatch, critical transaction gap, or missing evidence remains.
