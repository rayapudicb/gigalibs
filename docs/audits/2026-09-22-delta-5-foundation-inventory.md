# Delta 5 foundation inventory and disposition

Status: WI-OI-044 G0–G1 evidence
Method: targeted exported-interface, schema-symbol and runtime-path inspection; not production certification
Protected scope: CMMS import/export C4 files listed in `.pi/work/WI-OI-044.md` were not opened or changed

## Decision key

- **Reuse:** canonical base; preserve behavior and compatibility.
- **Extend:** canonical base with an identified gap for a later bounded Build item.
- **Adapter:** retain runtime but conform through the Delta 5 contract.
- **Contain:** do not promote as a foundation until separately reconciled.
- **Replace by migration:** only after accepted ADR, compatibility, evidence and recovery.

## Inventory

| Capability/path | Observed state | Disposition | Required next evidence |
| --- | --- | --- | --- |
| `packages/contracts/src/auth/platform-context.ts` | Strict signed-context schema with tenant, session/auth version, scopes, org scope and entitlement | Reuse | Async reference/revalidation fixtures; audience/tenant negative matrix |
| `packages/auth-core/src/platform-context.ts` | Asymmetric signing/verification implementation and tests exist | Reuse | Deployment key rotation/revocation and cross-runtime compatibility |
| `packages/configuration-core` | Deterministic compiler, validation and compatibility policy exist | Reuse | Independent review and adopter conformance; no parallel compiler |
| `packages/contracts/src/configuration` | Bounded schemas, surface registration, immutable versions, values and response contracts exist | Reuse/extend | Add accepted adapter descriptor/filter contract through later contract work |
| `packages/configuration-react` | Allowlisted renderer exists | Reuse | Adopter accessibility/security/version evidence |
| Configuration persistence in `packages/db` | Change sets, versions, activation, extension values, idempotency, records/templates/filters exist | Reuse | Profile-specific migration/recovery and adopter value ownership review |
| Configuration Studio services in `apps/playground-api` | Real APIs, activation, cache and outbox/invalidation paths exist | Reuse/extend | Human review, profile certification, recovery/observability gaps from WI-OI-039 |
| Configuration `NOTIFY` consumer | Dedicated listener and authoritative reload behavior exist | Reuse for invalidation | Keep session-capable route; prove missed-notification resync per profile |
| `packages/queue` | BullMQ queue/worker factories, retry defaults and named DTOs exist | Extend | Durable PostgreSQL job control, tenant context, leases, checkpoints, cancellation, reconciliation |
| `packages/queue/src/job-types.ts` | Some DTOs embed destination, attachment, endpoint, webhook secret or source mapping data | Replace by compatible v1 references | Credential/payload minimization tests and staged producer migration |
| Module BullMQ workers | Several module/control workers exist | Adapter/incremental migration | Inventory selected path only; crash/idempotency/upgrade evidence |
| FastAPI/Celery workers | Separate execution runtime exists | Adapter | Same durable control semantics or accepted bridge; no automatic rewrite |
| `packages/event-bus` | EventEmitter2 process-local bus explicitly intended for same-process events | Reuse locally only | Prevent use as durable cross-instance path; post-commit/loss semantics documented |
| `apps/playground-api/src/control-outbox.worker.ts` | PostgreSQL outbox lease/retry/failure logic exists | Reuse pattern/extend | Canonical envelope, transport adapter, durable consumer inbox and reconciliation |
| Module-specific outboxes | Multiple local transactional patterns exist | Extend one producer at a time | Ownership/envelope/lease/retry/DLQ/replay matrix for selected adopter |
| Durable consumer inbox | No single canonical shared contract identified in exported inventory | Add in selected module | Unique consumer/event receipt and atomic effect tests |
| `packages/storage-core` | Upload, presigned URL and delete abstraction exists | Extend | Tenant/classification/checksum/scan/expiry/encryption descriptor and denial tests |
| Module-specific storage | S3/object and in-memory patterns coexist | Adapter or contain | Real supported provider evidence; production in-memory artifact stores remain P0 blockers |
| `TenantIsolationBinding` in `packages/db` | Desired/effective isolation, status, region and non-secret binding reference exist | Reuse/extend | Versioned deployment/service binding, workload/pool policy, move/rotation lifecycle |
| Tenant-aware repositories/services | Several transaction-scoped paths exist | Reuse pattern | One canonical resolver interface and pool-contamination certification |
| PgBouncer/profile topology | Not a universal application guarantee | Deployment decision | Exact mode/version/driver/session/listener certification per profile |
| `packages/audit-core` | Diff, canonical hashing and chain verification helpers exist | Reuse/repair | Schema-aware redaction; fail-closed verification states; concurrency tests |
| `packages/audit-nest` | Service/controller/decorator plus audit-chain write exist | Extend/contain as sole writer | Current read-last/insert chain is concurrency unsafe and not transaction-coupled to every mutation |
| Direct module transaction audit writes | Many control-plane/domain services write audit within transactions | Reuse pattern | Coverage inventory and common envelope/redaction/integrity conformance |
| Analytics audit `recordAuditEvent` | Module-specific path exists; tests document swallowed audit errors | Contain from foundation claims | Must not certify fire-and-forget audit for material effects |
| Audit projection/archive | No canonical rebuildable projection/archive contract identified | Add after design acceptance | Checkpoint, integrity, retention/hold and restore tests |
| `packages/privacy-gdpr` inventory | Data inventory and portability classifications exist | Reuse/extend | Add foundation records/artifacts and deletion/hold/offboarding rules |
| `packages/health` queue/database signals | Common indicators exist | Reuse/extend | Delta 5 state/backlog/integrity/pool metrics and bounded labels |
| `packages/broker` adapters | Broker source exists with broad claims | Contain pending separate evidence | Do not make default transport without ownership, deployment and DR ADR |
| Analytics G4 paths under WI-OI-043 | Implementation evidence exists with contained credential/artifact P0 stubs | Review only | Human review and real replacements; not a Delta 5 reference adopter yet |
| CMMS import/export files marked WI-OI-043 | Product-boundary attribution conflict; paused user work | Frozen/contain | Separate authorized attribution and later adapter work item only after foundations |

