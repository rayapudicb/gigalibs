# Delta 5 F1 architecture and reference-adopter decision record

Status: Review packet; WI-OI-047 local technical work is in Review, no active G4 or production-release authorization

Date: 2026-09-22

Work items: WI-OI-044 and WI-OI-045

Product and Architecture reviewer: Chinni babu Rayapudo — Product Owner / Solution Architecture /
Manual UAT

Remaining independent reviewers: Security & Privacy, Backend/Data, IAM/Tenancy,
Data Portability/Privacy, Infrastructure/SRE, API Contracts, Web/Accessibility and QA/SDET

## 1. Purpose and gate rule

This record puts every F1 decision in one place so a human reviewer can accept, conditionally accept or
reject the exact architecture. It does not infer acceptance from chat, agent output, document creation,
local service startup or a screenshot.

F1 may close only when:

- every decision marked `HUMAN DECISION REQUIRED` below has a named accountable human and a recorded
  decision;
- every condition attached to a conditional acceptance is resolved and re-reviewed;
- ADR-0005, the v1 contracts, security/data/migration design, acceptance plan and Tenant Profile adopter
  design are accepted together without contradiction;
- no unresolved critical tenancy, security, privacy, data-loss or recovery risk remains; and
- the canonical work-item registry is updated by the SDLC Orchestrator.

F1 acceptance does not start implementation. WI-OI-047 subsequently completed its bounded local technical
work and entered Review on 2026-09-23. WI-OI-046 still requires its own accepted G3 decisions and explicit
sole active G4 handoff before TP-1 product behavior changes.

## 2. Product direction already recorded

These statements are repository-owner direction already present in WI-OI-044/WI-OI-045. Reviewers should
challenge a contradiction, but must not silently broaden them:

1. The existing `tenant-profile-extension` journey is the first low-risk Delta 5 reference adopter.
2. The existing Configuration Studio lifecycle is reused; Delta 5 does not create another metadata engine.
3. The adopter is independent of AR, Analytics and CMMS.
4. Paused CMMS Phase 4/import-extension files remain protected and unchanged.
5. F2 Configuration deployment repair and certification precedes F3/TP-1 adapter implementation.
6. One bounded Build work item may be active at a time.

Product and Solution Architecture acceptance of the D5-F1-001 through D5-F1-022 decision framework is
recorded in section 6, subject to measured verification during F2. Product and Solution Architecture also
accepted the exact D5-F1-014–022 values in the specialist package. These decisions do not supply the
still-missing specialist decisions or replace the remaining independent authorities.

### 2.1 Superseded Product/Architecture scope amendment — 2026-09-22

Chinni babu Rayapudo directed that the current deployment be operated locally and that no cloud provider
be selected now. Accordingly:

- the initial F2 target was `configuration-customer-managed-local-v1`;
- Managed Cloud is deferred to a separate future work item after provider selection; HostingRaja and
  DigitalOcean are candidates only;
- F2 certifies the Configuration Studio deployment/lifecycle and explicit-scope manifest path;
- F3/TP-1 certifies the Tenant Profile runtime-value journey after authoritative environment/cohort
  resolution replaces `local-uat`/`all-users` defaults; and
- F2 adds no malware-scanner dependency for strict signed JSON packages or platform-generated exports.

The profile choice in this subsection was subsequently superseded by the Local Development amendment in
section 2.2. Its Tenant Profile-value and scanner boundaries remain applicable. All other accepted values
remain subject to measured verification and specialist review.

### 2.2 Local execution amendment — 2026-09-22

The Product Owner/Solution Architecture reviewer confirmed that GigaLibs will currently be operated on the
existing local Docker environment and that external-infrastructure-dependent evidence should be deferred.
The current key is therefore `configuration-local-development-v1`. Docker 29.0.1, Compose 2.40.3,
PostgreSQL 16 and the existing digest-pinned MinIO are reused. Customer-Managed production, public TLS/DNS,
external storage/KMS/backup/alerting/registry provenance, HA and Managed Cloud are `DEFERRED_EXTERNAL`.

This amendment permits those rows to remain incomplete for the Local Foundation Ready milestone. It does
not convert them to passes or waive real authentication, tenant isolation, persistence, migrations,
fail-fast configuration, local recovery, accessibility or independent review.

