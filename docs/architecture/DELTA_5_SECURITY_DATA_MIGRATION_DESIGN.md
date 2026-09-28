# Delta 5 security, data, migration and recovery design

Status: Proposed under WI-OI-044; independent review required
Architecture decision: `ADR-0005-delta-5-foundation-convergence.md`
Contract baseline: `docs/contracts/delta-5-foundation-contracts-v1.md`

## 1. Trust boundaries

| Boundary | Trusted input | Mandatory validation | Authority after crossing |
| --- | --- | --- | --- |
| Browser/client → BFF/API | signed session/token | identity, session/auth version, membership, tenant, entitlement, scope, object access | API request only |
| Control plane → module API | signed `PlatformContextV1` | signature, issuer/audience/expiry plus current tenant/user/entitlement state | requested module capability |
| API → job transport | committed job ID and minimal async authority ref | durable job/context/binding reload | no effect until worker reauthorizes |
| Outbox → transport | committed immutable event envelope | lease/version/schema/classification | delivery only |
| Transport → consumer | event ID/envelope | schema, producer, tenant, inbox receipt, current policy | consumer-local effect only |
| Runtime → database | resolved binding and service role | tenant/deployment/status/version/workload policy | one transaction |
| Runtime → object store | tenant-bound artifact descriptor | purpose, classification, checksum, expiry, actor authorization | one upload/download operation |
| Module audit → projection/archive | committed audit outbox | envelope, redaction, integrity sequence/checkpoint | projection/archive only |

No downstream component trusts a tenant, actor, role, scope, database, object key or credential merely
because an upstream payload supplied it.

## 2. Data ownership

| Data | Authoritative owner | Projection/cache rule |
| --- | --- | --- |
| Identity, tenant, membership, entitlement | control plane per ADR-0001 | signed context is short-lived evidence; revalidate material async effects |
| Configuration definitions/manifests | existing Configuration Studio persistence | process cache bounded; PostgreSQL reload on uncertainty |
| Custom business values | adopting module | configuration service never becomes business record store |
| Job lifecycle/effect | owning module or accepted job-control owner | Redis/BullMQ is transport only |
| Domain event | producing module outbox | transport copies; consumers own inbox/local projection |
| Tenant isolation binding | control plane `TenantIsolationBinding` authority | versioned bounded cache, fail closed |
| Artifact metadata | owning module/job control | object store contains bytes; descriptor is business evidence |
| Audit evidence | module transaction | central search/archive is rebuildable projection |
| Telemetry | observability platform | not authoritative business or audit evidence |

Direct cross-module SQL is prohibited. Integration occurs through versioned APIs, events, fact contracts or
approved export/import paths.

## 3. Data classification and minimization

Classification inherits the highest classification of source fields and context. Unknown tenant-defined
field classification defaults to `RESTRICTED` until resolved.

| Surface | Allowed content | Prohibited content |
| --- | --- | --- |
| Queue command | IDs, bounded enums, checksums, artifact/context references | credentials, attachment bytes, raw rows, unrestricted URLs |
| Event payload | minimum completed fact needed by registered consumers | secrets, full source records by convenience, unrelated PII |
| Audit change set | allowlisted schema-aware diff after redaction | credential/token/key values, large binary data |
| Logs/traces | stable codes, bounded IDs according to policy, correlation | raw payloads, secrets, personal values, signed tokens |
| Metrics | bounded dimensions | tenant/user/record/event IDs as unbounded labels |
| Artifact descriptor | metadata/checksum/classification/retention | raw credential or public customer-data URL |

## 4. Authorization and tenant isolation

- Tenant ID is server-derived from verified authority and compared at every record/message/artifact boundary.
- The adapter permission map is code-owned. Layout visibility is never authorization.
- Workers and consumers use workload identities with only the owning capability; they cannot impersonate the
  original human.
- Current tenant/user suspension, entitlement, approval and database binding are checked before material
  async effects.