## Current conclusions

1. No new metadata engine, identity context, queue library, event emitter, storage abstraction, tenant
   registry or audit package should be created in F1.
2. The highest-risk gaps are semantic and operational: durable job truth, async reauthorization, inbox
   deduplication, tenant connection budgeting, artifact governance and concurrent audit integrity.
3. The first Build slice should add the minimum missing mechanisms to one low-risk adopter rather than
   redesign every existing package.
4. `@gigalibs/event-bus` remains useful but must never be confused with a durable integration bus.
5. The existing audit chain must not be marketed as tamper-evident under concurrent production writes until
   sequence allocation and unsealed/incomplete verification are repaired and certified.
6. Existing code and test claims remain evidence candidates; none of this inventory grants G5/G6 status.

## F1 routing

| Gap | Primary role | Required independent review |
| --- | --- | --- |
| Adapter/filter/value ownership | `solution_architecture`, `api_contracts`, adopting `backend_domain` | Security, Data, QA, affected Domain |
| Durable jobs/artifacts | `backend_domain`, `infrastructure_observability`, `data_portability` | IAM, Security, QA |
| Outbox/inbox/transport | `backend_domain`, `api_contracts`, `infrastructure_observability` | Architecture, Security, QA |
| Binding/pools | `tenant_identity_access`, `infrastructure_observability` | Backend/Data, Security, QA |
| Audit integrity/projection | `backend_domain`, `data_portability`, `tenant_identity_access` | Security, Legal/Privacy human, QA |

The next inspection is selected by the accepted first adopter. Broad rescanning is not required.
