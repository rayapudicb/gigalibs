# ADR-0021: Product Catalogue, UOM and Pricing Module — Ownership, Compiler and Runtime

- **Status:** Accepted
- **Date:** 2026-10-03
- **Work item:** WI-OI-112
- **Depends on:** ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020

## Context

GigaLibs needs one governed, industry-agnostic authority for the things a tenant sells, buys, uses or
references: products, services, resources, categories, units of measure, attributes, catalogues and
effective-dated prices. Today these concepts are scattered:

- `ProductCatalogItem` in the control-plane Prisma schema is a thin, frozen, module-owned commerce table
  with 0 active runtime consumers.
- `Price` in the control-plane schema is platform subscription billing (Plan tier pricing), not tenant
  commercial pricing.
- AR `InvoiceLineItem` uses free-text descriptions and integer cents with no product FK.
- AP `SupplierInvoiceLine` uses `itemCode` strings and `BigInt` minor units within the procurement domain.
- CMMS parts live in their own isolated `gigalibs_cmms` PostgreSQL schema with 25-column part definitions.

iDempiere's `M_Product`, `C_UOM`, `M_PriceList`, `M_PriceList_Version`, `M_ProductPrice`,
`M_Product_Category` and `M_AttributeSet` provide mature domain concepts. However, iDempiere conflates
product definition with inventory tracking (lot/serial), embeds GL accounting hooks in save triggers,
uses shared numeric IDs with Org 0 bypass, permits arbitrary SQL validation, and couples consumers
directly to producer schemas.

## Decision

### 1. One Product Catalogue capability module

Create a selectable **Product Catalogue business capability module** (`modules/product-catalogue`),
hosted in the shared module host by default. It is not part of the kernel. Consumers use its versioned
contracts (`@gigalibs/contracts/catalogue`), APIs, immutable snapshots and outbox facts; they never
import its code or query its schema.

### 2. One module registry

`modules/product-catalogue/module.yaml` declares identity, entitlements, permissions, dependencies and
health. The generated platform module catalogue includes it.

### 3. Canonical domain aggregates

| Aggregate | Ownership | Key invariants |
|---|---|---|
| `Product` | Product Catalogue | Stable UUID, tenant code, type (`GOOD \| SERVICE \| DIGITAL \| RESOURCE \| BUNDLE`), base UOM, sell/buy/use capabilities, lifecycle, org availability |
| `ProductCategory` | Product Catalogue | Self-referential hierarchy with deterministic cycle detection; effective dates |
| `ProductIdentifier` | Product Catalogue | Typed SKU/GTIN/barcode/manufacturer/external-source; issuer and tenant-scoped uniqueness |
| `ProductPartyRole` | Product Catalogue → Core Parties | Effective-dated manufacturer/brand-owner reference via Core Parties (WI-OI-111) |
| `UomDefinition` | Product Catalogue (reference) | Dimension, code, symbol, display precision, costing precision, ISO/UCUM reference |
| `UomConversion` | Product Catalogue | Same-dimension only; exact decimal rate; no redundant inverse column; effective dates |
| `ProductUom` | Product Catalogue | Allowed order/sell/purchase UOM per product; product-specific conversion where valid |
| `AttributeDefinition` | Product Catalogue | Typed governed attribute with classification, unit/reference rules and allowed values |
| `ProductAttributeValue` | Product Catalogue | Validated value for a product and attribute definition |
| `ProductRelation` | Product Catalogue | Substitute, accessory, component-reference; no inventory/BOM execution semantics |
| `Catalogue` | Product Catalogue | Named audience/channel container, tenant-bound, optionally org-scoped |
| `CatalogueVersion` | Product Catalogue | Immutable draft/submitted/approved/published with checksum and effective window |
| `CatalogueEntry` | Product Catalogue | Product availability and display order in one version |
| `PriceList` | Product Catalogue | Currency, tax-inclusion flag, audience/purpose, org scope, publication policy |
| `PriceListVersion` | Product Catalogue | Immutable, effective-dated, maker-checker controlled price set |
| `ProductPrice` | Product Catalogue | Product + UOM + quantity break → exact decimal list/standard/limit values |
| `ProductExtensionSnapshot` | Product Catalogue | Application Dictionary manifest/checksum |
| `ProductReferenceMapping` | Product Catalogue | Explicit source-system/module reference; never invisible FK rewrite |
| `ProductIdempotencyRecord` | Product Catalogue | Bounded command replay protection |

### 4. iDempiere reconciliation matrix