- Runtime database roles cannot own tables, bypass RLS or run migrations.
- Composite tenant keys and tenant-safe foreign keys are required where the selected schema pattern uses
  shared storage.
- RLS is defense in depth; repository predicates and object authorization remain mandatory.
- Cross-tenant identifiers return denied/not-found according to the accepted disclosure policy and always
  create bounded security telemetry.

## 5. Secrets

- Store only secret-manager references in bindings, jobs, events, configuration and audit.
- Separate read and write credentials for external systems where providers support it.
- Rotation changes binding/credential version and invalidates runtime caches without exposing bytes.
- Missing, revoked or incompatible credentials block the operation with a stable error and reconciliation
  path; there is no local fallback credential.
- Error causes, telemetry and artifacts are scanned/tested for connection strings, private keys, access
  tokens, webhook secrets and signed platform-context tokens.

## 6. Threat/control matrix

| Threat | Prevent | Detect | Recover/test |
| --- | --- | --- | --- |
| Tenant/context forgery | signed context, server resolution, equality checks | denied-context metric/audit | cross-tenant fuzz and negative E2E |
| Stale async authority | auth/entitlement/binding revalidation | blocked job/event reason | revoke/suspend between request and execution |
| Metadata injection | strict schema, allowlists, safe AST, output encoding | validation findings | property/fuzz, SQL/template/XSS cases |
| Expensive configured query | AST limits, query class, pagination, admission | latency/rows/cost alerts | representative plan/load tests |
| Duplicate job effect | idempotency receipt, uniqueness, transaction | duplicate/reconcile metric | crash before/after effect/ack |
| Lost event | local outbox in business transaction | outbox age/count reconciliation | transport outage and relay crashes |
| Duplicate/reordered event | inbox receipt, aggregate version/sequence | duplicate/gap telemetry | replay/reorder suite |
| Pool tenant leakage | transaction-local context, checkout assertions, role/RLS | eviction/security signal | high-concurrency pool reuse test |
| Queue/backlog DoS | quotas, fairness, admission, bounded retry | age/depth/saturation alerts | noisy-neighbor and poison storm |
| Artifact substitution | server key, checksum, tenant descriptor, scan | checksum/scan failure | swap/cross-tenant/expired grant tests |
| Audit omission | same transaction and coverage inventory | mutation-to-audit reconciliation | rollback and every-entry-path tests |
| Audit fork/tamper | locked sequence/unique scope/hash chain/archive | integrity verifier | concurrent writes, mutation/deletion, restore |
| Projection/cache poisoning | authoritative reload, signed/versioned input | divergence/rebuild metric | cache/projection loss and rebuild |

Residual critical risk cannot be accepted by the producer agent.

## 7. Persistence decisions for later Build slices

Exact physical names are assigned only by the owning Build item. Required logical constraints are:

### Metadata adopter

- immutable definition/manifest/version references;
- one active version per exact scope with optimistic concurrency;
- module-owned extension values with schema/checksum/record version;
- adapter registration is code-owned and cannot be tenant-mutated.

### Jobs

- unique `(tenant, module, operation, idempotency_key)` receipt;
- state/version compare-and-swap;
- unique attempt number per job;
- lease owner/expiry and checkpoint version;
- artifacts linked by tenant-safe key;
- append-only command/transition history.

### Events

- unique immutable event ID in module-owned outbox;
- lease/retry state without mutating envelope;
- unique `(consumer_id, event_id)` inbox receipt;
- optional unique aggregate sequence where the producer promises ordering;
- quarantine and reconciliation state retained by policy.

### Tenant bindings

- one compatible active binding per exact tenant/deployment/service scope;
- immutable version history and compare-and-swap activation;
- secret reference and topology IDs, never credential bytes;
- state-machine constraints for drain/move/rotation/recovery.

### Audit

- append-only application permissions;
- unique `(chain_scope, sequence)`;
- transaction-safe previous-hash/sequence allocation;
- source event/command idempotency;
- immutable integrity proof and projection/archive checkpoint.

