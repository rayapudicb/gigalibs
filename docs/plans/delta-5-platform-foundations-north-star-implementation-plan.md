# Delta 5 North Star — production implementation plan

Status: architecture and delivery candidate; not Build authorization  
Scope: shared platform foundations for tenant-safe module extensibility and operations  
Primary architecture owner: `solution_architecture`  
Delivery/governance owner: `agile_delivery_orchestrator`  
Product acceptance: named human Product Owner  
Release authority: named human release authority  
Last reviewed: 2026-09-22

## 0. Executive decision

GigaLibs should implement five reinforcing platform deltas:

1. governed metadata and module adapters;
2. durable asynchronous jobs;
3. transactional domain events;
4. tenant-aware database and connection governance; and
5. transactional audit evidence.

These five foundations are the North Star because together they let an entitled tenant extend a module,
run long-lived work, integrate through reliable events, preserve isolation under load, and prove every
material change.

They are **not five new products, five new microservices, or one giant shared runtime**. The repository
already contains important parts of every foundation. The implementation strategy is to converge those
parts behind authoritative contracts, close their operational gaps, and prove them through one bounded
module adoption at a time.

This document is deliberately strict:

- It does not authorize product code by itself.
- It does not assign a new `WI-OI-NNN`; the SDLC Orchestrator must allocate and reconcile work items.
- It does not repurpose Analytics work items for CMMS, metadata, queue, audit, or connection work.
- It does not declare existing code production-ready merely because it compiles or has unit tests.
- It does not promise exactly-once delivery, universal SQL, arbitrary tenant code, or automatic safe
  indexing.
- It does not replace the Analytics and Reports product plan. It supplies foundations that Analytics,
  Reports, Workflows, Connectors, and domain modules may use through explicit contracts.

## 1. North-star outcome

For any entitled tenant, an authorized administrator can configure supported module extensions without
changing source code. An authorized user or workflow can then perform a supported operation that:

1. resolves the correct tenant, deployment, module, and configuration version;
2. validates the operation against a compiled immutable manifest and module-owned rules;
3. commits business state, audit evidence, and an outbox record atomically;
4. dispatches long-running work through a durable, idempotent job lifecycle when required;
5. propagates events at least once, with consumer deduplication and reconciliation;
6. routes every database transaction through the tenant's approved isolation profile;
7. exposes truthful progress, failure, retry, cancellation, recovery, and history states; and
8. produces evidence sufficient for security review, incident response, export, retention, and release
   certification.

The reference journey must work in a production-shaped environment with real PostgreSQL, Redis, object
storage, identity, secrets, workers, and observability. Fixture success is not evidence.

## 2. Why this is one architecture and not five unrelated projects

The foundations share a single trusted context and a clearly owned local transaction boundary:

```text
Authenticated request / authorized connector / approved workflow
                         |
                         v
          tenant + actor + correlation + policy context
                         |
                         v
        compiled configuration + module adapter contract
                         |
                         v
             module-owned transaction boundary
          /              |                \
         v               v                 v
 business state     audit record      outbox record
         |                                 |
         |                                 v
         |                       relay -> event transport
         |                                 |
         v                                 v
 durable job control <- queue -> worker -> inbox/receipt
         |                                 |
         +------------ reconciliation -----+

All database access passes through tenant binding and connection governance.
All user-visible state comes from authoritative persisted state, never queue memory.
```

Metadata without module ownership becomes an unsafe generic database. Jobs without tenant routing and
audit cannot be operated safely. Events without an outbox lose committed changes. Connection pools
without tenant controls can cross-contaminate data. Audit written only in middleware misses worker and
event mutations. The five deltas therefore share contracts, but each domain module keeps ownership of its
business rules and records.

## 3. Product and architecture boundaries

### 3.1 In scope

- Governed tenant configuration for explicitly supported extension points.
- Immutable compiled manifests with activation, compatibility, and rollback semantics.
- Module adapter contracts for validation, authorization, persistence, filtering, indexing, import,
  export, event, and audit behavior.
- Durable bulk and background job control with retries, checkpoints, cancellation, artifacts, and
  reconciliation.
- Transactional outbox, durable consumer receipts/inbox, schema compatibility, replay, and dead-letter
  handling.
- Tenant-to-database binding, pool budgeting, transaction-local tenant context, topology health, and
  isolation-profile certification.
- Transactional append-only audit evidence, redaction, integrity verification, retention, and searchable
  projections.
- Operator and tenant-administrator experience for allowed configuration, jobs, failures, and audit
  history.
- Managed-cloud and customer-hosted deployment profiles where each is separately certified.

### 3.2 Out of scope

- A universal CRUD or SQL gateway across business schemas.
- Arbitrary tenant SQL, JavaScript, Python, shell, expression execution, or HTTP callbacks.
- Letting configuration bypass module invariants or authorization.
- Treating Redis, PostgreSQL `NOTIFY`, browser state, or process memory as the source of truth.
- A claim of exactly-once execution or exactly-once event delivery.
- One global audit interceptor as the sole record of business mutations.
- A blanket `custom_fields JSONB` column or generated indexes on every table.
- A central outbox table written across service databases.
- Direct cross-module table reads, including Analytics reading domain schemas.
- Provider credentials, OAuth tokens, database passwords, or personal data inside job/event payloads.
- A new workflow, analytics, connector, or domain product hidden inside this foundation program.
- Big-bang migration of every existing worker, event, or audit path.

### 3.3 Relationship to Analytics, Reports, Workflows, and Connectors

- Connectors own external-system authentication, discovery, checkpoints, rate limits, reconciliation, and
  source-specific behavior.
- Workflows orchestrate approved capabilities; they do not become the durable record for module data.
- Analytics owns ingestion, datasets, semantic models, queries, charts, dashboards, and reports.
- Delta 5 provides shared control contracts: tenant context, durable jobs, events, audit, and governed
  configuration.
- Analytics consumes external ingested datasets or versioned module fact contracts. It does not use the
  metadata adapter to query arbitrary operational tables.
- Domain modules remain independently usable when Analytics is unavailable.

### 3.4 Requirements trace seed

The work-item owner must confirm exact links and acceptance at G1. This seed preserves existing stable IDs;
it does not invent a parallel requirements catalog.

| Delta | Candidate functional links | Mandatory cross-cutting links |
| --- | --- | --- |
| Governed metadata and adapters | `FR-01`, `FR-05`, `FR-14`, `FR-15` | `NFR-GOV-001`–`003`, `NFR-SEC-001`–`004`, `NFR-DATA-001`–`004`, `NFR-PERF-002`–`003`, `NFR-UX-001`–`004`, `NFR-OPS-001`–`004` |
| Durable jobs | `FR-03`, `FR-08`, `FR-09`, `FR-10`, `FR-11`, `FR-16` | `NFR-SEC-001`–`005`, `NFR-DATA-001`–`004`, `NFR-REL-001`–`003`, `NFR-PERF-003`, `NFR-OBS-001`–`004`, `NFR-UX-001`–`002`, `NFR-OPS-001`–`004` |
| Transactional events | `FR-04`, `FR-08`, `FR-09`, `FR-11`, `FR-15` | `NFR-SEC-001`–`005`, `NFR-DATA-001`–`004`, `NFR-REL-001`–`003`, `NFR-PERF-001`, `NFR-OBS-001`–`004`, `NFR-OPS-001`–`004` |
| Tenant connection governance | `FR-02`, `FR-03`, `FR-14`, `FR-15` | `NFR-SEC-001`–`004`, `NFR-DATA-001`–`003`, `NFR-REL-003`, `NFR-PERF-002`–`003`, `NFR-OBS-001`–`004`, `NFR-OPS-001`–`004` |
| Transactional audit evidence | `FR-09`, `FR-10`, `FR-11`, `FR-12`, `FR-14`, `FR-15`, `FR-16` | `NFR-GOV-001`–`003`, `NFR-SEC-001`–`004`, `NFR-DATA-001`–`004`, `NFR-REL-001`–`003`, `NFR-OBS-001`–`004`, `NFR-UX-001`–`002`, `NFR-OPS-001`–`004` |

