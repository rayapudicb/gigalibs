# Enterprise Architecture Phase 4 — Product, Service, UOM, Catalogue and Pricing Foundation

- **Status:** Approved for WI-OI-112 Build on 2026-10-03; corrective implementation in progress
- **Recorded:** 2026-10-03
- **Candidate work item:** WI-OI-112, subject to SDLC Orchestrator allocation and owner approval
- **Depends on:** WI-OI-109, WI-OI-110, WI-OI-111, ADR-0001, ADR-0002, ADR-0013,
  ADR-0016, ADR-0018, ADR-0019 and ADR-0020
- **Requirements:** FR-01, FR-04, FR-05, FR-11, FR-14 and FR-15, plus applicable security,
  data, reliability, performance, accessibility, observability and operational NFRs

## 1. Phase outcome

Phase 4 gives each tenant one governed, industry-agnostic authority for the things it sells, buys, uses or
references: products, services, resources, categories, units of measure, attributes, catalogues and effective-
dated prices.

An authorized tenant administrator can create these masters through the UI, scope their availability to the
WI-OI-109 organization hierarchy, extend approved fields through the WI-OI-110 Application Dictionary, and
publish versioned catalogues without a developer or database change.

The same foundation must support retail items, restaurant menu items, agricultural inputs and produce,
manufactured goods, maintenance parts, healthcare services, insurance products, transport services,
government service catalogues and professional services. Industry packs provide governed templates and
reference values; they do not hardcode a tenant's products or prices.

## 2. Architectural decision

Create a selectable **Product Catalogue business capability module**, hosted in the shared module host by
default. It owns product and commercial catalogue definitions but is not part of the kernel. Consumers use its
versioned contracts, APIs, immutable snapshots and outbox facts; they never import its code or query its schema.

This adapts the useful iDempiere concepts around `M_Product`, `M_Product_Category`, `C_UOM`,
`M_PriceList`, `M_PriceList_Version`, `M_ProductPrice` and product attributes. It rejects iDempiere's shared
numeric IDs, Org 0 bypass, mutable global context, direct cross-domain table access, SQL validation fragments,
active-record coupling and implicit price resolution.

Phase 4 is not the deferred Finance/BigCapital programme. Finance remains bookmarked in
`docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md`.

## 3. Existing GigaLibs reconciliation

| Existing concept | Current meaning | Phase 4 treatment |
| --- | --- | --- |
| `ProductCatalogItem` in the control-plane Prisma schema | Thin tenant rate catalogue with free-text category/UOM, cents and tax percentage | Freeze new adoption; map to the new authority through an explicit compatibility adapter; retire only after every consumer and row is reconciled |
| `Price` in the control-plane Prisma schema | GigaLibs plan/subscription billing price | Keep separate; it is platform commercial billing, not a customer's product price |
| AR invoice line descriptions and values | Financial document-owned transactional snapshots | Preserve immutable snapshots; optionally reference a product ID without making AR dependent on live catalogue values |
| CMMS parts and MRO material | Maintenance-local definitions and operational consumption | Product identity can converge later; stock, lots, bins, reservations and valuation remain Inventory ownership under WI-OI-091 |
| AP/Procurement line items | Purchasing documents and supplier terms | Procurement remains owner; it may consume product references and snapshot agreed values later |
| Configuration Studio catalogues | Governed metadata/reference values | Reuse for UI metadata and extensions; do not use as the commercial product or price transaction store |
| Industry packs | Versioned solution configuration | May install proposed categories, attributes and UOM references through maker-checker; never create hidden customer business data |

No existing table is silently renamed, reinterpreted, copied or deleted. Every adoption needs an inventory,
mapping rule, row-count/checksum proof, compatibility period and explicit retirement decision.

## 4. Ownership boundaries

