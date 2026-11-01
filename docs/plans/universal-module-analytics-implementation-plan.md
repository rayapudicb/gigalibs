# Universal module analytics — implementation plan for Cursor

**Status:** In progress under **WI-OI-131** (2026-10-30). Phase A (contracts, pilot YAML, migration 000031) started; entitlement relay, access enforcement, ingestion registry, workbench and Trend Builder are not shipped yet. Supersedes the internal-module exclusion in `analytics-reports-production-implementation-plan.md` §1.1 for this work item only. Build under the repository's module gates. The owner deploys.

## Product contract

`analytics-studio` owns the central `/analytics` experience, semantic model, Trend Builder, saved charts, dashboards, reports and query engine. A reusable `ModuleAnalyticsWorkbench` renders an embedded Analytics & Trends tab. Business modules own their operational records and versioned analytics facts. The control plane owns tenant module entitlements. Analytics owns an entitlement projection and source registry; neither is a tenant-authored analytics configuration file.

The security axes are distinct:

1. `tenant_id` isolates customer data through signed context, SQL predicates and forced PostgreSQL RLS.
2. Catalog module entitlement decides which module sources this tenant may use. Analytics' own entitlement alone is insufficient to read another module's data.
3. Module read permission and, where applicable, organization unit/place scope decide which rows a user may query. A missing owning unit is not silently treated as shared.
4. Readiness controls whether a module's Analytics tab can be exposed outside UAT. Built code and a source row do not certify a module.

Enabling a module must register its declared source(s) for an entitled tenant even before the first event, with a truthful `NO_DATA` state. Disabling it must remove the source from the selector and refuse direct source, query, dashboard, drill-down and export requests. Historical facts remain governed by retention policy; an entitlement toggle is not a delete operation.

**Zero invented data:** no production mock, fixture fallback, seeded KPI number, browser-side aggregation of untrusted rows, default tenant, or fixed tenant/module menu. Test records are generated only in isolated proof databases and excluded from customer reporting. Code still needs explicit, reviewed metric definitions and query allowlists; “zero hardcoding” must not mean arbitrary SQL or ungoverned measures.

## Current code to reuse and gaps to close

| Existing | Gap |
| --- | --- |
| `modules/analytics-studio/apps/api/src/query-engine/` has governed model queries, dashboards, reports and freshness. | The query path does not yet authorize the originating business module's entitlement for every dataset/chart/report. |
| `gigalibs_analytics.source_connections` has forced tenant RLS and `(tenant_id, module_source_key)` uniqueness in migration 000029. | A source row is currently created by selected inbox events, not by platform enablement; `module_source_key` does not record its catalog entitlement key. `listSources` reads all tenant sources. |
| CMMS downtime and Workforce positions have signed MODULE_EVENTS ingestion paths. | These are hand-written producer paths, not a generic registered source contract and entitlement lifecycle. |
| Analytics uses an organization replica and filters mapped `unit_id` fields. | A unit-scoped source without an explicit unit mapping can be treated as tenant-shared. Require an explicit scope policy and reject unmapped ownership. |
| `@gigalibs/analytics-charts` builds ECharts options for web/PDF. | It has no React workbench. Keep its existing root export pure; put the React shell in a separate `./workbench` subpath with React peer dependencies, or a dedicated web package. |
| `/analytics/explore`, dashboards, sources and reports exist in `apps/workflow-platform`. | A cohesive Trend Builder and embedded `ModuleAnalyticsWorkbench` do not exist. |
| `AnalyticsStudioWorkbench.tsx` contains fixed AR/spend/FX metric shapes, while `metrics.service.ts` returns 503 for those legacy rollups. | The central executive overview is contained. Replace its fixed cross-domain layout only when registry-backed, reconciled measures exist; do not relabel it universal. |

## Build order and exact deliverables

### A. Source and entitlement contract (foundation)

