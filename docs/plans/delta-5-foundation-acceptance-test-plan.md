# Delta 5 foundation acceptance test plan

Status: Proposed under WI-OI-044; G3 design evidence only
Test owner: `qa_spec`
Independent reviewers: Security, IAM/Tenancy, Data, SRE, API Contracts, affected Domain and Product

## 1. Purpose

This plan defines evidence required for each later Delta 5 Build slice. A slice runs only its applicable
tests plus the shared mandatory gates. Passing package tests alone never certifies the foundation.

All test data must be isolated, attributable and non-production. Test records are excluded from customer
value and billing. Real supported PostgreSQL, Redis, object storage, identity/secrets and selected transport
are required for integration certification.

## 2. Evidence format

Each result records:

- test ID, work item, artifact/build digest and UTC time;
- environment/deployment profile and exact dependency versions;
- dataset/volume profile without customer secrets;
- command/harness version and configuration fingerprint;
- expected and observed outcome with raw artifact reference;
- cleanup result and remaining data/resources;
- owner, independent reviewer and limitations;
- requirement, ADR, contract, code/migration and production-metric links.

An unavailable dependency produces `NOT_RUN/BLOCKED`, not a mocked pass.

## 3. F0–F1 governance and design tests

| ID | Test | Pass condition |
| --- | --- | --- |
| D5-GOV-001 | Canonical WIP consistency | Plan, register, work records and governance config agree; verifier passes |
| D5-GOV-002 | Protected C4 integrity | All WI-OI-044 checkpoint hashes match until separately authorized |
| D5-GOV-003 | Existing capability disposition | Every candidate package/path is reuse/extend/replace/quarantine with owner/evidence |
| D5-GOV-004 | Requirement trace | Every P0/P1 requirement has design, acceptance/negative case, test owner and metric |
| D5-GOV-005 | Independent review | Producer is not sole reviewer for tenancy, security, data, migrations, audit or release |
| D5-ADR-001 | Decision consistency | ADR-0001/0002/0005 and deployment decisions have no unresolved ownership conflict |
| D5-CONTRACT-001 | Contract completeness | Context, adapter, filter, job, event, binding, artifact, audit and error schemas are bounded/versioned |
| D5-CONTRACT-002 | Compatibility | Accepted additive/breaking fixtures pass producer-consumer matrix |
| D5-THREAT-001 | Threat coverage | Threats map to prevention, detection, recovery, test and residual-risk owner |

## 4. Cross-boundary context and isolation

| ID | Scenario | Expected result |
| --- | --- | --- |
| D5-CTX-001 | Valid signed synchronous context | Exact tenant/audience/entitlement/scope accepted |
| D5-CTX-002 | Forged, expired, wrong-audience or modified context | Denied with no business effect |
| D5-CTX-003 | Client tenant differs from signed authority | Denied and security signal emitted |
| D5-CTX-004 | User/tenant suspended after job request | Worker blocks before effect and records reconciliation reason |
| D5-CTX-005 | Entitlement/scope revoked after event/job created | Consequential consumer/worker effect denied |
| D5-CTX-006 | Empty scoped-department assignment | Fails closed, never widens to tenant |
| D5-CTX-007 | Cross-tenant IDs across API/job/event/cache/artifact/audit | No read, write, inference, cancel, replay or download succeeds |
| D5-CTX-008 | Secret scanning | No token/credential/connection string in payload, log, trace, error or evidence artifact |

## 5. Governed metadata and adapter slice

| ID | Scenario | Expected result |
| --- | --- | --- |
| D5-META-001 | Same definition compiled repeatedly/reordered keys | Identical canonical manifest/checksum |
| D5-META-002 | Unknown field/type/component/operator | Rejected before persistence/execution |
| D5-META-003 | Arbitrary SQL/code/URL/expression input | Rejected by strict schema/allowlist |
| D5-META-004 | Concurrent draft update/activation | One deterministic winner; stale writers conflict |
| D5-META-005 | Incompatible activation/runtime | Blocked with actionable compatibility error |
| D5-META-006 | Missed invalidation/restart | Cache reload/resync returns authoritative active manifest |
| D5-META-007 | Safe filter AST fuzz | Bounds enforced; only parameterized allowlisted query emitted |
| D5-META-008 | Representative query plans | Accepted cost/latency/resource envelope; required indexes present |
| D5-META-009 | Field removal/type change with values | Usage analysis and migration/deprecation required; no silent loss |
| D5-META-010 | Renderer hostile content/accessibility | Output encoded; critical journey meets accepted WCAG evidence |
| D5-META-011 | Custom-field classification | Redaction/export/retention inherits correct or restrictive default |
| D5-META-012 | Module invariant attack | Adapter cannot bypass module transaction/validation/authorization |

