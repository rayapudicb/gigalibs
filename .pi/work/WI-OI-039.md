# WI-OI-039 — Universal dynamic configuration and forms core

Status: Review
Owner: SDLC Orchestrator / Solution Architecture with Backend, Web and Domain owners  
Requirements: FR-01–FR-06, FR-08, FR-10, FR-14–FR-16; NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004  
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, affected Domain, Product  
Gate: G4–G5 Review; no product acceptance or release authorization

## Outcome

Platform and tenant administrators can add approved fields, layouts, validation and supported component
configuration to registered module entities without a source-code release. The owning module still enforces
identity, permissions and business invariants, and every record is validated against a pinned immutable
schema version.

## Scope and boundary

The [implementation plan](../../docs/plans/identity-dataflow-assets-dynamic-configuration-plan.md) defines
DC-01 through DC-04: code-owned component/type catalog; versioned platform schemas and permitted tenant
overlays; safe server validation and expression evaluation; configuration change sets; accessible
authoring/runtime UI; and module adoption. [ADR-0002](../../docs/architecture/ADR-0002-governed-metadata-configuration.md)
and the [governed configuration rollout plan](../../docs/plans/zero-code-configuration-and-module-rollout-plan.md)
refine the target: a low-risk tenant-profile reference adapter precedes the first financial AR adapter, and
CMMS follows as a later adopter after its domain scope is accepted.
The [universal invoice dynamic-fields and templates guide](../../docs/plans/universal-invoice-dynamic-fields-and-templates-guide.md)
defines the hybrid metadata/value model, customer/segment field sets, registered screen surfaces, component
registry and immutable template bindings needed before WhooCrew becomes an AR source adapter.
The [universal invoicing portability and integration plan](../../docs/plans/universal-invoicing-portability-and-integration-plan.md)
defines the language-neutral configuration/manifest contract, React renderer boundary and conformance
evidence required for a separately implemented Java/React client deployment.
The [production rollout plan](../../docs/plans/universal-configuration-studio-production-rollout.md)
defines the evidence-backed state vocabulary, Configuration Studio construction phases, complete current
module unlock order and the standard module-level certification template. Its 2026-09-12 implementation
packet now also defines the legacy dynamic-form convergence decision, control-plane package/data/API/UI
ownership, deterministic validation/compatibility policy and an optional AI-to-draft boundary. AI cannot
publish or activate configuration, generate executable runtime code/SQL/HTTP actions, or become a runtime
dependency; the non-AI Studio and first reference adapter must pass before AI proposal work starts.
The [application-wide screen adoption plan](../../docs/plans/application-wide-configuration-studio-screen-adoption-plan.md)
maps the user-supplied 134-screen inventory plus assembled routes omitted from that inventory to stable
surface candidates, core locks, extension boundaries, activation behavior and module adoption waves. It is
a proposed inventory and does not register or certify a module surface by itself.
The [portable resolved-manifest schema](../../docs/contracts/configuration-studio/configuration-manifest.schema.json),
[draft OpenAPI contract](../../docs/contracts/configuration-studio/openapi.yaml),
[security/data/migration design](../../docs/architecture/CONFIGURATION_STUDIO_SECURITY_DATA_MIGRATION_DESIGN.md)
and [acceptance test plan](../../docs/plans/configuration-studio-acceptance-test-plan.md) form the current
CS-01 G1–G3 review package. They are design inputs and are not runtime implementation or independent
acceptance evidence.

This item does not authorize arbitrary code, generated per-form database tables, generic table mutation,
dynamic changes to authentication/accounting rules, or external actions from form expressions. The owner
authorized Build on 2026-09-13 and made WI-OI-039 the sole active implementation item. Independent reviewers
still retain architecture, security, QA, domain, product and release acceptance.

## Proposed delivery slices

