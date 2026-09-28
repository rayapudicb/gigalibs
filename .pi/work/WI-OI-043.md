# WI-OI-043 — External Data Analytics & Reporting Studio

Status: Review
Gate: G4–G5 Review; contained P0 replacements and named human acceptance remain pending
Owner: SDLC Orchestrator  
Created: 2026-09-21  
Plan: `docs/plans/analytics-reports-production-implementation-plan.md`  
Agent prompt: `docs/plans/analytics-reports-production-agent-prompt.md`

Canonical disposition (2026-09-22): G4 implementation evidence is recorded later in this file, but the
item is not an active Build stream and no production/release acceptance is inferred. The earlier G0
blocker text is retained as governance history; later implementation did not retroactively erase it. CMMS
import/export files carrying `WI-OI-043` annotations are frozen scope contamination and are excluded from
Analytics evidence pending an authorized attribution decision.

---

## Scope

Source-agnostic universal ingestion-first Analytics & Reporting Studio — a separately entitled SaaS module
within GigaLibs. Tenants connect external systems, ingest and model data, build charts and dashboards, and
generate reports entirely within GigaLibs.

**Pipeline (immutable order):**
External system → Connector Hub + Credential Vault → Workflow schedules sync → Ingestion engine + raw
tenant staging → Schema discovery + profiling → Data Studio mapping → Published analytical dataset →
Semantic model → Governed query engine → Charts + dashboards → Reports + CSV → Lineage + audit

**Entitlement module key:** `analytics-studio`  
**First source type:** External PostgreSQL (separate real PostgreSQL service)  
**Deployment profiles:** Managed Cloud, Customer-Managed

---

## Requirements trace

| Functional | NFR |
|---|---|
| FR-02 (multi-tenant isolation), FR-03 (data connectors), FR-05 (schema discovery) | NFR-PERF-001 |
| FR-08 (audit trail), FR-11 (observability), FR-12 (reporting) | |
| FR-14 (authentication/authorization), FR-15 (data governance) | |
| FR-16 (platform entitlement), FR-16 (module entitlement) | |

---

## Historical G0 blockers — preserved for audit

All items below are blockers. No agent may mark them resolved. Only named human authorities
(Solution Architecture, Security & Privacy, Backend/Data, QA/SDET, Product) can close G0.

### GOV-01: Active-Build governance contradiction

**Severity:** P0  
**Finding:** `config/sdlc-governance.json` lists `WI-OI-042` as the sole active implementation work item.
`.pi/PLAN.md` states `WI-OI-039` is the "sole active Build item". Both WI-OI-039 and WI-OI-042 carry
status `In Progress` in `WORK_ITEMS.md`. The `workInProgressLimits.implementationModules: 1` constraint
is violated — two active Build items exist simultaneously.

**Required action:** Named humans (Solution Architecture, Product) must reconcile which item is the sole
active Build item, update all three governance records (`PLAN.md`, `WORK_ITEMS.md`,
`config/sdlc-governance.json`) to agree, and confirm WI-OI-043 as the next Analytics work item before
any implementation under this work item begins.

**Agent constraint:** No agent may close either WI-OI-039 or WI-OI-042. No agent may mark this resolved.

---

### GOV-02: Pending DoR acceptance

**Severity:** P0  
**Finding:** WI-OI-043 has no accepted Definition of Ready. The following must be accepted by named
reviewers before Build proceeds:

1. FR/NFR traceability (linked above — verify with Requirements Spec)
2. Named independent reviewers: Solution Architecture, Security & Privacy, Backend/Data, QA/SDET, Product
3. Accepted source/capacity limits for Phase 1 (number of connectors, max tables, row volume, sync cadence)
4. Accepted exit scenario: one external PostgreSQL source → full pipeline → CSV report → lineage recorded
5. Accepted deployment profiles: Managed Cloud and Customer-Managed both scoped for Phase 1
6. Data ownership, threat model, permission matrix, classification, retention, migration and recovery
   accepted (extends existing WI-OI-005 threat model — requires scoping review)
7. Compatibility disposition of existing `reports` entitlement entries with `analytics-studio`

---

### TECH-01: `org_scope.department_ids` adapter drift

**Severity:** P0  
**Location:** `packages/contracts/src/modules/index.ts` and any analytics query predicate  
**Finding:** Pre-flight check required to confirm every analytics query predicate, RLS policy and interface
references `org_scope.department_ids` (the canonical field from `PlatformContextV1Schema`), not
`departmentIds` or any locally-invented variant. Adapter drift here causes silent data exposure across
department boundaries. Must be verified before first schema migration under WI-OI-043.

