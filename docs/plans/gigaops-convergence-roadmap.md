# GigaOps convergence roadmap

Status: Proposed programme (`WI-OI-062`), revision 2, 2026-09-26  
Owner: SDLC Orchestrator, with the repository owner as Product Owner  
Supersedes as working sequence: the external "Vision and phased implementation plan" (kept as design input only)  
Governed by: `AGENTS.md`, `.pi/PLAN.md`, `.pi/WORK_ITEMS.md`, `docs/SDLC_DEVELOPMENT_GUIDE.md`,
ADR-0003, ADR-0005, `docs/plans/delta-5-platform-foundations-north-star-implementation-plan.md`,
`docs/plans/gigaops-workforce-cmms-convergence-implementation-plan.md`

This document does not authorize Build by itself. Each phase starts only when its work item is registered,
passes G0–G3, and the owner hands it the single active Build slot.

## 1. Vision

A company in any industry configures its operation instead of coding it: where work happens, who can do
it, when it is booked, which rules apply in that jurisdiction, what it cost and what it bills. Every figure
traces back to evidence.

Pillars: Place, People, Work, Time & rules, Money, Insight, Any industry, Scale & edge.

The Delta 5 North Star applies to every phase: configure without code; commit business state, audit and
outbox atomically; run long work as durable jobs; deliver events at least once with consumer
deduplication; route every transaction through the tenant's isolation profile; show truthful state; and
produce evidence for review, incident response and release.

## 2. Decisions taken in revision 2

| Topic | Decision |
| --- | --- |
| Order | Prove configurability first (P3) on synthetic data in isolated, labelled Demo Lab tenants. Real workforce facts replace it in P9. |
| Tamper evidence | The vision's "genesis anchor" becomes a per-tenant integrity chain started at tenant activation inside Delta 5 transactional audit evidence (§12.5). Method chosen in ADR-0012 with a threat model and restore test. Sealed pay runs (P8) use it. |
| Finance | No general ledger in this programme. GigaOps produces reconciled billable charges to AR, contractor payables to the AP modules and an ERP export through Connector Hub. A GL is a separate Finance product only with named customer demand, `ledger-core` promotion and its own G0–G7. |
| Industries | The nine existing packs plus agriculture and harvesting make ten. Public works, security and film production follow named demand, as configuration only. Generic profile names, never real brands. |
| Lexicon | `CREW` renamed to `TEAM` (owner-approved 2026-09-26, delivered in WI-OI-061 migration 000004). |
| Tenant Admin Workforce access | `workforce:*` granted to `TENANT_ADMIN` (owner-approved 2026-09-26, WI-OI-061). |

### Owner decision, 2026-09-28: manufacturing first

- Manufacturing is the first industry to release. Release 1 is the core plus CMMS, Workforce and Geospatial
  with the manufacturing pack (`WI-OI-079`).
- GigaLibs ships a shared core plus the modules each client chooses. The architecture target is the kernel,
  capability module and industry pack model of `docs/GIGALIBS_PRODUCT_VISION.md`.
- P9 (`WI-OI-072`) runs on the manufacturing UAT tenant.
- P10 (the ten-industry suite) and industry vocabulary (`WI-OI-074`) follow after Release 1.
- M4 is retargeted to manufacturing only.

## 3. Business milestones

| Milestone | Reached at | Business outcome | Gate |
| --- | --- | --- | --- |
| M1 Configurability proof | end of P3 | A solution engineer shows the same product configured for three industries, one chosen blind, with sub-second drill-down, on isolated demo tenants. | G4 |
| M2 First business outcome | end of P9 | The nine-step journey in `gigaops-workforce-cmms-convergence-implementation-plan.md` §9 runs on a real local tenant. | G5 + Product Owner UAT |
| M3 Industry suite | end of P10 | Ten templates pass automated smoke tests; demos switch industries on isolated tenants in under two seconds. | G5 |
| M4 Release | P11 | Measured scale, offline devices, first customer cohort. Requires the owner to lift the 2026-09-22 local-only amendment. | G6–G7 |

## 4. Gates for every work item

