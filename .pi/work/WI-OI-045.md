# WI-OI-045 — Tenant Profile Delta 5 reference-adopter design

Status: Review
Gate: G3 Review; no G4 Build authorization
Owner: SDLC Orchestrator / Solution Architecture / Backend Domain
Requirements: FR-01, FR-05, FR-14, FR-15, FR-16; NFR-GOV-001–003,
NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-002–003,
NFR-OBS-001–004, NFR-UX-001–002, NFR-OPS-001–004
Independent reviewers: Security & Privacy, IAM/Tenancy, Data Portability, Infrastructure/SRE,
API Contracts, Web/Accessibility, QA/SDET, Product
Foundation: WI-OI-044 and ADR-0005

## 1. Owner decision

On 2026-09-22 the repository owner confirmed the existing Tenant Profile extension as the first low-risk
Delta 5 reference adopter.

This is not authorization to change product code. This work item defines the bounded adopter delta and the
sequential Build work required after independent G3 acceptance.

## 2. Outcome

An entitled Tenant Administrator can configure and activate an approved optional Tenant Profile field,
save a real value, request a signed tenant export containing the governed value, and reconstruct the whole
journey through durable event/job/audit evidence while a second tenant remains isolated.

The journey must survive API/worker/Redis/database process failure according to accepted recovery targets
and must use the tenant's approved binding/pool policy. It must not depend on AR, Analytics or CMMS.

## 3. Existing capability to preserve

| Existing capability | Evidence | Disposition |
| --- | --- | --- |
| Code-owned `tenant-profile-extension` surface | `ConfigurationStudioService.listBaseSurfaces()` | Reuse; express through accepted adapter contract |
| Locked tenant core fields and bounded extension slot | configuration contracts and service tests | Reuse |
| Immutable manifest compilation/activation | WI-OI-039 configuration foundation | Reuse; no second compiler/lifecycle |
| Real `ConfigurationExtensionValue` persistence | `packages/db` and configuration service | Reuse because the control plane owns the Tenant Profile entity |
| Optimistic value version and idempotency record | `saveExtensionValues()` | Reuse/extend to canonical operation context |
| Transaction-coupled audit on value save | configuration service transaction | Reuse; conform to audit v1/integrity policy |
| Settings UI renderer | `ConfiguredTenantFields.tsx` | Reuse; complete states/accessibility evidence |
| Durable PostgreSQL tenant export and polling worker | `TenantDataExport`, service and worker | Reuse/extend; it is the reference job rather than adding another job product |
| Signed ZIP export and verified object storage | privacy package/object storage | Reuse/extend artifact descriptor/classification/scan evidence |
| Configuration activation outbox/invalidation | control outbox and notification consumer | Reuse/extend event envelope/inbox/reconciliation |
| `TenantIsolationBinding` | control-plane schema/services | Reuse/extend; no second binding registry |

## 4. Exact gaps

1. Surface registration is an inline configuration list, not a versioned `ModuleAdapterDescriptorV1`
   implementation with explicit capabilities, permission map, audit policy and compatibility.
2. Tenant Profile reads/writes hard-code `local-uat` and `all-users`; runtime environment/cohort must come
   from an authoritative deployment policy, never a production fallback.
3. Extension-value save commits audit and idempotency, but no minimum domain event/outbox fact for the value
   change.
4. The configuration invalidation consumer has no canonical durable inbox/receipt contract.
5. Tenant export is durable PostgreSQL work, but it lacks the complete v1 attempt/heartbeat/cancellation/
   command-history model and current-authority revalidation immediately before snapshot/export.
6. Tenant export request has an active-job uniqueness policy but no canonical client idempotency key.
7. Object storage verifies bytes/checksum, but the durable artifact metadata does not yet carry the complete
   classification, encryption/key reference, scan status and retention policy contract.
8. Tenant isolation binding lacks the accepted versioned runtime workload/pool policy used by the API and
   worker.
9. Current generic audit chain allocation is concurrency-unsafe and unsealed/incomplete chains can be
   treated as valid; reference-slice writes must use the accepted transaction-safe audit policy.
10. Existing tests prove configuration behavior but do not yet provide one correlated end-to-end evidence
    chain across adapter, event, export job, artifact, binding and audit.

## 5. Explicit exclusions

- No new metadata engine, generic CRUD gateway or tenant-authored executable logic.
- No AR, Analytics, CMMS or paused C4 changes.
- No migration of every queue, event, storage or audit implementation.
- No tenant-specific fork or hard-coded production environment/cohort.
- No Redis/`NOTIFY`/in-memory source of truth.
- No exactly-once claim.
- No raw credentials, signed context token or full export bytes in queue/event/audit payloads.
- No external provider write or financial/physical effect.

## 6. Sequential Build slices after G3

Each slice receives a separate work item and becomes the sole active G4 item. Only one runs at a time.

### TP-1 — Adapter conformance and environment binding

- Add accepted adapter schemas to `@gigalibs/contracts`.
- Move Tenant Profile registration behind a code-owned adapter implementing the exact v1 descriptor.
- Preserve current route, keys, limits and existing client compatibility.
- Replace `local-uat`/`all-users` assumptions with authoritative deployment/cohort resolution that fails
  closed when missing.
- Add contract, compatibility, tenant-negative and UI-state tests.

Exit: existing behavior preserved; unknown capability/field/operator/environment is denied; no migration or
second registry unless accepted design proves it necessary.

### TP-2 — Durable tenant-export job conformance

