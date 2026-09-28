# WI-OI-049 — TP-3 Transactional Event & Consumer Inbox Conformance

Status: Review
Gate: G4 Review; TP-3 Local Development implementation complete, ready for independent specialist review
Owner: Backend Domain / Integration & Event Systems / Solution Architecture
Requirements: FR-01, FR-05, FR-08, FR-14, FR-15, FR-16; NFR-GOV-001–003,
NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-002–003,
NFR-OBS-001–004, NFR-UX-001–002, NFR-OPS-001–004
Independent reviewers: Solution Architecture, Security & Privacy, IAM/Tenancy,
Infrastructure/SRE, API Contracts, QA/SDET, Product
Dependencies: WI-OI-046 TP-1 Review package, WI-OI-048 TP-2 Review package
Design specification: `docs/architecture/TP3_TRANSACTIONAL_INBOX_AND_EVENT_CONFORMANCE_DESIGN.md`

---

## 1. Single outcome

Conform the platform's configuration invalidation and downstream event consumers to the Delta-5
transactional inbox pattern (`platform_inbox_events`), guaranteeing at-least-once transport delivery is
converted into exactly-once side-effect execution through durable per-consumer-group deduplication,
CAS lease heartbeat reclamation, poison-pill dead-letter isolation, and quantitative reconciliation
under the `configuration-local-development-v1` deployment profile.

---

## 2. Baseline capabilities to preserve

| Existing capability | Evidence | Disposition |
|---|---|---|
| PostgreSQL `platform_outbox_events` | `packages/db/schema.prisma` (from TP-2) | Preserve as producer outbox |
| `OutboxRelayProcessor` | `apps/playground-api` | Route to inbox consumers |
| `ConfigurationInvalidationConsumer` | `apps/playground-api` | Refactor to consume via durable inbox |
| Cache invalidation pipeline | `ConfigurationManifestCache` | Bind eviction to inbox transaction |
| Redis / BullMQ transport | Docker compose stack | Preserve strictly as wake-up/transport mechanism |

---

## 3. Bounded scope

### 3.1 Durable transactional inbox table
- Add `platform_inbox_events` table under PostgreSQL with tenant RLS.
- Enforce unique constraint `(tenantId, consumerGroup, messageId)` for sliding-window deduplication.
- Track monotonic lifecycle: `RECEIVED` -> `PROCESSING` -> `PROCESSED` / `FAILED` / `DEAD_LETTER`.

### 3.2 Idempotent consumer execution
- Before executing message side effects, record incoming message in `platform_inbox_events`.
- Deduplicate replays: if message is already `PROCESSED`, immediately acknowledge without repeating side effects.
- Record processing timestamp, attempt count, and last error trace.

### 3.3 Lease management & dead-letter isolation
- CAS lease renewal with `heartbeatAt` for long-running batch handlers.
- Automatic reclamation of crashed consumer leases when `heartbeatAt < NOW() - 300s`.
- Exponential backoff retry with transition to `DEAD_LETTER` after 5 failed attempts.

### 3.4 Clean architecture & zero side effects
- Keep 7 protected CMMS file hashes untouched.
- Preserve all 9 repository and SDLC governance audits green.
- Confine runtime profile to `configuration-local-development-v1`.

---

## 4. Exit criteria for Gate G3

- Formal design specification completed and linked.
- Database schema migration planned additively.
- Verification plan defined with 6 core scenarios (TP3-INBX-01 through TP3-INBX-06).
- Independent specialist review package issued.

---

## 5. Gate G4 Implementation & Verification Evidence

| Evidence Item | Location / Command | Verification Outcome |
|---|---|---|
| Additive Migration | `packages/db/migrations/20260925000000_tp3_transactional_inbox_and_deduplication/migration.sql` | Applied cleanly; additive schema with RLS and indexes |
| Prisma Schema | `packages/db/schema.prisma` | Model `PlatformInboxEvent`, enum `PlatformInboxStatus` |
| Transactional Inbox Service | `apps/playground-api/src/transactional-inbox.service.ts` | Idempotent deduplication, CAS lease reclamation, dead-letter quarantine |
| Consumer Integration | `apps/playground-api/src/configuration-invalidation.consumer.ts` | Wires `TransactionalInboxService` preserving backwards compatibility |
| Module Provider Registration | `apps/playground-api/src/app.module.ts` | Registered provider verified via `verify-api-module-boundary.mjs` |
| Unit Test Suite | `apps/playground-api/src/transactional-inbox.spec.ts` | 9/9 passing tests (82/82 total suite passing) |
| Protected File Hash Verification | `shasum -a 256 ...` (7 CMMS files) | 100% byte-for-byte identical; 0 files modified |
| SDLC Governance Audit | `pnpm audit:sdlc` | Passed (19 agents, 49 work items, 0 violations) |
| Runtime Data & Package Audits | `pnpm audit:*` | All 6 audits pass cleanly |