| Gate | Track | Pass condition |
| --- | --- | --- |
| G0–G1 | Design | Outcome, human owner, existing-code inventory with no duplicate capability, FR/NFR IDs, acceptance and negative cases, value measure. |
| G2 | Design | ADR, data ownership, threat model, permissions, tenant isolation, migration with roll-forward or recovery plan. |
| G3 | Design | Every UI state specified; API and event schemas versioned; idempotency rules; test layers and representative volume. |
| G4 | Build | UI, API, rules, persistence, events, authorization, audit and telemetry together; module-completeness standard; exact image; then Review. |
| G5 | Milestones M2, M3 | Integrated, migration, E2E, tenant-negative, security, performance, resilience, accessibility and restore evidence; independent review; Product Owner accepts. |
| G6–G7 | Milestone M4 | SBOM and provenance, rehearsed migrations, canary with halt criteria, named release authority; SLOs met through the observation window. |

G0–G3 for the next phase runs while the current phase is in G4. Build sizes are engineering estimates
(S ≈ 1 week, M 2–3 weeks, L 4–6 weeks) and exclude human review time.

## 5. Delta 5 foundation map

D1 governed metadata and module adapters · D2 durable jobs · D3 transactional domain events ·
D4 tenant connection governance · D5 transactional audit evidence.
"Adopter" marks the proposed slice that proves reuse (Delta 5 §20 Phase 9); the SDLC Orchestrator confirms.

| Phase | D1 | D2 | D3 | D4 | D5 | Used for |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | | | uses | uses | uses | Module outbox, tenant binding, append-only audit |
| P2 | uses | | uses | uses | uses | Node types from configuration; node-change events |
| P3 | **adopter** | uses | | uses | uses | Industry packs and metric catalogue as governed configuration; synthetic load as a durable job |
| P4 | | | uses | uses | uses | Least-privilege binding, outbox, audit |
| P5 | uses | uses | uses | uses | uses | Tenant custom fields; roster import job |
| P6 | | | **adopter** | uses | uses | Workforce and CMMS events in the canonical envelope |
| P7 | | uses | uses | uses | uses | Punch inbox with idempotency; admission control |
| P8 | uses | **adopter** | uses | uses | **adopter** | Calculation and export jobs; sealed runs on the integrity chain |
| P9 | uses | | uses | uses | uses | Facts from module outboxes; bounded analytical queries |
| P10 | uses | uses | | uses | uses | Ten governed templates; demo tenant provisioning and reset |
| P11 | | uses | uses | uses | uses | Transport swap, capacity limits, archive and export |

## 6. Rules that prevent technical debt

1. Canonical schemas only (`gigalibs_workforce`, `gigalibs_spatial`, `gigalibs_cmms`). The prototype
   `gigalibs_gigaops` migrations are never applied; a registered work item retires them once canonical
   tables cover their concepts.
2. No links across module databases. Modules hold each other's IDs as plain references and synchronize
   through versioned events in the Delta 5 envelope. Nothing reads another module's tables.
3. One system per concept: retire the control-plane `GeofenceZone` into Geospatial; finish the duplicate
   platform-RBAC convergence (ADR-0003 Decision 9); Configuration Studio is the only metadata engine.
4. No free-form SQL from configuration. Metric catalogues, filters and rules compile to typed, allowlisted
   structures.
5. Fix names before data exists (done for `CREW`); settle permission naming in ADR-0003.
6. Contracts versioned from day one; additive changes only; breaking changes become a new version with both
   served during migration.
7. Forward-only migrations. A nullable-then-required change registers its follow-up work item with a date.
8. Synthetic data only in labelled demo or certification tenants, excluded from value reporting, with
   proven reset and deletion.
9. Quarantined packages stay out until promoted through `docs/runtime-quarantine.md`.
10. Every known limitation is a registered work item with an owner; code comments are not tracking.
11. Prove one journey before generalizing; a mechanism becomes shared only after its second adopter passes.
12. Permissions are tested through the real session path, never only with hand-built tokens.

## 7. Screen unlocks

| Overview | Resources | Skills | Jobs | Availability | Scheduling | Time | Pay | Compliance | Analytics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | P0 | P0 | P5 | P5 | P6 | P7 | P8 | P8 | P3 demo · P9 live |

