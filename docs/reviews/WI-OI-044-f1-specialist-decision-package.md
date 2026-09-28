# WI-OI-044 F1 specialist decision package

Status: Proposed technical baseline for independent review; not specialist acceptance or G4 authorization

Date: 2026-09-22

Decisions: D5-F1-014 through D5-F1-022

Applies to: the future Tenant Profile reference journey and the current Local Development Configuration
Profile only

Owner amendment: use the existing Docker/PostgreSQL/MinIO locally. Customer-Managed production and Managed
Cloud are deferred until their infrastructure is selected. F2-local certifies Configuration
deployment/lifecycle; F3/TP-1 certifies Tenant Profile values.

## 1. Decision method

This package turns the remaining F1 blanks into testable recommendations. Values are based on the adopted
NFRs, current runtime bounds, checked-in alerts/runbooks and the isolated local Configuration performance
result. They are entry targets for real-profile testing, not claims that production evidence already exists.

Independent Security/Privacy, Backend/Data, IAM/Tenancy, Data Portability/Privacy, SRE and QA humans must
accept, change or reject the applicable rows. Any changed value must retain the requirement, test and
operational rationale.

Evidence used:

- NFR-PERF-001/002/003, NFR-REL-001/002/003 and NFR-OBS-004;
- `docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-performance-result.json`;
- `docs/runbooks/database-disaster-recovery.md`;
- `docs/runbooks/configuration-studio-operations.md`;
- `.env.example`, `apps/playground-api/src/config/runtime-config.ts` and
  `apps/playground-api/src/tenant-export-config.ts`;
- `apps/playground-api/src/configuration-manifest.cache.ts` and
  `apps/playground-api/src/configuration-invalidation.consumer.ts`;
- `infra/prometheus/alerts.yml`; and
- the WI-OI-047 deployment architecture, contract and acceptance plan.

## 2. D5-F1-014 — representative certification volume

### 2.1 Minimum F2 profile

| Dimension | Required certification input |
| --- | --- |
| Tenant isolation | Two tenants with distinct administrators, members and viewers; one suspended member |
| Definition size | 250 fields, 20 required fields, three sections and 20 projected columns |
| Configuration state | 100 attributable definition/activation operations for the primary tenant and 25 noisy-neighbor operations at minimum |
| Concurrency | 10 concurrent reads, five concurrent writes and 16 competing edits to one version |
| Read sample | 100 warm manifest reads, 80 reads during edits, 30 projected reads and 40 reads during neighbor writes |
| Artifact | Signed Configuration package at the accepted bounded JSON body limit; no arbitrary/binary upload |
| Outbox load | 10 committed events/second sustained for 15 minutes and 25 events/second for a five-minute burst |
| Process shape | Local Development: one API and one web instance; no HA or production availability claim |
| Failure load | Repeat the profile during one API loss, listener disconnect, database interruption and object-storage outage |

The prior local run used PostgreSQL 16.14, one API replica, 10 read/five write concurrency and recorded
warm manifest p95 30.236 ms, mixed manifest p95 78.377 ms, projected-read p95 260.818 ms and noisy-neighbor
read p95 262.524 ms. This is characterization only. F2 must rerun the profile from immutable artifacts in
the accepted Local Development deployment shape.

Passing this profile supports only this bounded reference tier. It does not certify larger tenants or the
Analytics, workflow execution, connector, CMMS or financial workloads.

Tenant Profile value/export workload rows in later sections are F3/TP-2 targets retained for the accepted
foundation design; they are not F2 exit claims.

## 3. D5-F1-015 — service objectives

### 3.1 Local Development

| Indicator | Proposed objective | Measurement window |
| --- | --- | --- |
| API/web readiness availability | Measured and reported; no 99.9% claim | Entire certification/observation window, including documented host downtime |
| Configuration Studio browser interaction | p95 under 2 seconds | Rolling five minutes and observation report |
| Configuration GET API | p95 at or below 500 ms; p99 at or below 1 second | Rolling five minutes under the accepted profile |
| Configuration mutation API | p95 at or below 1 second; p99 at or below 2 seconds | Rolling five minutes, excluding asynchronous export completion |
| Activation-to-local-process convergence | p95 at or below 5 seconds; maximum 30 seconds | From commit timestamp to the API returning the checksum |
| Tenant-export request acceptance | p95 under 2 seconds | Request to durable job identifier |
| Bounded tenant-export completion | 10 MiB-or-smaller reference artifact within five minutes | Durable acceptance to signed artifact Ready |
| HTTP 5xx | Less than 1% | Rolling five minutes, excluding caller-caused 4xx |
| Lost acknowledged state | Zero | Entire certification and observation window |
| Cross-tenant disclosure or effect | Zero | Entire lifecycle |