1. Add `ModuleAnalyticsSourceContractV1` to `packages/contracts/src/analytics/`: `catalogModuleKey`, `sourceKey`, `version`, title, `requiredReadPermission`, fact schema/version, primary key, event time, owner scope (`UNIT_REQUIRED`, `TENANT_SHARED_EXPLICIT`, or approved place scope), data classification, dimensions, measures with aggregation/unit/precision, default views, and freshness target. Validate it at build and ingress. A source key must be stable and globally unambiguous; the catalog key is the entitlement key, not the runtime package name.
2. Declare contracts in module manifests or a generated module-owned file. Extend `scripts/module-manifests.mjs` to generate a source catalog. Reject duplicate keys, unknown catalog keys, missing owner fields, unsupported measures and source contracts with no proof path. Do not generate tenant-specific files.
3. Add an additive Analytics migration after its current manifest tail for `catalog_module_key`, `contract_version`, scope policy and lifecycle on `source_connections`, plus a forced-RLS `tenant_module_entitlement_replica(tenant_id, catalog_module_key, version, status, applied_at)`. Backfill only known existing CMMS/Workforce source keys through an explicit migration map; quarantine unknown legacy keys. Record upgrade verification and roll-forward.
4. Extend `packages/tenancy-nest/src/entitlement-events.ts`, called by `platform-administration.service.ts` and workspace creation, with a versioned entitlement snapshot (new v2 event; current v1 carries no ordering version). Preserve the v1 event/handler that activates module windows. Relay v2 from `apps/playground-api/src/control-outbox.worker.ts` into a signed, idempotent Analytics inbox. Apply snapshots only in version order; an older enable must never resurrect a later disable. On enable, upsert each declared source with `NO_DATA` until real facts arrive. On disable, mark unavailable. Reconcile missed events with a signed control-plane snapshot job. Unknown or lagging versions fail closed.
5. Add one server-side `assertAnalyticsSourceAccess(principal, sourceId)` used by source discovery, mapping, dataset build, query spec, chart data, dashboards, drill-down, scheduled reports, and file download. It checks tenant RLS, Analytics entitlement, source module entitlement, source status/readiness, module read permission, and scope policy. Follow lineage from semantic model/dataset to source; do not trust a source key supplied by the browser. Recheck when serving cached answers or stored report artifacts.

### B. Real data ingestion and governed metrics

6. Extend the signed MODULE_EVENTS inbox into a registry-driven ingestor. Validate `tenantId`, `catalogModuleKey`, `sourceKey`, event ID, aggregate ID/version, occurred-at time, organization owner or explicit shared scope, schema version and payload. Store immutable raw fact versions and deduplicate on `(tenant_id, source_key, event_id)`. Handle correction/reversal facts; never mutate historical value to conceal a correction. Reject production events flagged as test/synthetic from customer value metrics.
7. Each producer writes its business change and outbox fact in one local transaction, then relays with bounded timeout, retry, idempotency, dead-letter/reconciliation metrics and signed audience. Analytics never joins another module's database schema. Add one bounded backfill per source for existing records, with durable cursor and source-count/control-total reconciliation. Enabling a module with no data shows an empty state, not a sample dashboard.
8. Compile contract measures into the existing allowlisted semantic/query machinery. A metric definition specifies grain, dimensions, time field, numerator/denominator where needed, units, rounding and reversal policy. Pin contract and dataset versions to saved charts/reports. Expose freshness, source watermark, lineage, partial/rebuilding/rejected states and a traceable source record link. The central rollup first returns authorized per-source KPI tiles. Composite metrics require an explicit server-owned semantic definition, compatible units/currency/time grain, and authorization to every contributing source; never sum arbitrary module values in React. Do not let tenant metadata execute raw SQL or bypass the source-access check.

### C. One reusable UI, two entry points