| Slice | Result | Entry/exit boundary |
| --- | --- | --- |
| DC-01 | Architecture, entity/field/component/permission/classification and adapter contracts | ADR-0002 accepted with independent Architecture, Security, Domain and QA review |
| DC-02 | Durable metadata, versions, overlays, dependencies, activation, audit/outbox and cache invalidation | Forward migration, clean install/upgrade/restore and tenant isolation pass |
| DC-03 | Compiler, safe expression runtime, compatibility rules and checksummed manifests | Invalid/cyclic/oversized/unauthorized configuration fails closed; stale clients conflict |
| DC-04 | Accessible authoring, diff/preview/publish and shared runtime renderer | Real APIs only; complete state, role, accessibility and restart journeys pass |
| DC-05 | Tenant-profile reference adapter and package/ALM promotion | Two-tenant overlays, persistent values, masking/export and rollback prove the core |
| DC-06 | AR invoice-draft adapter and issued-invoice extension snapshot | Non-financial dynamic field persists end to end and cannot alter or rewrite financial truth |
| DC-07 | Registered rule/workflow/action bridge | Pinned versions, allowlisted actions, retry/idempotency/reconciliation and audit pass |
| DC-08 | Package/ALM and registered automation bridge | Environment promotion and allowlisted rule/workflow/action composition pass dependency, recovery and audit tests |
| DC-09 | Measured module adoption | One module adapter at a time passes its own completeness and business-outcome gate |
| DC-AI-01 | Optional AI-assisted draft proposals | Structured proposal only; deterministic validation and human approval; provider outage cannot affect published runtime |

## Current handoff

CS-01 G1–G3 artifacts are the accepted implementation inputs for the producer build. Product, Architecture,
Security, Backend/Data, Web/Accessibility and QA review remain independent exit requirements. Implementation
must preserve the fail-closed boundary until the real PostgreSQL API, renderer and reference adapter pass.

## Implementation evidence — 2026-09-14