## 8. Migration sequence

Every behavior-changing slice uses:

1. **Expand:** add compatible records/indexes/constraints without switching behavior.
2. **Dual compatibility:** deploy code that can read the old state and write/reconcile the new form only
   where explicitly required.
3. **Backfill:** tenant-bounded resumable job with checkpoint, rate limit, audit and checksum/count evidence.
4. **Verify:** record counts, tenant ownership, constraints, semantic checksums, query plans and restore.
5. **Activate:** cohort/version switch with observable preconditions and halt threshold.
6. **Observe:** accepted window covering latency, errors, saturation, backlog, integrity and value.
7. **Contract:** remove old path only after rollback window and consumer compatibility close.

Applied migrations are never edited. Recovery favors roll-forward; destructive rollback requires an
explicit approved procedure and verified backup.

## 9. Deployment and connection model

Certify managed-cloud and customer-managed profiles separately. Each environment declares exact supported
PostgreSQL, Redis, object store, driver, pooler and transport versions.

Connection budget:

```text
database ceiling
- admin/migration/replication reserve
- failover/recovery reserve
= allocatable application connections

sum(API + workers + relays + listeners + analytics/query by max replicas)
<= allocatable application connections
```

Autoscaling and worker concurrency cannot exceed this model. Long jobs use checkpoints and bounded
transactions. PgBouncer transaction pooling cannot carry `LISTEN`, session-dependent behavior or an
uncertified driver/prepared-statement combination.

## 10. Failure and recovery invariants

- Database commit succeeds but enqueue/publish fails: dispatcher repairs from durable pending rows.
- Transport delivers twice: idempotency/inbox prevents duplicate effect.
- Worker dies during effect: lease expires; next attempt reconciles before retry.
- Redis is lost: job/outbox state remains reconstructable from PostgreSQL.
- Object store is unavailable: job remains retryable/failed with no fabricated artifact.
- Binding cache is unavailable/stale: authoritative reload or fail closed.
- Audit projection/archive is unavailable: module transaction follows accepted policy; source audit remains
  durable and projection is rebuilt later. Required compliance export outage is visible.
- Configuration invalidation is missed: bounded cache bypass/reload/resync restores authoritative state.
- Incompatible schema/runtime: operation is blocked or quarantined; never coerced silently.

## 11. Retention, hold and offboarding

Data Portability must approve a matrix by data class and deployment profile covering:

- configuration definitions and historical manifests;
- business extension values and immutable snapshots;
- job records, checkpoints, error artifacts and outputs;
- outbox/inbox/quarantine/replay evidence;
- database binding and credential-rotation history;
- audit source, projection and integrity archive;
- logs, metrics and traces.

Legal hold overrides normal deletion only through an authorized, auditable state. Tenant offboarding
disables new authority, drains/reconciles work, exports permitted data, expires credentials/grants, deletes
according to policy and verifies deletion without destroying retained legal evidence.

## 12. Required runbooks

- stuck/duplicate/cancelled/poison job and queue loss;
- outbox backlog, consumer quarantine, replay and reconciliation;
- database saturation, binding failure, credential rotation, tenant move and failover;
- configuration incompatibility and cache resync;
- audit integrity alert, projection rebuild, archive restore and retention/hold;
- artifact malware/checksum/storage outage and expired grant;
- rollout halt, worker drain, rollback/roll-forward and tenant offboarding.

## 13. Open human decisions before G4

1. First low-risk adopter and measurable outcome.
2. Named independent reviewers.
3. Exact job-control physical ownership for the first adopter.
4. Supported deployment profiles and concrete infrastructure versions.
5. Pool, timeout, quota, capacity, SLO, RPO and RTO values backed by representative evidence.
6. Audit chain scope, archive/integrity technology and legal retention/hold conclusions.
7. Event retention/replay window and future broker threshold.
8. Artifact malware-scanning and encryption/key-management provider per profile.

These are blockers to Build, not blanks an implementation agent may fill.
