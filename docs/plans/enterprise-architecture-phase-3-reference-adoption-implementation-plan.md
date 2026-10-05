# Enterprise Architecture Phase 3 — Reference Adoption, Core Parties and Bounded Custom Apps

- **Status:** Proposed implementation plan; not an active Build item
- **Recorded:** 2026-10-03
- **Work item:** To be allocated by the SDLC Orchestrator after WI-OI-110 exits Build
- **Depends on:** WI-OI-109, WI-OI-110, ADR-0002, ADR-0013, ADR-0016, ADR-0018 and ADR-0019
- **Requirements:** FR-01, FR-04, FR-05, FR-14 and FR-15; applicable security, data, reliability,
  performance, accessibility and observability NFRs

## 1. Phase outcome

Phase 3 proves that the Phase 2 Application Dictionary can safely extend a real shared master without
turning GigaLibs into an ungoverned generic database.

An authorized tenant administrator can:

1. maintain canonical organizations and people as Parties;
2. assign one or more governed roles such as Customer, Supplier, Contractor, Agency, Carrier or Partner;
3. add approved tenant-specific fields and layouts through Configuration Studio;
4. create a bounded tenant-owned non-core application without a source-code release;
5. publish navigation, forms, lists, details and registered actions to web/tablet/mobile manifests;
6. promote, activate, roll forward or pin the last-good configuration without changing canonical business
   invariants.

This is the bridge between the iDempiere-inspired Application Dictionary and later business modules. It
adapts the useful Business Partner idea while preserving GigaLibs tenant isolation, organization scope and
module ownership.

## 2. Why this phase is next

WI-OI-110 already uses Tenant Profile as its low-risk dictionary adopter. Building another metadata engine
or repeating that adopter would create rework. The next proof must demonstrate two harder cases:

- a canonical shared master used by several future modules: **Core Parties**;
- a tenant-owned, explicitly non-core record type: **Bounded Custom App**.

ADR-0013 already assigns organizations and contacts such as customers, suppliers and contractors to Core
Parties. Phase 3 implements that authority. AR, AP, Procurement, Workforce and CMMS may reference a Party
contract later, but this phase does not move or delete their existing records.

## 3. Non-goals

Phase 3 does not implement:

- invoices, bills, payments, accounting, tax, bank or inventory transactions;
- a general ledger or Finance Ops expansion;
- arbitrary tenant tables or runtime DDL;
- a generic API that can patch module-owned tables;
- arbitrary SQL, JavaScript, expressions, webhooks or executable scripts;
- workflow execution, provider adapters or external actions;
- destructive migration of existing AR customers, AP suppliers or CMMS vendors;
- production or cloud release.

## 4. Personas and business outcomes

| Persona | Required action | Observable outcome |
| --- | --- | --- |
| Platform administrator | Register locked Party fields, roles, references and action handlers | One versioned platform baseline is available to entitled tenants |
| Tenant configurator | Add approved fields, sections, list columns, labels and validation | Tenant-specific Party experience is created without product code |
| Configuration approver | Review impact, approve, publish and activate | Maker and approver are distinct and the active checksum is auditable |
| Tenant administrator | Create, edit, classify, merge and archive Parties | One canonical Party can act in multiple roles without duplicated identity |
| Authorized member | Search and view Parties inside effective tenant/org scope | Unauthorized records and fields are not disclosed |
| Custom app builder | Define a bounded non-core entity and its views | A simple tenant application becomes usable without runtime DDL |
| Auditor | Inspect versions, actors, changes, accesses and exports | Every material action is attributable and reconstructable |

## 5. Canonical ownership and data model

### 5.1 Core Parties

The canonical model should contain these logical records. Physical names are finalized during G2 design.

| Record | Required semantics |
| --- | --- |
| `Party` | Tenant-bound organization or person; stable UUID, code, name, status, classification, version and lifecycle dates |
| `PartyRole` | Effective-dated allowlisted role such as CUSTOMER, SUPPLIER, CONTRACTOR, AGENCY, CARRIER or PARTNER |
| `PartyIdentifier` | Typed external, registration or tax identifier; country/issuer scope; uniqueness and sensitivity rules |
| `PartyContactPoint` | Email, phone or URL with purpose, verification, primary flag and effective dates |
| `PartyAddress` | Versioned postal/service/billing/shipping address with country and validation status |
| `PartyRelationship` | Typed effective-dated relationship between two Parties; cycle rules where applicable |
| `PartyOrgAssignment` | Links a Party to a WI-OI-109 organization unit and purpose without widening access |
| `PartyExtensionSnapshot` | Manifest/checksum reference used when a consuming domain must retain an immutable snapshot later |