## 8. Phases

### P0 — Close WI-OI-061 and stabilize (size S, G4 → Review, now)

- **Business outcome:** a tenant admin keeps a real, tenant-isolated directory of people, teams and labour
  pools with verified qualifications.
- **Work item:** `WI-OI-061`.
- **Actions:** owner sign-in test as a Tenant Admin; `CREW` → `TEAM` (migration 000004, contract, UI);
  session-path permission test; eight mandatory checks and exact-image certification; evidence in
  `.pi/work/WI-OI-061.md`; split the working tree into per-work-item commits (owner decision); rebuild
  module images so `.env.modules` names real images; `CLAUDE.md` pointer to `AGENTS.md`.
- **Exit:** tenant A creates, restarts and updates with an expected version; tenant B sees nothing; eight
  checks pass; an independent reviewer signs the permission change.

### P1 — Governance and foundation reconciliation (human track, parallel, G0–G2 programme)

- **Business outcome:** decisions keep pace with delivery; every later phase starts from an approved design.
- **Work item:** `WI-OI-062` (this programme).
- **Actions:** triage the Review queue (55 of 61 items) into accept, accept with conditions, or reopen; weekly
  review slot; named independent reviewers for permissions, tenancy, migrations and deployment; accept
  ADR-0003 including lexicon and permission naming (recommended: allow granular `module.entity.action`
  permissions in custom roles); confirm Delta 5 adopter roles with the SDLC Orchestrator and align with
  WI-OI-044 to WI-OI-047; reserve ADR-0006 to ADR-0012.
- **Exit:** Review queue below 15; ADR-0003 accepted; adopter roles confirmed.

### P2 — Place: sites, zones and jurisdiction scope (size M)

- **Business outcome:** an operations lead models every real site once, from a single shop to a
  multi-country estate, and limits a regional manager to their region.
- **Work item:** `WI-OI-063` (proposed). **ADR:** 0006. **Owner:** `modules/geospatial`.
- **Deliverables:** `gigalibs_spatial.spatial_nodes` with `ltree` path, configured node type, ISO country and
  subdivision, time zone, optional GeoJSON boundary, RLS, audit and outbox; `SpatialNodeChangedV1`; optional
  `spatial_scope` on `PlatformContextV1` (old tokens still verify); shared helper binding
  `path <@ ANY($1::ltree[])` with strict validation, failing closed; Sites & Zones explorer that collapses to
  a flat list for single-location tenants; bulk import through Universal Data Studio; retire control-plane
  `GeofenceZone`. (Jurisdiction codes on country packs and the Japan pack moved to P3 by owner decision,
  2026-09-26.)
- **Not adopted from the vision:** table in shared `packages/db`; PostGIS now (not present in
  `postgres:16-alpine`; ADR-0006 decides on measured need).
- **Exit:** sub-tree query p95 < 8 ms on 50,000 nodes; zero cross-scope and cross-tenant reads; exact image.

### P3 — Configurability proof (size M, milestone M1)

- **Business outcome:** a solution engineer shows the same product configured for three industries, one
  chosen blind, with drill-down in under a second and no code or schema change.
- **Work item:** `WI-OI-064` (proposed). **Owners:** Analytics Studio, Configuration Studio, Demo Lab.
- **Deliverables:** fact store storing node ID and path snapshot at event time; semantic metric catalogue
  (labour, spend, downtime, carbon) as governed configuration compiled to typed allowlisted queries; ECharts
  tree and sunburst drill-down (ADR-0004); industry packs as versioned Configuration Studio definitions;
  synthetic facts generated by a durable job into isolated labelled Demo Lab tenants (FR-13), excluded from
  value reporting; benchmarks `qsr.json`, `jp-metro-industrial.json`, then a blind third industry; country
  packs, including Japan, as Configuration Studio definitions with jurisdiction (ISO 3166-2) codes, built once
  where the Japan benchmark first consumes them (moved from P2).
- **Exit:** p95 < 20 ms on 1,000,000 synthetic facts; blind industry configured by a non-engineer in 30
  minutes; zero migrations between profiles; demo reset and deletion proven.

