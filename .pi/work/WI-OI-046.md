# WI-OI-046 — TP-1 Tenant Profile adapter conformance

Status: Review
Gate: G4 Review; TP-1 implementation and 25-outcome exact-image certification complete
Owner: Backend Domain / API Contracts / Web Experience
Requirements: FR-01, FR-05, FR-14, FR-15; NFR-GOV-001–003, NFR-SEC-001–004,
NFR-DATA-001–004, NFR-REL-001–002, NFR-PERF-002–003, NFR-OBS-001–004,
NFR-UX-001–002, NFR-OPS-001–004
Independent reviewers: Solution Architecture, Security & Privacy, IAM/Tenancy, Infrastructure/SRE,
API Contracts, Web/Accessibility, QA/SDET and Product
Dependencies: WI-OI-039 Review evidence, WI-OI-044 proposed foundation decisions, WI-OI-045 adopter design,
and WI-OI-047 local technical Review conditions

## 1. Single outcome

Conform the existing Tenant Profile configuration surface to the accepted module-adapter contract and
replace client-controlled/hard-coded runtime environment/cohort selection with a server-resolved scope,
without changing the user's existing field/value behavior or adding another metadata engine.

This slice does not implement durable export jobs, domain events/inbox, connection governance or audit
integrity. Those remain TP-2 through TP-5.

## 2. Current truth

- `ConfigurationStudioService.listBaseSurfaces()` registers `tenant-profile-extension` inline.
- The existing surface owns locked `name`, `slug`, `status` and `region` fields plus a bounded
  `profile-details` extension slot.
- `saveExtensionValues()` verifies the tenant-profile owner, active manifest, optimistic version,
  field permissions and values, then commits value, audit and idempotency in one transaction.
- `ConfiguredTenantFields` loads the manifest/value and saves through authenticated BFF routes.
- Both server and client embed `local-uat` and `all-users` assumptions.
- All relevant implementation files already contain uncommitted changes from prior work and must be patched
  minimally after a fresh diff review.

## 3. Required implementation

### 3.1 Contract

Add strict v1 schemas under the existing configuration contract namespace:

- `ModuleAdapterDescriptorV1Schema`;
- adapter capability, storage-strategy, compatibility and limit schemas;
- safe filter-contract descriptor schema, but no filter execution in this slice;
- `ConfigurationRuntimeScopeV1Schema` for server-resolved environment/cohort/version evidence; and
- versioned response fixtures proving unknown-field rejection and additive compatibility.

Do not copy `PlatformContextV1` or introduce a new tenant context.

### 3.2 Code-owned adapter registry

Introduce a small server registry with:

- lookup by exact `(moduleKey, entityKey, surfaceKey)`;
- duplicate-key startup rejection;
- immutable descriptor return;
- adapter-owned extension-owner validation; and
- no table names, SQL, arbitrary callbacks or tenant-defined executable handlers.

Implement `TenantProfileConfigurationAdapterV1` from the existing registration values. Preserve the
current serialized surface response so old web clients continue to decode it.

`ConfigurationStudioService` delegates surface and owner checks to the registry. Do not rewrite the full
service or move business persistence into a generic new package.

### 3.3 Server-resolved runtime scope

- Add a runtime-scope resolver that derives the deployment environment from required server configuration
  and the cohort from authenticated server policy.
- Missing or invalid environment/cohort configuration fails startup or the dependent operation explicitly.
- Add a current-runtime-manifest boundary that accepts only module/entity/surface; the server supplies
  environment/cohort.
- Preserve the existing explicit-scope endpoint for authorized Studio preview/administration if compatibility
  requires it; it must not become the normal end-user runtime path.
- Update `ConfiguredTenantFields` to consume the server-resolved boundary and display the resolved scope or
  safe version evidence where useful.
- Never accept a browser-supplied cohort as proof that the actor belongs to that cohort.

### 3.4 Error and telemetry behavior