`FR-17` and Accounts Receivable are not dependencies of this program. A financial module may adopt these
foundations only through its own later work item, domain-owned contracts, independent financial review,
and separately accepted release evidence.

## 4. Current-state truth and required disposition

The first implementation obligation is reuse and convergence, not replacement.

| Existing capability | Current truth | North-star disposition |
| --- | --- | --- |
| `@gigalibs/configuration-core` | Deterministic compiler and runtime validation exist | Preserve as the canonical definition/compiler boundary; extend only through versioned contracts |
| `@gigalibs/configuration-react` | Allowlisted renderer exists | Preserve; certify accessibility, unsafe-content handling, version compatibility, and failure states |
| `packages/contracts/src/configuration` | Shared configuration contracts exist | Reconcile into the canonical contract catalog; no parallel metadata DTO family |
| `packages/db` configuration persistence | Real persistence exists | Preserve ownership; add only approved forward migrations and compatibility evidence |
| Configuration Studio APIs | Authoring and activation paths exist | Complete authorization, concurrency, recovery, tenant-negative, and operational certification |
| Configuration manifest cache | Bounded process-local cache exists | Treat as an optimization; authoritative reads and invalidation recovery remain database-backed |
| Configuration outbox plus `NOTIFY` | Commit-coupled invalidation signal exists | Keep for local invalidation; never describe `NOTIFY` as a durable cross-service queue |
| `packages/queue` and BullMQ workers | Shared queue factories and worker patterns exist | Converge lifecycle and tenancy contracts; do not introduce a competing job framework |
| Module-specific workers | AR, CMMS, FastAPI/Celery, and control-plane workers exist | Inventory by runtime; migrate only selected paths after compatibility and recovery design |
| Module outboxes | Several outbox implementations exist | Standardize envelope and operational behavior while keeping module-owned transactional tables |
| `packages/audit-core` / `packages/audit-nest` | Diff and decorator/service primitives exist | Reuse for presentation and instrumentation; add authoritative transaction-coupled audit writes |
| `packages/event-bus` | Event abstractions exist | Inspect and evolve behind the canonical event contract; no new bus abstraction without an ADR |
| `packages/storage-core` | Storage abstraction exists | Use for job inputs/outputs where compatible; certify encryption, tenancy, expiry, and cleanup |
| CMMS import/export and metadata migrations marked `WI-OI-043` | Work-item attribution conflicts with Analytics scope | Inventory and reconcile through the Orchestrator; do not silently rename, delete, or claim the code |

Existing behavior is a candidate foundation, not production certification. Every reused component must be
traced to requirements, threats, migrations, tests, recovery, rollout evidence, and an operational owner.

## 5. Immediate governance blockers

No Delta 5 product behavior may enter Build until all of the following are true:

1. `.pi/PLAN.md`, `.pi/WORK_ITEMS.md`, individual `.pi/work/WI-OI-NNN.md` records, and
   `config/sdlc-governance.json` agree on the sole active Build item.
2. `pnpm audit:sdlc` or the canonical direct verifier passes without WIP/status contradictions.
3. The SDLC Orchestrator resolves whether existing CMMS metadata/import/export changes attributed to
   `WI-OI-043` belong to an existing approved work item, a new bounded work item, or quarantine.
4. `WI-OI-039` is handled according to its canonical state. Unfinished human review or production-profile
   certification is not converted into approval by this document.
5. Each new implementation slice receives a stable work item with outcome, linked FR/NFR IDs, human
   owner, named independent reviewers, Definition of Ready, and gate state.
6. Affected ADRs are accepted by authorized reviewers. Draft ADR text is not an architecture decision.
7. The selected adopter module is named. “All modules” is not a valid first adopter.

This plan may support G0–G3 design work. It cannot be cited as permission to bypass the one-module Build
rule.

## 6. Governing principles

### 6.1 Module ownership

- A domain module owns its canonical entities, invariants, transaction boundary, migrations, and business
  authorization.
- Shared platform packages provide contracts and reusable mechanisms; they do not own domain truth.
- A module adapter exposes only explicit capabilities and fields. Absence from the adapter means denied.
- No shared platform code writes a module's business tables outside the module-owned service/repository.

### 6.2 Tenant isolation

- Tenant identity is derived from verified server-side identity and authoritative tenant membership.
- Tenant identifiers supplied by a client are selectors to validate, never proof of authority.
- Every persistent record, queue job, event, artifact, cache key, trace, and audit record has an explicit
  tenant and deployment binding where applicable.
- Any mismatch among identity, URL, payload, job, event, database binding, or object prefix fails closed.
- There is no default tenant and no silent fallback database.

### 6.3 Delivery semantics

- Queue execution and event delivery are at least once.
- Exactly-once business effect is approached through transaction design, idempotency keys, uniqueness,
  durable receipts, and reconciliation—not claimed from the transport.
- Retries are bounded, classified, observable, and safe.
- Poison messages and terminal jobs are retained according to policy and recoverable through authorized
  operator actions.

### 6.4 Truthful state

- PostgreSQL or the module's approved durable store is authoritative for business, job, event, and audit
  state.
- Redis is transport, scheduling, coordination, or cache—not the sole business record.
- `NOTIFY` is a wake-up/invalidation signal; consumers recover by reading durable state.
- UI badges and status labels reflect persisted, observed facts with timestamps.

### 6.5 Secure extensibility

- Configuration is data validated against an allowlist; it is not tenant-authored executable code.
- Secrets are references resolved only inside an authorized runtime.
- Filter, sort, expression, and mapping languages use bounded typed ASTs, not string interpolation.
- Configuration activation is versioned, reviewed where required, auditable, reversible, and compatible
  with the target module/runtime version.

### 6.6 True-SaaS operating model

- All customers run versioned platform code and contracts; tenant needs are expressed through governed
  configuration, entitlements, and supported adapters—not tenant-specific source forks.
- Provisioning creates explicit tenant, environment/deployment, region/residency, entitlement, quota,
  binding, key/secret-reference, migration, retention, and observability state.
- Entitlements and limits are enforced server-side at API, job, event, storage, query, and worker admission
  boundaries. Hiding a UI control is not enforcement.
- Tenant suspension, plan change, region move, restore, export, and offboarding are state machines with
  authorization, audit, reconciliation, and recovery.
- Shared resources implement fairness and noisy-neighbor protection; dedicated resources retain the same
  control contracts and evidence model.
- Usage meters for jobs, events, storage, connections, exports, and other billable dimensions are derived
  from durable evidence and reconcile before billing or value claims.
- Operators can identify blast radius by tenant/deployment/module without exposing customer data.
- A customer-hosted installation is a separately supported deployment profile, not an exception that
  bypasses tenancy, upgrades, telemetry, backups, or certification.

## 7. Canonical cross-foundation context

Define one versioned `PlatformContextV1` contract, represented consistently across HTTP, job, event, audit,
and telemetry boundaries.

Required logical fields:

| Field | Rule |
| --- | --- |
| `tenantId` | Required for tenant-scoped operations; server-derived and revalidated at every trust boundary |
| `deploymentId` | Required where a tenant can have more than one deployment or isolation binding |
| `actor` | Human, service, workflow, connector, or system identity with immutable subject and type |
| `authorizationContext` | Scopes/roles/policy decision reference; never blindly trusted from a queue payload |
| `correlationId` | Stable across the end-to-end journey |
| `causationId` | Identifies the immediately causing request, event, or job |
| `traceContext` | Standards-compatible trace propagation without secrets or sensitive payloads |
| `idempotencyKey` | Required for retryable commands and externally triggered mutations |
| `configurationVersion` | Pins the immutable manifest used to validate/execute the operation |
| `schemaVersion` | Identifies the envelope contract |
| `dataClassification` | Drives logging, artifact, retention, export, and masking policy |
| `requestedAt` | Trusted server timestamp for control and forensic use |

Rules:

- Context is serialized minimally. It must not contain raw tokens, passwords, provider credentials, or
  unrestricted user-provided metadata.
- A worker or consumer reloads current authority and tenant binding before a material effect. A historical
  authorization snapshot is evidence, not perpetual permission.