| Concept | Canonical owner |
| --- | --- |
| Product/service identity, category, attribute definition and sell/buy/use flags | Product Catalogue |
| Commercial catalogue and effective-dated list price | Product Catalogue |
| Units, dimensions and approved conversions | Product Catalogue reference domain |
| Tenant, user, permission and entitlement authority | Kernel IAM/Tenancy |
| Organization scope | WI-OI-109 Organization Hierarchy |
| Manufacturer, brand owner, supplier or customer identity | WI-OI-111 Core Parties |
| Extension fields, layouts and runtime manifests | WI-OI-110 Application Dictionary / Configuration Studio |
| On-hand quantity, warehouse, locator, lot/serial, reservation, movement and valuation | Future Inventory module, WI-OI-091 |
| Requisition, supplier agreement, purchase order and receipt | Future Procurement & Vendors module, WI-OI-092 |
| Tax determination and calculation | Tax module |
| Currency conversion | Multi-Currency module |
| Invoice, credit, payment and financial-document snapshot | AR/AP owning module |
| Bill of materials, routing and production | Future manufacturing capability, not Phase 4 |
| Platform subscription plans and prices | Platform billing, not Product Catalogue |

Product Catalogue must remain usable without Inventory, Procurement, AR or Finance. Those modules may also
operate with free-text document lines where their accepted contracts permit it.

## 5. Canonical domain model

Physical names are finalized in the Phase 4 ADR and G2 data design. Every mutable row is tenant-bound, uses a
stable UUID, optimistic version, actor/timestamps, lifecycle status and organization-aware access policy.

| Aggregate/record | Required semantics |
| --- | --- |
| `Product` | Stable identity, tenant product code, type, names/descriptions, lifecycle, base UOM, classification and sell/buy/use capabilities |
| `ProductCategory` | Versioned hierarchy with deterministic cycle prevention and effective dates |
| `ProductIdentifier` | Typed SKU, GTIN/barcode, manufacturer, external-source or tenant alias; issuer and uniqueness rules |
| `ProductPartyRole` | Effective-dated manufacturer, brand owner or preferred-party relationship referencing Core Parties |
| `UomDefinition` | Dimension, code, symbol, precision, rounding and lifecycle; ISO/UCUM reference where applicable |
| `UomConversion` | Explicit same-dimension conversion using safe decimal/rational values, direction and effective dates |
| `ProductUom` | Allowed order, sell, purchase or consumption UOM and product-specific conversion where valid |
| `AttributeDefinition` | Typed governed attribute with classification, unit/reference rules and allowed values |
| `ProductAttributeValue` | Validated value for a product and attribute definition |
| `ProductRelation` | Substitute, accessory, component-reference or related item; no inventory/BOM execution semantics |
| `Catalogue` | Named audience/channel/purpose container, tenant-bound and optionally organization-scoped |
| `CatalogueVersion` | Immutable draft/approved/published version with checksum and effective window |
| `CatalogueEntry` | Product availability, display order and channel-specific presentation in one version |
| `PriceList` | Currency, tax-inclusion flag, audience/purpose, organization scope and publication policy |
| `PriceListVersion` | Immutable, approved, effective-dated price set with deterministic precedence |
| `ProductPrice` | Product, UOM, quantity break and exact decimal list/standard/limit values in one price-list version |
| `ProductExtensionSnapshot` | Application Dictionary manifest/checksum used to validate and reconstruct extensions |
| `ProductReferenceMapping` | Explicit source-system/module reference mapping; never an invisible foreign-key rewrite |
| `ProductIdempotencyRecord` | Bounded command replay protection |

### 5.1 Required invariants

- No floating-point money or quantities. Use bounded decimals with currency/UOM precision.
- A conversion may only connect compatible dimensions and may not create ambiguous or cyclic paths.
- Tenant product code and constrained identifiers are unique within their declared scope.
- Published catalogue and price-list versions are immutable; corrections create a new version.
- Effective windows for the same precedence key cannot overlap ambiguously.
- Organization assignment narrows visibility or availability but never establishes tenant membership.
- Archived products remain resolvable for historical snapshots and references.
- A price result always records the selected version, rule/precedence path, currency, UOM and effective instant.
- Extensions cannot replace locked identity, money, UOM, lifecycle, scope or publication fields.