## 6. Durable job slice

| ID | Scenario | Expected result |
| --- | --- | --- |
| D5-JOB-001 | Same idempotency key concurrently submitted | One authoritative job/business operation; duplicate reference returned |
| D5-JOB-002 | Crash before effect | Lease recovery retries safely |
| D5-JOB-003 | Crash after effect before transport acknowledgement | Reconciliation finds effect; no duplicate effect |
| D5-JOB-004 | Redis restart/loss after durable request | Dispatcher reconstructs/repairs delivery from PostgreSQL |
| D5-JOB-005 | Validation/authorization failure | Terminal, not repeatedly retried |
| D5-JOB-006 | Transient dependency failure | Bounded jittered retry then success/terminal/DLQ as designed |
| D5-JOB-007 | Cancel while queued/running | Requested and completed cancellation distinguished; checkpoint consistent |
| D5-JOB-008 | Heartbeat/lease loss | Visible recovery/reconciliation state; no false success |
| D5-JOB-009 | Resume from checkpoint after build upgrade | Compatible resume or explicit blocked migration, never silent reset |
| D5-JOB-010 | Large import/export | Measured bounded memory and transaction size; pagination/checkpoints work |
| D5-JOB-011 | Artifact swap/expiry/malware/checksum failure | Denied/quarantined with no processing/download |
| D5-JOB-012 | Tenant/noisy-neighbor pressure | Fair admission and accepted capacity/SLO envelope |
| D5-JOB-013 | Worker rolling upgrade/drain | No lost acknowledged work; old/new contract compatibility passes |

## 7. Transactional event slice

| ID | Scenario | Expected result |
| --- | --- | --- |
| D5-EVT-001 | Business transaction rollback | No committed business state, audit or outbox fact |
| D5-EVT-002 | Relay crash before publish | Durable pending row is retried |
| D5-EVT-003 | Relay crash after publish before acknowledgement | Duplicate delivery, one consumer effect |
| D5-EVT-004 | Duplicate/reordered/delayed event | Inbox/version policy prevents duplicate or invalid state |
| D5-EVT-005 | Unknown/breaking schema | Quarantined with stable error and operator recovery |
| D5-EVT-006 | Transport outage/backlog | No loss; backlog age alerts and bounded recovery succeed |
| D5-EVT-007 | Notification loss | Poll/reconciliation publishes committed rows |
| D5-EVT-008 | Unauthorized producer/tenant injection | Rejected before inbox/effect |
| D5-EVT-009 | Tenant-bounded replay | Authorized range only; original envelope unchanged; replay audited |
| D5-EVT-010 | Quantitative reconciliation | committed = pending + leased + published/terminal according to policy; consumer counts reconcile |
| D5-EVT-011 | Producer/consumer rolling versions | Accepted compatibility window passes |

## 8. Tenant binding and connection slice

| ID | Scenario | Expected result |
| --- | --- | --- |
| D5-CONN-001 | Missing/ambiguous/suspended/incompatible binding | Fail closed; no fallback database/schema |
| D5-CONN-002 | High-concurrency pool reuse across tenants | No session/context leakage; dirty connection evicted |
| D5-CONN-003 | Shared-schema RLS negative matrix | Cross-tenant reads/writes fail for runtime roles |
| D5-CONN-004 | Schema/dedicated profile routing | Exact approved binding used; topology not disclosed |
| D5-CONN-005 | Stale binding cache during tenant move | Version mismatch blocks/reloads; drain/switch/reconcile succeeds |
| D5-CONN-006 | Credential/certificate rotation | New work uses new version; old revoked; in-flight policy observed |
| D5-CONN-007 | Pooler/database restart/failover/DNS change | Bounded failure and recovery within accepted targets |
| D5-CONN-008 | Aggregate connection saturation | Admission protects reserve and database; no autoscale oversubscription |
| D5-CONN-009 | Listener through deployment topology | Session-capable route works; notification loss still recovers from rows |
| D5-CONN-010 | Migration/backup/restore by isolation profile | Clean install, supported upgrade and single-tenant recovery verified |

