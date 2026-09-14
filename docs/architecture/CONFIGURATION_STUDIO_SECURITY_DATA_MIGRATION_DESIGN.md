# Configuration Studio security, data and migration design

Status: Bounded implementation at G3–G4 for WI-OI-039; independent review required  
Requirements: FR-01–FR-06, FR-08, FR-10, FR-14–FR-16; NFR-GOV-001–003,
NFR-SEC-001–006, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004,
NFR-OBS-001–004 and NFR-OPS-001–004  
Decision authority: ADR-0002 after acceptance

## 1. Outcome and boundary

An authorized administrator can add a permitted field or layout change to a registered module surface,
obtain a deterministic impact result, publish an immutable version and activate it for an approved tenant
cohort. The owning module validates and persists the resulting business value in its own transaction.

Configuration Studio owns definitions, drafts, versions, approvals, manifests and activations. It does not
own customer, invoice, payment, supplier, asset, work-order or other canonical business records. It exposes
no arbitrary SQL, JavaScript, shell, URL invocation or generic canonical-table mutation.

## 2. Authority model

The server derives actor, platform authority, active tenant membership, tenant status, subscription/module
entitlement and effective permission from the canonical control plane on every command. Tenant identifiers
in route, header or payload data are never accepted as authority.

The minimum permissions are separately evaluated:

| Permission | Capability |
| --- | --- |
| `configuration:read` | View authorized registry, versions and activation health |
| `configuration:draft` | Create and edit a draft within permitted surfaces |
| `configuration:validate` | Compile and inspect a draft and its impact |
| `configuration:submit` | Submit a valid draft for review |
| `configuration:approve` | Approve a submitted change authored by another actor when separation is required |
| `configuration:publish` | Create an immutable published version from an approved checksum |
| `configuration:activate` | Plan and activate an approved version for an allowed cohort/environment |
| `configuration:rollback` | Select the compatible last-good version with a reason |
| `configuration:export` | Export signed metadata packages without records or secrets |

Platform-owned locked definitions may require platform authority in addition to tenant permission. Tenant
overlays can restrict presentation or access but cannot grant permissions, broaden classification access,
weaken required module constraints or replace registered business commands.

## 3. Data ownership and classification

Configuration metadata is `INTERNAL` by default. Labels and help text may be `PUBLIC`; permission mappings,
dependency topology and audit evidence are at least `INTERNAL`; security-sensitive configuration is
`CONFIDENTIAL`. Secrets are credential references and never occur in metadata documents, runtime manifests,
packages, previews, logs or audit payloads.

Business extension values inherit the higher classification of the field definition and source record.
The owning module enforces field read/write/mask/export policy before returning or accepting a value.
Search, report and export projections must preserve that policy and tenant boundary.

## 4. Command and runtime data flow

```text
Authoring browser
  -> authenticated configuration command API
  -> tenant/RBAC/surface authority
  -> optimistic change-set transaction
  -> deterministic compiler and impact analysis
  -> independent review
  -> immutable publication transaction + audit/outbox
  -> cohort activation + cache invalidation

Business browser
  -> owning module command API
  -> tenant/RBAC/object/field authority
  -> active manifest checksum verification
  -> structural and bounded-rule validation
  -> module invariants
  -> canonical record + extension values + audit/outbox transaction
```

The browser renderer cannot authorize a field or action. Hidden and disabled components are presentation
states; the module API repeats every permission, validation and invariant decision.

## 5. Persistence and transaction rules

CS-02 adds forward migrations for registry bindings, surfaces, component versions, fields, change sets,
drafts, findings, immutable published versions, dependencies, approvals, activations, extension values,
projections and audit/outbox. All tenant-owned rows carry a required tenant foreign key and tenant-leading
unique/index keys. Published content and approval evidence are append-only.

Publication locks the change set, verifies its approved checksum, allocates the next sequence and writes the
published version plus audit/outbox atomically. Activation verifies compatibility/dependencies and writes
the new selection plus invalidation event atomically. A module write commits its canonical record,
extension values, schema/checksum reference, audit and outbox in the module-owned transaction.

Idempotency records bind tenant, actor, operation, key, request checksum and stored outcome. Reusing a key
with different content is a conflict. Optimistic commands require `If-Match`; stale drafts and stale business
manifests fail without a partial write.