## 6. Product types and terminology

Start with a small stable vocabulary:

```text
GOOD | SERVICE | DIGITAL | RESOURCE | BUNDLE
```

Industry language such as Item, Menu Item, Crop Input, Procedure, Policy Product, Fare, Spare Part or Public
Service is supplied through dictionary labels and industry packs. It does not create a new physical model.

`BUNDLE` in Phase 4 is a commercial grouping only. Executable bills of material, kits that decrement stock,
formulas, recipes and production routings belong to later Inventory/Manufacturing work.

## 7. API contract

The proposed versioned surface is:

```text
GET    /v1/products
POST   /v1/products
GET    /v1/products/{productId}
PATCH  /v1/products/{productId}
POST   /v1/products/{productId}/archive
POST   /v1/products/{productId}/restore

GET    /v1/product-categories
POST   /v1/product-categories
PATCH  /v1/product-categories/{categoryId}

GET    /v1/uoms
POST   /v1/uoms
POST   /v1/uom-conversions
POST   /v1/uom-conversions/resolve

GET    /v1/product-attributes
POST   /v1/product-attributes
PATCH  /v1/product-attributes/{attributeId}

GET    /v1/catalogues
POST   /v1/catalogues
POST   /v1/catalogues/{catalogueId}/versions
POST   /v1/catalogues/{catalogueId}/versions/{versionId}/submit
POST   /v1/catalogues/{catalogueId}/versions/{versionId}/approve
POST   /v1/catalogues/{catalogueId}/versions/{versionId}/publish

GET    /v1/price-lists
POST   /v1/price-lists
POST   /v1/price-lists/{priceListId}/versions
POST   /v1/price-lists/{priceListId}/versions/{versionId}/submit
POST   /v1/price-lists/{priceListId}/versions/{versionId}/approve
POST   /v1/price-lists/{priceListId}/versions/{versionId}/activate
POST   /v1/prices/resolve
```

Lists use cursor pagination, bounded page size, deterministic ordering, indexed filters and explicit field
projections. Commands require idempotency keys. Updates require expected version/ETag. Errors use platform
problem details and never disclose an inaccessible tenant/org record.

`POST /v1/prices/resolve` accepts product, quantity, UOM, currency, organization, audience/party context and
effective instant. It returns the exact price plus a non-sensitive resolution trace. It does not calculate tax,
currency conversion, discount campaigns, inventory availability or financial postings.

## 8. Permissions and maker-checker

Start deny-by-default with separate permissions:

```text
products:read
products:create
products:update
products:archive
products:identifiers.manage
products:restricted.read
product-categories:manage
uoms:read
uoms:manage
catalogues:read
catalogues:draft
catalogues:submit
catalogues:approve
catalogues:publish
pricing:read
pricing:draft
pricing:submit
pricing:approve
pricing:activate
products:import
products:export
```

The maker cannot approve their own catalogue or price-list version. UI visibility is not authorization.
Preview requires normal record access plus the appropriate preview permission and cannot widen organization
scope.

## 9. Web, tablet and mobile experience

Add a manifest-contributed **Product & Catalogue Studio**, not hardcoded shell navigation.

### 9.1 Web/tablet administration

- Overview with real counts, publication state, expiring versions and validation failures.
- Products & Services searchable grid with create/edit drawer and bulk actions.
- Product dossier: overview, identifiers, categories, UOM, attributes, related products, party links,
  organization availability, catalogue membership, pricing, extensions and audit.
- Category tree with keyboard-safe re-parenting and cycle validation.
- UOM and conversion workbench with dimension/precision warnings and conversion preview.
- Catalogue version editor with diff, validation, submit, approve, publish and last-good visibility.
- Price-list version grid with effective dates, quantity breaks, controlled bulk edit/import and resolution test.
- Import preview with column mapping, row-level validation, quarantine, idempotent retry and result receipt.
- Export with field masking, authorization, audit and asynchronous handling above the bounded threshold.

