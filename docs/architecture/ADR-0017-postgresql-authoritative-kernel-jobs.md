# ADR-0017: PostgreSQL-authoritative kernel jobs with optional BullMQ dispatch

- **Status:** Accepted for the bounded local-development implementation; production acceptance is pending.
- **Date:** 2026-09-30.
- **Work item:** WI-OI-104b.
- **Builds on:** ADR-0005 §3, ADR-0016 F14 and `.pi/tasks/FOUNDATION-CLOSE.md`.

## Context

Connector pulls, Analytics summary builds and report schedules need one durable lifecycle. BullMQ is useful for
low-latency dispatch, but Redis cannot be the only record of an accepted operation. Module-specific queues and an
in-memory scheduler would duplicate retry, tenancy, cancellation and audit behavior.

## Decision

`@gigalibs/jobs` is the kernel interface for defining, scheduling, enqueueing and running asynchronous work.

- PostgreSQL owns every accepted job, its versioned definition reference, tenant, initiating subject and authority
  version, correlation and idempotency keys, attempts, lease, retry/dead-letter state, bounded result summary and
  append-only lifecycle audit.
- A definition chooses `POSTGRES` polling or `BULLMQ` dispatch. Both use the same PostgreSQL record and state
  machine. Redis carries only the durable job ID and is never recovery truth.
- PostgreSQL workers claim ready rows with `FOR UPDATE SKIP LOCKED`. A lease and heartbeat make abandoned work
  recoverable. Execution is at least once; business handlers must be idempotent.
- Tenant-facing reads, enqueue and cancellation must successfully assume `gigalibs_jobs_tenant` and set
  transaction-local `app.tenant_id`. Cross-tenant worker methods must successfully assume
  `gigalibs_jobs_worker`; missing membership fails closed in both cases.
- Idempotency is unique per tenant, job type and key. Reuse with a different payload, version, backend, owner,
  authority version or execution time is a conflict.
- Payloads and results are size-bounded JSON. Payloads contain identifiers and secret references, never plaintext
  credentials. Errors are bounded and do not include payloads.
- Job definitions are code-owned and versioned. Unknown versions are rejected instead of silently using current
  behavior. Timeouts expose an abort signal; handlers must propagate it to external clients.

## State machine

`QUEUED → RUNNING → SUCCEEDED` is the success path. A retryable failure or expired lease moves to `RETRY_WAIT`,
then returns to `RUNNING` with bounded exponential backoff. Exhausted or explicitly non-retryable work moves to
`DEAD_LETTER`. Pending work may move to `CANCELLED`. Every transition and BullMQ dispatch outcome is recorded in
the same PostgreSQL transaction as its durable state change.

## Consequences

- Redis loss can delay work but cannot erase an accepted job; a dispatcher republishes pending IDs and stale
  dispatched IDs. Store claims still prevent duplicate delivery from becoming concurrent execution.
- BullMQ completion alone never proves the business effect. The PostgreSQL terminal state and the owning module's
  idempotent receipt remain authoritative.
- WI-OI-104c adds durable schedules and re-resolves the schedule owner's current rights before dispatch. This ADR
  does not grant stored permissions or establish cohort membership.
- Existing queue and scheduler packages are not deleted in this slice. Consumers move through explicit later
  slices, after which unused copies can be retired under the package inventory.
- Cloud topology, operational credentials, capacity limits and production release require profile-specific
  Infrastructure/SRE, Security and QA evidence.