Every row is tenant-bound. Organization assignment narrows scope but never establishes tenant authority.
PlatformContext and the server-resolved WI-OI-109 scope determine access.

### 5.2 Bounded custom records

Reuse the existing `ConfigurationRecord`, `ConfigurationTemplate`, `ConfigurationSavedFilter`, published
version, activation, extension-value, audit and outbox foundations. Do not create a second generic-record
store.

A tenant-defined entity must be declared `NON_CORE` and may not impersonate reserved owners such as Party,
User, Tenant, Invoice, Payment, Supplier Invoice, Asset, Work Order, Journal, Workflow, Audit or Credential.

Custom records require:

- tenant, environment and optional organization-unit scope;
- active manifest version and checksum;
- optimistic version;
- created/updated/archived actor and timestamps;
- bounded indexed projections selected from an allowlist;
- classification, retention and export policy;
- audit and transactional outbox evidence.

## 6. API contract

Extend the existing Configuration Studio and module gateway contracts; do not create parallel APIs.

### 6.1 Party API

Proposed versioned contract surface:

```text
GET    /v1/parties
POST   /v1/parties
GET    /v1/parties/{partyId}
PATCH  /v1/parties/{partyId}
POST   /v1/parties/{partyId}/archive
POST   /v1/parties/{partyId}/restore
POST   /v1/parties/{partyId}/merge-preview
POST   /v1/parties/{partyId}/merge
GET    /v1/parties/{partyId}/roles
POST   /v1/parties/{partyId}/roles
PATCH  /v1/parties/{partyId}/roles/{roleId}
GET    /v1/parties/{partyId}/addresses
POST   /v1/parties/{partyId}/addresses
PATCH  /v1/parties/{partyId}/addresses/{addressId}
GET    /v1/parties/{partyId}/contacts
POST   /v1/parties/{partyId}/contacts
PATCH  /v1/parties/{partyId}/contacts/{contactId}
```

List APIs use cursor pagination, bounded page sizes, deterministic ordering, indexed filters and explicit
field projections. Commands require an idempotency key; updates require expected version/ETag. Errors use
the platform problem-details contract without confirming inaccessible records.

### 6.2 Configuration/runtime APIs

Reuse and complete the existing endpoints for:

- dictionary descriptors and contributions;
- change sets, impact, submit, approve, reject and publish;
- activations and rollback/last-good pinning;
- runtime manifests and preview manifests;
- custom application records, templates and saved filters;
- package import/export without customer records or secrets.

Generated gateways enforce the same permission and organization scope as direct module APIs.

## 7. Permissions

Start deny-by-default with separate permissions:

```text
parties:read
parties:create
parties:update
parties:archive
parties:merge
parties:identifiers.manage
parties:restricted.read
configuration-apps:read
configuration-apps:write
configuration-apps:export
configuration:draft
configuration:submit
configuration:approve
configuration:publish
configuration:activate
```

Merge, restricted identifiers, publication and activation are privileged actions. UI visibility is not
authorization. Preview requires both configuration-preview permission and normal record permission and
must never create normal tenant membership.

## 8. Web, tablet and mobile experience

### 8.1 Party workspace

Provide one GigaLibs/Medusa UI workspace with:

- overview counters derived from real records;
- searchable/filterable Party table;
- organization/person and role filters;
- create/edit drawer with server validation;
- dossier tabs for overview, roles, contacts, addresses, identifiers, relationships, organization scope,
  extensions and audit;
- duplicate candidates and governed merge preview;
- archive/restore with reason;
- import preview, row validation, quarantine and result receipt;
- export with field-level masking and auditable authorization.

Every surface implements loading, genuine empty state, validation, denied, not found without disclosure,
conflict, stale manifest, retryable error and success states. Focus management, keyboard operation, live
announcements, accessible tables and WCAG 2.1 AA contrast are mandatory.

### 8.2 Bounded custom app builder

Configuration Studio provides:

- entity metadata and reserved-key validation;
- field/reference/relationship editor;
- validation-rule builder using the bounded safe AST;
- form, detail, list, tab and section designer;
- navigation contribution and icon selection;
- permission mapping;
- web/tablet/mobile presentation preview;
- dependency and breaking-change impact view;
- maker-checker publication and activation;
- runtime list/detail/create/edit/archive screens.

Mobile manifests may render approved field operations. Full custom application administration remains web
or tablet only.

## 9. Event, audit and observability contract

Core Parties emits versioned post-commit facts such as:

```text
party.created.v1
party.updated.v1
party.role.changed.v1
party.archived.v1
party.merged.v1
```

Events include tenant, party, version, actor, correlation, causation and organization-scope references but
exclude restricted identifiers and contact values unless the consumer contract explicitly permits them.