- Revocation, tenant suspension, deleted connection, incompatible manifest, or moved database binding
  results in a blocked/reconciliation state, not fallback execution.
- Contract version changes require backward/forward compatibility policy and consumer contract tests.

## 8. Delta 1 — governed metadata and module adapters

### 8.1 Objective

Allow tenants to configure explicitly supported fields, forms, views, validation, import/export mappings,
and safe query capabilities without weakening module ownership.

### 8.2 Canonical architecture

```text
Configuration Studio
  -> draft definition
  -> server-side schema + policy validation
  -> deterministic compile
  -> immutable manifest version
  -> activation record + audit + outbox
  -> module adapter compatibility check
  -> tenant/module-scoped cache
  -> module-owned read/write path
```

The existing configuration packages and persistence are the base. Do not create a parallel “Metadata
Runtime,” “Dynamic Object Service,” or universal table gateway.

### 8.3 Module adapter contract

Each adopter implements a versioned adapter declaring:

- module and entity identifiers;
- supported configuration schema versions;
- supported field types, validation constraints, and display surfaces;
- create/update/read/filter/sort/import/export capabilities;
- module permission mappings for each capability;
- canonical record ID and optimistic-concurrency behavior;
- storage strategy for custom values;
- normalization and business-invariant hooks;
- safe filter AST fields/operators and query cost constraints;
- index declarations and activation requirements;
- audit classification/redaction behavior;
- events emitted and job types accepted;
- maximum field counts, payload sizes, list sizes, and nesting depth;
- deprecation and manifest-compatibility behavior.

Adapters must not accept arbitrary table names, column names, SQL fragments, repository objects, or
unrestricted callbacks from configuration.

### 8.4 Storage strategy

Choose per adopter and record the decision in its design:

1. **Bounded JSONB on the owning entity** only when lifecycle, authorization, transaction, retention, and
   query patterns align with the entity.
2. **Module-owned extension value tables** when values need independent indexing, cardinality, retention,
   history, or migration behavior.
3. **Dedicated canonical columns/tables** when a value becomes a stable business invariant, join key,
   financial/regulatory field, or high-volume query dimension.

No option is globally preferred. The adapter owns translation and validation. The generic configuration
service stores definitions/manifests, not business values.

### 8.5 Query and indexing safety

- All filtering and sorting uses a typed, size-bounded AST compiled by the module adapter to parameterized
  repository queries.
- Unknown fields/operators, excessive predicates, leading-wildcard scans, unbounded ranges, and
  disallowed joins fail before database execution.
- Pagination is mandatory and deterministic; export is a job rather than an unbounded request.
- Index requests are proposals. A migration is generated/reviewed by the owning module and released
  through normal migration gates.
- Activation cannot claim a field is efficiently filterable until the required index exists and is
  verified in the relevant deployment profile.
- Query plans, cardinality, write amplification, lock duration, and storage growth are tested at
  representative scale.

### 8.6 Definition lifecycle

Minimum states:

```text
Draft -> Validated -> Approved (when policy requires) -> Active
                                      |                    |
                                      v                    v
                                  Rejected             Superseded
                                                           |
                                                           v
                                                       Retired
```

Requirements:

- Versions are immutable after activation.
- Activation uses optimistic concurrency and a unique active-version constraint per scope.
- Rollback means activating a compatible prior version, never editing historical evidence.
- Removing or changing a field requires value-usage analysis, export/retention decisions, compatibility
  checks, and an explicit migration or deprecation window.
- Cache misses, stale versions, invalidation loss, and incompatible runtimes have explicit failure states.

### 8.7 Delta 1 acceptance evidence

- Deterministic compiler golden tests and hostile-input/property tests.
- Tenant/module/entity permission matrix and negative cross-tenant tests.
- Concurrent draft/activation conflict tests.
- Manifest compatibility tests across supported runtime versions.
- Storage migration, rollback/roll-forward, and value-preservation evidence.
- Safe query AST fuzzing plus database-plan tests at representative scale.
- Accessibility and unsafe-content tests for every allowlisted renderer.
- Cache invalidation-loss recovery proving the database remains authoritative.
- Audit evidence for create, edit, validate, activate, supersede, rollback, and retire.

## 9. Delta 2 — durable asynchronous jobs

### 9.1 Objective

Provide one truthful job lifecycle for imports, exports, connector synchronization, report generation,
reconciliation, and other bounded background work while preserving runtime-specific execution where
needed.

### 9.2 Architecture decision

- Reuse BullMQ and the existing queue package for Node/NestJS workloads unless an ADR proves it cannot
  satisfy a selected workload.
- Existing Celery/FastAPI work is not automatically rewritten. It must implement the same control-plane
  contract or receive an approved compatibility bridge.
- PostgreSQL job-control records are authoritative. Redis queue state is operational transport state.
- Job payloads contain identifiers and object references, not full sensitive datasets or credentials.
- Each module owns job semantics and effects; shared packages own lifecycle/envelope consistency.

### 9.3 Durable job model

The canonical logical model includes:

| Record | Required purpose |
| --- | --- |
| Job | Tenant, module, type, requester, idempotency key, configuration version, state, progress, timestamps, version |
| Attempt | Attempt number, worker/runtime, start/end, heartbeat, classified result, trace |
| Checkpoint | Resumable cursor/version with integrity and compatibility metadata |
| Artifact | Tenant-bound object reference, classification, checksum, size, expiry, scan status |
| Error | Stable error code, safe summary, retryability, operator detail reference |
| Command history | Requested retry/cancel/pause/resume with actor, policy decision, and outcome |

Physical tables may be module-owned or provided by an approved shared job-control component. The ADR must
define ownership and forbid cross-service SQL. Shared logical contracts do not require a central database.

### 9.4 State machine

Minimum externally visible states:

```text
Requested -> Accepted -> Queued -> Running -> Succeeded
    |           |          |         |
    |           |          |         +-> CancelRequested -> Cancelled
    |           |          |         +-> RetryScheduled -> Queued
    |           |          |         +-> FailedTerminal
    |           |          +-> Expired / DeadLettered
    |           +-> Rejected
    +-> DuplicateOfExisting
```

Rules:

- Transitions use compare-and-swap/version checks and append history.
- Enqueue follows durable commit, normally through an outbox dispatcher.
- A missing queue message is repairable from durable requested/queued state.
- A completed transport job is not success until the module effect and authoritative job state commit.
- Progress is monotonic within an attempt and explicitly reset or versioned across retries.
- Cancellation is cooperative. The UI must distinguish requested from completed cancellation.
- Heartbeat loss moves work through a documented lease/recovery policy; it never silently reports success.

### 9.5 Idempotency and retry

- Define the idempotency scope as `(tenant, module, operation, idempotencyKey)` or a stricter domain key.
- Persist command receipt before or atomically with side effects.
- Use unique constraints or domain invariants to prevent duplicate business effects.
- Retry only classified transient failures; validation, authorization, incompatible schema, missing tenant
  binding, and policy denial are terminal until explicit correction.
- Backoff is exponential with jitter, bounded attempts, and a total age/expiry policy.
- External side effects require provider idempotency where available and local reconciliation regardless.
- Manual replay creates an audited command tied to the original job and never edits history.

### 9.6 Import/export and artifact handling

- Client upload obtains a tenant-scoped, short-lived object-storage grant after authorization.
- Artifacts are encrypted, checksummed, malware-scanned where applicable, classified, size-limited, and
  retained/expired by policy.
- Parsing is streaming with measured bounded memory; code that accumulates the full file is not certified
  as streaming.
- Import uses validate/preview/commit semantics where domain risk requires it.
- Per-row errors are stored in bounded artifacts, not emitted wholesale into logs or job rows.
- Exports run against a documented consistency model and include schema/configuration version plus an
  integrity checksum.
- Download grants are tenant-bound, actor-authorized, short-lived, audited, and revocable.

### 9.7 Worker deployment and operations