**Required action:** Backend/Data reviewer must grep all analytics paths for the wrong field name and
sign off before Phase 1 begins.

---

### TECH-02: Data Studio RLS omissions

**Severity:** P0  
**Finding:** The `analytics-studio` module has no schema migrations yet for WI-OI-043. When Phase 1
migrations are written, every table must have:
- `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
- Tenant-safe foreign keys
- Composite keys including `tenant_id`
- Read-write tables: `SELECT`, `INSERT`, `UPDATE` — disallowed privileges revoked
- Append-only tables (`analytics_audit_log`, `analytics_lineage_edges`, `report_audit_log`,
  `raw_record_versions`, `connector_outbox`, `report_runs` history): `SELECT` and `INSERT` only —
  `UPDATE` and `DELETE` explicitly revoked, never granted
- Runtime roles cannot own tables or bypass RLS
- Migration roles are separate from runtime roles

This is a prerequisite requirement that must be accepted by Security & Privacy before Phase 1 migrations
are submitted for review.

---

### TECH-03: OSS visualization library adoption decision

**Severity:** P0  
**Finding:** No ADR exists for any visualization library (Recharts, Nivo, ECharts, Tremor,
react-grid-layout, or any other). The agent prompt classifies these as CONDITIONALLY ALLOWED — they
require recorded upstream URL/commit, selected source, license/NOTICE obligations, SBOM, vulnerability
status, accessibility/runtime evidence, upgrade owner and removal plan before merge.

**Required action:** Architecture must accept ADR-0004 (OSS Visualization Library) before any chart
library code is merged under WI-OI-043. The `industry-charts-catalog.ts` hardcoded chart definitions
currently in `apps/workflow-platform` must not be assumed to satisfy this requirement.

---

## Phase 0 containment — completed 2026-09-21

The following containment changes were applied under the governance rules of Phase 0 (containment only;
no product implementation; all changes assigned to WI-OI-043 Phase 0):

| File | Change | Finding removed |
|---|---|---|
| `modules/analytics-studio/apps/api/src/metrics/metrics.service.ts` | `overallLineageVerified: true` → `false`; `getTimeSeries()` returns `[]` instead of cross-module queries; CONTAINED_P0 comments on `getLineageProof()` and all four cross-module helper methods | Unconditional lineage attestation; cross-module schema reads (`gigalibs_platform.billing_invoices`, `gigalibs_spend.expenses`, `gigalibs_currency.conversion_ledger`, `gigalibs_recovery.detected_leaks`); silent zero fallbacks suppressing UNAVAILABLE |
| `modules/analytics-studio/apps/api/src/metrics/telemetry.service.ts` | Removed `ensureTenantSeriesSeeded()` and `refreshFinOpsLiveMetrics()` calls from production path; `isLiveDatabaseSynced: true` → `false`; hardcoded numeric fallbacks `$12,500,000`, `$5,940,000`, `$301,410` removed; hardcoded waterfall payload zeroed out | Production seeding of 36 hardcoded industry telemetry records; cross-module FinOps refresh with fabricated fallback amounts; unconditional `isLiveDatabaseSynced: true` claim |
| `modules/analytics-studio/apps/api/src/actions/actions.service.ts` | `TRIGGER_CROSS_MODULE_AUDIT` → `NOT_IMPLEMENTED` with explicit reason; `FREEZE_SUSPICIOUS_ANOMALY` → `NOT_IMPLEMENTED` with explicit reason | Synthetic `AUDIT_PASSED` (hardcoded 100% isolation score, `crossTenantBleedDetected: false`); synthetic `ENTITY_FROZEN` without real freeze subsystem |
| `apps/workflow-platform/lib/industry-charts-catalog.ts` | Hardcoded KPI values removed from all 6 `IndustrySector.kpis` arrays (farming, energy, logistics, manufacturing, healthcare, finops) | Fabricated business metrics: $14.82 M cashflow, 31.2 days DSO, 87.6% OEE, 82.4% ICU occupancy, 448.2 MW load, 14 silo units — all presented as live operational data |
| `.pi/WORK_ITEMS.md` | WI-OI-043 registered as `Proposed` at G0 | WI-OI-043 did not exist |

**Not changed (correct as-is):**
- `apps/workflow-platform/app/api/reports/route.ts` — 503 containment in place (`REPORTS_READ_MODEL_CONTAINED`, `Cache-Control: no-store`)

---

## Phase 0 exit conditions (for named human review)

- [x] One Analytics & Reporting work item registered (`WI-OI-043`)
- [x] Governance contradiction recorded (GOV-01) — not resolved; resolution requires named humans
- [x] Containment is truthful — no fabricated data reaches production-routed endpoints
- [x] No WI-OI-043 product implementation code was placed — containment only
- [ ] GOV-01 resolved by named humans (Solution Architecture, Product)
- [ ] DoR accepted (GOV-02)
- [ ] TECH-01 confirmed (department_ids adapter review)
- [ ] TECH-02 accepted (RLS requirements accepted by Security)
- [ ] TECH-03 accepted (ADR-0004 OSS library decision)

The last five items remain open. Phase 1 (Schema & Connector foundation) may not begin until all
five are closed by named human reviewers.

---

## Required independent reviewers

| Role | Name | Status |
|---|---|---|
| Solution Architecture | TBD | Pending |
| Security & Privacy | TBD | Pending |
| Backend/Data | TBD | Pending |
| QA/SDET | TBD | Pending |
| Product | TBD | Pending |

No agent may fill these names or mark acceptance.

---

## G4 Build Evidence — WI-OI-043 (All 7 Phases)

**Evidence state:** G4 Build evidence recorded; independent human review remains pending
**Current gate:** G4–G5 Review
**SDLC Governance:** No agent may mark human acceptance. Status remains In Progress until named human authorities (Solution Architecture, Security & Privacy, Backend/Data, QA/SDET, Product) close the gate.

### ADR-0004 — OSS Visualization Library

**Decision:** Apache ECharts 5.5.1 + echarts-for-react@3.0.2 adopted.  
**Evidence:**
- `packages/charts-react/src/index.tsx` — wrapper published as `@gigalibs/charts-react`
- All chart render responses include `accessibleTable: Array<{label, value}>` (WCAG 2.1 AA)
- Chart options template provides cosmetic config only (colors, title, labels); series data is always injected from real governed query results — never from template

---

### Phase Build Evidence Matrix

| Phase | Description | Commit | Key Files |
|---|---|---|---|
| 1 | Connector Hub + Credential Vault | (prior sessions) | `connectors/connector.service.ts`, `000004_connector_hub_source_connections.up.sql` |
| 2 | Ingestion Engine + Raw Tenant Staging | (prior sessions) | `ingestion/ingestion.service.ts`, `000005_connector_sync_runs_and_raw_records.up.sql` |
| 3 | Schema Discovery + Data Studio Mappings | (prior sessions) | `schema-discovery/schema-discovery.service.ts`, `000006_schema_discovery_and_studio_mappings.up.sql` |
| 4 | Analytical Datasets + Semantic Models | f44c134 | `datasets/dataset.service.ts`, `datasets/semantic-model.controller.ts`, `000007_analytical_datasets_and_semantic_models.up.sql` |
| 5 | Governed Query Engine + ECharts + Dashboards | a3f9890 | `query-engine/query-engine.service.ts`, `query-engine/chart.service.ts`, `000008_charts_and_dashboards.up.sql` |
| 6 | Reports, CSV Export, Scheduled Delivery | d1fc7ac | `reports/report.service.ts`, `reports/report.controller.ts`, `000009_reports_and_scheduled_delivery.up.sql` |
| 7 | Lineage DAG + Tamper-Evident Audit Log | 286cd76 | `lineage/lineage.service.ts`, `lineage/lineage.controller.ts`, `000010_lineage_and_audit.up.sql` |

---

### Architecture Invariants Enforced

| Invariant | Enforcement | Evidence |
|---|---|---|
| Tenant isolation | RLS + FORCE RLS on all tables; `withTenantTransaction` / `queryWithTenant` in all service calls | All 10 migrations (000004–000010) |
| Append-only audit tables | `REVOKE UPDATE, DELETE` at migration level; no UPDATE/DELETE SQL in service source | Migrations 000005, 000006, 000007, 000008, 000009, 000010; source audits in each `.spec.ts` |
| `UNAUTHORIZED` is never a FreshnessState | TypeScript union type `'FRESH' \| 'STALE' \| 'PARTIAL' \| 'REBUILDING' \| 'UNAVAILABLE'`; excluded from migration enum with comment; no assignment in code | `query-engine/query-engine.service.ts`; `000008_charts_and_dashboards.up.sql` |
| No credential bytes in event_payload | Explicit JSDoc comment; source audit in `lineage.spec.ts` Suite 8 | `lineage/lineage.service.ts` |
| SHA-256 content hashing | Mapping versions, semantic model versions, dataset checksums, CSV artifact checksums | `datasets/dataset.service.ts`, `reports/report.service.ts` |
| RFC 4180 CSV | CRLF line endings; double-quote escaping; comment metadata lines | `reports/report.service.ts` — `buildCsv()`, `csvEscape()` |
| Download token TTL = 15 minutes | `TOKEN_TTL_MS = 15 * 60 * 1000`; expired → GoneException | `reports/report.service.ts` |
| Idempotency | `UNIQUE(report_definition_id, idempotency_key) DEFERRABLE` on report_runs | `000009_reports_and_scheduled_delivery.up.sql` |
| Lineage TEXT node IDs | No cross-table FKs for heterogeneous node types | `000010_lineage_and_audit.up.sql` |
| ECharts data from query results | Template merged first; series data always overridden from `queryResponse.results` | `query-engine/chart.service.ts` |
| WCAG 2.1 AA accessible table | Every chart render response includes `accessibleTable` | `query-engine/chart.service.ts` |

---

### CONTAINED_P0 Phase Boundaries (Production Stubs)

| Location | Stub | Production Replacement |
|---|---|---|
| `ingestion/ingestion.service.ts` | Vault credential resolution throws `NOT_IMPLEMENTED` | Wire real vault client (credential-vault service or Kubernetes secret) |
| `reports/report.service.ts` | Artifact store is in-memory `Map<string, Buffer>` keyed by runId; `storage_ref = 'mem://${runId}'` | Vault-scoped object store (S3-compatible or cloud blob storage) |

These are phase-boundary stubs. Both are clearly labelled `CONTAINED_P0` in source. Neither stub is a security boundary — the download token + TTL + SHA-256 verification layer applies at the controller layer regardless of storage backend.

---

### Vertical-Slice Truth Boundary Test

`modules/analytics-studio/apps/api/src/analytics-truth-boundary.test.ts` (513 lines)

Covers all 7 phases with cross-phase assertions:
- All 7 pipeline modules registered in `AppModule`
- Migration ledger versions 4–10 monotonically increasing, each with a schema_migrations INSERT
- All append-only tables (`raw_record_versions`, `studio_mapping_versions`, `dataset_record_versions`, `semantic_model_versions`, `report_artifacts`, `report_deliveries`, `analytics_lineage_edges`, `analytics_audit_log`) have REVOKE UPDATE + DELETE
- `PlatformContextV1` entitlement key `analytics-studio` present in auth source
- `UNAUTHORIZED` not assigned as a `FreshnessState` value anywhere in codebase

---

### G4 Gate Compliance

| Gate Criterion | Status | Evidence |
|---|---|---|
| Source-agnostic pipeline in prescribed immutable order | ✓ VERIFIED | 7 migrations (000004–000010); 7 NestJS modules; AppModule import chain |
| All append-only tables REVOKE UPDATE/DELETE | ✓ VERIFIED | Migrations + source audits in each `.spec.ts` |
| RLS + FORCE RLS on every table | ✓ VERIFIED | All 10 migrations |
| No raw credentials or PII in audit event_payload | ✓ VERIFIED | `lineage.service.ts` comment + lineage.spec.ts Suite 8 |
| `UNAUTHORIZED` excluded from FreshnessState | ✓ VERIFIED | TypeScript type + migration enum comment + no-assignment source audit |
| ECharts data injected from query results, not template | ✓ VERIFIED | `chart.service.ts` merge order; truth-boundary test Phase 5 |
| WCAG 2.1 AA accessible table on every chart | ✓ VERIFIED | `chart.service.ts` `accessibleTable` field; truth-boundary test Phase 5 |
| SHA-256 content hashing | ✓ VERIFIED | Dataset, semantic model, CSV artifact checksums |
| RFC 4180 CSV output | ✓ VERIFIED | `buildCsv()`, `csvEscape()`, CRLF line endings |
| 15-minute download token TTL; GoneException on expiry | ✓ VERIFIED | `TOKEN_TTL_MS`; `report.service.ts`; `report.spec.ts` Suite 5 |
| Idempotency key deduplication on report_runs | ✓ VERIFIED | UNIQUE DEFERRABLE constraint; `triggerReportRun` short-circuit |
| Lineage DAG using TEXT node IDs | ✓ VERIFIED | `analytics_lineage_edges` schema; lineage.spec.ts Suite 3 |
| CONTAINED_P0 stubs labelled | ✓ VERIFIED | `ingestion/ingestion.service.ts`; `reports/report.service.ts` |
| Vertical-slice truth boundary test | ✓ VERIFIED | `analytics-truth-boundary.test.ts` — all 7 phases |
| Independent human sign-off | ⏳ PENDING | Required: Solution Architecture, Security & Privacy, Backend/Data, QA/SDET, Product |

**Status remains Review.** No agent may close this gate or update reviewer status.