Metrics cover request outcome/latency, manifest/checksum conflicts, validation rejection, merge conflicts,
outbox backlog, record counts by status, import quarantine and tenant/org authorization denial. Logs never
contain unrestricted PII.

## 10. Implementation slices

| Slice | Delivery | Exit evidence |
| --- | --- | --- |
| P3-0 | Reconcile existing Customer, Supplier, vendor, contact and custom-record owners; ADR and threat model | No duplicate authority or unresolved migration owner |
| P3-1 | Strict Party, role, address, identifier, relationship and event contracts | Contract tests and compatibility policy pass |
| P3-2 | Forward PostgreSQL migration, forced RLS, composite tenant FKs, indexes and recovery plan | Clean install and representative upgrade pass |
| P3-3 | Party domain invariants, repository transactions, idempotency, concurrency, audit and outbox | Unit, real-DB, race and replay tests pass |
| P3-4 | Party API, generated client and adapter contribution to WI-OI-110 dictionary | OpenAPI/runtime/consumer tests pass |
| P3-5 | Party workspace and complete UI states | Browser, accessibility and permission tests pass |
| P3-6 | Harden existing custom record/template/filter APIs and generic runtime renderer | Tenant-created non-core app survives restart and refresh |
| P3-7 | Promotion, import/export, last-good pin, deprecation and compatible evolution | Package promotion and rollback/forward-fix journey passes |
| P3-8 | Integrated two-tenant/two-org certification and evidence packet | `pnpm verify` and all Phase 3 certification pass |

Slices remain inside one allocated work item unless the SDLC Orchestrator deliberately splits them. Only
one slice changes product behavior at a time, with evidence appended after each accepted boundary.

## 11. Compatibility and migration strategy

- Existing AR Customer, AP Supplier and CMMS vendor tables remain authoritative for their current frozen
  slices during Phase 3.
- Phase 3 defines stable Party reference contracts and a deterministic mapping registry; it does not silently
  rewrite existing foreign keys.
- Later module-specific convergence uses copy → verify → dual-read only where approved → switch → retire.
- No applied migration is edited. Every change is forward-only and tested from empty and representative
  predecessor schemas.
- Duplicate detection never auto-merges. Merge requires preview, permission, reason and an immutable alias
  from the retired Party to the survivor.
- Published metadata keys are never renamed or deleted; deprecation and replacement preserve old records.

## 12. Production-readiness verification

Minimum certification includes:

1. contract/schema/compiler tests for all metadata and Party constructs;
2. real PostgreSQL tests for constraints, RLS, transactions and query plans;
3. two tenants, two users and sibling organization-scope positive/negative tests;
4. privilege revocation during an active session;
5. idempotent create/import and concurrent update/merge tests;
6. PII masking, export authorization, retention and audit tests;
7. outbox retry, duplicate delivery, DLQ and authoritative resync;
8. manifest checksum/ETag, stale client, last-good and incompatible-change tests;
9. refresh, process restart, clean install, upgrade, backup/restore and roll-forward evidence;
10. Playwright desktop/tablet journeys, keyboard and automated/manual accessibility checks;
11. bounded performance tests for list/search and manifest loading;
12. SBOM, vulnerability, exact-image, provenance and deployment-profile evidence;
13. full `pnpm verify` with no new drift.

## 13. Definition of Done

Phase 3 is complete only when:

- Core Parties is the accepted canonical owner for organizations/contacts and multi-role partners;
- one tenant extends Party safely through the Application Dictionary;
- a second tenant has a different overlay with zero leakage;
- a tenant creates and operates one bounded non-core app without source-code changes or runtime DDL;
- web/tablet/mobile clients consume the same immutable manifest family;
- permissions, field masking and WI-OI-109 organization scope are enforced server-side;
- every confirmed mutation persists through refresh and restart and emits audit/outbox evidence;
- clean install, representative upgrade, backup/restore and last-good recovery pass;
- API, database, event, UI and completeness registers reconcile with implementation;
- named independent Security, Backend/Data, API Contracts, Web/Accessibility, QA and Product decisions are
  recorded.

## 14. Start gate

Before product code changes, the owner and SDLC Orchestrator must:

1. move WI-OI-110 out of active Build with its evidence preserved;
2. allocate a stable work-item identifier for Phase 3;
3. complete G0-G3 decisions for Party ownership, PII, tenant/org scope, contracts and migration;
4. confirm whether Customer Profile is the first Party-role adopter or remains deferred with AR;
5. approve the proposed Phase 3 task card.

Until those conditions are met, this document is an implementation-ready plan and bookmark, not an
authorization to change product code, migrations or the running local environment.
