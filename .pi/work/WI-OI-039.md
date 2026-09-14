# WI-OI-039 — Universal dynamic configuration and forms core

Status: In Progress  
Owner: SDLC Orchestrator / Solution Architecture with Backend, Web and Domain owners  
Requirements: FR-01–FR-06, FR-08, FR-10, FR-14–FR-16; NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004  
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, affected Domain, Product  
Gate: G3–G4 Build; no product acceptance or release authorization

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
| CS-01 | Strict Zod definition, lifecycle, activation, extension-value and tenant-record contracts in `@gigalibs/contracts`; `listView` (columnKeys, sortKey/direction, searchableFieldKeys, quickFilters); `ListApplicationRecordsQuerySchema` (cursor pagination, sort, search, filter); template and saved-filter DTO schemas | Independent contract review and published compatibility-policy acceptance |
| CS-02 | Forward PostgreSQL migrations: change sets, immutable versions, activations, version-bound extension values, idempotency, tenant application records (20260913); `configuration_templates` with soft-delete/clone chain and `configuration_saved_filters` (20260914) | Restored-backup rehearsal and production-scale lock/volume evidence |
| CS-03 | Tenant-derived NestJS commands and queries with optimistic concurrency, idempotency, maker-checker approval and HTTP boundary certification | Wider suspended/downgraded-role matrix and independent security review |
| CS-04 | Deterministic allowlisted compiler, canonical SHA-256 manifests, resource limits, platform-only reserved keys with module-supplied domain reservations, credential-field rejection, sensitive-default rejection, server value validation, and a bounded conditional-expression AST with cycle/type/reference limits | Property-based fuzz coverage and wider compatibility cases |
| CS-05 | Environment/cohort activation, explicit older-version rollback, audit/outbox invalidation events and bounded lifecycle metrics | Multi-replica activation convergence, dashboards and failure injection |
| CS-06 | Registry-driven three-pane visual builder with component palette, responsive canvas and contextual inspector; persisted-record diff/impact review, publish/activate/rollback workflow, package UI and runtime preview | Nested condition-group authoring, preview-as-role, keyboard/screen-reader/browser matrix plus product acceptance |
| CS-07 | Shared React renderer for the 13 currently registered field types with browser-safe conditional visibility and requiredness parity | Cross-client conformance fixtures and the later Java renderer portability work |
| CS-08 | Tenant-profile extension adapter plus tenant-created application pages with real PostgreSQL CRUD, stale-write rejection and soft deletion; cursor-paginated list view with per-manifest column projection, in-memory search/filter, stale-flag; single-record detail endpoint; template CRUD (create/update/duplicate/delete) and saved-filter CRUD via raw SQL | AR financial snapshot adapter remains a later domain-owned slice |
| CS-08a | Mask/export policy: `maskValues` redacts CONFIDENTIAL/RESTRICTED field values to `"***"` unless actor holds `configuration:unmask-sensitive`; `exportPackage` strips `defaultValue` from sensitive field definitions unless actor holds `configuration:export-sensitive` | Security review of masking boundary and export trust model |
| CS-09 | Isolated PostgreSQL and authenticated HTTP certifications cover lifecycle, tenant isolation, field security, conditional-required denial, values, tenant apps, record-aware impact and unsafe-activation denial, explicit rollback, signed package export/import/tamper denial, audit and outbox | Backup restore, multi-replica/performance/accessibility evidence, observability dashboards, runbook rehearsal and named independent approvals |

The bounded local-UAT implementation is visible as `REVIEW`; it is not `AVAILABLE`, production-certified or
an authority to generate arbitrary executable code. Custom fields and tenant-owned record pages are
zero-code. Authentication, finance invariants, provider integrations and external actions continue through
registered code-owned contracts.

The current percentage and remaining work are maintained in the [Configuration Studio implementation status](../../docs/audits/2026-09-09-readiness/universal-configuration-studio-status.md).
