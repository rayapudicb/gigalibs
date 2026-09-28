# ADR-0005: Delta 5 foundation convergence

- Status: Proposed; independent acceptance required before G4
- Date: 2026-09-22
- Work item: WI-OI-044
- Owner: Solution Architecture
- Reviewers required: Security & Privacy, Backend/Data, IAM/Tenancy, Data Portability,
  Infrastructure/SRE, API Contracts, QA/SDET, Product

## Context

GigaLibs already has useful but uneven foundation implementations:

- `@gigalibs/configuration-core`, `@gigalibs/configuration-react`, configuration contracts and
  PostgreSQL persistence;
- `@gigalibs/queue` backed by BullMQ/Redis plus module-specific workers;
- an in-process `@gigalibs/event-bus` and several unrelated transactional outboxes;
- `TenantIsolationBinding`, signed `PlatformContextV1`, tenant-aware repositories and module-local database
  adapters;
- `@gigalibs/audit-core`, `@gigalibs/audit-nest` and many direct transaction-coupled audit writes; and
- `@gigalibs/storage-core` plus module-specific artifact stores.

These components are not one certified platform contract. Important current gaps include:

- generic queue DTOs containing destinations, webhook secrets, attachments or source mappings rather than
  minimum references;
- Redis/BullMQ state being easier to observe than an authoritative durable job lifecycle;
- the event bus being explicitly process-local and unable to provide durable cross-instance delivery;
- different outbox envelopes, consumer deduplication and reconciliation behavior;
- a tenant isolation binding that records desired/effective mode but not the complete runtime routing,
  migration, pool and rotation contract;
- storage contracts without mandatory tenant, classification, checksum, expiry or scan state;
- audit hash creation using a non-transactional read-last/insert sequence that can fork under concurrency;
- chain verification treating a set with no cryptographic proofs as valid; and
- HTTP decorators/services being unable to prove mutations made by workers, consumers or internal calls.

Creating a second metadata runtime, queue framework, event platform, tenancy service or audit service would
increase these inconsistencies. The required change is controlled convergence.

## Decision

### 1. One shared context, local authority

`PlatformContextV1` remains the canonical signed synchronous identity/tenant/entitlement context. No second
tenant token is introduced.

Async work stores a minimal `AsyncAuthorityRefV1` containing identifiers, requested capability and
authorization-version references. Workers and consumers resolve current tenant status, entitlement,
identity, scopes and database binding before a material effect. Serialized roles or scopes are evidence of
request time, not permanent authority.

Each module retains ownership of business records, invariants, repositories, transaction boundaries,
migrations and domain authorization. Shared packages provide contracts and mechanisms only.

### 2. Governed metadata extends ADR-0002

ADR-0002 and the existing configuration packages remain canonical. Delta 5 adds a versioned module-adapter
contract; it does not add a parallel metadata engine or generic business-record database.

Each adapter allowlists entities, fields, operations, permissions, storage, query operators, limits,
snapshots, emitted events and accepted jobs. Safe filter AST compilation occurs inside the owning adapter
against parameterized repositories. Indexes and value migrations remain module-owned forward migrations.

### 3. PostgreSQL is authoritative for jobs; BullMQ is transport

Every material asynchronous operation has a durable module-owned or approved job-control record before
enqueue. The record owns state, attempts, idempotency, progress, checkpoint, cancellation, artifact
references and terminal error classification.

BullMQ remains the first supported Node transport. Existing Celery work is not automatically rewritten; it
must implement the same durable control contract or use an accepted bridge. Queue messages carry job and
context references, never raw credentials or unrestricted source data.

Delivery is at least once. Exactly-one business effect comes from uniqueness, idempotent module commands,
transaction boundaries, durable receipts and reconciliation.

### 4. Module-owned outbox/inbox; transport is replaceable

Business state, authoritative audit and an outbox row commit in the owning module's local transaction.
There is no central cross-database outbox table.

The first Node reference slice uses the existing Redis/BullMQ capability through consumer-specific queues
behind a transport interface. The durable outbox and consumer inbox/receipt remain authoritative. A future
broker requires a separate ADR and compatibility evidence; domain contracts do not expose the vendor.

`@gigalibs/event-bus` remains valid only for same-process, post-commit reactions where loss on process exit
is explicitly acceptable. It is not the durable integration event path. PostgreSQL `NOTIFY` may wake a
relay or invalidate a cache, but consumers recover from durable rows.

### 5. Extend the existing tenant binding authority

`TenantIsolationBinding` remains the control-plane root for tenant isolation desired/effective state.
Runtime routing is extended through versioned binding details rather than a parallel tenant database
registry. The binding contains only approved topology identifiers and secret references.

Repositories obtain connections through a tenant/deployment resolver and workload policy. Transaction-local
tenant context is set and cleared inside every transaction. Runtime, worker, relay, listener, migration and
administrative traffic have explicit routes and aggregate connection budgets.