## 9. Transactional audit slice

| ID | Scenario | Expected result |
| --- | --- | --- |
| D5-AUD-001 | HTTP/worker/consumer/operator mutation | Each material path creates authoritative audit in owning transaction |
| D5-AUD-002 | Business rollback | No `COMMITTED` evidence for rolled-back effect |
| D5-AUD-003 | Concurrent same-scope audit writes | Unique ordered sequence; no fork or lost record |
| D5-AUD-004 | No proof/sequence gap/hash mismatch | `UNSEALED`/`INCOMPLETE`/`INVALID`, never `VALID` |
| D5-AUD-005 | Secret/custom-field redaction | Prohibited values absent from source/projection/export/logs |
| D5-AUD-006 | Projection outage/loss | Source remains durable; checkpointed rebuild matches counts/hashes |
| D5-AUD-007 | Unauthorized search/export | Denied, rate limited and itself audited as required |
| D5-AUD-008 | Retention/legal hold/offboarding | Accepted policy applied and deletion/retention verified |
| D5-AUD-009 | Archive backup/restore/integrity | Restored evidence verifies against source/checkpoints |
| D5-AUD-010 | Audit write pressure | Accepted latency/connection/storage envelope without bypass |

## 10. Integrated first-adopter journey

The selected adopter must demonstrate in one production-shaped environment:

1. authorized administrator creates and activates one supported extension;
2. module adapter performs a real module-owned mutation under the pinned manifest;
3. the same transaction commits business state, audit and outbox;
4. one consumer processes the fact idempotently;
5. one bounded job processes an artifact/checkpoint and survives an injected crash;
6. every operation resolves the tenant binding and respects admission/pool limits;
7. user sees truthful success, empty, denied, conflict, partial/stale, retry and terminal states;
8. audit reconstruction links actor, policy, configuration, mutation, event, job and artifact; and
9. a second tenant cannot observe or affect any part of the first journey.

## 11. Performance, resilience and recovery profiles

G1/G3 must define representative tenant count, records, custom fields, job/artifact size, concurrency,
event rate/backlog, connection ceiling, retention and dependency latency. Tests capture p50/p95/p99,
throughput, memory, CPU, connections, locks, queue/event age, retries and recovery time.

The baseline NFR targets remain authoritative where applicable, including NFR-PERF-001/002 and
NFR-OBS-004. Any slice-specific value requires measured evidence and named human acceptance; this plan does
not invent defaults.

Required disaster/recovery drills:

- PostgreSQL backup/restore and accepted RPO/RTO scenario;
- Redis loss and reconstruction;
- object storage outage and artifact recovery/expiry;
- event transport outage/backlog recovery;
- audit projection/archive rebuild;
- tenant binding move/credential rotation;
- worker/relay rolling upgrade and abrupt loss.

## 12. Mandatory repository gates

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

Run slice-specific certifications from `.pi/PLAN.md` plus exact work-item commands. Evidence must identify
commands that were blocked or not applicable; omissions cannot be reported as passes.

## 13. Release decision

A slice cannot pass G5/G6 until:

- every applicable P0 test passes with real supported infrastructure;
- no open P0/P1 defect or unresolved critical risk remains;
- migration/recovery, tenant-negative, security, performance, resilience and accessibility evidence passes;
- dashboards, alerts, runbooks, support and on-call ownership are exercised;
- SBOM/provenance and immutable artifacts exist;
- named independent reviewers record decisions; and
- human Product Owner and release authority approve the exact artifact/profile/cohort.

G7 completes only after the accepted production observation window meets SLO and value criteria.