9. Build `ModuleAnalyticsWorkbench` as a React `./workbench` export of `@gigalibs/analytics-charts` (or a dedicated React-only package). Props are `sourceKey`, allowed views and callbacks to the signed Analytics BFF; no tenant ID, SQL, sample rows or module-specific KPI values. Render KPI row, trend/chart row, detail table, date/filter controls, freshness/error/empty states and drill-down from the same `AnalyticsQueryResultV1` data contract. Preserve the pure chart/PDF root export.
10. Replace the contained fixed executive panel in `apps/workflow-platform/components/analytics/AnalyticsStudioWorkbench.tsx` with a registry-driven central module switcher and Trend Builder. Both list only `GET /v1/module-sources` results after server-side access checks. Trend Builder lets an authorized user choose approved measure, dimension, grain, filters and comparison period, previews through existing `POST /v1/query/spec`, and saves through existing chart/dashboard APIs. It cannot invent measures in React.
11. Embedded module tabs reuse the same workbench and signed BFF routes. The tab is hidden when the module, Analytics, or user permission is absent. That UI check is convenience; every API path still enforces access. CMMS `/cmms/analytics` may retain its operational API, but its embedded analytics experience should consume the shared source contract and workbench rather than fork charts.

### D. Producer rollout in business dependency order

| Wave | Catalog entitlement key | First real facts/measures | Notes |
| --- | --- | --- | --- |
| Pilot | `asset-maintenance` | Work-order completion, downtime duration, backlog by owning unit | Reuse CMMS facts and reconcile with its existing `v1/analytics` routes. Runtime package `physical-operations-cmms` is not the catalog key. |
| Pilot | `gigaops` | Filled/open positions, scheduled hours, attendance exceptions | Reuse Workforce positions projection; prove person-data classification and scope. |
| Pilot | `iot-gateway` | Ingested event/device health, verified alert counts | Count actual device/event records only; no fake telemetry. |
| Pilot | `geospatial-studio` | Authorized place counts/coverage | Keep place scope in the query path. |
| iDempiere 1 | `business-partners` | Active parties, credit holds/exposure from reconciled feeds | Ownerless historical balances remain excluded or explicitly unreconciled. |
| iDempiere 2–3 | `universal-inventory` | ATP, movement/valuation, transfer lead time and in-transit | Material Ledger and Advanced SCM share this entitlement; avoid double counting movement and transfer facts. |
| iDempiere 3/5 | `universal-procurement` | PO cycle time, landed-cost allocation totals | Finance owns posted cost values; reconcile allocation to its posting. |
| iDempiere 4 | `universal-manufacturing` | Released/completed orders, component shortages, MRP plan accuracy, WIP/variance | Publish only confirmed Inventory/Finance states with pending/rejected status visible. |
| iDempiere 6 | `universal-returns` | Authorized/inspected/disposed RMAs and credited value | Reconcile credit values with Orders/AR owner facts. |
| iDempiere 7 | `project-operations` | Approved time/cost, budget burn and overrun | Reconcile Finance postings before calling spend “actual.” |
| Later | `financial-operations`, Orders, AR, Spend, other reviewed modules | Only module-owned reconciled measures | Add a contract and proof per source; readiness/entitlement still gates visibility. |

Advanced SCM and Landed Cost are functional slices spanning existing modules; they are not new tenant entitlement keys. Each source has exactly one declared owner and stable lineage. A cross-domain dashboard may combine approved sources only when the user is entitled and permitted to see **every** source it uses.

## Cursor task sequence and gates

Register a stable work item/card for the full Analytics foundation and pilot. Implement A1–A5 first and prove a CMMS-only tenant, an Inventory-only tenant, a disabled source with a stale saved chart/report ID, and two users in sibling organization units. Then B6–B8 with one real CMMS fact and one real Workforce fact, including replay, backfill, reversal, source-count parity and failure recovery. Then C9–C11; prove the central and embedded views produce the same authorized result. Complete the full foundation/pilot module, run `pnpm verify`, and make its one module-completion commit. For each D adoption, define a full module integration card, finish its end-to-end scope before its completion commit, and keep building without UAT pauses where the owner has authorized that sequence. The owner deploys according to the release worktree rule.

For every completed module slice: migration upgrade on disposable PostgreSQL 16, forced-RLS two-tenant proof, organization/place scope proof, permission/entitlement revocation proof, signed relay replay and retry proof, real-data browser journey, `pnpm verify` with no new failures, evidence in the task card and canonical `.pi/WORK_ITEMS.md`. Record `Built` only after its implementation gate; `Done` requires owner UAT acceptance. A source row, passing unit test or visible chart is not sufficient evidence.