PgBouncer is deployment-profile infrastructure, not a universal application assumption. Transaction
pooling, prepared statements, session state, listeners, failover and driver versions require profile-specific
certification. `LISTEN` consumers use a session-capable route.

### 6. Module-owned audit source; shared evidence contract

Authoritative audit records are written in the same module transaction as material state changes. Shared
audit packages own the envelope, schema-aware redaction, canonical hashing and verification helpers.
Interceptors/decorators may capture request metadata but are never the only audit path.

The existing control-plane audit hash algorithm is not certified for concurrent writes. The audit Build
slice must introduce transaction-safe sequence allocation, a uniqueness invariant, explicit chain scope,
and fail-closed verification that distinguishes `UNSEALED`, `VALID`, `INVALID` and `INCOMPLETE`.

A module audit outbox exports minimal records to a searchable projection/archive. Projection loss does not
destroy authoritative evidence and is repairable from checkpoints.

### 7. Artifact references, not payload blobs

Job/event/audit payloads refer to tenant-bound objects through an approved storage contract. The contract
requires tenant/deployment, classification, checksum, byte count, media type, scan state, retention/expiry,
encryption/key reference and immutable object identifier. Download grants are short-lived, actor-authorized
and audited. Public objects are prohibited for customer data unless a separate accepted requirement exists.

### 8. No new standalone foundation services in the first slice

The first adopter implements the contracts through existing packages and module-owned persistence. A new
service is allowed only if an ADR demonstrates independent scaling/availability/security ownership that
cannot be met safely in the existing topology. Shared code is called a platform standard only after two
independent adopters and G7 observation.

## Ownership

| Concern | Authority |
| --- | --- |
| Work items, WIP and gates | `agile_delivery_orchestrator` |
| Cross-foundation architecture | `solution_architecture` |
| Contract schemas and compatibility | `api_contracts` with owning domain |
| Business transaction/job/event/audit integration | `backend_domain` |
| Identity, scopes, tenant enforcement and secret references | `tenant_identity_access` |
| Classification, import/export, retention, hold and offboarding | `data_portability` |
| Queue/transport/pool/storage topology, telemetry and runbooks | `infrastructure_observability` |
| Independent acceptance evidence | `qa_spec` |
| Product, risk and release decisions | named humans |

The dormant `tenant_config` role does not own a generic metadata platform.

## Compatibility and migration

- Contracts begin at version 1 and use additive evolution within a compatibility window.
- Breaking job/event/adapter/audit changes use a new schema version with dual-read/write only when an
  accepted migration plan requires it.
- Schema work follows expand → backfill/reconcile → verify → activate → contract.
- Existing workers/outboxes/audits migrate one selected path at a time; package symmetry is not a reason to
  migrate.
- Redis loss, transport loss, projection loss and notification loss recover from PostgreSQL records.
- A tenant binding move uses provision → verify → drain → switch → reconcile → retire states.
- Existing CMMS import/export C4 files frozen in WI-OI-044 are not an adopter or migration target.

## Rejected alternatives

- A new universal metadata/runtime service.
- A generic CRUD or SQL gateway into module schemas.
- Redis, queue state, `NOTIFY`, process memory or browser state as business truth.
- Exactly-once transport claims.
- One central outbox written by multiple service databases.
- A single audit interceptor or fire-and-forget audit write.
- Credentials or full customer records in queue/event/audit payloads.
- Automatic rewrite of Celery or every legacy worker/event path.
- One giant Delta 5 Build item.

## Consequences

The design requires more explicit module integration and reconciliation than a generic platform service,
but preserves domain integrity, deployment independence and tenant isolation. The first release will expose
fewer configurable operations while providing truthful durability and evidence. Legacy convenience DTOs and
audit APIs remain supported only until their owning work item supplies a compatibility migration.

## Acceptance conditions

This ADR may move to Accepted only when:

- the contracts and acceptance plan linked from WI-OI-044 are independently reviewed;
- the first low-risk adopter and measurable outcome are named;
- deployment-profile transport/pool/storage support is explicit;
- audit concurrency/integrity and asynchronous reauthorization designs have no unresolved critical risk;
- migration/recovery and representative-volume test methods are approved; and
- named human Architecture, Security, Product and applicable Data/Operations authorities record decisions.

Agent completion of documents or tests cannot accept this ADR.

## References

- `docs/architecture/ADR-0001-operational-intelligence-service-ownership.md`
- `docs/architecture/ADR-0002-governed-metadata-configuration.md`
- `docs/plans/delta-5-platform-foundations-north-star-implementation-plan.md`
- `.pi/work/WI-OI-044.md`
- BullMQ idempotent jobs: <https://docs.bullmq.io/patterns/idempotent-jobs>
- PostgreSQL `NOTIFY`: <https://www.postgresql.org/docs/16/sql-notify.html>
- PgBouncer feature compatibility: <https://www.pgbouncer.org/features.html>