- API processes do not execute unbounded business work inline.
- Workers have explicit queue allowlists, concurrency, memory/CPU limits, graceful shutdown, and readiness.
- Queue priority cannot starve security, reconciliation, or interactive work; fairness by tenant is tested.
- Per-tenant and global admission limits protect databases and providers.
- Backpressure is visible to APIs and UI through honest queued/throttled states.
- Worker deployment topology, autoscaling, drain, upgrade compatibility, and rollback are certified per
  deployment profile.

### 9.8 Delta 2 acceptance evidence

- Duplicate delivery and concurrent worker tests prove one business effect.
- Crash tests at pre-effect, mid-effect, post-effect/pre-ack, and post-ack boundaries.
- Redis restart/loss and queue repair from PostgreSQL state.
- Retry classification, poison job, DLQ, replay, cancellation, timeout, and expiry tests.
- Cross-tenant payload, artifact, status, cancellation, and download denial tests.
- Representative file-volume and bounded-memory tests.
- Worker rolling-upgrade and old/new payload compatibility tests.
- Reconciliation detects and repairs queued-without-message, running-without-lease, and effect-without-final
  status conditions.

## 10. Delta 3 — transactional domain events

### 10.1 Objective

Ensure committed module changes become durable integration facts without dual-write loss, while consumers
remain independently deployable and retry-safe.

### 10.2 Producer architecture

- A module writes its business mutation, authoritative audit record, and outbox row in one local database
  transaction.
- Each module/database owns its outbox table or equivalent local durable log.
- A shared library defines envelope validation, leasing, retry bookkeeping, redaction, and telemetry.
- A relay publishes after commit and records delivery attempt/outcome.
- PostgreSQL `NOTIFY` may wake a local relay, but polling/reconciliation of durable outbox rows is required.
- The relay cannot infer or manufacture a domain event from changed rows after the fact.

### 10.3 Canonical event envelope

Required logical fields:

- globally unique `eventId`;
- versioned `eventType` and `schemaVersion`;
- `tenantId`, `deploymentId` when applicable, and producer module;
- aggregate type/id/version and per-aggregate sequence where ordering is required;
- occurred/committed timestamps with defined semantics;
- actor, correlation, causation, and trace references;
- data classification and retention category;
- payload containing the minimum integration fact, never credentials;
- schema/content type and producer build/version;
- optional configuration version and source checkpoint.

Event names describe completed facts, not instructions. Commands use a different contract and authorization
model.

### 10.4 Consumer architecture

- Consumers validate envelope and schema before executing behavior.
- A durable inbox/receipt keyed by consumer and event ID prevents duplicate effects.
- Inbox receipt and local effect commit atomically when they share a database; otherwise use a documented
  saga/reconciliation design.
- Consumers are tenant-aware and independently reauthorize any consequential action.
- Unknown incompatible versions fail to a visible quarantine/DLQ state.
- Replay is range- and tenant-bounded, authorized, rate-limited, and audited.
- Ordering is guaranteed only for an explicitly documented key; global ordering is not promised.

### 10.5 Schema governance

- Event schemas live in the canonical contract package/registry with ownership and compatibility policy.
- Additive changes require consumer contract evidence; breaking changes require a new version/type and a
  migration window.
- Producers cannot remove a field until all registered consumers have exited the compatibility window.
- Consumer registration records purpose, data classification, retention, owner, accepted versions, and
  failure/recovery route.
- Sensitive data is referenced or minimized; encryption and masking follow classification.

### 10.6 Event transport

The first ADR must choose the supported transport for each deployment profile based on measured needs.
The contract must not hard-code a vendor. Criteria include durability, ordering scope, consumer groups,
replay, retention, tenant isolation, operations, customer-hosted support, cost, and disaster recovery.

`NOTIFY` is not the event transport for durable cross-service delivery. If Redis/BullMQ is used as a relay
transport, the outbox and inbox remain authoritative for repair and deduplication.

### 10.7 Delta 3 acceptance evidence

- Atomicity test: rollback produces neither business state nor outbox/audit records.
- Relay crash tests before publish, after publish/before acknowledgement, and after acknowledgement.
- Duplicate, reordered, delayed, poison, incompatible-version, and missing-consumer tests.
- Cross-tenant event injection and subscription authorization tests.
- Producer/consumer compatibility suite for every registered pair.
- Replay and reconciliation tests with bounded blast radius.
- Transport outage, backlog recovery, retention exhaustion, and disaster-recovery tests.
- Metrics reconcile committed outbox, published, received, processed, failed, quarantined, and aged rows.

## 11. Delta 4 — tenant-aware connection governance

### 11.1 Objective

Resolve every data operation to the correct tenant/deployment/database binding, enforce safe connection
usage, and prevent aggregate workload from exhausting shared infrastructure.

### 11.2 Supported isolation profiles

The architecture must support only explicitly certified profiles, for example:

1. shared database/shared schema with tenant keys and defense-in-depth RLS where applicable;
2. shared database/separate schema; and
3. dedicated database or cluster for a tenant/deployment.

Support is not claimed until migrations, backup/restore, pooling, observability, offboarding, and tenant
negative tests pass for that profile. A deployment may support a subset.

### 11.3 Tenant binding registry

The authoritative registry maps `(tenantId, deploymentId, service/module)` to:

- isolation profile and database/schema identifier;
- secret reference, never raw connection material;
- region/residency and data classification constraints;
- migration version and compatibility state;
- pool policy and workload class;
- status: provisioning, active, draining, suspended, migrating, recovery, retired;
- key/credential version and rotation status;
- backup/restore policy and operational owner.

Reads are cached only with bounded TTL/versioning and explicit invalidation. Missing, stale-incompatible, or
ambiguous bindings fail closed. Moving a tenant requires a state machine and drain/reconciliation process.

### 11.4 Connection and transaction rules

- Every repository call executes inside a scope that has already resolved and verified tenant binding.
- Tenant/session context is established transaction-locally and cleared automatically at transaction end.
- Code must never depend on session state surviving across requests under transaction pooling.
- Pool checkout/check-in hooks assert clean state; contamination triggers connection eviction and a
  security signal.
- Database roles follow least privilege by service and workload. Migration roles are separate from runtime
  roles.
- Read replicas, if used, expose explicit consistency/staleness semantics and cannot serve operations that
  require read-your-write without a safe route.
- Long transactions, unbounded cursors, and unreviewed session features are prohibited.

### 11.5 PgBouncer and session-sensitive features

- PgBouncer is optional deployment infrastructure, not an assumed application guarantee.
- Transaction pooling requires certification of prepared statements, drivers, migrations, advisory locks,
  temporary objects, session variables, and failure behavior for the exact versions/configuration.
- `LISTEN`/`NOTIFY` consumers use dedicated session-capable connections and must not pass through an
  incompatible transaction-pooling path.
- Administrative, migration, replication, and application traffic use separated routes and budgets.
- Configuration, upgrade, failover, DNS, TLS, certificate rotation, and saturation behavior require
  deployment-profile runbooks.

### 11.6 Capacity and admission control

Before rollout, produce a measured capacity model:

```text
database connection ceiling
- reserved admin/migration/replication capacity
- failure/failover reserve
= safely allocatable application connections

sum(api pool budget + worker pool budget + relay pool budget + analytics/query budget)
<= safely allocatable application connections
```

Budgets are set per service instance, replica count, workload class, isolation profile, and failure mode.
Autoscaling cannot increase replicas beyond the aggregate database budget. Admission control must reject or
queue excess work before the database collapses.

No numeric SLO, pool size, timeout, or limit in this plan is a production default. Values require load
evidence, capacity review, and named human acceptance.

### 11.7 Delta 4 acceptance evidence

- Cross-tenant tests at HTTP, job, event, repository, cache, artifact, and audit boundaries.
- Pool-reuse contamination test under high concurrency.
- Binding cache stale/missing/moved/suspended tests.
- Database failover, pooler restart, DNS change, credential rotation, and certificate rotation tests.
- Exhaustion/admission-control and noisy-neighbor fairness tests.
- Migration compatibility across all certified isolation profiles.
- Backup/restore and single-tenant recovery evidence.
- Session-feature compatibility tests for the exact driver and PgBouncer mode, where used.