## 6. Compiler and expression safety

The compiler accepts versioned typed documents, rejects unknown properties and resolves platform, module
and tenant layers in a deterministic order. Canonical JSON serialization produces a SHA-256 checksum. The
same inputs and compiler version must produce the same manifest and checksum.

Conditions use the AST in the portable manifest schema. The compiler enforces node count, nesting depth,
field references, value types and operator compatibility. Patterns reference an allowlisted, reviewed
pattern key; tenant-authored regular expressions are prohibited until bounded-engine evidence exists.
There is no dynamic `Function`, `eval`, template execution, SQL or network access.

## 7. Threats and mandatory controls

| Threat | Required control and evidence |
| --- | --- |
| Cross-tenant definition/value access | Server-derived tenant; tenant-leading keys; API, DB, cache, search, export and audit negative tests |
| Permission escalation through layout metadata | Code-owned permission registry; overlay monotonicity check; server field enforcement |
| Mass assignment | Reject unknown fields; adapter allowlist; immutable/core fields excluded from extension document |
| Stored XSS | Plain-text defaults; allowlisted components/properties; contextual escaping; CSP and hostile-content tests |
| Expression/regex denial of service | Typed AST; depth/node/time budgets; registered patterns; fuzz and resource-limit tests |
| SSRF/external action injection | No URLs/actions in field metadata; only registered action keys through governed workflow contracts |
| Stale or poisoned cache | Tenant/role/locale/checksum cache key; signed/checksummed content; invalidation and last-good pin |
| Review bypass | State-machine constraints; author/approver separation by risk; checksum-bound approval |
| Secret/data exfiltration in package or AI prompt | Schema exclusion, classification/redaction, export scanner and provider-boundary tests |
| Record corruption after config change | Compatibility classification, migration checkpoint, stale-client conflict and immutable snapshots |

## 8. Compatibility, migration and recovery

Optional additions and label/layout changes are normally compatible. Required fields, tightened validation,
projection changes and permission reductions are conditional and require an explicit checkpoint. Type/key
reuse, in-use option removal, invariant relaxation and snapshot semantic changes are breaking or prohibited.

The database migration sequence is expand -> deploy compatible readers/writers -> backfill/projection build
-> verify -> activate. DDL uses bounded lock time and is rehearsed against clean PostgreSQL 16, the oldest
supported upgrade state and a restored backup. Configuration values are never silently coerced.

Rollback selects a compatible last-good manifest. It does not delete metadata or values, reverse an unsafe
business migration or rewrite issued financial records. Failed data/schema changes use a reviewed forward
fix or restore under the module recovery plan.

## 9. Cache, events and operations

Manifest cache keys include tenant, environment/cohort, module, entity, surface, mode, locale, effective
field policy and activation checksum. Missing or unverifiable manifests fail closed for dynamic fields;
module-coded canonical fields may continue only when their adapter contract explicitly permits it.

Outbox events are versioned and contain identifiers/checksums rather than definitions or business values:
`configuration.version.published.v1`, `configuration.activation.changed.v1`,
`configuration.projection.requested.v1` and `configuration.activation.failed.v1`. Consumers are idempotent,
checkpointed and observable. Metrics cover compilation, publication, activation, cache age/miss/error,
adapter conflicts, projection lag and rollback. Alerts link to tested runbooks.

## 10. AI boundary

AI is optional authoring assistance after the manual Studio and reference adapter pass. The server supplies
allowlisted registry context and receives a schema-validated draft proposal. AI cannot publish, activate,
create permissions, generate executable code/SQL/HTTP actions or handle runtime requests. Provider failure
returns an explicit unavailable/abstained result while every non-AI function remains operational.

## 11. Required reviews before Build

- Product accepts the first profile-field outcome and permitted administrator vocabulary.
- Architecture accepts ADR-0002, ownership, package topology and extraction boundary.
- Security accepts the threat model, classification, permission and expression controls.
- Backend/Data accepts the PostgreSQL 16 migration, transaction, projection, backup and recovery design.
- Web/Accessibility accepts component contracts and complete-state behavior.
- QA accepts the contract and acceptance matrix.

These reviews move WI-OI-039 toward Ready. They do not complete WI-OI-013, authorize production release or
certify an adopting business module.
