# WI-OI-044 — Delta 5 foundation governance and contract baseline

Status: Review
Gate: G1–G3 Review; no G4 Build authorization
Owner: SDLC Orchestrator / Solution Architecture
Requirements: FR-01–FR-05, FR-08–FR-12, FR-14–FR-16; NFR-GOV-001–003,
NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003,
NFR-OBS-001–004, NFR-UX-001–002, NFR-OPS-001–004
Independent reviewers: Security & Privacy, Backend/Data, IAM/Tenancy, Data Portability,
Infrastructure/SRE, API Contracts, QA/SDET, Product
North Star: `docs/plans/delta-5-platform-foundations-north-star-implementation-plan.md`

## 1. Owner direction and boundary

On 2026-09-22 the repository owner directed the currently paused Phase 4/import-extension work to remain
undisturbed and prioritized completion of the shared foundations first.

This work item authorizes only:

- F0 governance reconciliation, provenance capture and existing-capability inventory; and
- F1 requirements, ADR, threat, contract, migration and independent test design.

It does not authorize product code, schema migrations, dependency changes, a new service, a module adapter,
or release activity. Each behavior-changing Delta 5 slice requires a separate stable work item, accepted
Definition of Ready and explicit sole-Build handoff.

## 2. Outcome

Produce an accepted, implementation-ready baseline for five shared foundations without duplicating the
existing configuration, queue, event, tenancy, storage or audit capabilities:

1. governed metadata and module adapters;
2. durable asynchronous jobs;
3. transactional events;
4. tenant-aware connection governance; and
5. transactional audit evidence.

The baseline must identify authoritative owners, reuse points, contracts, security boundaries, persistence,
migrations, compatibility, failure/recovery behavior, tests, deployment profiles and human decisions.

## 3. Protected C4 checkpoint

The following files are frozen. Their current bytes are provenance evidence and must not be edited,
formatted, moved, reattributed, staged, reset or deleted under WI-OI-044:

| Path | Current Git state | SHA-256 at F0 entry |
| --- | --- | --- |
| `modules/physical-operations-cmms/apps/api/src/import-export/column-registry.ts` | untracked | `0c60be762ba00ebe003300fd99554bda59331ce563daf2284eb118dff713e978` |
| `modules/physical-operations-cmms/apps/api/src/import-export/row-validator.ts` | untracked | `7fc1d71ec04d41027641a2d4f86ceea3de5897f228774d4bf4fdd5528c6f1ef1` |
| `modules/physical-operations-cmms/apps/api/src/import-export/import-job.service.ts` | modified | `7f67627b2e0f90d339fff52ba924a180f3a419bb829f308fbac392f416507567` |
| `modules/physical-operations-cmms/apps/api/src/import-export/types.ts` | modified | `baa6e407f0d2786cb85a61a35b37ddcfe0ae629aa06eec4cfc71c5acce30e621` |
| `modules/physical-operations-cmms/db/migrations/000007_import_export_jobs.up.sql` | untracked | `71f9d2aff51de4cf71813a8cab13281d83a80a2eed475a09ec8a44493cf0afeb` |
| `modules/physical-operations-cmms/db/migrations/000008_custom_attributes.up.sql` | untracked | `959796b7568eb2abd6301cee92097551f8bf8717b5cdd413b15acae5da563eff` |
| `modules/physical-operations-cmms/db/migrations/000009_column_alias_maps.up.sql` | untracked | `c8be29955b622b4fb9c3d5e4178f1443086f2dbfd329a3b06d9ba3a9adbd4825` |

The entire `modules/physical-operations-cmms/apps/api/src/import-export/` directory is protected from
WI-OI-044 changes. The hashes above are the minimum quick integrity check, not an assertion that the files
are accepted, complete or correctly attributed.

## 4. F0 findings

1. `.pi/PLAN.md`, `.pi/WORK_ITEMS.md`, detailed work items and governance configuration disagreed on the
   active Build stream.
2. Governance configuration listed both WI-OI-042 and WI-OI-043 despite the implementation WIP limit of
   one and the canonical register placing WI-OI-042 in Review.
3. WI-OI-043's header said Proposed/G0 while the same file recorded all seven G4 phases and the canonical
   register said In Progress.
4. WI-OI-039 and WI-OI-042 detailed headers were stale relative to the canonical Review status.
5. CMMS import/export files and migrations contain WI-OI-043 annotations even though WI-OI-043 owns the
   External Data Analytics & Reporting Studio.
6. The repository already contains configuration, queues/workers, outboxes, event/storage packages and
   audit primitives. Delta 5 is convergence and certification, not a greenfield platform rewrite.

## 5. F0 allowed changes

- `.pi/PLAN.md`
- `.pi/WORK_ITEMS.md`
- `config/sdlc-governance.json`
- status/provenance text in affected `.pi/work/*.md`
- this work-item record
- Delta 5 plan and future G0–G3 design artifacts

No production code, package manifest, lockfile, schema, migration, generated artifact or runtime
configuration may change during F0.

## 6. F0 exit criteria

- [x] Stable work item `WI-OI-044` allocated for the bounded F0–F1 baseline.
- [x] WI-OI-039, WI-OI-042 and WI-OI-043 canonical status reconciled to Review.
- [x] Active G4 Build list reconciled to empty while WI-OI-044 remains at G0–G3.
- [x] Protected C4 paths and entry hashes recorded.
- [x] CMMS/WI-OI-043 attribution conflict recorded without editing or silently renaming source.
- [x] `node scripts/verify-sdlc-governance.mjs` passes with 44 work items and no active G4 Build item.
- [ ] Independent reviewers are named by authorized humans.
- [x] Repository owner confirmed the existing Tenant Profile extension as the first low-risk adopter;
  bounded adopter design is tracked by WI-OI-045.