| Packet | Implemented result | Remaining exit evidence |
| --- | --- | --- |
| CS-01 | Strict Zod definition, lifecycle, activation, extension-value and tenant-record contracts in `@gigalibs/contracts`; typed code-owned surface registrations now include route, locked core-field descriptors, permitted presentation overrides and bounded extension slots. The shared definition ceiling now matches the accepted 250-field profile, and the API enforces each registered surface's field-count and allowed-type envelope before persistence | Reconcile and independently review each module's core-field registry before its adapter is registered |
| CS-02 | Forward PostgreSQL migrations: change sets, immutable versions, activations, version-bound extension values, idempotency, tenant application records (20260913); `configuration_templates` with soft-delete/clone chain and `configuration_saved_filters` (20260914). PostgreSQL 16 clean replay, generated-client compatibility, empty physical-schema diff and same-major restore pass. A separate 33→35 upgrade preserved representative semantic state and the active manifest across an application restart. A guarded local PostgreSQL-container restart preserved the active manifest/value and accepted a subsequent write through the same API process | Representative-volume WAL/PITR, lock-duration and target-profile RPO/RTO evidence |
| CS-03 | Tenant-derived NestJS commands and queries with optimistic concurrency, idempotency, maker-checker approval and HTTP boundary certification. A disposable PostgreSQL 16/real-API run now proves unauthenticated denial, suspended membership, suspended user, suspended tenant, live TENANT_ADMIN→VIEWER downgrade, authoring/value-write denial after downgrade, permitted viewer runtime read, restoration, maker-checker denial and tenant-scoped lifecycle behavior | Organization-specific custom-role combinations, external IdP/SCIM interoperability and named independent security review |
| CS-04 | Deterministic allowlisted compiler, canonical SHA-256 manifests, resource limits, platform-only reserved keys with module-supplied domain reservations, credential-field rejection, sensitive-default rejection, server value validation, and a bounded conditional-expression AST with cycle/type/reference limits. A fixed-seed generative suite now exercises 600 arbitrary JSON documents, 180 valid definitions under reordered object keys and 180 generated runtime-value sets. Thirteen compatibility-policy cases cover optional/required additions, label/layout changes, type/key changes, used-option removal, constraint tightening/relaxation, permission reduction/broadening and projection changes. Required additions remain conditional even when a default exists; invariant or authority relaxation is breaking | Named Architecture, Security and QA review of the compiler/compatibility boundary; record-aware projection/backfill rehearsal remains part of CS-09 |
| CS-05 | Environment/cohort activation, explicit older-version rollback, audit/outbox invalidation events and bounded lifecycle metrics. Configuration events publish a strictly parsed minimal envelope through transaction-coupled PostgreSQL `NOTIFY`; the outbox becomes `PUBLISHED` in the same commit. The adopting manifest consumer maintains a 1,000-entry/30-second process cache keyed by the complete activation scope, deduplicates successful events by `eventId`, reloads the current active projection from PostgreSQL, bypasses cached values whenever its listener is disconnected and resynchronizes known scopes before reconnect use. Two real API replicas proved online cached A→B invalidation/reconciliation, offline B restart/read, cached rollback B→A invalidation and four `PUBLISHED` activation events. The real-HTTP harness receives the notification, converts that row into a five-minute-old `PROCESSING` claim, receives its replay on attempt two and verifies the consumer deduplicates it; an invalid envelope fails exactly once with an immutable failure audit and no notification. A separate guarded outage makes a pending event due while PostgreSQL is stopped and proves publication plus notification after the same API reconnects. It also stops PostgreSQL after `pg_notify` is queued but before the `PUBLISHED` transaction commits, proves rollback/no receipt and then one receipt after stale-claim recovery on attempt two. Static conformance binds thirteen Configuration metrics to a sixteen-panel dashboard, six module alerts and an operations runbook. A real local API/PostgreSQL scrape passes credential, listener, collector-health, metric-family and cardinality checks | Dashboard import, fired/resolved alert routing, and deployment-profile replica/operator rehearsal |
| CS-06 | Registry-driven three-pane visual builder with component palette, responsive canvas and contextual inspector; the permission-gated global Studio-mode toggle preserves the live module shell, exposes a screen-local Config panel, displays registered core fields as locked and opens the full designer in place. Workflow tabs now implement roving Arrow Left/Right, Home and End focus with explicit tab/tabpanel relationships. Twenty-one authenticated axe-core scans pass the supported WCAG 2.2 A/AA rules on optimized Chromium, Firefox and WebKit builds across desktop, mobile preview, compact viewport, reduced-motion and all five workflow states | Remaining module surface registrations, nested condition-group authoring, preview-as-role, recorded manual keyboard/screen-reader/zoom/high-contrast review, contextual-overlay and both deployment-profile checks plus product acceptance |
| CS-07 | Shared React renderer for the 13 currently registered field types with browser-safe conditional visibility and requiredness parity. The language-neutral JSON Schema matches the real compiled manifest. All 32 Configuration operations now use named v1 success schemas, and the controller strictly projects responses before serialization so new ORM columns cannot silently enter the API. A dependency-free Java 11 client independently decodes a real compiler/runtime-response fixture spanning all 13 field types and eight components, validates conditional/list references and rejects eight hostile fixtures. Its HTTP transport then decodes the real local bearer-authenticated API response, rejects an invalid token, prohibits non-loopback cleartext, follows no redirect, requires JSON and bounds the body to two megabytes | Target-profile TLS/trust-chain certification, consumer-specific rendering and independent API/client review |
| CS-08 | Tenant-profile extension adapter plus tenant-created application pages with real PostgreSQL CRUD, stale-write rejection and soft deletion; cursor-paginated list view with per-manifest column projection, in-memory search/filter, stale-flag; single-record detail endpoint; template CRUD (create/update/duplicate/delete) and saved-filter CRUD via raw SQL | AR financial snapshot adapter remains a later domain-owned slice |
| CS-08a | Mask/export policy: `maskValues` redacts CONFIDENTIAL/RESTRICTED field values to `"***"` unless actor holds `configuration:unmask-sensitive`; `exportPackage` strips `defaultValue` from sensitive field definitions unless actor holds `configuration:export-sensitive` | Security review of masking boundary and export trust model |
| CS-09 | Isolated PostgreSQL and authenticated HTTP certifications cover lifecycle, tenant isolation, field security, conditional-required denial, values, tenant apps, record-aware impact and unsafe-activation denial, explicit rollback, signed package export/import/tamper denial, audit and outbox. The local HTTP-boundary certification passes fifteen outcomes including current-database suspension and role-downgrade enforcement, a live Java 11 bearer-manifest fetch with six transport-hardening outcomes, valid notification receipt, stale-claim replay with a second receipt, adopting-consumer deduplication and audited permanent-envelope rejection without publication. The logical-recovery drill produced a 420,338-byte custom backup and verified the restored checksum and 35-migration history; the cache-aware two-replica certification passed nine convergence outcomes; the 33→35 upgrade/application-restart certification passed seven outcomes; the local database-restart drill passed eleven outcomes including pending-event delivery after recovery and interrupted-publish rollback/retry; contract convergence and Java 11 offline client conformance each passed eleven outcomes; static observability passed eight outcomes and the local live scrape passed ten; a two-tenant local load profile passes nine outcomes at the accepted 250-field boundary; and the local accessibility certification passes 21 zero-violation axe scans across three browser engines plus their workflow-tab keyboard checks | WAL/PITR, deployment-profile performance/failure/accessibility evidence, manual assistive-technology review, target-profile Java TLS/trust-chain integration, alert-routing/dashboard/operator rehearsal, deployment-profile recovery/replica rehearsal and named independent approvals |
| CS-10 | Dual-profile deployment packaging: Managed Cloud Helm chart suite under `infra/helm/workflow-platform` (values.yaml, _helpers.tpl, api, web, pre-install migration hook, pdb, ingress, networkpolicy) and Customer-Managed Compose bundle under `infra/compose` (compose.yaml, .env.example, check-prerequisites.sh, generate-credentials.sh, backup.sh, restore.sh, README.md). Host capacity pre-flight passes (Docker 29, Compose v2, 10 CPU, 16 GB RAM); PostgreSQL 16 custom-format dump/restore drill passes with 421,248 bytes. | Independent operator rehearsal in both deployment profiles and named human sign-offs |