| iDempiere concept | Source | Business purpose | Decision | GigaLibs owner | Security boundary | Persistence treatment |
|---|---|---|---|---|---|---|
| `M_Product` | `MProduct.java` | Master product/service identity, type, base UOM, capabilities | **Adapt** | Product Catalogue | Tenant + Org RLS | Module-owned schema, composite tenant FK |
| `M_Product_Category` | `MProductCategory.java` | Hierarchical taxonomy with default category | **Adapt** | Product Catalogue | Tenant RLS | Adjacency relation with cycle detection |
| `C_UOM` / `C_UOM_Conversion` | `MUOM.java`, `MUOMConversion.java` | Units of measure, precision, dimensional conversions | **Adapt** | Product Catalogue (reference) | Tenant RLS | Exact decimal rates; no DivideRate column |
| `M_PriceList` | `MPriceList.java` | Commercial pricing header, currency, tax posture | **Adapt** | Product Catalogue | Tenant + Org RLS | Separate from AP supplier agreements |
| `M_PriceList_Version` | `MPriceListVersion.java` | Effective-dated immutable price container | **Adapt** | Product Catalogue | Tenant RLS | Add maker-checker lifecycle (DRAFT→SUBMITTED→APPROVED→ACTIVATED) |
| `M_ProductPrice` | `MProductPrice.java` | Three-tier price per product in a version | **Adapt** | Product Catalogue | Tenant RLS | Add UOM and quantity-break columns; exact bounded decimal |
| `M_Product_BOM` | `MProductBOM.java` | Assembly/kit component definition | **Reject** | Future Manufacturing | N/A | Phase 4 BUNDLE is commercial grouping only; no stock/BOM execution |
| `M_AttributeSet` | `MAttributeSet.java` | Product specs + instance tracking (lot/serial) | **Split** | Product Catalogue (specs) / Inventory (lot/serial) | Tenant RLS | Product-level specs adopted; instance tracking deferred to WI-OI-091 |
| Org 0 system bypass | Global context | Cross-tenant shared records | **Reject** | N/A | Hard reject | Strict tenant isolation; no system-wide product records |
| Auto-accounting hooks | `afterSave()` | GL account generation in product save | **Reject** | Future Finance | N/A | Product Catalogue is decoupled from GL; consumers snapshot what they need |
| SQL validation fragments | `AD_Val_Rule` | Arbitrary WHERE clause validation | **Reject** | N/A | N/A | Safe AST validation rules per ADR-0019 |
| Numeric sequence IDs | `AD_Sequence` | Shared integer primary keys | **Reject** | N/A | N/A | Stable UUIDs with tenant composite keys |

### 5. Existing entity treatment

| Existing entity | Treatment | Retirement gate |
|---|---|---|
| `ProductCatalogItem` | Freeze new adoption; classify as `commerce (frozen)` in `package-layers.json`; provide compatibility read adapter | Retire only after full row reconciliation, consumer migration and explicit owner decision |
| Platform `Price` | Keep strictly separate; it is platform subscription billing | Never retire; never repurpose for tenant commercial pricing |
| AR `InvoiceLineItem` | Preserve immutable snapshots; optionally capture product reference ID for provenance | AR remains independent; product snapshot is optional, never a required FK |
| AP `SupplierInvoiceLine` | Procurement owns purchasing snapshots; product reference via mapping | Procurement scope; convergence is future WI-OI-092 |
| CMMS `gigalibs_cmms.parts` | Maintain separation; future convergence links part to product via reference mapping | Deferred to WI-OI-091 inventory/parts convergence |

### 6. Architecture tenets

1. **One Product Catalogue module** is the documented product/UOM/catalogue/pricing authority.
2. **Selectable capability module**, not kernel storage. Consumers use public contracts, never schema imports.
3. **Zero runtime tenant DDL.** Extensions go through the Application Dictionary (ADR-0019).
4. **Zero arbitrary code execution.** No SQL, JavaScript, expression eval, shell or HTTP actions.
5. **No floating-point money or quantities.** Bounded decimals with currency/UOM precision.
6. **Published versions are immutable.** Corrections create a new version.
7. **Maker-checker controlled.** Producer cannot approve their own catalogue or price-list version.
8. **Deterministic price resolution** records the selected version, rule/precedence path, currency, UOM and effective instant.
9. **Tenant and organization authority** resolved by the server via WI-OI-109, never by metadata visibility.
10. **No Org 0 bypass.** Every product, price, catalogue and UOM is strictly tenant-scoped.
11. **Existing records are never silently re-owned.** Every adoption needs inventory, mapping, proof and explicit retirement.
12. **Consumer snapshots** retain historical descriptions, UOM and price provenance after master changes.
13. **Registered action keys** resolve only to reviewed code handlers per ADR-0019.

### 7. Threat model

| Threat | Mitigation |
|---|---|
| Cross-tenant product/price disclosure | Composite tenant FK + PostgreSQL RLS; API never discloses existence of inaccessible records |
| Sibling org price manipulation | Organization scope resolved server-side; price resolution honours org assignment |
| Unauthorized price activation | Maker-checker: producer ≠ approver; separate `pricing:approve` and `pricing:activate` permissions |
| Floating-point money rounding | Exact bounded `Decimal(20, 6)` for quantities; `BigInt` minor units for money; no IEEE 754 |
| Hostile import data (formula injection) | CSV/XLSX import neutralizes formulas; row-level validation; quarantine |
| Extension bypass of locked fields | `ProductConfigurationAdapterV1` declares locked identity/money/UOM/lifecycle/publication fields |
| Dictionary expression execution | Safe AST only per ADR-0019; no SQL, JS, shell or HTTP actions |
| Consumer schema coupling | Consumers use versioned contracts and immutable snapshots; no cross-schema reads |
| Stale price cache | Outbox events trigger cache invalidation; resolution always checks effective dates |
| UOM conversion overflow | Bounded decimal precision; dimension compatibility check; reject ambiguous/cyclic paths |

## Consequences

- A new `modules/product-catalogue` directory is created with its own module manifest, domain,
  API, migrations and UI contributions.
- `@gigalibs/contracts/catalogue` provides the versioned public contracts.
- The module owns its PostgreSQL schema with RLS and composite tenant foreign keys.
- `ProductCatalogItem` remains frozen and fenced; a compatibility adapter maps reads until retirement.
- Platform `Price` is untouched; it remains platform subscription billing.
- Finance, Inventory, Procurement and Manufacturing remain separate future capabilities.