The tenant-export objectives apply when TP-2 is authorized and are not required to claim F2 completion.

The single-instance reference profile carries **no 99.9% availability claim**. Host maintenance or loss
causes downtime. A customer or later cloud profile may claim 99.9% only after a separately certified HA
extension proves replica, database, storage, network and operator responsibilities.

## 4. D5-F1-016 — recovery objectives

Only local integrity and recovery measurements are required now. Numeric production RPO/RTO, external
backup and cross-host recovery rows are `DEFERRED_EXTERNAL`.

| State/dependency | Local Development target | Verification rule |
| --- | --- | --- |
| PostgreSQL authoritative state | No production RPO claim; measure local dump/restore duration | Restore to a clean local database; checksum and migration history verification |
| API/web process loss | RPO 0; process recovery under 15 minutes on an intact host | No committed state is process-local; downtime is reported |
| Configuration invalidation/cache | RPO 0; convergence under 5 minutes | PostgreSQL remains authoritative; disconnected listener immediately bypasses cache |
| Object-storage artifacts | No production RPO/RTO claim | Verify MinIO outage is explicit and local persisted objects survive container restart |
| Audit source records | Same RPO/RTO as PostgreSQL | Audit source commits with the material change |
| Audit projection/archive | Release-deferred | Local source records remain authoritative; external archive is `DEFERRED_EXTERNAL` |

WAL archiving, encrypted independent backup storage and cross-host restore remain required before any
production claim. Their absence is accepted only because this profile is explicitly development/demo.

## 5. D5-F1-017 — connection and admission budget

F2 uses direct PostgreSQL connections. PgBouncer remains outside the current profile until a session-aware routing
and driver compatibility certification exists.

### 5.1 Local Development budget

| Budget | Connections |
| --- | ---: |
| Configured database ceiling | 100 |
| Administration/migration/recovery reserve | 30 |
| Allocatable application ceiling | 70 |
| One API process, maximum pool | 20 |
| Dedicated `LISTEN` session | 1 |
| One-shot migration maximum | 5 |
| Backup/metrics/operator tooling maximum | 5 |
| Planned total | 31 |
| Unallocated application/failure headroom | 39 |

F2 must make the pool maximum machine-verifiable; an unconsumed Helm `poolSize` value is not credited.
Scale-out or a future cloud profile requires recalculating the aggregate budget and rerunning
saturation/noisy-neighbor tests.

Admission begins rejecting new non-critical work with a retryable capacity error before 80% of the database
ceiling or before either reserve is consumed. Migrations and recovery never borrow the application pool.

## 6. D5-F1-018 — timeouts, retry and cache policy

| Control | Proposed production value |
| --- | --- |
| BFF → Control Plane request timeout | 10 seconds; no automatic mutation replay |
| BFF request body | 1 MiB maximum |
| Database connection establishment | 5 seconds |
| Interactive database statement timeout | 5 seconds |
| Interactive lock wait | 1 second |
| Interactive transaction timeout | 10 seconds |
| Tenant-export repeatable-read snapshot | 120 seconds maximum |
| Manifest cache age | 30 seconds only while listener is connected; otherwise immediate bypass |
| Listener reconnect | Exponential from one second to 30 seconds maximum |
| Control outbox | poll 2 s; batch 50; claim 60 s; 10 attempts; exponential retry 2–300 s |
| Tenant export | poll 10 s; batch 2; claim 300 s; five attempts; exponential retry 10–900 s |
| Signed export expiry | 168 hours; expired object/grant unavailable |
| S3 presigned URL | 300 seconds in production |
| F2 artifact ceiling | 10 MiB |
| Storage cleanup | every 60 seconds, batch 100 |
| Access/refresh session policy | access 15 minutes; refresh 30 days; current authority checked on use |