- Use stable codes for adapter missing/incompatible, runtime scope missing/denied and manifest unavailable.
- Preserve safe loading, unavailable, denied, validation, conflict, retryable and success UI states.
- Add bounded adapter/scope/manifest outcome metrics without tenant/user/record identifiers as labels.
- Audit administrative preview-scope access where the accepted policy requires it.

## 4. Candidate file budget

Allowed after the work item becomes Ready:

- new contract file(s) under `packages/contracts/src/configuration/` and the existing export index;
- new focused adapter registry/tenant-profile adapter/runtime-scope files under `apps/playground-api/src/`;
- minimal integration hunks in `configuration-studio.service.ts`, controller/module and their tests;
- minimal `ConfiguredTenantFields.tsx` and focused BFF/UI tests;
- deployment configuration schema/example/runbook updates required by the runtime-scope resolver.

Forbidden:

- `modules/physical-operations-cmms/**`, including all frozen C4 files;
- `modules/accounts-receivable/**` and `modules/analytics-studio/**`;
- job/export, event/inbox, connection-pool or audit-chain implementation;
- database migration unless an accepted compatibility finding proves one is required;
- unrelated formatting, generated-file churn or whole-file rewrites;
- new dependency or lockfile change without separate accepted evidence.

## 5. Pre-flight stop conditions

Do not write product code until all are true:

- [ ] ADR-0005 accepted by named human Architecture/Security/Product authorities.
- [ ] WI-OI-044 and WI-OI-045 applicable G3 decisions accepted.
- [ ] Named independent reviewers recorded.
- [ ] Runtime environment/cohort source and deployment-profile behavior accepted.
- [ ] Exact current diffs for every candidate dirty file reviewed and preserved.
- [ ] This item is `Ready`/`In Progress` and the sole `activeImplementationWorkItems` entry.
- [ ] Targeted acceptance commands and evidence locations are accepted by QA/SDET.

If any condition fails, limit work to design/review evidence and report the blocker.

### 5.1 G3 readiness evidence

The [G3 readiness and human decision packet](../../docs/audits/2026-09-22-wi-oi-046-g3-readiness.md)
records the proposed fail-closed environment/cohort policy, compatibility/preview boundaries, exact adapter
descriptor, implementation patch map, dirty-file fingerprints, reviewer decisions and verification
contract. It is review evidence only. Its proposed decisions do not become accepted merely because they
are documented.

### 5.2 Post-F2 reconciliation — 2026-09-23

WI-OI-047 completed bounded local technical certification and entered Review. The exact-image F2 evidence
now measures the accepted first-adopter boundary: two tenants, separate maker/checker identities, 250
configured fields, 100 reads at concurrency 10, p95 `29.349 ms`, p99 `37.667 ms`, process/dependency
failure, restart, restore and generated-data cleanup. This satisfies the agent-executable F2 dependency but
does not supply the human decisions below.

The current named-review request is
`docs/reviews/WI-OI-046-g3-decision-request-2026-09-23.md`. WI-OI-046 remains `Proposed`, is not an active
Build item and has no product-code authority.

The fresh candidate checkpoint and collision audit are:

- `docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-23.sha256`; and
- `docs/audits/2026-09-23-wi-oi-046-prebuild-collision-audit.md`.

Thirteen product/API/web candidate hashes are unchanged from 2026-09-22. The two changed Compose hashes are
the expected WI-OI-047 local-profile delta. Helm remains external/deferred and is not in the local TP-1
file budget.

The exact proposed requirement-to-test commands, real-infrastructure matrix, evidence schema, manual
journey, cleanup and stop conditions are in `docs/plans/WI-OI-046-tp1-verification-plan.md`. QA/SDET
acceptance remains pending; creating the plan does not check the pre-flight box.