Every surface implements loading, real empty, denied, not-found-without-disclosure, invalid scope, validation,
conflict, stale version, retryable failure, success and partial import states. WCAG 2.1 AA keyboard, focus,
announcement, contrast and accessible-table behavior is required.

### 9.2 Mobile contract

Mobile receives manifest-driven read/search/scan/lookup and limited authorized field actions. Full category,
UOM, catalogue and price publication administration remains web/tablet. Tenant-branded mobile applications use
the same APIs and entitlements; no tenant-specific business logic is compiled into the shared mobile core.

## 10. Events, audit and observability

Emit versioned post-commit facts through the transactional outbox:

```text
product.created.v1
product.updated.v1
product.archived.v1
product.category.changed.v1
catalogue.version.published.v1
price-list.version.activated.v1
uom.conversion.changed.v1
```

Events contain tenant, actor, correlation, causation, aggregate/version and bounded non-sensitive facts. Consumers
are idempotent. No event includes restricted identifiers, complete extension payloads or undisclosed price lists.

Audit must reconstruct actor, reason, before/after version, approval chain, organization scope, import/export
receipt and price-resolution version. Metrics include request latency/error rate, search latency, publication
failures, price-resolution outcomes, conversion failures, outbox lag and consumer dead letters. Logs and traces
carry tenant-safe correlation IDs without product-sensitive values.

## 11. Implementation slices

### P4-0 — Ownership inventory and ADR

- Inventory `ProductCatalogItem`, platform `Price`, invoice/AP lines, CMMS parts, master-data catalogues,
  imports, APIs, navigation, permissions and consumers.
- Decide the canonical module/schema, migration compatibility windows and retirement gates.
- Add a Phase 4 ADR and threat/data-classification model.
- Stop if any current consumer would be silently re-owned.

### P4-1 — Contracts and module skeleton

- Add the Product Catalogue module manifest, permissions, health, module-host registration and entitlement.
- Add versioned public contracts for products, UOM, catalogue, pricing, events and immutable consumer snapshots.
- Add module-boundary and API-boundary audit fixtures.

### P4-2 — Forward-only persistence

- Add module-owned PostgreSQL schema, migrations, RLS/policies, composite tenant references and indexes.
- Add lifecycle, optimistic concurrency, idempotency, audit and outbox persistence.
- Prove empty install, representative upgrade, roll-forward/recovery and unchanged existing row checksums.

### P4-3 — Product, category, UOM and attribute domain

- Implement invariants, repositories, commands/queries and safe errors.
- Implement category cycle detection, UOM compatibility/precision and identifier validation.
- Add organization availability and Core Party references without cross-schema reads.

### P4-4 — Catalogue and pricing lifecycle

- Implement immutable versions, diff, validation, maker-checker and effective activation.
- Implement deterministic price resolution and resolution trace.
- Prove temporal boundaries, quantity breaks, UOM precision and concurrency.

### P4-5 — Application Dictionary adoption

- Register locked module descriptors and allowlisted `ProductConfigurationAdapterV1` handlers.
- Support safe tenant extension fields, labels, sections, list columns and validations.
- Compile web/tablet/mobile manifests with checksum and last-good behavior; no runtime DDL or code execution.

### P4-6 — Product & Catalogue Studio

- Deliver the accessible web/tablet workspace, drawers, dossier, category/UOM tools, version editors and audit.
- Contribute navigation through the module manifest.
- Add component, contract, browser and accessibility tests for every state.

### P4-7 — Import, export and interoperability

- Implement bounded CSV/XLSX import preview, mapping, validation, quarantine and idempotent commit.
- Use durable background jobs for large imports/exports with progress, cancellation and receipts.
- Add explicit external/reference mapping; no default tenant or silent fallback.

### P4-8 — Consumer convergence

- Add compatibility adapters and immutable snapshot contracts for approved consumers.
- Prove AR/CMMS or another chosen pilot can reference a product without schema access or runtime dependence.
- Keep legacy paths until parity, data reconciliation and owner-approved retirement.