## 12. Delta 5 — transactional audit evidence

### 12.1 Objective

Create trustworthy evidence of material configuration, data, security, job, event, and operator actions
without leaking sensitive data or making a central audit service part of every write's availability path.

### 12.2 Three distinct records

Do not conflate:

1. **Domain history** — business history needed to interpret the entity.
2. **Security/audit evidence** — who/what attempted or completed a material action, under which authority,
   and with what bounded change/result.
3. **Observability telemetry** — logs, metrics, and traces optimized for operations, not authoritative
   business evidence.

Each has separate retention, access, integrity, and availability requirements.

### 12.3 Write architecture

- Authoritative audit is written in the module's transaction with the material business effect whenever
  atomicity is required.
- Shared audit packages define envelopes, diff/redaction helpers, policy classification, and search/export
  contracts.
- Decorators/interceptors may collect route metadata and intent, but cannot be the sole evidence because
  they miss internal, worker, consumer, and repository paths.
- A transactional audit outbox may export records to a central searchable projection or archive.
- Failure to update the projection does not erase the module-owned source record; reconciliation repairs
  the projection.

### 12.4 Canonical audit envelope

Required logical content:

- unique audit ID and schema version;
- tenant/deployment and owning module;
- actor type/subject and delegated/impersonation chain;
- policy/authorization decision reference;
- action, resource type/id/version;
- outcome: attempted, denied, committed, failed, cancelled, reconciled;
- server timestamps and transaction/commit reference where available;
- correlation, causation, request/job/event IDs;
- configuration version and source connection where relevant;
- safe before/after or patch representation with classification-aware redaction;
- reason/comment/approval reference when policy requires;
- integrity metadata and export/archive status.

### 12.5 Diff, redaction, and integrity

- Diffs are schema-aware. Secret, credential, token, large binary, and prohibited personal fields are never
  captured in plaintext.
- Custom fields inherit their active metadata classification; unknown classification defaults to the more
  restrictive policy.
- Large changes store bounded summaries plus encrypted artifact references where policy permits.
- Audit records are append-only to the application role. Corrections create linked records.
- Integrity controls may use chaining, signed batches, immutable object retention, or database controls;
  the selected method requires a threat model and restore verification.
- Central search is a projection. Integrity verification must trace a projection result to its source
  record and archive.

### 12.6 Audit access and lifecycle

- Audit read/export permissions are separate from ordinary entity permissions.
- Search is tenant-scoped, paginated, rate-limited, and itself audited for sensitive categories.
- Retention, legal hold, erasure exceptions, residency, archive, and offboarding behavior are explicitly
  mapped by classification and jurisdiction.
- Tenant administrators see only permitted tenant evidence; platform operators require break-glass or
  scoped support authorization.
- Timestamps, time zones, actor labels, and outcome labels are unambiguous in UI and export.

### 12.7 Delta 5 acceptance evidence

- Every material mutation path—HTTP, job, event, operator, migration utility—has atomic audit evidence or
  an approved compensating design.
- Transaction rollback leaves no false “committed” audit record.
- Redaction tests cover canonical and tenant-defined fields, nested data, exceptions, and logs.
- Unauthorized search/export and cross-tenant denial tests.
- Tamper detection and integrity-verification tests.
- Projection loss/rebuild and archive restore tests.
- Retention, legal hold, offboarding, and permitted erasure tests.
- Performance evidence shows audit writes do not silently bypass or overload the business transaction.

## 13. API and contract surface

All public and inter-service contracts must be versioned, documented, generated where appropriate, and
owned by `api_contracts` with domain approval.

Minimum surface, subject to ADR/design approval:

### 13.1 Configuration

- draft create/read/update with optimistic version;
- validate/compile with structured diagnostics;
- compare manifest versions;
- activate/supersede/retire with explicit preconditions;
- adapter capability and compatibility discovery;
- usage/dependency analysis before destructive schema change.

### 13.2 Jobs

- create job with idempotency key;
- get/list job with tenant/module filters and cursor pagination;
- request cancellation/retry/replay subject to state and policy;
- obtain authorized artifact upload/download grants;
- get bounded error report and attempt history.

### 13.3 Events

- schema catalog and compatibility validation for build tooling;
- operational outbox/inbox health for authorized operators;
- bounded replay/quarantine/reconcile commands, never arbitrary payload editing.

### 13.4 Tenant bindings

- administrative provisioning/migration/rotation APIs separated from application routing;
- runtime resolution as an internal capability with strict cache/version semantics;
- health/status views that reveal no credentials or cross-tenant topology.

### 13.5 Audit

- tenant-scoped cursor search with server-side allowed filters;
- integrity verification and export jobs;
- legal-hold/retention controls only for specifically authorized roles.

Every endpoint requires documented authentication, authorization, scope, tenant source, idempotency,
concurrency, pagination, rate limit, error contract, audit rule, and data classification.

## 14. Security and abuse model

G2 must explicitly analyze at least:

- forged tenant/deployment IDs and confused-deputy calls;
- horizontal and vertical privilege escalation;
- malicious field definitions, labels, templates, expressions, filters, and mapping payloads;
- stored/reflected XSS in configured UI content;
- SQL/NoSQL/expression/template injection;
- manifest downgrade, replay, cache poisoning, and incompatible activation;
- job payload substitution, duplicate execution, queue flooding, starvation, and artifact swapping;
- event spoofing, tampering, replay, schema confusion, and poison-message loops;
- connection-pool state leakage and database-binding cache poisoning;
- credential exposure through errors, telemetry, artifacts, events, or audit diffs;
- audit suppression, false success, tampering, truncation, and unauthorized search;
- bulk export/exfiltration and inference attacks;
- compromised worker, connector, or support/operator account;
- denial of service through expensive filters, excessive fields, large files, or replay storms;
- retention/legal-hold conflicts and unsafe offboarding;
- customer-hosted configuration drift and unsupported infrastructure versions.

Controls must be mapped to prevention, detection, response, test evidence, residual risk owner, and release
gate. Critical residual risks require named human acceptance; an implementing agent cannot self-accept.

## 15. Persistence and migration strategy

### 15.1 Rules

- No blanket schema migration across every module.
- Every schema change has a forward migration, compatibility analysis, data verification, recovery or
  roll-forward plan, lock/volume assessment, and observability.
- Deployments use expand -> migrate/backfill -> verify -> activate -> contract when contraction is needed.
- Old and new application versions coexist safely through the declared rollout window.
- Backfills are resumable, tenant-bounded, rate-limited, and auditable jobs.
- Migration tooling uses a separate least-privilege operational identity.
- Schema version and manifest version are distinct and both visible in evidence.

### 15.2 Candidate logical records

Do not create these until the ownership ADR is accepted, but the design must account for:

- configuration definitions, immutable manifests, activation history, dependencies;
- module adapter/capability registration and compatibility;
- durable job, attempts, checkpoints, commands, artifacts, errors;
- module-owned outbox, delivery attempts, consumer inbox/receipts, quarantine;
- tenant/deployment database bindings and rotation/migration history;
- module-owned audit records, integrity batches, archive/projection checkpoints.

Table names and locations are implementation details. Cross-service direct table access is prohibited.

## 16. Observability and production controls

### 16.1 Common telemetry dimensions

Use bounded-cardinality dimensions such as module, operation/job/event type, deployment profile, result,
error class, and isolation profile. Tenant IDs belong only where policy and cardinality controls permit.
Never place secrets, raw payloads, unrestricted record IDs, or personal values in metric labels.

### 16.2 Minimum signals

| Foundation | Required signals |
| --- | --- |
| Metadata | compile/activation success and latency, incompatible manifests, cache hit/stale/resync, adapter errors |
| Jobs | state counts, age, queue delay, run time, retries, heartbeat loss, DLQ, cancellations, artifact failures |
| Events | outbox age/backlog, publish attempts, consumer lag, duplicates, failures, quarantine, reconciliation drift |
| Connections | active/waiting connections, checkout latency, saturation, timeouts, binding failures, evictions, long transactions |
| Audit | transactional write failures, projection lag, integrity failures, archive/export/retention failures |