## 3. Recommended F1 architecture decisions

Each row is the recommended architecture baseline. Product and Solution Architecture acceptance is
recorded in section 6. `Required decision` identifies every authority that must still record the outcome;
one role's acceptance does not stand in for another role's specialist review.

| ID | Recommended decision | Required decision |
| --- | --- | --- |
| D5-F1-001 | Accept Tenant Profile as the first adopter with the measurable journey in WI-OI-045: activate an approved optional field, persist a real value, produce a signed tenant export, reconstruct event/job/audit evidence and prove a second tenant cannot observe or affect it. | Product, Architecture, QA |
| D5-F1-002 | Accept ADR-0005's convergence model: shared contracts with module-local authority; no new standalone foundation service in the first slice. | Architecture, Security, Backend/Data |
| D5-F1-003 | Preserve signed `PlatformContextV1` for synchronous calls. Async records carry immutable authority references and workers/consumers revalidate current tenant, user, entitlement and permission before consequential effects. | IAM/Tenancy, Security, API Contracts |
| D5-F1-004 | Reuse Configuration Studio and introduce only code-owned `ModuleAdapterDescriptorV1` adapters. Reject arbitrary SQL, table/column identifiers, executable expressions, unrestricted URLs and tenant-authored module invariants. | Architecture, Security, API Contracts, affected Domain |
| D5-F1-005 | Keep PostgreSQL authoritative for durable job state. Extend the existing `TenantDataExport` records and worker; do not create a second job product. BullMQ/Redis may be transport only in a later separately accepted profile and cannot be required by F2. | Architecture, Backend/Data, SRE |
| D5-F1-006 | Keep module-owned transactional outbox/inbox records. For the first adopter use PostgreSQL polling plus `LISTEN/NOTIFY` only as a wake-up/invalidation signal. Do not claim exactly-once delivery. An external broker requires a later transport decision and measured need. | Architecture, Backend/Data, SRE, API Contracts |
| D5-F1-007 | Extend the existing `TenantIsolationBinding`; do not build a second registry. Certify shared-schema PostgreSQL RLS first for this adopter. F2 uses direct PostgreSQL connections; PgBouncer, schema-per-tenant and dedicated-database profiles remain unsupported until separately certified. | Architecture, IAM/Tenancy, Backend/Data, SRE |
| D5-F1-008 | Store authoritative audit evidence in the same module transaction as the material change. Use a transaction-safe chain scoped by `(tenant_id, deployment_id, owner_module)`, fail closed to `UNSEALED`, `INCOMPLETE` or `INVALID`, and treat any search/archive projection as rebuildable. | Security, Backend/Data, Data Portability/Privacy |
| D5-F1-009 | Use server-created tenant-prefixed artifact keys, checksums, classification, encryption/key references, scan status and bounded grants. Store references rather than payload blobs. Public customer-data objects and raw persistent object URLs are prohibited. | Security, Data Portability/Privacy, SRE |
| D5-F1-010 | Accept one current local-development profile using the existing Docker/Compose, PostgreSQL 16 and digest-pinned MinIO. Redis and the execution plane are excluded from the Configuration dependency graph. Customer-Managed production and Managed Cloud are deferred and unclaimed. | Product/Architecture accepted scope; Security, local operator and QA pending |
| D5-F1-011 | For local development, accept capability-gated Ed25519 signing, canonical AES-256 keys, mode-0600 ignored secret files, revision-qualified image tags and recorded local image IDs. Never bake `.env` or credentials into images. Registry signature/provenance/external SBOM attestation is release-deferred. | Product/Architecture accepted boundary; Security/local operator pending; Release Operations deferred |
| D5-F1-012 | Accept expand → dual compatibility → backfill → verify → activate → observe → contract as the only default migration sequence. Applied migrations are immutable; failure blocks rollout and recovery defaults to roll-forward from a verified checkpoint. | Backend/Data, SRE, QA, Release Operations |
| D5-F1-013 | Accept the Delta 5 and Configuration deployment acceptance plans as the minimum evidence matrices. A missing real dependency produces `NOT_RUN/BLOCKED`, never a mocked pass. | QA, Security, SRE, Product |

## 4. Human decisions that still require explicit values