### F2 closure re-audit — 2026-09-22

The [F2 closure audit](../../docs/audits/2026-09-22-configuration-f2-closure-audit.md) requalifies CS-10.
The deployment files exist, but their API/web environment names, health probes, signing inputs and
credential generation do not match the checked-in applications; referenced application images also lack a
checked-in reproducible build/provenance path. CS-10 is therefore not passed and F2 is No-Go pending the
bounded WI-OI-047 remediation. On 2026-09-22 the Product Owner/Solution Architecture reviewer ultimately
narrowed current execution to `configuration-local-development-v1` using the existing Docker/PostgreSQL/
MinIO stack; customer-managed production and cloud evidence are deferred. Current-source focused
Configuration tests still pass, but the applicable local deployment contradictions are not waived.

### PostgreSQL 16 recovery and replica evidence — 2026-09-16

The bounded recovery harness passed against the healthy local PostgreSQL 16 certification service. It
replayed all 35 forward migrations into a generated `gigalibs_pg16_cert_source_*` database, persisted an
attributable non-production IAM graph, confirmed 112 absolute-time columns, exercised generated Prisma
queries for the affected Tenant/Saga/Governor models, required an empty physical-schema diff, created a
same-major 420,338-byte custom backup and restored it into a separate generated database. Source/restored
record checksums and migration history matched. The harness removed both disposable databases and its
temporary dump; no raw credential or business record was written to the evidence file. The result is recorded in
`docs/audits/2026-09-09-readiness/evidence/uat/postgresql16-backup-restore-result.json`.

The two-replica certification activated a first manifest through replica A and primed the bounded cache on
replica B. With both replicas online, a second A activation invalidated and authoritatively reconciled B's
cached projection through the PostgreSQL notification consumer. B was then stopped while A activated a
third checksum; the restarted process read the current authoritative version. Rollback through B invalidated
A's primed cache, both listener gauges reported `1`, and four activation/rollback outbox records reached
`PUBLISHED`. The generated database and both child API processes were cleaned; evidence is in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-multi-replica-result.json`.

The upgrade certification replayed the accepted 33-migration predecessor, seeded attributable tenant
hierarchy, Saga, Governor and active Configuration state, then applied only the two new forward fixes. The
semantic-state checksum remained identical; the regenerated client read every repaired model; and the
upgraded API served the preserved active manifest before and after an application restart. The generated
database and temporary 33-migration directory were verified removed. Evidence is in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-upgrade-result.json`.

This closes clean replay, logical backup/restore, the 33→35 forward upgrade, application restart, local
database restart and local two-replica convergence. It does not prove WAL/PITR, representative-volume
RPO/RTO, host/storage loss, replica promotion or behavior inside either supported deployment profile.

The guarded database-restart harness verified that `gigalibs-postgres` was the local PostgreSQL 16 service
published on the configured port, migrated a generated database, persisted an active manifest and extension
value, and then stopped and restarted the full PostgreSQL container while the API stayed alive. Successful
in-flight responses retained the active checksum; unavailable requests produced 261 sanitized retryable
`503` responses with `Retry-After` plus one network interruption, with no unexpected HTTP response. A
test-attributable pending Configuration event became due while PostgreSQL was stopped; after recovery the
same API published it on attempt one and the listener received its valid notification. A certification-only
database trigger separately paused a publish after notification enqueue and before the `PUBLISHED` commit;
stopping PostgreSQL rolled the transaction back with zero receipt, and stale-claim recovery emitted exactly
one receipt on attempt two. The same API also read the pre-restart value and committed a version-2 write;
the manifest and updated value then survived an application restart. The generated database was verified
removed and the container was left running. Evidence is in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-database-restart-result.json`. This is a
local process and transport-transaction recovery drill only, not WAL/PITR, host loss, failover or
deployment-profile RPO/RTO evidence. Adopting-consumer convergence is certified separately by the cache-aware
two-replica and HTTP replay runs.

The local performance harness aligned the runtime contract and tenant-application surface with the accepted
250-field profile and added fail-closed enforcement of registered field-count and field-type limits. Against
one real NestJS API, PostgreSQL 16 and two isolated tenants, it measured 100 warm manifest reads, 80 reads
while 16 authors competed on one draft, 100 persisted high-field records with a 20-column list projection,
and primary-tenant reads while the second tenant wrote 25 high-field records. The latest post-contract run
recorded read p95 of 30.236 ms, 78.377 ms, 260.818 ms and 262.524 ms respectively; exactly one competing
edit won and 15 conflicted.
All durable records were accompanied by audit/outbox evidence and the generated database was verified
removed. The result is in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-performance-result.json`. These values
are local baseline measurements against the global NFR-PERF-002 two-second read budget, not independent
acceptance of either deployment profile; write SLO, browser rendering, indexed projection, failover and
provider-fault budgets remain open.