### 16.3 SLO process

For each first adopter:

1. define user-facing service indicators;
2. establish representative baseline and capacity envelope;
3. propose target, error budget, measurement query, and observation window;
4. assign response owner and page/ticket threshold;
5. define rollout halt and automatic protection behavior;
6. obtain Product, Operations, Security, and Release acceptance as applicable.

This plan intentionally does not invent universal latency, throughput, availability, RPO, or RTO values.
Unmeasured numbers create false confidence.

## 17. Deployment profiles and recovery

### 17.1 Deployment profiles

Certify separately:

- managed GigaLibs cloud;
- customer-hosted baseline; and
- any regulated/dedicated profile actually sold.

Each profile declares supported PostgreSQL/Redis/object-store/pooler/transport versions, topology,
encryption, secrets integration, observability, backup, scaling, upgrade, and support boundaries.

### 17.2 Required runbooks

- configuration activation failure, incompatible manifest, and cache resync;
- job backlog, stuck job, poison job, duplicate effect suspicion, and artifact failure;
- outbox backlog, transport outage, consumer lag, schema incompatibility, replay, and reconciliation;
- database saturation, pooler failure, binding error, tenant move, credential rotation, and failover;
- audit projection lag, integrity alert, archive/restore, retention, and legal hold;
- deployment drain, worker upgrade, rollback/roll-forward, and partial-region failure;
- tenant suspension, export, offboarding, and recovery.

Runbooks identify detection, decision authority, safe commands, blast-radius controls, validation, customer
communication owner, and evidence to retain.

## 18. Agent and human ownership model

The exact primary role for this architecture is `solution_architecture`. The dormant `tenant_config` role is
not the owner of a new metadata platform and must not be activated casually to bypass canonical ownership.

| Role | Accountable contribution | Must not self-approve |
| --- | --- | --- |
| `agile_delivery_orchestrator` | Allocate/reconcile work items, WIP, gates, dependencies, reviewers, evidence links | Product acceptance, risk acceptance, release authority |
| `requirements_spec` | Outcome, FR/NFR trace, actors, negative cases, value and non-goals | Product priority/acceptance |
| `solution_architecture` | Target architecture, ownership, ADRs, compatibility, migration/recovery boundaries | Its own high-risk architecture acceptance |
| `api_contracts` | HTTP/event/job/context schemas, errors, idempotency, compatibility | Domain semantics or release acceptance |
| `backend_domain` | Module services, repositories, transactions, workers, outbox/inbox, authoritative audit integration | Tenancy/security/migration review alone |
| `tenant_identity_access` | Identity, RBAC/scopes, tenant enforcement, service/worker identity, secret-reference boundaries | Its own tenant-isolation certification |
| `integration_connectors` | External auth, mappings, checkpoints, rate limits, retries, reconciliation | Provider readiness or security alone |
| `data_portability` | Classification, import/export, lineage, retention, erasure, hold, offboarding | Legal conclusions or retention acceptance |
| `infrastructure_observability` | Runtime topology, queues, storage, pools, telemetry, SLO and operational runbooks | Release approval |
| `developer_platform` | Canonical manifests/SDKs/examples/certification tooling for extension authors | Claiming examples as production capability |
| `web_experience` | Accessible, API-backed configuration/job/audit states and failure recovery UX | Server-side authorization or data correctness |
| `trust_safety_automation` | Automation safety tiers, approvals, limits, override and abuse cases when automation acts | Product/risk acceptance |
| `qa_spec` | Independent test design, traceability, tenant/RBAC/resilience/performance evidence | Producer self-certification |
| `release_operations` | Immutable artifacts, SBOM/provenance, migrations, canary, halt, recovery, observation | Human release authorization |
| `documentation_enablement` | Operator/admin/developer documentation and versioned support boundaries | Architecture or release acceptance |

Named humans retain Product Owner acceptance, security/risk acceptance, legal/privacy conclusions, and
production-release authority.

## 19. Work-item decomposition and sequencing

Do not create one “implement Delta 5” work item. That would violate bounded scope and make evidence
meaningless. Use an architecture program/epic for traceability and separately gated implementation slices.
The Orchestrator assigns actual `WI-OI-NNN` identifiers.

### 19.1 Design/convergence items

These may prepare G0–G3 artifacts without authorizing product changes:

1. Governance and code-attribution reconciliation.
2. Canonical `PlatformContextV1` and envelope compatibility design.
3. Job-control convergence ADR and current-worker inventory.
4. Event/outbox/inbox convergence ADR and transport decision.
5. Tenant-binding/pool architecture and capacity model.
6. Transactional audit/evidence architecture and retention model.

### 19.2 Build slices

One Build slice at a time under the canonical WIP policy:

1. Close or truthfully re-state the existing Configuration Studio item; do not duplicate it.
2. Select one low-risk adopter for the first governed module adapter.
3. Add only the job, event, binding, and audit capabilities required by that adopter's end-to-end journey.
4. Certify the integrated journey through G5–G7 before adopting the next module.
5. Extract/reuse shared code only after the first use is proven; verify it through a second independent
   adopter before calling it a platform standard.
6. Migrate legacy workers/events/audits incrementally based on risk and value, not package symmetry.

Each behavior-changing slice normally receives its own bounded work item. If the Orchestrator keeps
multiple sequential phases in one item, that item must still name the phase-level gates, owners, evidence,
and stop conditions; it cannot use an umbrella title to hide concurrent Build work.

The first adopter should avoid a financial, regulated, physical-safety, or high-volume path unless the
product owner explicitly accepts the additional review burden. The first financial adopter remains a
separate, independently reviewed slice.

## 20. Phased implementation plan

### Phase 0 — governance reconciliation and factual inventory

Owner: `agile_delivery_orchestrator`  
Gate target: G0

Deliverables:

- Reconcile `.pi/PLAN.md`, `.pi/WORK_ITEMS.md`, `.pi/work`, and governance configuration.
- Run the canonical SDLC audit and resolve WIP/status errors.
- Inventory all configuration, job, worker, queue, outbox, inbox, event, binding, audit, artifact, and
  migration code by owning module and work item.
- Identify production reachability, deployment profile, tests, known limitations, and responsible owner.
- Resolve `WI-OI-043` contamination without rewriting history: record provenance and authorized
  reattribution/quarantine decision.
- Record reuse/extend/replace/quarantine disposition for every candidate capability.
- Nominate the first adopter, human owner, independent reviewers, and value outcome.

Exit:

- One authoritative Build item; clean governance verifier.
- No duplicate capability or unresolved data owner.
- No product change hidden under a documentation or Analytics work item.

### Phase 1 — requirements, ADRs, threats, and acceptance design

Owners: `requirements_spec`, `solution_architecture`, `api_contracts`, `tenant_identity_access`,
`data_portability`, `infrastructure_observability`, `qa_spec`  
Gate target: G1–G3

Deliverables:

- Stable requirements linked to applicable `FR-01`–`FR-16` and new NFR/test identifiers.
- First-adopter journey, roles, data classes, volumes, failure cases, recovery, and value measure.
- ADR set for adapter ownership/storage, job control, event transport, tenant binding/pooling, and audit
  integrity/projection.
- `PlatformContextV1`, job, event, inbox, error, artifact, audit, and adapter contracts.
- Threat model, abuse cases, permission matrix, secrets flow, retention/hold/offboarding design.
- Forward migration and deployment compatibility plan.
- Complete API/UX state model and independent acceptance-test plan.
- Measured performance/capacity test design and proposed SLO process.

Exit:

- No unresolved critical security, tenant-isolation, data-loss, or ownership issue.
- The first vertical slice is independently demonstrable.
- Every promised UI/API/worker state has an evidence method and owner.

### Phase 2 — close the configuration foundation before extending it

Owner: existing Configuration Studio work-item team  
Gate target: current item's actual remaining gate; no invented state

Deliverables:

- Close remaining human review and production-profile evidence for the existing configuration foundation,
  or explicitly narrow/re-state its certification.
- Verify deterministic compilation, immutable activation, compatibility, cache resync, authorization,
  audit, migration, and recovery claims.