F0 may exit with the last two human/product decisions open only into F1 design. They remain hard blockers
for G4.

## 7. F1 deliverables

Use targeted reads and small artifacts. Do not copy the North Star into multiple documents.

1. Existing-capability disposition: reuse, extend, replace with ADR, or quarantine.
2. `PlatformContextV1` cross-boundary compatibility decision.
3. Module adapter contract and storage/index decision framework.
4. Durable job-control contract and authoritative ownership decision.
5. Event/outbox/inbox envelope, compatibility and transport ADR.
6. Tenant-binding, pooling, session-feature and capacity ADR.
7. Transactional audit, redaction, integrity, projection and retention ADR.
8. Threat model and permission/data-classification matrix.
9. Migration/deployment/recovery design for the current Local Development profile; production and cloud
   infrastructure are deferred.
10. Independent acceptance plan covering tenant-negative, fault, load, restore and accessibility evidence.

## 8. G4 entry blockers

- Named independent reviewers and human Product Owner are recorded.
- One first adopter and measurable outcome are accepted.
- Every P0/P1 requirement has a test owner and evidence method.
- ADRs and contracts are accepted; no critical threat/data-loss risk is unresolved.
- Migration, compatibility, recovery, capacity, SLO and deployment-profile decisions are explicit.
- A separate bounded Build work item is Ready and is the sole entry in
  `activeImplementationWorkItems`.
- Protected C4 hashes remain unchanged unless a later authorized work item explicitly resumes that work.

## 9. Current handoff

F0 governance reconciliation is complete. F1 agent-executable design evidence is recorded below. The next
handoff is independent review and the unresolved human/product decisions; no Build work begins from this
handoff.

## 10. F1 design evidence

| Deliverable | Artifact | Agent state |
| --- | --- | --- |
| Existing capability disposition | `docs/audits/2026-09-22-delta-5-foundation-inventory.md` | Drafted from targeted repository inspection |
| Convergence/ownership decision | `docs/architecture/ADR-0005-delta-5-foundation-convergence.md` | Proposed; not accepted |
| Context, adapter, filter, job, event, binding, artifact, audit and error contracts | `docs/contracts/delta-5-foundation-contracts-v1.md` | Proposed; not a runtime contract |
| Threat, permission, classification, persistence, migration and recovery design | `docs/architecture/DELTA_5_SECURITY_DATA_MIGRATION_DESIGN.md` | Proposed; independent review pending |
| Independent acceptance and negative-test matrix | `docs/plans/delta-5-foundation-acceptance-test-plan.md` | Proposed; test owner/review pending |
| North-star sequencing and production gates | `docs/plans/delta-5-platform-foundations-north-star-implementation-plan.md` | Architecture candidate |
| Consolidated human decisions and reviewer record | `docs/reviews/WI-OI-044-WI-OI-045-f1-decision-record.md` | Product/Solution Architecture accepted the D5-F1-001–022 framework and exact D5-F1-014–022 values subject to F2 measurement; remaining specialist decisions pending |
| Specialist operating baseline | `docs/reviews/WI-OI-044-f1-specialist-decision-package.md` | Exact load/SLO/recovery/capacity/timeout/retention/security/halt values accepted by Product/Solution Architecture; specialist acceptance pending |
| Specialist pre-review findings | `docs/reviews/WI-OI-044-f1-specialist-pre-review-findings.md` | Local stack and external deferrals are resolved; named local specialist decisions and thresholds still block G4 entry |
| Local execution scope | `docs/plans/configuration-local-execution-plan.md` | Existing Docker/PostgreSQL/MinIO selected; external release infrastructure explicitly deferred |

Agent-complete design coverage:

- [x] Existing capabilities assigned reuse/extend/adapter/contain dispositions.
- [x] `PlatformContextV1` preserved as the synchronous authority; async reauthorization specified.
- [x] Module adapter and safe filter boundary specified.
- [x] PostgreSQL-authoritative durable job model and BullMQ transport boundary specified.
- [x] Module-owned outbox/inbox and initial transport boundary specified.
- [x] Existing tenant binding extension, pool/admission and session-sensitive route specified.
- [x] Transactional audit, redaction, concurrent integrity and projection model specified.
- [x] Threat, data, migration, deployment and recovery design drafted.
- [x] Independent acceptance matrix drafted.

Still blocking G4:

- [ ] Named human reviewers and decisions.
- [x] Chinni babu Rayapudo accepted the D5-F1-001–022 framework and exact D5-F1-014–022 specialist values
  as Product Owner and Solution Architecture reviewer, subject to measured verification during F2;
  remaining specialist authorities are not waived.
- [x] Product/Architecture selected the Local Development Docker/PostgreSQL/MinIO stack, deferred external
  release infrastructure, kept Tenant Profile value certification in F3/TP-1 and removed the unjustified
  F2 scanner dependency.
- [x] Existing Tenant Profile extension selected as the first low-risk adopter; measurable journey is
  baselined in WI-OI-045, pending independent G3 acceptance.
- [x] Local Development profile versions and concrete dependency identities recorded; production providers deferred.
- [ ] Accepted representative volumes, pool/timeout/quota/SLO/RPO/RTO values.
- [ ] Accepted audit chain scope, archive/integrity and legal retention/hold decisions.
- [ ] ADR-0005 and contract/design/test artifacts accepted at their applicable gates.
- [ ] Separate bounded Build work item allocated and marked Ready.

Agents cannot fill human reviewer names or accept product, security, privacy/legal, operational or release
risk.