The focused pre-change baseline is recorded in
`docs/audits/2026-09-23-wi-oi-046-focused-prebuild-baseline.md`: contracts and Configuration core build;
30 contract/compiler tests; 47 API tests; web typecheck; 10 focused web tests; and the Configuration
contract, local-profile, observability and SDLC audits pass. The initially proposed package-local contracts
test selected zero files, so the plan now uses explicit root-level paths. This baseline does not prove
unimplemented D1–D6 behavior or supply QA acceptance.

On 2026-09-23 Chinni babu Rayapudo accepted D1–D6 and the recommended SP-01–SP-07 amendments as Product
Owner/Solution Architecture for the bounded TP-1 Local Development slice. The exact declarations are
recorded in `docs/reviews/WI-OI-046-g3-decision-request-2026-09-23.md` and
`docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md`. Security, IAM/Tenancy,
Infrastructure/SRE, API Contracts, Web/Accessibility and QA/SDET decisions remain open, so no pre-flight
checkbox or Build authority is inferred from these acceptances.

The specialist technical pre-review at
`docs/reviews/WI-OI-046-specialist-technical-pre-review-2026-09-23.md` recommends Conditional acceptance
and identifies seven required conditions. Product/Solution Architecture accepted its recommended SP-01
canonical `tenant-settings` to `tenant-access` entitlement mapping and SP-02 strict current-response
contract while preserving the exact legacy shape. Applicable independent specialists must still accept or
condition these and SP-03–SP-07 before G4; they must not be improvised in product code.

Exact proposed resolutions and the consolidated human record are available at:

- `docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md`; and
- `docs/reviews/WI-OI-047-exit-WI-OI-046-entry-integrated-review.md`.

### 5.3 Refreshed pre-Build baseline — 2026-09-24

After WI-OI-042 completed its bounded Department remediation and returned to Review, the complete TP-1
candidate set was re-hashed. All 15 candidate files are byte-identical to the September 23 checkpoint.
The refreshed focused baseline passes both builds, 87 tests across 17 files, workflow typecheck and the
Configuration contract, Local Development profile, observability and SDLC audits. No product code,
schema, migration, dependency or lockfile was changed.

Current evidence:

- `docs/audits/2026-09-24-wi-oi-046-prebuild-collision-audit.md`;
- `docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-24.sha256`;
- `docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md`; and
- `infra/compose/evidence/wi-oi-046-prebuild-20260924/focused-baseline.json`.

This closes the agent-executable freshness check only. Every independent specialist decision and the
Ready/sole-Build transition remain mandatory.

The subsequent IAM/Tenancy precheck is recorded in
`docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md`. Ten authentication/tenancy test files
pass 86 tests and the RBAC package builds. Canonical current-state tenant, membership, user, permission and
durable entitlement primitives exist. The current runtime endpoint still lacks the required
`tenant-access` entitlement query and no TP-1 privileged-preview boundary exists, so the evidence is a
green foundation rather than implementation proof. A named IAM/Tenancy decision for SP-01 and SP-03
remains pending.

The API Contracts precheck is recorded in
`docs/reviews/WI-OI-046-api-contracts-decision-request-2026-09-24.md`. The current legacy query/response,
OpenAPI, controller and service confirm that a separate strict current-runtime response is required to
preserve strict legacy decoders. Both contract packages build, 30 contract/compiler tests pass and the
Configuration contract audit passes all 11 outcomes across 32 operations. The current route still uses
silent scope defaults, no current/preview routes or TP-1 strict error envelope exist, and the adapter
registry remains unimplemented. A named API Contracts decision remains pending.

The Web/Accessibility precheck is recorded in
`docs/reviews/WI-OI-046-web-accessibility-decision-request-2026-09-24.md`. Workflow typecheck, ten focused
web tests, and the API/navigation boundary audits pass. The current Tenant Profile consumer still calls
the legacy manifest endpoint with browser-owned scope values, silently renders nothing during loading,
404 and initial-load failure, and has no typed denied/invalid/retry/conflict state, visible retry,
predictable error focus or stale-request cancellation. The existing accessibility harness covers Studio,
not the TP-1 Tenant Settings consumer. These are explicit future implementation and evidence requirements;
a named Web/Accessibility decision for SP-04 remains pending.