### P4 — CMMS core recovery (size L)

- **Business outcome:** a maintenance manager runs assets, preventive maintenance, meters, parts and work
  orders for real sites.
- **Work item:** `WI-OI-038` (exists). **Owner:** `modules/physical-operations-cmms`.
- **Deliverables:** ordered migration manifest excluding prototypes; fix type check, auth and import
  boundaries; signed context, org and spatial scope, least-privilege RLS; assets and work orders store
  `site_ref` from P2; decide Tenant Admin `cmms:*`; People and Dispatch stay unavailable.
- **Exit:** CMMS entitled without Workforce screens; clean install, upgrade, two-tenant denial, restart,
  restore.

### P4b — CMMS complete: reliability, shop-floor kiosk, EAM (size L, plan v3 **Phase 6 / M-CM2**)

**Not Phase 1.** These routes exist in navigation today as honest placeholders (`module.yaml` →
`/cmms/analytics`, `/cmms/floor`). They must not show measured KPIs or live telemetry until the backlog
items below are built and certified.

| Capability | Route today | Backlog | What it is (product) | What it is not |
| --- | --- | --- | --- | --- |
| **Reliability reporting** | `/cmms/analytics` | **CM-07**, **U19b** | MTBF, availability, downtime Pareto and overdue/completion metrics from **attributable downtime and service-restoration events**, drill-through to source, unknown stays unknown | Guessed or empty-chart “reliability” |
| **Shop-floor kiosk** | `/cmms/floor` | **CM-04**, **U19c** | Device-bound shop-floor UI: technician identity, **governed meter/threshold → request/work-order** automation, proven operational telemetry on a floor-oriented view | A generic **3D digital twin** of the plant (that direction is **Geospatial** — e.g. spatial exploration on `/maps` — plus optional CAD/BIM components later; kiosk may **use** place/asset identity from T3 but is not defined as “Three.js factory viewer”) |
| **EAM depth** | (future surfaces) | **EAM-001–005**, **WI-OI-108** (permits slice) | Extended asset lifecycle, permits, contained forms rebuild | — |

**Work item shell:** **M-CM2** in `docs/plans/platform-implementation-plan.md`; supersedes the contained
other-stream rebuild notes in **WI-OI-108**.

**Depends on:** **M-CM1** (work orders, requests, meters, parts — Phase 1 W1), **T3** one place identity,
**T5** where stock/EAM touches inventory, and for kiosk **CM-04** meter/IoT consumer (audit backlog:
versioned consumer, unique trigger key, no fake sensor state).

**Exit:** `/cmms/analytics` and `/cmms/floor` show real persisted data only; journey and module-completeness
evidence; independent Security review before UAT deploy (same as every release).

### P5 — People: jobs, engagements and availability (size M + M)

- **Business outcome:** a workforce manager describes who the organisation employs or contracts, what each
  role requires and when each person can work, and imports an existing roster.
- **Work items:** `WI-OI-065` jobs, positions, engagements; `WI-OI-066` availability and absence.
- **Deliverables:** effective-dated `job_profiles`, `positions`, `engagements`; `availability_rules`,
  `absences`, working calendars; tenant custom fields through the Configuration Studio adapter; roster
  import as a durable job through Universal Data Studio.
- **Exit:** effective dating, isolation, restart, audit and outbox; invalid imports leave no partial writes.

### P6 — Work: demand, booking and dispatch (size L)

- **Business outcome:** a dispatcher staffs work from any source, including CMMS work orders, with qualified
  and available people, and nobody is double-booked.
- **Work items:** `WI-OI-067` demand and booking; `WI-OI-068` CMMS handshake. **ADR:** 0007.
- **Deliverables:** demand requirements (`site_ref`, window, capability, headcount); `resource_allocations`
  DRAFT → CONFIRMED → DISPATCHED → ON_SITE → COMPLETED or CANCELLED; capability guard (422); `EXCLUDE USING
  gist` overlap constraint (`btree_gist` available); `WorkRequirementRequestedV1` and
  `ResourceBookingCreatedV1` families in the Delta 5 envelope with logical IDs only; dispatch board;
  Communications notifications; Workflow Studio approvals; open-call sourcing increment; E-Signature for
  agreements.
