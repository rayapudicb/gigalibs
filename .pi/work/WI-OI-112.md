# WI-OI-112: Product, Service, UOM, Catalogue and Pricing Foundation (Phase 4)

- **Item ID:** `WI-OI-112`
- **Standard Link:** FR-01, FR-04, FR-05, FR-11, FR-14, FR-15, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003, NFR-UX-001–004, NFR-OBS-001–004, ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021 (to be created)
- **Status:** Review (committed `2f18945`; approved by the owner 2026-10-03). Corrected by the WI-OI-119 audit (2026-10-05).
- **Author:** Antigravity Pairing Assistant
- **Date:** 2026-10-03

---

## 1. Executive Summary

Enterprise Architecture Phase 4 establishes one governed, industry-agnostic authority for every thing a tenant sells, buys, uses or references: products, services, resources, categories, units of measure, attributes, catalogues and effective-dated prices. Implemented as a selectable **Product Catalogue business capability module**, it adapts iDempiere `M_Product`, `C_UOM`, `M_PriceList` concepts while rejecting shared numeric IDs, mutable global context, direct cross-domain schema access and SQL validation fragments.

---

## 2. Slice Plan & Status

| Slice | Description | Status | Evidence |
|---|---|---|---|
| **P4-0** | Ownership inventory, existing consumer reconciliation & ADR-0021 | ✅ Done | ADR-0021 written; `ProductCatalogItem` frozen; Tenant relations mapped |
| **P4-1** | Module skeleton, versioned contracts & entitlement | ✅ Done | Contracts in `@gigalibs/contracts/catalogue`; hosted module, signed gateway and web-package registered |
| **P4-2** | Forward-only PostgreSQL migration with RLS | ✅ Done | `000001_product_catalogue_foundation.up.sql` with schema `gigalibs_product_catalogue`, strict RLS, audit and outbox |
| **P4-3** | Product, category, UOM & attribute domain invariants | ✅ Done | Organization scoped access, exact decimal math, `validateCustomExtensions` Safe AST validation |
| **P4-4** | Catalogue and price-list lifecycle | ✅ Done | Maker-checker transitions, price list activation, version overlap refusal |
| **P4-5** | Application Dictionary adoption (`ProductConfigurationAdapterV1`) | ✅ Done | `ProductConfigurationAdapterV1` in adapter registry; Safe AST rules validated server-side |
| **P4-6** | Product & Catalogue Studio UI (web/tablet, WCAG 2.1 AA) | ✅ Done | `ProductCatalogueWorkspace` embeds `<DictionaryRenderer />` for custom extensions and creation modal |
| **P4-7** | Import, export & interoperability with background jobs | ✅ Done | CSV export, reference mapping, idempotency replay |
| **P4-8** | Consumer convergence + legacy compatibility adapters | ✅ Done | Immutable consumer snapshots (`productSnapshot`), outbox facts |
| **P4-9** | Local certification: two-tenant/two-org, concurrency, migration, accessibility | ✅ Done | `real-database-proof.ts` passed 8/8 against real PostgreSQL; `verify.mjs --audits` passed |

---

## 3. Pre-flight & Alignment Checklist

- [x] WI-OI-111 committed (`ad7f83b`) — Core Parties and Application Dictionary foundation ready.
- [x] Phase 4 implementation plan reviewed (`docs/plans/enterprise-architecture-phase-4-product-catalog-pricing-implementation-plan.md`).
- [x] Work item ID allocated as `WI-OI-112`.
- [x] Task card `.pi/tasks/WI-OI-112.md` updated and owner-approved.
- [x] Owner defaults confirmed (2026-10-03): product types, UOM policy, `ProductCatalogItem` freeze, module placement, scope boundary.