The contract-convergence audit replaced an aspirational incompatible manifest/OpenAPI draft with artifacts
that describe the implemented v1 boundary. AJV 2020-12 validates a real compiler result and rejects unknown
executable metadata plus a 251-field document; field/component/mode/compiler constants match the runtime;
and parsed OpenAPI covers all 32 controller method/path pairs, body-carried idempotency/concurrency fields,
the nested runtime-manifest envelope and implemented 200/201/503 status boundaries. It also requires all
eleven impact-change kinds to match between the runtime contract and OpenAPI and records the compatibility
classifier source hash. Artifact/source hashes are recorded in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-contract-convergence-result.json`.
Every one of the 32 operations now references a named v1 success-response contract. Shared strict Zod
schemas normalize persisted dates to ISO-8601 and reject undeclared top-level fields at the controller
boundary, preventing future Prisma columns from silently changing the public API. The real 250-field HTTP
lifecycle passed after enabling these projections. A separately implemented, dependency-free Java 11
client now compiles with warnings as errors and passes eleven conformance outcomes against a real compiler
fixture: all 13 field types/eight components, conditional/list references, strict unknown and duplicate
property rejection, response/manifest checksum agreement, resource limits and hostile component/condition/
timestamp cases. Evidence is in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-java-client-result.json`. The local HTTP
boundary now also compiles the Java HTTP transport with warnings as errors and uses it to decode the real
bearer-authenticated manifest. Six transport outcomes cover the valid response, invalid-token denial,
non-loopback cleartext prohibition, redirect refusal, media-type enforcement and the two-megabyte response
bound. Aggregate evidence is embedded in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-http-boundary-result.json`; the temporary
classes and database are removed and no bearer is persisted. Target-profile TLS/trust-chain behavior,
consumer-specific rendering and independent API/client acceptance remain open.

The compiler continuation moves compatibility classification into `@gigalibs/configuration-core` so the
control plane and tests use one policy implementation. Fixed-seed generated tests cover 960 compiler and
runtime-validation cases without accepting executable metadata, throwing on arbitrary JSON or changing a
checksum when only object-key insertion order changes. Thirteen policy cases enforce compatible optional
and presentation changes, conditional required/tightened/permission-reduction/projection changes, and
breaking type/key/invariant/authority relaxation. The repository baseline passes 62 TypeScript test files
with 587 tests plus four execution-plane tests. This is local automated evidence; named independent review
is still required.

The self-contained local HTTP-boundary harness creates a guarded disposable PostgreSQL 16 database,
replays all 35 migrations, starts the real control-plane API with one-run JWT, encryption, metrics and
configuration-package signing secrets, and deletes the database after the run. Its fifteen outcomes include
unauthenticated denial, server-derived tenancy/RBAC, maker-checker enforcement, membership/user/tenant
suspension, a live `TENANT_ADMIN` to `VIEWER` downgrade that removes authoring and value writes while
preserving the allowlisted runtime read, record-aware unsafe-activation denial and signed-package tamper
denial. It compiles the Java 11 transport with warnings as errors, decodes the real bearer-authenticated
manifest and passes five negative transport controls without persisting the credential. It also receives the
minimal versioned PostgreSQL notification after the outbox transaction commits,
simulates a worker crash by making the claim five minutes stale, and receives the at-least-once replay on
attempt two. The certified event produced two receipts, the adopting consumer incremented its bounded
deduplication counter only after the first successful processing, and the complete run received four
Configuration notifications. A test-attributable invalid envelope then failed permanently on attempt one, created the
required failure audit and emitted no notification. Aggregate evidence is in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-http-boundary-result.json`; no raw
credential is persisted. This is local transport/replay/permanent-failure and adopting-consumer evidence,
not transaction-commit failure injection, external-provider or named independent acceptance.