Only idempotent reads or operations carrying the original accepted idempotency key may retry automatically.
Validation, authorization, incompatibility and integrity failures are terminal. A network timeout after a
mutation is an unknown outcome and must be reconciled before retry.

## 7. D5-F1-019 and D5-F1-020 — retention, hold and archive proposal

This is a technical default, not a legal conclusion. Privacy/Legal and Data Portability must confirm or
replace every duration for the selling jurisdictions and customer contracts.

| Record class | Online retention | Archive/expiry | Hold/offboarding rule |
| --- | --- | --- | --- |
| Active configuration and Tenant Profile values | Tenant lifecycle | Delete after authorized offboarding/erasure verification unless held | Hold applies only to identified records; new authority is disabled at offboarding |
| Superseded manifests, approvals and activations | 365 days online | Integrity archive for seven years | Preserve exact checksum and reviewer lineage under hold |
| Job/idempotency/transition records | 90 days online | Transition evidence 365 days; then delete unless held | Retain longer than all retry/reconciliation windows |
| Signed tenant-export artifact | Seven days | Hard-delete object and expire every grant; descriptor retained 90 days | Hold requires a separate authorized retained copy, never extending a public grant |
| Successful outbox/inbox receipt | 30 days after reconciliation | Delete after count/checkpoint verification | Held incident range is preserved |
| Failed/quarantined event evidence | 90 days after terminal reconciliation | Archive incident evidence if required | No deletion while unresolved or held |
| Tenant-binding and credential-version history | 365 days online | Security archive for seven years | Secret bytes are never archived in business/audit records |
| Authoritative audit evidence | 365 days searchable | Seven-year integrity archive | Legal hold suspends deletion for the exact scope; access remains audited |
| Application logs | 30 days searchable | Delete by 90 days | No payload/secret values; incident hold is explicitly scoped |
| Distributed traces | Seven days | Delete | No raw customer values or credentials |
| Metrics | 13 months | Delete/aggregate according to policy | Bounded labels only; not audit evidence |
| PostgreSQL PITR/backup | 35 rolling days | Monthly recovery checkpoint for 12 months where approved | Encrypted; offboarding deletion follows backup-expiry evidence unless held |

Deletion jobs record policy/version, counts, object/database outcomes and failures without copying deleted
content into audit. Failed deletion remains visible and retryable. A legal hold requires authorized create,
release and periodic review; it never silently applies to an entire platform.

## 8. D5-F1-021 — artifact, encryption and provider boundary

### 8.1 Local Development profile

- S3 Signature Version 4 compatibility remains mandatory. Loopback/local-Docker HTTP is permitted only in
  this profile; TLS/hostname/CA verification is `DEFERRED_EXTERNAL`.
- Buckets deny public access, require default server-side encryption, enable versioning where recovery or
  integrity needs it, and use least-privilege per-deployment credentials.
- Application payload keys are AES-256, versioned and injected by secret reference. Configuration/export
  signatures use Ed25519 with key IDs and a bounded trusted-public-key ring.
- Keys come from a mode-0600 ignored local secret file or process injection. External KMS is
  `DEFERRED_EXTERNAL`.
  Raw keys never appear in profile values, images, evidence or logs.
- Application encryption keys rotate at least every 90 days; signing keys at least every 180 days. Emergency
  revocation is immediate. Prior verification/decryption keys remain only for the documented compatibility
  window and are removed after rewrap/expiry verification.

### 8.2 Artifact media and scanner decision

F2 accepts only strict, size-bounded, signed JSON Configuration packages and platform-generated signed
tenant exports. Unknown media types and arbitrary binary uploads are unavailable. Configuration imports
fail closed on schema, checksum, signature or trust failure before any state change.

No malware-scanner runtime is added or credited in F2. Platform-generated exports record
`NOT_APPLICABLE_PLATFORM_GENERATED`; strict JSON packages record the applicable signature/schema result,
not a fabricated malware-scan success. Any future arbitrary upload or binary package work item must select,
review and certify a real scanner before that path becomes reachable.

## 9. D5-F1-022 — rollout, halt and observation

### 9.1 Sequence

1. Clean-start and sequential-upgrade verification in an isolated Local Development profile.
2. Complete the local failure-injection and recovery matrix.
3. Freeze local evidence and move WI-OI-047 to Review after independent acceptance.
4. Canary, cohort and G7 production observation are `DEFERRED_EXTERNAL` until a production target exists.