- **Exit:** 1,000 concurrent booking attempts, zero overlaps; work order → booking → completion idempotent
  and replayable.

### P7 — Time and attendance (size L)

- **Business outcome:** workers record time at the right place, managers approve it, exceptions are resolved
  without database access.
- **Work item:** `WI-OI-069`.
- **Deliverables:** `WorkEventPayloadV1` and ingestion contract on the PostgreSQL inbox with device
  idempotency keys; geofence checks through the Geospatial API; timesheets; Workflow Studio approval with
  optional Configuration Studio safety checklist; Exception Inbox; corrections with reason codes; load test
  recording punches per minute.
- **Exit:** duplicate, late and out-of-fence punches handled; approved timesheets immutable; baseline recorded.

### P8 — Rules, compliance and pay readiness (size L)

- **Business outcome:** payroll receives explainable, sealed, payroll-ready earning lines; billing receives
  billable charges; the business sees margin per job and site.
- **Work items:** `WI-OI-070` policy packs; `WI-OI-071` pay readiness and export; `WI-OI-040` work-source
  billing (exists). **ADRs:** 0008, 0012.
- **Deliverables:** effective-dated jurisdiction packs in Universal Rule Pro (first jurisdiction by named
  client); calculation runs as durable jobs freezing `rule_version_id`, the `multi-currency` rate reference
  and precision; earning lines with rule trace and seal on the integrity chain; approve/lock/reopen/correct
  with separation of duties; ERP and payroll export through Connector Hub with reconciliation; AR billable
  charges (FR-17); AP payables; margin view.
- **Not in scope:** general ledger, statutory payroll, tax filing, payments.
- **Exit:** golden tests per rule; sealed reruns identical; post-approval rate changes ignored; exports
  reconcile 100%.

### P9 — Live intelligence and the first business outcome (size M, milestone M2)

- **Business outcome:** managers see real coverage, overtime, cost and margin with lineage and freshness;
  the nine-step journey runs end to end.
- **Work item:** `WI-OI-072`.
- **Deliverables:** Workforce and CMMS facts through outboxes into the P3 fact store; Analytics switches to
  live data for entitled tenants; nine-step journey on a real isolated local tenant; G5 evidence (E2E,
  tenant-negative, WCAG 2.2 AA, performance, restore) and Product Owner UAT.
- **Exit:** nine steps pass; every metric traces to source facts; no open P0/P1 defect; owner accepts.

### P10 — Industry suite (size M, milestone M3)

- **Business outcome:** a new customer in any of ten industries starts from a tested template; sales can
  switch industries live without touching customer data.
- **Work item:** `WI-OI-073`. **ADRs:** 0009 ontology read-only projection, 0010 connector inbound authority.
- **Deliverables:** ten templates; Demo Lab switcher under two seconds with reset and deletion;
  E-Signature, document OCR and Communications store `site_ref`.
- **Exit:** smoke tests for ten templates; switcher proven; ADR-0009 and ADR-0010 accepted.

### P11 — Scale, edge and release (size L+, milestone M4)

- **Business outcome:** large sites punch in at shift change without delay, offline devices never lose a
  record, and the product reaches a first customer cohort.
- **Work items:** `WI-OI-074` transport and load; `WI-OI-075` offline punch client; `WI-OI-076` release
  evidence. **ADR:** 0011.
- **Deliverables:** Redis Streams or Kafka only if the P7 baseline is below 25,000 punches per minute;
  device-scoped offline queue then edit conflict rules and server-checked slot claims; MQTT device adapter
  first; SBOM, provenance, canary, SLOs, on-call; customer-hosted profile certified separately.
- **Exit:** throughput at target; zero Critical/High image findings; canary meets halt criteria; named
  release authority; SLOs through the G7 window.

## 9. Where each vision item lands