These cannot be supplied or accepted by an implementation agent. The named authority must fill every
remaining decision before F1/F2 G4 entry. Concrete evidence-backed recommendations are consolidated in
`docs/reviews/WI-OI-044-f1-specialist-decision-package.md`; that package is not specialist acceptance.

| ID | Decision required | Recommended starting boundary | Accepted value / authority |
| --- | --- | --- | --- |
| D5-F1-014 | Representative first-adopter volume | At least two tenants and 250 configured fields; record tenant count, concurrent administrators, reads/writes per second, export record/byte size and audit/event rate. Do not extrapolate beyond measured evidence. | Product/Architecture accepted the boundary; **exact values and QA decision pending** |
| D5-F1-015 | Interaction and propagation SLOs | Preserve NFR-PERF-002 cached-interaction p95 under 2 seconds and NFR-PERF-001 applicable event-to-decision p95 under 5 seconds. The single-host local profile makes no 99.9% availability claim. Define exact operation boundaries, measurement windows and error policy. | Product/Architecture accepted the amended baseline; **SRE/QA measurement policy pending** |
| D5-F1-016 | Recovery objectives | Prove local process restart, PostgreSQL dump/restore, invalidation recovery and MinIO outage behavior. Cross-host WAL/PITR and external backup RPO/RTO are deferred release evidence. | Product/Architecture accepted the amended boundary; **local thresholds and Backend/Data/SRE decisions pending** |
| D5-F1-017 | Connection and admission budget | Record database ceiling, admin/migration/replication reserve, failover reserve, replica counts, per-process pool sizes, listener connections, worker concurrency, queue/export quotas and rejection behavior. The aggregate must stay below the measured allocatable ceiling. | Architecture accepted the model; **Backend/Data/SRE values pending** |
| D5-F1-018 | Timeouts and retry limits | Record API/BFF/dependency timeouts, lease/heartbeat/claim values, retry counts/backoff, presign lifetime and cache TTL/invalidation recovery bounds. | Architecture accepted the model; **Backend/Data/SRE/Security values pending** |
| D5-F1-019 | Event and operational-record retention | Record outbox/inbox/quarantine/replay windows and deletion verification for the current profile. | Product/Architecture accepted the requirement; **Data Portability/Privacy/Security values pending** |
| D5-F1-020 | Audit retention, hold and archive | Record audit source/projection/archive retention, immutable integrity mechanism, archive provider, legal-hold authority, residency, restore verification and tenant-offboarding treatment. No legal conclusion is inferred. | Product/Architecture accepted the requirement; **Privacy/Legal/Security/Data Portability decisions pending** |
| D5-F1-021 | Artifact protection boundary | No scanner is added for strict signed JSON Configuration packages or platform-generated exports. Local MinIO and local secret-file controls are the current test boundary; external KMS/S3 are deferred. Arbitrary/binary uploads stay unavailable until a later scanner decision. | Product/Architecture accepted the amendment; **Security/local-operator decision pending** |
| D5-F1-022 | Rollout and halt thresholds | Stop on any cross-tenant result, migration mismatch/failure, lost acknowledged work, invalid audit chain, critical unaccepted vulnerability, secret exposure or production-reachable fake. Add numeric latency/error/saturation/backlog thresholds and observation window. | Product/Architecture accepted the stop conditions; **numeric thresholds and Security/SRE/QA/Release decisions pending** |

## 5. Required named-human roster

Agent role names describe preparation responsibilities; they are not human approvals. One person may cover
more than one role only when organizational policy permits it, but the producer cannot be the sole reviewer
of tenancy, security, privacy, migrations, recovery or release risk.

| Human name | Review responsibility | Independent from producer? | Decision status | Date |
| --- | --- | --- | --- | --- |
| Chinni babu Rayapudo | Product Owner / Solution Architecture | Yes — independent from agent producer | Accepted D5-F1-001–022 framework and exact D5-F1-014–022 specialist values, subject to measured F2 verification | 2026-09-22 |
| **TBD** | Security & Privacy / risk | Required | Pending | — |
| **TBD** | Backend/Data / migration | Required | Pending | — |
| **TBD** | IAM/Tenancy | Required | Pending | — |
| **TBD** | Data Portability / Privacy or Legal | Required | Pending | — |
| **TBD** | Local operator | Required | Pending | — |
| **TBD** | API Contracts | Required | Pending | — |
| **TBD** | Web/Accessibility | Required | Pending | — |
| **TBD** | QA/SDET | Required | Pending | — |