### 9.2 Immediate halt conditions

Halt rollout and preserve evidence on any:

- cross-tenant read, write, inference, cache, audit or artifact access;
- production-reachable mock/fake/default tenant or local-only business persistence;
- lost acknowledged state, duplicate consequential effect or invalid/incomplete audit reported as valid;
- migration mismatch/failure, unverified backup, restore integrity failure or exceeded RPO/RTO;
- exposed credential/private key/token or critical unaccepted vulnerability;
- local application image/source-revision mismatch, unrecorded local image ID or a production artifact
  presented without its required signature/provenance;
- Configuration checksum divergence between replicas after 30 seconds;
- failed outbox record or pending age above 300 seconds;
- listener disconnect longer than two minutes without verified cache bypass; or
- operator inability to execute the documented recovery without direct business-row edits.

### 9.3 Numeric halt thresholds

- HTTP 5xx above 1% for five consecutive minutes.
- Configuration browser p95 above two seconds for five consecutive minutes.
- API p99 above one second for five consecutive minutes, unless an accepted dependency-specific exception
  is active and the browser SLO remains met.
- Database connections at or above 80% of the configured ceiling for five minutes, or any reserve consumed.
- CPU above 85% or memory above 90% of limit for 10 minutes with rising latency/backlog.
- Export/job oldest runnable age above five minutes at the accepted load.
- Any alert required by the acceptance plan that cannot fire, route, link to a runbook and resolve.

Restarting the rollout requires a documented cause, corrected immutable artifact, rerun of affected tests
and independent approval. A threshold is never raised during an incident to make the release pass.

## 10. Independent specialist decision table

One actual human may cover multiple responsibilities only when organizational policy permits it. Each row
records the exact sections and evidence reviewed.

Recorded Product and Architecture decision:

| Human name | Responsibility | Decisions | Decision | Conditions/findings | Date |
| --- | --- | --- | --- | --- | --- |
| Chinni babu Rayapudo | Product Owner / Solution Architecture | D5-F1-014–022 | Accept | Subject to measured verification during F2; specialist authorities are not waived | 2026-09-22 |
| Chinni babu Rayapudo | Product Owner / Solution Architecture | Local-profile and F2/F3/scanner amendments to D5-F1-014–022 | Accept | Ultimately narrowed to Local Development; external release infrastructure deferred; Configuration lifecycle only; no scanner | 2026-09-22 |
| Chinni babu Rayapudo | Local operator | D5-F1-014–018, 021–022 local Build entry | Accept | Existing Docker/PostgreSQL/MinIO only; measured LOCAL-2–LOCAL-5 verification remains required | 2026-09-22 |

Remaining specialist decisions:

| Human name | Responsibility | Decisions | Decision | Conditions/findings | Date |
| --- | --- | --- | --- | --- | --- |
| **TBD** | Security & Privacy | D5-F1-015, 018–022 | Accept / Conditional / Reject | _required_ | YYYY-MM-DD |
| **TBD** | Backend/Data | D5-F1-014, 016–018, 020, 022 | Accept / Conditional / Reject | _required_ | YYYY-MM-DD |
| **TBD** | IAM/Tenancy | D5-F1-014, 018–020, 022 | Accept / Conditional / Reject | _required_ | YYYY-MM-DD |
| **TBD** | Data Portability / Privacy or Legal | D5-F1-019–021 | Accept / Conditional / Reject | _required_ | YYYY-MM-DD |
| **TBD** | API Contracts | D5-F1-014, 015, 018 | Accept / Conditional / Reject | _required_ | YYYY-MM-DD |
| **TBD** | Web/Accessibility | D5-F1-014, 015, 022 | Accept / Conditional / Reject | _required_ | YYYY-MM-DD |
| **TBD** | QA/SDET | D5-F1-014–022 | Accept / Conditional / Reject | _required_ | YYYY-MM-DD |

## 11. Current recommendation

The values are specific enough for independent review and implementation planning. They are not certified
and do not close F1. F1 remains No-Go until the named specialists accept or revise them and every accepted
value is reflected consistently in WI-OI-047's deployment contract, test plan and later implementation.