- Document stable extension points and unsupported behavior.
- Remove or quarantine any production-reachable fabricated/default-tenant path discovered by audit.

Exit:

- A named, versioned configuration foundation is accepted for the chosen adopter's needs.
- No parallel metadata engine is required for the next slice.

### Phase 3 — first module adapter vertical slice

Owners: `backend_domain`, `api_contracts`, `web_experience` with independent IAM/data/QA review  
Gate target: G4–G5 for the selected adopter work item

Deliverables:

- One adapter with bounded fields, renderer, validation, permissions, storage, query AST, and audit rules.
- Module-owned atomic create/update path using a pinned active manifest.
- Configuration Studio compatibility/usage information for the adapter.
- Safe list/filter/sort with deterministic pagination and representative query-plan evidence.
- Definition and value migrations with rollback/roll-forward/recovery.
- Full empty/loading/denied/conflict/incompatible/stale/dependency-failure states.

Exit:

- A real tenant can configure and use the selected extension without source changes.
- Cross-tenant, authorization, concurrency, migration, accessibility, and volume evidence passes.

### Phase 4 — durable job slice for the same adopter

Owners: `backend_domain`, `infrastructure_observability`, `data_portability`  
Gate target: G4–G5

Deliverables:

- PostgreSQL-backed job control and existing queue integration.
- Enqueue outbox, idempotency receipt, attempt/heartbeat/checkpoint, cancellation, retry, DLQ, and
  reconciliation.
- Tenant-scoped artifact upload/download and retention.
- One real bounded operation, preferably import/export or another adopter-relevant bulk action.
- Accessible job progress, error, recovery, and history experience.

Exit:

- Crash, duplicate, Redis outage, worker upgrade, cancellation, volume, and tenant-negative tests pass.
- Operator can reconcile every ambiguous state without editing database rows manually.

### Phase 5 — transactional event slice

Owners: `backend_domain`, `api_contracts`, `infrastructure_observability`  
Gate target: G4–G5

Deliverables:

- Module-owned outbox and shared envelope integration for one committed fact.
- Relay with lease/retry/backoff/DLQ/reconciliation and observed backlog.
- One real consumer with durable inbox, idempotent local effect, and compatibility tests.
- Authorized tenant-bounded replay and quarantine tooling.
- Transport outage and recovery runbook.

Exit:

- No dual-write loss in fault-injection evidence.
- Duplicate/reordered/replayed events do not duplicate business effect.
- Outbox, transport, inbox, and consumer state reconcile quantitatively.

### Phase 6 — tenant connection governor pilot

Owners: `tenant_identity_access`, `infrastructure_observability`, `backend_domain`  
Gate target: G4–G5

Deliverables:

- Authoritative binding registry and runtime resolver for the selected deployment profile.
- Pool budgets, admission control, transaction-local context, clean checkout/check-in behavior.
- Explicit route for session-sensitive listeners and administrative/migration traffic.
- Credential rotation, suspended/moved tenant, failover, and recovery flows.
- Capacity test with API, worker, event relay, and audit load together.

Exit:

- Tenant-leak tests, pool contamination tests, saturation tests, and profile-specific recovery pass.
- Autoscaling and worker concurrency cannot exceed accepted database capacity.

### Phase 7 — transactional audit completion

Owners: `backend_domain`, `tenant_identity_access`, `data_portability`, `web_experience`  
Gate target: G4–G5

Deliverables:

- Transaction-coupled authoritative audit for all selected slice mutations and control commands.
- Classification-aware custom-field diffs and secret redaction.
- Integrity mechanism and durable export to searchable projection/archive.
- Tenant-authorized history/search/export UI with pagination and clear outcomes.
- Retention, hold, offboarding, projection rebuild, and archive restore paths.

Exit:

- Atomicity, tamper, redaction, cross-tenant, rebuild, retention, and restore evidence passes.
- Every visible job/event/configuration outcome traces to authoritative audit evidence.

### Phase 8 — integrated certification and first cohort

Owners: `qa_spec`, `release_operations`, `infrastructure_observability`; named humans approve  
Gate target: G5–G7

Deliverables:

- Full trace matrix from outcome through production metric.
- Mandatory repository audits plus slice-specific certifications.
- SBOM/provenance/license/security evidence and immutable build artifacts.
- Migration rehearsal, backup/restore, rollback/roll-forward, load, resilience, security, and accessibility
  reports.
- Canary/cohort rollout plan, halt criteria, recovery authority, support/on-call readiness.
- Observation dashboard and accepted observation window.

Exit:

- No open P0/P1 defect or unresolved critical risk.
- Human Product Owner accepts the integrated journey.
- Human release authority approves cohort rollout.
- G7 observation proves SLO and value outcome before broader adoption.

### Phase 9 — second adopter and platform extraction proof

Owners: adopter module team plus foundation owners  
Gate target: new bounded work item through G0–G7

Deliverables:

- Second adopter with materially different entity/query/job characteristics.
- Evidence that shared contracts are reusable without weakening either module's invariants.
- Compatibility policy and upgrade tooling validated across two adopters.
- Refactor only duplicated stable mechanisms into shared packages.

Exit:

- “Platform foundation” claims are backed by two independent adopters and production observation.
- Subsequent adoption has a documented certification kit, not copy-pasted implementation.

## 21. First reference slice

The exact domain must be approved in Phase 0. Its shape should be:

1. Tenant administrator adds one supported custom field and one supported view/filter configuration.
2. Activation compiles an immutable manifest and checks module/runtime compatibility.
3. Authorized user creates/updates a real module record through the adapter.
4. The module transaction commits canonical data, authoritative audit, and an outbox event.
5. A consumer receives the event at least once and commits one idempotent effect/receipt.
6. Administrator starts a bounded import or export job using object storage.
7. Worker resumes safely after an injected crash and exposes truthful progress/error state.
8. All operations resolve the tenant's binding and respect pool/admission limits.
9. Audit history correlates configuration, entity, event, job, artifact, and operator actions.
10. A second tenant cannot observe or influence any identifier, cache entry, job, event, artifact, database,
    or audit record from the first tenant.

This is the minimum end-to-end proof. A collection of isolated package tests is not the reference slice.

## 22. Test and certification matrix

| Layer | Required evidence |
| --- | --- |
| Unit/property/fuzz | Compiler determinism, AST bounds, state machines, retry classification, redaction, envelope validation |
| Contract | HTTP schemas, job/event/audit/context versions, producer-consumer compatibility, generated clients |
| Persistence | Constraints, transaction atomicity, concurrency, migrations, backfills, query plans, retention |
| Real infrastructure | PostgreSQL, Redis, object storage, transport, pooler where supported, identity/secrets |
| Integration | API -> DB -> outbox -> queue/transport -> worker/consumer -> audit/projection |
| Tenant/RBAC negative | Cross-tenant IDs, mismatched context, stale authority, suspended tenant, unauthorized replay/export |
| Failure injection | Process crash, lost ack, duplicate delivery, dependency outage, cache loss, failover, saturation |
| Performance | Representative rows/files/tenants/concurrency/backlog; p50/p95/p99, memory, connections, recovery time |
| Security | Injection, XSS, secret leakage, artifact substitution, replay, escalation, audit tamper |
| Accessibility | Keyboard, focus, announcements, status/error semantics, contrast, large datasets/pagination |
| Migration/recovery | Old/new compatibility, rehearsal, backup/restore, rollback/forward, single-tenant recovery |
| Operations | Alerts, dashboards, runbooks, replay/reconcile controls, on-call drill, evidence retention |
| E2E/UAT | Real first-adopter journey and all promised failure/recovery states |

All tests use isolated, attributable non-production data. No test dataset contributes to customer value
metrics.

## 23. Definition of Ready for each Build slice

A slice cannot enter G4 until:

- canonical work item and FR/NFR links exist;
- sole active Build/WIP status is clean;
- named adopter, outcome, users, human owner, reviewers, and non-goals are explicit;
- authoritative business, configuration, job, event, binding, artifact, and audit owners are known;
- contracts, permissions, tenant source, classification, retention, and secrets flow are accepted;
- migration, compatibility, rollback/roll-forward, backup/restore, and offboarding are designed;
- idempotency, retry, timeout, concurrency, cancellation, reconciliation, and failure states are specified;
- representative scale, capacity model, telemetry, SLO process, and halt criteria are testable;
- UI/API/worker/operator states and independent test plan are complete;
- dependencies and human/external decisions are resolved or explicitly gated.

## 24. Definition of Done

A slice is not Done until:

- real persistence and real supported infrastructure are used;
- server-side tenancy, authentication, authorization, and secret handling pass independent review;
- all module invariants and transaction boundaries are preserved;
- jobs/events are idempotent, observable, reconcilable, and recoverable under at-least-once delivery;
- audit evidence is authoritative, redacted, integrity-protected, and recoverable;
- forward migrations, compatibility, rehearsal, verification, and recovery evidence pass;
- unit, contract, integration, tenant-negative, security, performance, resilience, accessibility, restore,
  and E2E evidence pass as applicable;
- documentation, dashboards, alerts, runbooks, support, and on-call ownership exist;
- production-reachable mocks, fake provider results, silent fixture fallbacks, default tenants, embedded
  credentials, and local-only business persistence are absent;
- SBOM/provenance and immutable release evidence exist;
- independent reviewers sign applicable high-risk dimensions;
- named human Product Owner and release authority approve; and
- G7 production observation meets the accepted SLO and value window.

## 25. Stop-ship conditions

Stop Build or rollout immediately for any of the following:

- governance/WIP records disagree or code is attributed to the wrong work item;
- tenant identity or database binding can default, drift, or be overridden by untrusted input;
- a cache, Redis queue, `NOTIFY`, browser state, or local file is the only record of a promised outcome;
- retry can duplicate a financial, physical, external, or otherwise material effect;
- business commit can occur without required audit/outbox evidence, or audit can claim a rolled-back commit;
- secrets or sensitive values appear in job/event payloads, logs, traces, metrics, errors, or audit diffs;
- an adapter accepts arbitrary SQL, table/column identifiers, executable code, or unrestricted URLs;
- production code can return fixture/mock/fabricated success;
- a migration lacks compatibility and recovery evidence;
- queue/event backlog, database saturation, integrity failure, or cross-tenant signal cannot halt rollout;
- required independent/human review is missing;
- customer-hosted or managed-profile capability is claimed without profile-specific certification.

## 26. Mandatory evidence packet

Each implementation work item maintains links to:

- outcome and requirements trace;
- accepted ADRs and threat/data/permission designs;
- API/event/job/audit schemas and compatibility report;
- migrations, query plans, capacity model, and recovery plan;
- unit/contract/integration/security/resilience/performance/accessibility results;
- tenant/RBAC negative-test report;
- SBOM, license, vulnerability, provenance, and immutable artifact references;
- dashboards, alerts, SLO queries, runbooks, and drill results;
- known limitations and unsupported deployment profiles;
- independent reviewer decisions and human acceptance;
- cohort rollout/halt record and G7 production observation.

The evidence packet is versioned with the released artifact. Chat summaries are not evidence.

## 27. Mandatory repository verification

Run from a clean, release-candidate checkout with the required services and supported deployment profile:

```text
pnpm build
pnpm test
pnpm audit:production-data
pnpm audit:all-runtime-data
pnpm audit:package-dependencies
pnpm audit:api-boundary
pnpm audit:navigation
pnpm audit:sdlc
```

Also run all slice-specific integration certifications listed in `.pi/PLAN.md`. If a required service is
unavailable, record the test as not run and block the applicable gate; do not replace it with a mock and
claim certification.

## 28. Decisions required before implementation

The following are deliberate decisions, not agent assumptions:

1. Which existing work item owns governance cleanup and which item is the sole active Build item?
2. What is the first low-risk adopter and its measurable user outcome?
3. What is the canonical physical ownership model for durable job-control records?
4. Which event transport and retention/replay capability is supported per deployment profile?
5. Which tenant isolation profiles are actually sold and certified first?
6. Is PgBouncer part of each profile, and in which pooling mode for each traffic class?
7. What audit integrity/archive mechanism satisfies the accepted threat, legal, and customer requirements?
8. What data classifications, retention periods, legal-hold rules, and residency constraints apply?
9. What representative volumes and accepted SLO/RPO/RTO/halt thresholds apply to the first adopter?
10. Which human reviewers and authorities accept architecture, security, privacy/legal, product, operations,
    and release risk?

Until answered in canonical artifacts, these remain blockers to the relevant gate.

## 29. Patterns explicitly rejected

- Building a second metadata engine beside the existing Configuration Studio.
- Making `tenant_config` a generic owner of every module's data.
- One metadata table or service that performs arbitrary CRUD across domain schemas.
- A “universal query gateway” that accepts arbitrary tenant filters/SQL against operational databases.
- Adding JSONB/custom-field indexes to every table in one migration.
- A single giant worker daemon that owns all domain operations.
- Treating BullMQ job completion as proof of exactly-one business effect.
- Treating PostgreSQL `NOTIFY` as a durable message broker.
- One shared outbox table across independently owned service databases.
- Writing audit only in HTTP middleware/interceptors.
- Trusting tenant, actor, role, database, or policy context serialized by an earlier caller.
- Putting credentials or source records in queue/event/audit payloads.
- Migrating every legacy path before proving one complete adopter journey.
- Calling a package “platform-ready” after one adopter or a passing unit suite.
- Claiming managed-cloud behavior applies to customer-hosted deployments without separate evidence.

## 30. Implementation order, in one view

```text
0. Reconcile governance and code attribution
1. Inventory/reuse existing foundations
2. Baseline requirements, contracts, ADRs, threats and tests
3. Close/narrow the existing configuration foundation truthfully
4. Implement one bounded module adapter
5. Add one durable job journey for that adopter
6. Add one transactional event producer and consumer
7. Certify tenant binding, pools and aggregate capacity
8. Complete transaction-coupled audit and evidence lifecycle
9. Run integrated G5 evidence and human UAT
10. Canary/cohort rollout with halt/recovery controls
11. Observe through G7
12. Prove reuse with a second adopter
13. Adopt additional modules one at a time
```

This order is the no-compromise path: it preserves the North Star while keeping every production claim
bounded, testable, reversible, tenant-safe, and honestly evidenced.

## 31. Authoritative references

Repository governance and architecture take precedence:

- `.pi/PLAN.md`
- `.pi/WORK_ITEMS.md`
- `docs/REQUIREMENTS_BASELINE.md`
- `docs/SDLC_DEVELOPMENT_GUIDE.md`
- `docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md`
- `docs/architecture/ADR-0002-governed-metadata-configuration.md`
- `docs/architecture/CONFIGURATION_STUDIO_SECURITY_DATA_MIGRATION_DESIGN.md`
- `docs/plans/configuration-studio-acceptance-test-plan.md`
- relevant `.pi/agents/*/AGENT.md`, contracts, migrations, and runbooks

External behavior references used to constrain transport and pooling claims:

- BullMQ idempotent jobs: <https://docs.bullmq.io/patterns/idempotent-jobs>
- Bull/BullMQ at-least-once and stalled-job behavior: <https://docs.bullmq.io/bull/important-notes>
- BullMQ job IDs and deduplication: <https://docs.bullmq.io/guide/jobs/job-ids> and
  <https://docs.bullmq.io/guide/jobs/deduplication>
- BullMQ workers and retries: <https://docs.bullmq.io/guide/workers/> and
  <https://docs.bullmq.io/guide/retrying-failing-jobs>
- PostgreSQL `NOTIFY`: <https://www.postgresql.org/docs/16/sql-notify.html>
- PgBouncer feature compatibility: <https://www.pgbouncer.org/features.html>
- PgBouncer configuration: <https://www.pgbouncer.org/config.html>
- PgBouncer operational usage: <https://www.pgbouncer.org/usage.html>

Where an external reference conflicts with an accepted GigaLibs ADR or certified deployment constraint,
the conflict must be resolved explicitly; it must not be silently interpreted by an implementation agent.