| Vision item | Phase | Decision |
| --- | --- | --- |
| `platform_spatial_nodes` with `ltree` | P2 | Kept, in `gigalibs_spatial` |
| PostGIS polygons | P2 | Deferred to ADR-0006 on measured need |
| Parameterized scope middleware | P2 | Kept |
| Flat UI for single-location tenants | P2 | Kept |
| `ledger_genesis_records` | P1/P8 | Replaced by the Delta 5 integrity chain (ADR-0012) |
| Bitemporal fact store | P3 | Kept, in Analytics Studio |
| JSON metric catalogue and query generator | P3 | Kept; typed structures, no free SQL |
| Triple-industry gate with blind third industry | P3 | Kept, on isolated demo tenants |
| `work_units.spatial_node_id` foreign key | P6 | Replaced by logical `site_ref` in `gigalibs_workforce` |
| `applied_rule_version_id` | P8 | Kept, on calculation runs |
| Ingestion buffer interface | P7/P11 | Kept; PostgreSQL first |
| Tickets and forms spatial pull-forward | P2/P7 | Forms via Configuration Studio; `tickets-core` only after promotion |
| Safety checklist before time approval | P7 | Kept |
| Compliance engine (Japan, California, India, EU) | P8 | Universal Rule Pro packs, one jurisdiction at a time |
| Dual sourcing with agreement signing | P6 | Kept; E-Signature owns signatures |
| CMMS `resource_allocation_id` foreign key | P6 | Replaced by logical ID plus events |
| CMMS reliability (MTBF, availability, downtime Pareto) | P4b | **CM-07**; route `/cmms/analytics`; no KPIs until downtime capture |
| CMMS shop-floor kiosk (device + meter alerts) | P4b | **CM-04**, **U19c**; route `/cmms/floor`; not a 3D plant twin |
| Plant / unit 3D spatial view | P2 / M-GEO | **`/maps`** and Geospatial place model; CMMS floor may link assets to places |
| FX rate lock at approval | P8 | Reference to the multi-currency rate entry |
| GAAP ledger and Merkle chain | — | Separate Finance product on named demand |
| Pay versus bill margin | P8 | Kept |
| Ten industries and sales switcher | P10 | Kept; Demo Lab tenants |
| Ontology and Connector Hub ADRs | P10 | Renumbered ADR-0009, ADR-0010 |
| Kafka, CRDT offline sync, hardware layer | P11 | After measured need |

## 10. Gaps found in the 2026-09-26 audit

| Gap | Evidence | Addressed in |
| --- | --- | --- |
| Review backlog blocks Done | 55 of 61 items in Review | P1 |
| Workforce permissions not grantable | Dotted names dropped by the session filter; no role held them | P0 (fixed), P1 (custom roles) |
| Tests used hand-picked scopes | No session-path test | P0 (added) |
| GigaOps section pages crashed | Server route imported a client-module value | P0 (fixed) |
| `CREW` violated the ADR-0003 lexicon | Migration 000003, `WorkforceResourceTypeV1Schema` | P0 (migration 000004) |
| Tenant Admins cannot open CMMS | No `cmms:*` in the role | P4 |
| Two geofence systems | `GeofenceZone` and `gigalibs_spatial.geofences` | P2 |
| No Japan country pack | Only US, GB, AU, IN, EU | P3 (moved from P2, owner decision 2026-09-26) |
| PostGIS absent | `postgres:16-alpine` offers `ltree`, `btree_gist` | P2 |
| Uncommitted work at risk | ~600 changed files on one branch | P0 (owner decision) |
| Module image drift | `.env.modules` names unbuilt images | P0 |
| Stale Workforce deployment profile | Migration version 2 and business APIs "disabled" | P0 (corrected) |
| Stale local package build | `rbac-core` dist lacked the new role grant | P0 (rebuilt) |

## 11. Definition of done for every work item

- `WI-OI-NNN` registered with FR/NFR links before Build; G0–G3 evidence before G4.
- ADR for any ownership or boundary change; Delta 5 foundations consumed, not copied.
- Forward-only migrations in the owning schema, replayed empty and on upgrade.
- State, audit and outbox committed in one transaction; RLS with two-tenant and unscoped-query tests.
- Permission test through the session path; every UI state (loading, empty, denied, validation, conflict,
  failure, retry).
- All eight mandatory checks; exact image with zero Critical/High findings; restart persistence.
- Evidence in `.pi/work/`; independent reviewer; human acceptance.