The QA/SDET precheck is recorded in
`docs/reviews/WI-OI-046-qa-sdet-decision-request-2026-09-24.md`. The complete focused sequence was rerun:
both builds, 87 tests across 17 files, workflow typecheck, and Configuration contract, Local Development
profile and observability audits pass. The agent QA recommendation is Conditional until QA-01 through
QA-12 are accepted: stable requirement trace, real-dependency classification, exact authority/concurrency
matrices, complete web/accessibility and observability proof, bounded performance, migration stop rule,
rebuilt-image scans, cleanup accounting, repository-failure comparison and immutable defect evidence. A
named QA/SDET decision remains pending; the green baseline does not prove TP-1 implementation.

The primary agent also reconciled four standalone human execution checklists against the repository and
reran their exact IAM, contract, web, API-boundary and navigation commands. They are linked from the
independent specialist request and human review guide. These checklists are review aids only: they do not
record a human decision, change WI-OI-046 status or authorize G4 implementation.

Rakesh Konduri subsequently recorded `Accept` as the independent Infrastructure/SRE reviewer for SP-07
and the bounded Local Development operational evidence, with no conditions and no production, cloud,
external release or TP-2–TP-6 authority. The executed manifest, governance, deployment-profile,
pre-Build-baseline, supply-chain, runtime, restore and SP-07 checks are recorded in
`docs/reviews/WI-OI-046-infrastructure-sre-check-record-2026-09-24.md`. At that checkpoint the remaining
specialist decisions were pending; their subsequent records are summarized below.

The current Security packet and short human checklist were revalidated against the replacement exact-image
bundle on 2026-09-24. All four frozen design hashes and all nine recorded supply-chain report hashes match;
the exact images remain non-root with zero Critical, High or image-secret findings. This is not an
unconditional Security acceptance: SBOM license gaps, absent versioned SAST/IaC evidence, deferred
external controls and the missing ACS/Twilio credential-owner rotation/revocation declaration remain
explicit conditions. At that checkpoint the named Security & Privacy decision was pending; Harsha
Koganti's subsequent acceptance is recorded below.

On 2026-09-24 Chinni babu Rayapudo assigned Harsha Koganti to the Security & Privacy and IAM/Tenancy
reviews alongside Rakesh Konduri's already recorded Backend/Data and Infrastructure/SRE responsibilities.
Harsha's assignment was recorded in the consolidated specialist request without inferring acceptance;
his subsequent personal decisions are recorded below.

Harsha Koganti subsequently accepted SP-01 and SP-03 as the independent IAM/Tenancy reviewer, subject to
the implementation using current durable tenant, user, membership, permission and `tenant-access`
entitlement authority and keeping preview tenant-bound, dual-permission protected and separate from normal
cohort membership. The verbatim decision is
`docs/reviews/WI-OI-046-iam-tenancy-decision-2026-09-24.md`. This closes only the IAM/Tenancy design row;
the separate Security & Privacy decision is recorded below.

Harsha Koganti also accepted SP-01, SP-03, SP-05 and SP-07 as the independent Security & Privacy reviewer,
subject to implementing the documented fail-closed entitlement, privileged-preview, safe-error and runtime
configuration controls and proving them with the specified post-Build security, two-tenant, revocation,
audit and startup tests. The verbatim decision is
`docs/reviews/WI-OI-046-security-privacy-decision-2026-09-24.md`. API Contracts, Web/Accessibility and
QA/SDET decisions and the sole-Build handoff are recorded in the following section.

### 5.4 G4 sole-Build authorization — 2026-09-24

Chinni babu Rayapudi recorded `Accept` decisions as the API Contracts and Web/Accessibility reviewer and
`Accept with QA-01 through QA-12 incorporated` as the QA/SDET reviewer. The exact declarations are:

- `docs/reviews/WI-OI-046-api-contracts-decision-2026-09-24.md`;
- `docs/reviews/WI-OI-046-web-accessibility-decision-2026-09-24.md`; and
- `docs/reviews/WI-OI-046-qa-sdet-decision-2026-09-24.md`.

After recording those decisions, Chinni babu Rayapudi explicitly directed: `proceed with development`.
The SDLC Orchestrator therefore moved WI-OI-046 to `In Progress` as the sole active G4 implementation
item for bounded `configuration-local-development-v1` TP-1. All reviewer conditions remain mandatory
implementation and post-Build acceptance requirements. This authorization does not extend to TP-2–TP-6,
production, cloud, customer-managed distribution or external release.

## 6. Required tests

### Contract/unit

- strict descriptor parse and unknown-field rejection;
- duplicate adapter registration/startup failure;
- exact adapter lookup; unknown module/entity/surface denied;
- tenant-profile descriptor preserves current route, locked fields, slot types/count and permissions;
- incompatible contract/runtime version denied;
- missing/invalid runtime environment or cohort fails closed;
- browser/query cohort cannot override server resolution;
- explicit preview scope requires its distinct permission.

### Service/integration

- existing change-set, compile, activation, value read/write, optimistic conflict, idempotency and audit tests
  remain green;
- two tenants activate different manifests and cannot discover each other's adapter state/value/cache;
- suspension/role downgrade removes write authority without restarting the service;
- missed invalidation and restart reload the authoritative active manifest;
- old serialized surface clients continue to decode during rolling deployment;
- no new database table or production mock/fallback is reachable.

### Web/accessibility

- settings runtime uses server-resolved scope;
- loading, absent-manifest, denied, invalid, conflict, retryable dependency and success states;
- keyboard/focus/error announcement and accepted WCAG automation;
- no UI-only authorization assumption.

Applicable acceptance IDs: D5-CTX-001–008 and D5-META-001–012.

## 7. Verification

Run focused package/service/web tests first. At the gate run:

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

Also run the configuration compiler, authenticated HTTP boundary, two-replica/cache, accessibility and
deployment-profile certifications applicable to the changed paths. A blocked infrastructure test remains
blocked; it cannot be replaced by a mock pass.

## 8. Exit

- Existing Tenant Profile behavior and wire compatibility are preserved.
- All normal runtime manifest selection is server-resolved and fail-closed.
- Tenant Profile is represented by the accepted v1 adapter descriptor and registry.
- No tenant leakage, core-field shadowing, permission bypass or runtime fallback exists.
- Trace, migrations-if-any, tests, evidence, runbook and known limitations are complete.
- Independent reviewers accept the exact slice for G5 handoff.
- TP-2 remains a separate unauthorized item until the Orchestrator opens it.

## 9. Current handoff

- G3 packet: `docs/audits/2026-09-22-wi-oi-046-g3-readiness.md`
- Current decision request: `docs/reviews/WI-OI-046-g3-decision-request-2026-09-23.md`
- Consolidated specialist request: `docs/reviews/WI-OI-046-independent-specialist-decision-request-2026-09-24.md`
- Refreshed collision/baseline evidence: `docs/audits/2026-09-24-wi-oi-046-prebuild-collision-audit.md`
  and `docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md`
- Product/Solution Architecture: D1–D6 and recommended SP-01–SP-07 amendments accepted on 2026-09-23 for Local Development only
- F2 dependency: technically complete and in Review; independent WI-OI-047 conditions remain open
- Product code changed by WI-OI-046: none
- Migration/dependency/lockfile changed by WI-OI-046: none
- Infrastructure/SRE: Rakesh Konduri accepted SP-07 and bounded Local Development operational evidence on
  2026-09-24 with no conditions after the required read-only checklist was executed and recorded
- Next authority: named Security, IAM/Tenancy, API Contracts, Web/Accessibility and QA/SDET reviewers,
  followed by SDLC Orchestrator Ready/sole-Build handoff