- Extend the existing `TenantDataExport` lifecycle rather than introducing another export job.
- Add request idempotency, transition history, attempt/heartbeat/lease, cancellation and reconciliation
  required by the accepted job contract.
- Revalidate current tenant/user/entitlement/permission before snapshot and before download grant.
- Add artifact classification/encryption/scan/retention evidence without exposing storage keys.
- Preserve signed archive/checksum and existing export compatibility through an explicit format/version
  decision.

Exit: crash boundaries, duplicate request, cancellation, stale lease, storage outage, Redis absence (if
transport is later added), bounded resource use and cross-tenant artifact denial pass.

### TP-3 — Transactional event and inbox conformance

- Add a minimum `tenant.profile.extensions.updated.v1` fact in the same transaction as value/audit state if
  an accepted consumer need exists.
- Conform configuration activation events to the common envelope without breaking current invalidation.
- Add consumer-specific durable receipt/reconciliation for the selected real consumer.
- Keep `NOTIFY` as a wake-up/invalidation signal only.

Exit: rollback emits no fact; relay loss/duplicate/replay/version failure and quantitative reconciliation
tests pass.

### TP-4 — Binding, pool and admission conformance

- Extend existing tenant binding authority with the accepted version/workload policy.
- Route Tenant Profile API, export worker, outbox relay and listener through their certified workload
  classes.
- Use transaction-local tenant context and a session-capable listener route where required.
- Enforce aggregate connection budgets and admission before saturation.

Exit: missing/stale/suspended binding, pool contamination, rotation, restart/failover and saturation tests
pass for the selected deployment profile.

### TP-5 — Transactional audit conformance

- Apply the accepted `AuditEvidenceV1` envelope and schema-aware field redaction.
- Introduce transaction-safe chain sequence allocation and fail-closed verification states for the selected
  scope.
- Export to a rebuildable searchable projection/archive through a local audit outbox.
- Cover API, worker, event, download, cancellation, replay and operator commands.

Exit: rollback, concurrent writes, tamper/gap/unsealed, redaction, projection rebuild, retention/hold and
archive restore tests pass.

### TP-6 — Integrated certification and cohort

- Execute the first-adopter journey from configuration through export and audit reconstruction.
- Run mandatory repository and slice-specific gates in the accepted Local Development profile. Any later
  production or cloud profile must rerun the complete matrix under its own authorization.
- Produce immutable artifact, SBOM/provenance, migration/recovery, runbook and observation evidence.

Exit: G5 evidence, human UAT/review and G6/G7 authority; no agent can grant acceptance.

## 7. Candidate affected paths for later Build

These are candidates, not current authorization:

- `packages/contracts/src/configuration/` plus new accepted foundation contract modules;
- `packages/configuration-core/` only where descriptor compatibility requires it;
- `apps/playground-api/src/configuration-studio.*` and adapter-specific new files;
- `apps/playground-api/src/tenant-data-export.*` and object-storage integration;
- `apps/playground-api/src/control-outbox.worker.ts` and configuration invalidation consumer;
- `packages/audit-core`, `packages/audit-nest`, tenancy/binding packages as separately scoped;
- forward-only `packages/db` migrations;
- `ConfiguredTenantFields.tsx` and focused BFF/UI tests.

Existing dirty files must be diffed and preserved before any accepted Build slice. No whole-file rewrite is
allowed when a bounded adapter or helper extraction is sufficient.

## 8. Protected paths

All C4 paths and hashes recorded in WI-OI-044 remain protected. WI-OI-045 also excludes:

- `modules/physical-operations-cmms/**`;
- `modules/accounts-receivable/**`;
- `modules/analytics-studio/**`; and
- unrelated application/module files already modified in the working tree.

## 9. Acceptance trace

Applicable IDs from the Delta 5 acceptance plan:

- governance/contracts: D5-GOV-001–005, D5-ADR-001, D5-CONTRACT-001–002, D5-THREAT-001;
- context/tenancy: D5-CTX-001–008;
- adapter: D5-META-001–012;
- export job: D5-JOB-001–013;
- event: D5-EVT-001–011;
- binding: D5-CONN-001–010;
- audit: D5-AUD-001–010; and
- the complete integrated first-adopter journey.

## 10. G4 entry blockers

- [x] Existing Tenant Profile selected by repository owner.
- [x] Existing code/gap inventory captured without product changes.
- [x] Sequential reference-slice design and exclusions recorded.
- [ ] Named human reviewers assigned.
- [ ] ADR-0005 and v1 contract/security/test artifacts accepted.
- [x] Local Development profile and dependency identities accepted by Product/Architecture; production
  infrastructure remains release-deferred.
- [ ] Representative volumes and SLO/RPO/RTO/pool/quota/halt values accepted.
- [ ] Audit chain/archive/retention/legal decisions accepted.
- [ ] TP-1 receives its own stable Ready work item and sole-Build authorization.

## 11. Current handoff

WI-OI-045 may proceed through independent G3 design review. It cannot enter G4. The first future code change
is TP-1 adapter conformance only; TP-2 through TP-6 remain unauthorized until each predecessor exits and a
new bounded work item becomes the sole active Build stream.

The exact recommendations, unresolved operating values, named-human roster and decision template are in
`docs/reviews/WI-OI-044-WI-OI-045-f1-decision-record.md`. Product and Solution Architecture acceptance is
recorded there; remaining specialist acceptance and G4 authority are not inferred.