The static observability-conformance audit verifies that thirteen Configuration Studio database/cache/consumer metrics are
both emitted by the control plane and required by the authenticated live-scrape verifier. It parses six
module-scoped Prometheus alerts, a sixteen-panel Grafana dashboard and the operator runbook, checks that alerts
use the emitted outbox `status` label, and rejects high-cardinality tenant/user/record/event identifiers in
the dashboard. Artifact hashes and eight outcomes are recorded in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-observability-result.json`. This is
static wiring evidence. A separate guarded local run replayed all 35 migrations into a disposable
PostgreSQL 16.14 database, started the real API with a one-run scraper secret, rejected missing/invalid
credentials, observed collector health and listener connectivity at `1`, found all thirteen Configuration
metric families with honest empty state, passed route/identity cardinality safeguards and verified database cleanup. Its evidence is in
`docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-live-observability-result.json`.
Prometheus rule evaluation, dashboard import, fired-and-resolved notification routing and an independent
operator rehearsal in both deployment profiles remain required.

The first replica attempt exposed a physical naming mismatch in the 20260914 Saga/Governor/tenant-hierarchy
migration. Two forward migrations now align those columns/constraints/indexes with Prisma, retain existing
database actor foreign keys and defaults in the canonical datamodel, and add the missing activation lookup
index. Each migration includes compatibility and recovery instructions; no applied migration was edited.

### Core-field registry continuation — 2026-09-14

- Replaced the web-owned list of claimed AR surfaces with an exact authenticated proxy to the control-plane
  registry, preserving one definition authority and one response contract.
- Added typed core-field and extension-slot registration contracts. The tenant-profile reference surface
  declares locked `name`, `slug`, `status` and `region` fields with explicit lock reasons.
- Added fail-closed validation preventing a tenant definition from shadowing a registered core key.
- Added Studio presentation of locked core fields in the palette and preview canvas.
- Replaced the detached Studio page with a permission-gated global Studio mode. `/configuration` and the
  legacy `/studio/configuration` deep link now enter the contextual mode and return to the module catalogue;
  registered module screens retain their live content and navigation, add a floating Config control and open
  the three-pane designer as an in-place overlay.
- Registered the AR Customer and Invoice Draft screens as inspection-only surfaces. Their code-owned core
  attributes are visible and locked in the screen-local panel; authoring fails closed until DC-06 provides
  extension persistence plus the immutable issued-invoice snapshot.
- Verification: contracts, control-plane and workflow-platform TypeScript compilation passed; 4 focused
  registry/proxy/shadowing tests and 5 existing configuration renderer tests passed; `git diff --check`
  passed. All six mandatory static audit commands passed.
- Repository-wide build did not execute package compilation because existing package build scripts invoked
  a non-interactive `pnpm install` that attempted a modules-directory purge. The full Vitest run reached
  505 passing tests and 11 failures in pre-existing IAM containment and Prisma privacy-inventory coverage;
  none of those failures exercise this registry slice. These failures remain global verification blockers.
- The assembled workflow-platform Next.js production build passed and includes both `/configuration` and
  `/studio/configuration`; the navigation audit reports 78 page routes and 55 static internal links.
- Added a rolling-deployment compatibility decoder after a client exception was reported: legacy surface
  registrations that predate `coreFields` and `extensionSlots` now render with empty, fail-closed metadata,
  while non-array/malformed registry responses are rejected as controlled load errors instead of reaching
  React rendering. Three decoder regression tests, workflow-platform TypeScript and a fresh production
  build pass.
- AR authoring remains deliberately disabled. DC-06 must reconcile the AR-local forms/custom-fields
  authority, implement server-side extension validation/persistence and snapshot issued invoice extensions
  before either registered AR surface can create or activate tenant fields.

The bounded local-UAT implementation is visible as `REVIEW`; it is not `AVAILABLE`, production-certified or
an authority to generate arbitrary executable code. Custom fields and tenant-owned record pages are
zero-code. Authentication, finance invariants, provider integrations and external actions continue through
registered code-owned contracts.

The current percentage and remaining work are maintained in the [Configuration Studio implementation status](../../docs/audits/2026-09-09-readiness/universal-configuration-studio-status.md).