Release Authority is required before G6, not as a substitute for the F1 design reviewers above.

## 6. Human decision record

Each actual reviewer adds one row. `Conditional` is not a gate pass while any condition remains open.

| Human name | Responsibility | Decision IDs reviewed | Evidence reviewed | Decision | Conditions/findings | Date |
| --- | --- | --- | --- | --- | --- | --- |
| Chinni babu Rayapudo | Product Owner / Solution Architecture | D5-F1-001–D5-F1-022 framework and exact D5-F1-014–022 values | This decision record, `docs/reviews/WI-OI-044-f1-specialist-decision-package.md` and `docs/reviews/WI-OI-044-WI-OI-045-f1-evidence-manifest.sha256` | Accept | Subject to measured verification during F2; remaining specialist authorities are not waived | 2026-09-22 |
| Chinni babu Rayapudo | Product Owner / Solution Architecture | D5-F1-010, 015–016, 019, 021 and F2/F3 boundary amendment | Amended Configuration architecture, contract, test plan and specialist package | Accept | Customer-Managed Local decision later narrowed to the Local Development milestone below; no F2 scanner; Tenant Profile value journey remains F3 | 2026-09-22 |
| Chinni babu Rayapudo | Product Owner / Solution Architecture | Local execution and external-deferral amendment | `docs/plans/configuration-local-execution-plan.md` plus amended deployment architecture/contract/test plan | Accept | Existing Docker/PostgreSQL/MinIO reused; external infrastructure deferred without production credit | 2026-09-22 |
| Chinni babu Rayapudo | Product Owner / Solution Architecture / Local Operator | WI-OI-047 bounded Local G4 entry | Local execution plan, amended deployment contract/test plan and existing Docker inventory | Accept | Authorizes local implementation only; Security, Backend/Data, Web/Accessibility and QA/SDET exit decisions are not waived | 2026-09-22 |
| _required_ | Security & Privacy | _IDs_ | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Backend/Data | _IDs_ | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | IAM/Tenancy | _IDs_ | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Data Portability / Privacy or Legal | _IDs_ | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Infrastructure/SRE operator | _IDs_ | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | API Contracts | _IDs_ | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Web/Accessibility | _IDs_ | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | QA/SDET | _IDs_ | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |

## 7. Reviewer evidence set

Review the following as one versioned set:

- `docs/plans/delta-5-platform-foundations-north-star-implementation-plan.md`
- `docs/audits/2026-09-22-delta-5-foundation-inventory.md`
- `docs/architecture/ADR-0005-delta-5-foundation-convergence.md`
- `docs/contracts/delta-5-foundation-contracts-v1.md`
- `docs/architecture/DELTA_5_SECURITY_DATA_MIGRATION_DESIGN.md`
- `docs/plans/delta-5-foundation-acceptance-test-plan.md`
- `.pi/work/WI-OI-044.md`
- `.pi/work/WI-OI-045.md`
- `docs/architecture/CONFIGURATION_DEPLOYMENT_PROFILE_DESIGN.md`
- `docs/contracts/configuration-deployment-contract-v1.md`
- `docs/plans/configuration-deployment-acceptance-test-plan.md`
- `docs/audits/2026-09-22-configuration-f2-closure-audit.md`
- `.pi/work/WI-OI-047.md`
- `docs/reviews/WI-OI-044-f1-specialist-decision-package.md`
- `docs/reviews/WI-OI-044-f1-specialist-pre-review-findings.md`

Before signing, record a SHA-256 manifest or immutable review revision for this evidence set. Later changes
invalidate only the affected decisions but must be re-reviewed before Build or release.

## 8. Gate outcome

Current outcome: **WI-OI-047 local technical evidence is in Review; NO-GO for WI-OI-046 G4 entry and full
F1/production closure**.

Reason: WI-OI-047 no longer holds Build authority, but its independent Security, Backend/Data,
Web/Accessibility and QA/SDET conditions remain open. ADR-0005, the applicable F1/TP-1 specialist decisions
and the WI-OI-046 D1–D6 packet still lack named acceptance. Privacy/legal and external infrastructure remain
release-deferred. No local Build result may be presented as production acceptance.