### P4-9 — Local certification and review

- Run real PostgreSQL two-tenant/two-organization certification, RLS, revocation and sibling-denial tests.
- Run empty-install/upgrade/recovery, concurrency, audit/outbox, accessibility and bounded performance proofs.
- Run exact-image scans and full `pnpm verify`.
- Record independent Security, IAM/Tenancy, Backend/Data, API Contracts, Web/Accessibility and QA decisions.

## 12. Required test matrix

- Tenant A cannot discover, reference, price, export or mutate Tenant B records.
- A member scoped to one organization cannot discover sibling-only availability or prices.
- Revocation affects the next request and invalidates any scope-sensitive cache.
- Duplicate idempotency keys replay the original result and never create duplicate aggregates/events.
- Stale ETags and simultaneous edits return deterministic conflicts.
- Category/product relations reject cycles and cross-tenant links.
- UOM conversions reject dimension mismatch, ambiguity, overflow and invalid rounding.
- Published versions cannot be changed; future activation and boundary instants resolve correctly.
- Price resolution is deterministic across organization, audience, UOM, quantity and time precedence.
- Restricted identifiers and price lists are masked from errors, logs, audit payloads and events.
- Imports prove hostile spreadsheet formula neutralization, duplicate detection, quarantine and safe retry.
- Consumer snapshots retain historical descriptions, UOM and price provenance after master changes.
- Dictionary extensions cannot override locked fields or introduce SQL/script/external execution.
- UI proves keyboard-only use, focus recovery, announcements, responsive tablet layout and accessible tables.
- Empty install, upgrade from the current schema, failed migration recovery and restore are proven.

## 13. Definition of Done

Phase 4 may enter Review only when:

- one module is the documented product/UOM/catalogue/pricing authority;
- real UI, APIs and PostgreSQL persistence work without mock or fixture fallback;
- tenant and organization isolation is enforced server-side and in PostgreSQL;
- published catalogue and price versions are immutable and maker-checker controlled;
- deterministic price and UOM resolution are proven with real database tests;
- Application Dictionary extensions work without runtime DDL or arbitrary execution;
- at least one approved consumer uses a public contract/snapshot without cross-schema access;
- legacy records are either reconciled or explicitly retained with no false retirement claim;
- audit, outbox, observability, failure/recovery, import/export and accessibility evidence is complete;
- `pnpm verify` and slice-specific exact-image certification pass;
- named independent reviews are recorded;
- production/cloud release remains a separate human decision.

## 14. Decisions required before Build

1. Confirm Product Catalogue is a selectable business capability module, not kernel storage.
2. Confirm Phase 4 includes governed list pricing but excludes tax calculation, promotions, supplier agreements,
   inventory valuation and accounting.
3. Approve the initial product types and whether `BUNDLE` is included in the first slice.
4. Approve the UOM source policy: platform reference definitions plus tenant-approved additions, with no magic
   default unit.
5. Choose the first consumer proof: AR line snapshot, CMMS part reference, or a neutral custom application.
6. Approve coexistence and later retirement rules for `ProductCatalogItem`; do not reuse platform `Price`.
7. Allocate the stable work-item ID and named independent reviewers after WI-OI-111 is accepted or otherwise
   formally leaves the sole active Build slot.

## 15. Recommended first vertical slice

Use one tenant with two sibling organizations. Through UI only, an administrator:

1. creates a unit and a compatible conversion;
2. creates a service and a stocked-good definition without creating stock;
3. assigns organization availability and a Core Party manufacturer;
4. adds one approved extension field through Configuration Studio;
5. creates, submits, independently approves and activates a USD price-list version;
6. resolves a price at two quantity/effective-date boundaries;
7. consumes an immutable product snapshot in the selected pilot module;
8. proves sibling and second-tenant denial, revocation, audit and outbox evidence.

That slice establishes real business value and the architectural boundary before bulk tooling or legacy
retirement expands the work.
