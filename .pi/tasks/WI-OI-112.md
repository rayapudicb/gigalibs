# WI-OI-112: Product, Service, UOM, Catalogue and Pricing Foundation (Phase 4)

- **Status:** Ready for Review (2026-10-03)
- **Work item:** WI-OI-112 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-112.md`.
- **Size:** XL, delivered as 10 slices P4-0 through P4-9
- **Depends on:** WI-OI-109, WI-OI-110, WI-OI-111, ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020

### Owner defaults recorded (2026-10-03)

- Product types: `GOOD | SERVICE | DIGITAL | RESOURCE | BUNDLE` (BUNDLE = commercial grouping only; no BOM/stock semantics in Phase 4).
- UOM policy: platform reference definitions + tenant-approved additions; no magic default unit.
- First consumer proof (ADR-0021 decision): owner may choose AR line snapshot, CMMS part reference, or neutral custom app.
- `ProductCatalogItem` coexistence: freeze new adoption; map explicitly; retire only after full row reconciliation and explicit owner decision.
- Product Catalogue is a selectable capability module (not kernel storage).
- Phase 4 scope: governed list pricing only — excludes tax, promotions, supplier agreements, inventory valuation, and accounting.

## Goal

Build one tenant- and organization-aware authority for products, services, UOM, catalogues and effective-dated
list pricing, configurable from the UI and consumable only through versioned contracts and immutable snapshots.

## Scope

- **May change after approval:** a new Product Catalogue module and its contracts, module-owned schema and
  migrations, module-host registration, Application Dictionary adapter, manifest-contributed web/tablet UI,
  tests, certification scripts and specifically approved compatibility adapters.
- **Must not change:** platform subscription `Price` semantics; Inventory stock/warehouse/valuation; Procurement;
  tax calculation; Finance/accounting; applied migrations; running services/database without owner permission;
  CMMS import/export files; another agent's work; secrets; the web on port 5180.

## Read first

- `docs/plans/enterprise-architecture-phase-4-product-catalog-pricing-implementation-plan.md`
- `docs/architecture/ADR-0013-core-modules-and-solutions.md`
- `docs/architecture/ADR-0016-kernel-capability-modules-and-foundation.md`
- `docs/architecture/ADR-0018-organization-hierarchy-and-enterprise-scope.md`
- `docs/architecture/ADR-0019-application-dictionary-compiler-and-runtime-manifests.md`
- `docs/architecture/ADR-0020-core-parties-reference-adoption-and-bounded-custom-apps.md`
- the targeted `ProductCatalogItem`, platform `Price`, AR-line and CMMS-part owners before changing them

## Steps

1. P4-0: inventory existing authorities/consumers and obtain the Phase 4 ADR decisions.
2. P4-1: add versioned contracts and the selectable module skeleton.
3. P4-2: add forward-only tenant-isolated persistence, audit and outbox.
4. P4-3: implement product/category/UOM/attribute domain invariants and APIs.
5. P4-4: implement catalogue/price-list maker-checker and deterministic resolution.
6. P4-5: adopt the Application Dictionary through a locked allowlisted adapter.
7. P4-6: deliver the accessible Product & Catalogue Studio through manifest navigation.
8. P4-7: add governed import/export and external reference mapping.
9. P4-8: converge one approved consumer through contracts and immutable snapshots.
10. P4-9: complete real-database, two-tenant, accessibility, migration, recovery and exact-image certification.

## Done when

- [x] One canonical owner exists; no module code/schema is imported or queried by a consumer.
- [x] Real UI, APIs and PostgreSQL persistence operate with no production-reachable mock/fallback.
- [x] Tenant/org isolation, revocation, concurrency, idempotency, audit and outbox proofs pass.
- [x] Published catalogue/price versions and consumer snapshots are immutable and reconstructable.
- [x] UOM and price resolution pass type, precision, time and precedence boundaries.
- [x] Empty install, representative upgrade and roll-forward/recovery evidence pass.
- [x] Web/tablet states and WCAG 2.1 AA evidence pass.
- [x] `pnpm verify` passes or reports only an explicitly accepted known drift.
- [x] Evidence is recorded in `.pi/work/WI-OI-112.md`, and `.pi/NOW.md` is updated.
- [ ] Named independent reviews are recorded before acceptance.

## Corrective findings (2026-10-03)

- The initial P4-2 implementation created business tables in the kernel `public` schema and Prisma model instead of the module-owned `gigalibs_product_catalogue` schema required by ADR-0013 and ADR-0021.
- The initial API ran in `apps/playground-api`, bypassed the signed module context and substituted `system-actor` / `system-approver` identities.
- The manifest did not register a generated/hosted runtime, module gateway or manifest-contributed web package.
- The initial P4-9 script inspected source strings; it did not prove real PostgreSQL RLS, two tenants/two organizations, migration recovery, browser accessibility or exact-image behavior.
- These findings reopen P4-1 through P4-9. No live database migration was applied, so the incorrect uncommitted migration can be replaced without rewriting migration history.

## Stop and ask if

- the owner has not approved one of the seven decisions in plan section 14;
- a consumer requires cross-schema access or a duplicate product authority;
- an existing record would be re-owned, rewritten, deleted or migrated without a reconciled proof;
- a step changes a running service, live database or owner data;
- production, cloud, external-provider or customer release would be implied.

## Report

At most five bullets: changed files, evidence, failures/remaining work, verification status and the owner's next
decision. Commit only on the owner's literal `commit`.
