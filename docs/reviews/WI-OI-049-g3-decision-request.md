# WI-OI-049 Gate G3 Decision Request: TP-3 Transactional Inbox & Consumer Event Conformance

- **Work Item:** WI-OI-049
- **Deployment Profile:** `configuration-local-development-v1`
- **Request Date:** 2026-09-24
- **Owning Roles:** Solution Architecture, Backend Domain, Integration & Event Systems
- **Target Gate:** Gate G3 Architecture & Design Review

---

## 1. Context & Purpose

Following the delivery of **WI-OI-048 (TP-2)**, which established the platform's canonical transactional outbox (`platform_outbox_events`), this decision request formally submits the **TP-3** architecture and design specification ([`docs/architecture/TP3_TRANSACTIONAL_INBOX_AND_EVENT_CONFORMANCE_DESIGN.md`](file:///Users/rayapudi/dev/gigalibs/docs/architecture/TP3_TRANSACTIONAL_INBOX_AND_EVENT_CONFORMANCE_DESIGN.md)) for independent specialist evaluation.

TP-3 establishes the complementary **transactional inbox engine** (`platform_inbox_events`) to guarantee that asynchronous platform messages (such as `tenant.profile.extensions.updated.v1` and configuration manifest activations) are consumed with deterministic, exactly-once side-effect idempotency, automated crash lease reclamation, and poison-pill dead-letter quarantine.

---

## 2. Design Summary & Architecture Alignment

1. **Transactional Ingestion (`platform_inbox_events`)**:
   - New additive table with tenant RLS and unique constraint `(tenantId, consumerGroup, messageId)`.
   - Monotonic state tracking: `RECEIVED` -> `PROCESSING` -> `PROCESSED` / `FAILED` / `DEAD_LETTER`.
2. **Idempotent Consumer Deduplication**:
   - Deduplication sliding window ensures retransmitted or replayed messages produce zero redundant side effects.
3. **Cooperative Lease Heartbeats & CAS Stale Recovery**:
   - Consumer leases timeout at 300s, enabling active secondary workers to re-claim stalled events via Compare-And-Swap without double-execution.
4. **Poison-Pill Isolation**:
   - Fatal serialization or consumer crashes are quarantined to `DEAD_LETTER` after 5 exponential backoff attempts without blocking subsequent tenant events.
5. **Cache Eviction Synchrony**:
   - `ConfigurationInvalidationConsumer` evicts cached manifest entries only after atomically confirming the durable inbox state.

---

## 3. Independent Specialist Review Request

The following named independent reviewers are requested to review and record their determinations:

1. **Solution Architecture**: Review data flow, state machine transitions, and absence of dual-write race conditions.
2. **Security & Privacy**: Review tenant isolation under RLS, absence of plaintext credentials in payloads, and audit traceability.
3. **IAM & Tenancy**: Verify tenant-scoped consumer authorization and isolation.
4. **Infrastructure / SRE**: Verify PostgreSQL connection efficiency, index coverage, and dead-letter monitoring.
5. **API Contracts**: Verify event payload envelope compatibility.
6. **QA / SDET**: Verify coverage of all 6 test scenarios (TP3-INBX-01 through TP3-INBX-06).
7. **Product Acceptance**: Confirm functional alignment with tenant profile configuration extension milestones.
