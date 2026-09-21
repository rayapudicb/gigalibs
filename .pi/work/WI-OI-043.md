# WI-OI-043 — External Data Analytics & Reporting Studio

Status: Proposed  
Gate: G0  
Owner: SDLC Orchestrator  
Created: 2026-09-21  
Plan: `docs/plans/analytics-reports-production-implementation-plan.md`  
Agent prompt: `docs/plans/analytics-reports-production-agent-prompt.md`

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

## G0 blockers — must be resolved before Build is authorized

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
