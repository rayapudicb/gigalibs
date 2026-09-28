# WI-OI-064 - Configurability proof (roadmap P3, milestone M1)

Status: In Progress (G0–G3 design, then bounded Local G4 Build) — sole active item from 2026-09-26 under the
owner's continuous-mode handoff (WI-OI-062). Requirements: FR-01, FR-11, FR-12, FR-13, FR-14 and applicable NFRs.

## Business outcome

A solution engineer shows the same product configured for three industries — QSR, Japanese metro industrial
and a third chosen blind — with drill-down from the whole estate to a single site in under a second, on
isolated labelled demo tenants, with no code or schema change between them.

## G0 inventory (2026-09-26)

| Capability | What exists | Reuse / gap |
| --- | --- | --- |
| Analytics Studio (`modules/analytics-studio`) | Deployed locally (WI-OI-059 Review); 11 migrations; datasets, semantic models with governed aggregate functions, query engine, charts, dashboards, reports, lineage, freshness | Reuse the semantic-model and freshness concepts. Datasets are built from connector raw records; there is no event fact store keyed by place |
| Analytics authorization | OIDC guard over a JWKS; the web proxy obtains tokens from Analytics' own `POST /oidc/dev/token?tenantId=&sub=` | **Blocking finding 1** below |
| Measure SQL | `executeMeasure` embeds `field_reference` into SQL text (`analytical_payload->>'${field}'`); the field is regex-validated at write time | Not exploitable today, but string-built SQL contradicts roadmap rule 4; bind the key as a parameter (`->> $n`) |
| Configuration Studio (control plane) | Change sets → submit → approve → publish → activation and rollback; surfaces; package export and import; tenant apps and records | The governed-definition lifecycle packs and metric catalogues must use (Delta 5 D1 adopter) |
| Industry packs | Nine JSON packs in `modules/gigaops/config/industry-packs` (incl. `qsr.json`, `jp-metro-industrial.json`); owner decision adds agriculture as the tenth | JSON in an undeployed module; becomes Configuration Studio definitions |
| Country packs | US, GB, AU, IN, EU JSON in `modules/gigaops`; Japan and ISO 3166-2 jurisdiction codes moved here from P2 (owner decision) | Same conversion; add JP |
| Visualization | ADR-0004 **Accepted: ECharts**; `@gigalibs/charts-react` has no ECharts dependency (hand-rolled) | Implement ADR-0004 for tree and sunburst drill-down |
| Durable jobs (Delta 5 D2) | Durable tenant export with leases and outbox (WI-OI-048), transactional inbox (WI-OI-049), workload admission (WI-OI-050) | Synthetic fact generation runs as a durable job on this foundation |
| Demo Lab (FR-13) | Not implemented | New: isolated, labelled demo tenants with proven reset and deletion, excluded from value reporting |
| Places (P2) | Place ids, paths and `SpatialNodeChangedV1` events (WI-OI-063) | Facts store place id plus a path snapshot at event time |

## G0 findings

1. **Analytics development token minting (blocking for P3).** `POST /oidc/dev/token` issues a valid Analytics
   token for any `tenantId` and subject with no credential whenever `ANALYTICS_ALLOW_INSECURE_OIDC=true`
   (forbidden in production by runtime config; the local profile enables it). The port is not published to the
   host, so exposure is limited to containers on the local Docker network, but any of them can impersonate any
   tenant. Same class as the Geospatial header fallback removed in 063a. Analytics must verify the BFF-signed
   `PlatformContextV1` (audience `gigalibs-analytics-api`, module `analytics-studio`) like Workforce and
   Geospatial, and the web proxy must stop calling the dev endpoint.
2. Measure SQL built as text (see inventory) — tighten to bound parameters in the same slice.
3. ADR-0004 accepted but unimplemented.
4. Packs live only as JSON in an undeployed prototype module.
5. No fact store, no Demo Lab.
6. The dev tokens carry `analytics:*`, so the module never sees the user's real permissions; only the web proxy
   checks them. The signed context forwards the verified `granted_scopes`.
7. The undeployed E-Signature proxy (`app/api/esign`) uses the same dev-token pattern; it is fixed when
   E-Signature is certified (P6 agreements, WI-OI-067), not in this item.
8. Local Analytics holds no tenant data (every table empty), so it moves from the hashed module tenant binding to
   the canonical tenant id without a data migration — matching Workforce and Geospatial, whose events P9 ingests.

## Proposed build slices (one at a time, each certified before the next)

1. **064a Analytics runtime convergence** — signed `PlatformContextV1` guard with entitlement and scope checks
   (including `spatial_scope` for place-keyed facts); remove the dev token path from the BFF and disable the
   dev provider in the local profile; bind measure keys as parameters; exact image, scan, runtime certification.
2. **064b Operational fact store and metric catalogue** — `gigalibs_analytics.operational_facts` (tenant, fact
   type, place id, path snapshot, occurred at, measures), forced RLS, append-only; metric catalogue (labour,
   spend, downtime, carbon) as Configuration Studio definitions compiled to typed, allowlisted queries; drill-down
   API by path prefix. Exit: p95 < 20 ms on 1,000,000 facts.
3. **064c Packs as governed definitions** — industry packs (ten) and country packs with ISO 3166-2 jurisdiction
   codes, including Japan, as versioned Configuration Studio definitions activated per tenant.
4. **064d Demo Lab** — isolated labelled demo tenants, synthetic facts generated by a durable job from a pack,
   reset and deletion proven, excluded from value reporting (FR-13).
5. **064e Drill-down experience** — ECharts tree and sunburst (ADR-0004) in Medusa UI, estate → region → site in
   under a second; the blind third industry configured by a non-engineer in 30 minutes (human-run acceptance).

## Exit criteria (roadmap)

p95 < 20 ms on 1,000,000 synthetic facts; blind industry configured by a non-engineer in 30 minutes; zero
migrations between profiles; demo reset and deletion proven.

## 064a design (G1–G3)

**Acceptance cases.** A request without a token, with a wrong audience, a wrong module, an expired or tampered
token, or a revoked session is refused (401/403); a valid context reaches only its own tenant's rows (forced RLS
on `app.tenant_id`); each endpoint's permission is checked against the user's real `granted_scopes`; the dev
token endpoint no longer exists; measure keys are bound parameters; two-tenant denial holds end to end through
the web proxy.

**Threat model.** Removes tenant impersonation from the local network (finding 1) and permission inflation
(finding 6). Authority is the Ed25519-signed `PlatformContextV1` minted per request by the BFF; the private key
lives only in the web container, the public key only in Analytics.

**Contracts and runtime.** Audience `gigalibs-analytics-api`, module key `analytics-studio`; principal gains
session, auth version, roles, persona, org and spatial scope. Migration `000012` adds
`auth_revocation_events` (forced RLS, runtime read-only), mirroring Workforce and Geospatial. Runtime config
replaces the OIDC settings with `ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64` and the audience; the dev
provider, its controller and the insecure-OIDC switch are removed. The web `/api/analytics` proxy moves onto
`createSignedModuleProxy` with its existing allow-list. `generate-module-runtime-credentials.sh` issues the key
pair. Deploys include `compose.modules.local.yaml` from here on.

**Tests.** Guard matrix (unit), runtime config, measure-binding test, proxy boundary test, and a live
`verify-analytics-http.sh` (signed-context matrix and two-tenant denial through the running service).

## 064a build (2026-09-26)

- Analytics: `PlatformContextAuthorizationGuard` (renamed from `OidcAuthorizationGuard` in every controller)
  verifies the Ed25519-signed context for audience `gigalibs-analytics-api` and module `analytics-studio`,
  checks the endpoint permission against the verified `granted_scopes`, consults `auth_revocation_events`
  (fails closed with 503 when it cannot) and freezes a principal with session, roles, persona, org and spatial
  scope. The development issuer (`oidc-dev` controller and service), the `jose` dependency and the
  insecure-OIDC switch are removed. Migration `000012_platform_context_revocation` (schema contract pinned to
  the last migration by a test); runtime config takes only the public key and audience.
- Measure SQL binds the JSONB key as `$2`; the aggregate function stays a closed switch.
- Web: `/api/analytics` uses `createSignedModuleProxy` (entitlement, scope, same-origin and allow-list checks;
  canonical tenant id; no calls to the development issuer). Old route kept in `scratch/wi-oi-064-originals`.
- Infra: `generate-module-runtime-credentials.sh` issues the Analytics key pair (and appends it to an existing
  profile without touching other secrets); `compose.modules.local.yaml` passes the public key to Analytics, the
  private key to web, marks `auth_revocation_events` read-only and expects migration 12. Local deploys now
  include the modules overlay.
- Tests: guard matrix (5), runtime config (8), web boundary (6); `verify-analytics-http.sh` for the live matrix,
  two-tenant RLS and revocation.

### 064a local certification — identity `5abfa667bb10-6cecab041271` (2026-09-26)

| Check | Result |
| --- | --- |
| `pnpm build` / `pnpm test` / six audits | 106/106; 197/197 files (existing entitlement-key test updated to read the proxy and the guard); pass |
| Deploy (all four overlays) | 5 module migration jobs + control plane in parallel, all exit 0; 11 services healthy |
| `verify-analytics-http.sh` (run 20260926T122449Z) | no token / wrong audience / foreign key 401, wrong module / no scope 403, `/oidc/dev/*` 404, read-only user cannot set up (403), setup 201, tenant B sees nothing (forced RLS), revoked session 401 |
| Browser path (`verify:analytics-web-path`, run 1790425734752-2060d4) | real web login → BFF-signed context → Analytics; canonical tenant id; Tenant Admin read and setup; Member 403 |
| Clean module migration replay | Connector Hub v4 and Analytics v12 with two-tenant RLS: pass (replay script updated from v11) |
| Revocation table | runtime role SELECT only; RLS forced |
| Regression | concurrent migrations, Geospatial HTTP/runtime/journey/performance (p95 4.097 ms), Workforce HTTP/runtime/journey, session scope: pass |
| Image policy (Trivy 0.74.0) | all seven images 0 Critical, 0 High (`infra/compose/evidence/wi-oi-064a-20260926T122907Z/`) |
| Analytics runtime | user 65532, read-only root, all capabilities dropped, `no-new-privileges`, no host port, no OIDC settings |

The replay-script version bump and the new web-path script were added after this build, so the formal re-run
of both on an exact identity is part of the 064b certification cycle.

## 064b design (G1–G3 draft) — fact store, rollups and metric catalogue

**Fact store (Analytics, `gigalibs_analytics`).** `operational_facts`: tenant, fact type (labour hours, labour
cost, spend, downtime minutes, carbon kg), place id and `ltree` path snapshot at event time, occurred at,
quantity and unit, bounded dimensions, origin (`LIVE` | `SYNTHETIC`), source event id (idempotent, unique per
tenant and source); forced RLS, append-only. History keeps the path at event time: moving a site later does not
re-attribute old facts.

**Meeting p95 < 20 ms on 1,000,000 facts.** Aggregating raw facts per click cannot meet the target. Facts roll
up into `place_rollups` keyed by (tenant, metric, ancestor path, child path, day): every fact contributes to each
ancestor level, so a drill-down at any level reads only its children × days (for example 10 regions × 30 days =
300 rows) through one b-tree range. Rollups are rebuilt set-based per tenant and day by a durable job (Delta 5
D2) and are reproducible from facts.

**Metric catalogue — ownership decision required.** Configuration Studio today governs form fields (component
kinds are inputs; one adapter, tenant profile). Two options:

- **A. Extend Configuration Studio (roadmap rule 3, D1 adopter).** Add typed definition kinds (metric catalogue,
  industry pack, country pack) to its change set → approval → publish → activation lifecycle, distributed to
  Analytics through the existing manifest-invalidation consumer. One metadata engine; about 1–2 weeks more.
- **B. Module-owned first (roadmap rule 11).** Analytics owns a versioned, audited catalogue (draft → publish,
  typed schema, allowlisted compile); packs stay versioned files seeded per tenant; promotion into Configuration
  Studio when a second module needs governed definitions. Faster, but a second metadata engine until promoted.

Either way metrics compile only from a typed definition (fact type, aggregate, bounded filters, ratio of two
metrics) to parameterized SQL over rollups — never free-form SQL (rule 4).

**Owner decision (2026-09-26): option A — extend Configuration Studio.** P3 is re-sliced:

1. 064a Analytics runtime convergence — **certified**.
2. 064b Fact store and hierarchical rollups in Analytics (data plane; 1,000,000-fact performance proof).
3. 064c Configuration Studio typed definition kinds (metric catalogue, industry pack, country pack with ISO 3166-2
   codes, including Japan) with approval, publish, activation and distribution to Analytics.
4. 064d Metric compilation and drill-down API over rollups, driven by the activated catalogue.
5. 064e Demo Lab: isolated labelled tenants, synthetic facts by durable job from an activated pack, reset/deletion.
6. 064f Drill-down experience (ECharts, ADR-0004) and the blind third-industry acceptance run.

## 064b build (2026-09-26)

- Migration `000013_operational_facts_and_place_rollups`: `operational_facts` (fact type, place id and `ltree` path
  at event time, UTC timestamp, non-negative quantity, currency for cost and spend, bounded dimensions, `LIVE` |
  `SYNTHETIC` origin, idempotent source event id; append-only for the runtime role) and `place_rollups` (tenant,
  fact type, ancestor path, child path, day; `''` is the whole estate and child = ancestor holds facts recorded on
  the place itself); forced RLS on both; `rebuild_place_rollups(tenant, from, to)` is SECURITY INVOKER (RLS-bound),
  set-based and idempotent; audit enums gain `PLACE_ROLLUPS_REBUILT` / `PLACE_ROLLUP`. Schema contract 13.
- API: `GET /v1/places/drilldown` (`analytics:read`; one ancestor's children for a ≤ 366-day window via the
  rollup primary key) and `POST /v1/places/rollups/rebuild` (`analytics:action`, audited in the same transaction;
  internal — not exposed by the BFF). Contracts in `@gigalibs/contracts` (`PlaceDrilldownQueryV1`,
  `PlaceDrilldownV1`, `RebuildPlaceRollupsV1`).
- Spatially scoped members receive `403 SPATIAL_SCOPE_DENIED`: Analytics has no place directory to resolve
  assigned place ids yet. The directory is a projection of `SpatialNodeChangedV1` built with live fact ingestion
  (registered to WI-OI-072, P9).
- Verified against real PostgreSQL before the build: estate, region and site drill-downs reconcile (self buckets
  included) and rebuilds are idempotent.
- Tests: 9 service tests, 1 proxy test; `verify-analytics-performance.sh` loads 1,000,000 facts into a labelled
  certification tenant, rebuilds through the API, reconciles totals, measures p95 against 20 ms, then deletes the
  synthetic facts and rollups.

### 064b performance finding and fix (2026-09-26)

First certification run on identity `9c242f79f25c`: totals reconciled, but drill-down p95 was **21.5 ms** (limit
20 ms). Diagnosis: the query itself runs in 0.16 ms, but under forced RLS PostgreSQL only uses leakproof
operators as index conditions ahead of the tenant policy, and `ltree` equality is not leakproof, so
`ancestor_path` was applied as a filter after scanning every rollup of the tenant and window (43 ms cold,
14,340 rows removed). Forward migration `000014_place_rollups_text_paths` stores rollup paths as text (leakproof
equality; ltree still computes them); verified under the runtime role with RLS: 0.179 ms using the full primary
key, totals unchanged. Schema contract 14. Generator overflow in the performance script (int4) fixed with bigint.

### 064b local certification — identity `5abfa667bb10-8197f27022df` (2026-09-26)

| Check | Result |
| --- | --- |
| `pnpm build` / `pnpm test` / six audits | 106/106; 198/198 files; pass |
| Deploy (all overlays) | Analytics migrations 13 and 14 applied; every migration job exit 0; 11 services healthy |
| **Drill-down performance** (run 20260926T141647Z) | **1,000,000 facts: p50 3.814 ms, p95 5.163 ms, max 17.9 ms end to end through the API (limit 20 ms)**; 175,930 rollup rows rebuilt in 8.0 s; estate, region and site totals reconcile to the raw facts (4,500,000); synthetic data deleted after the run |
| Analytics HTTP (signed-context matrix, RLS, revocation), web path, clean replay v14, concurrent migrations | pass |
| Geospatial HTTP / runtime / journey / performance (p95 3.710 ms), Workforce HTTP / runtime / journey, session scope | pass (a first regression pass run concurrently with host builds produced load-induced token expiries and a latency miss; every one passed when rerun on an idle host) |
| Image policy (Trivy 0.74.0) | all seven images 0 Critical, 0 High (`infra/compose/evidence/wi-oi-064b-20260926T151120Z/`) |

**P3 exit criterion "p95 < 20 ms on 1,000,000 synthetic facts": met.**

## 064c build (2026-09-26) — governed catalogues in Configuration Studio

- Contracts (`configuration/catalogue.ts`): `MetricCatalogueV1` (aggregate and ratio metrics over the fact types;
  ratios may only reference aggregates in the same catalogue), `IndustryPackV1` (prototype fields plus place
  levels and a synthetic demo profile with its currency), `CountryPackV1` (currency, time zones, ISO 3166-2
  subdivisions checked against the country, working-time defaults, export formats) and
  `GovernedCatalogueDefinition` pinned to its module/entity identity (`analytics-studio/metric-catalogue`,
  `gigaops/industry-pack`, `gigaops/country-pack`); change sets and their responses accept a surface or a catalogue.
- `configuration-core`: `compileGovernedCatalogue` (checksummed manifest), `classifyGovernedCatalogueChange`
  (removing a metric, place type or subdivision is breaking), and the bundled catalogues: operations metrics
  (7), nine industry packs converted from the prototype, six country packs — US (51), GB (4), AU (8) with
  subdivisions, IN and EU without (India's arrive with the P8 India jurisdiction pack), and **Japan (new: 47
  prefectures, Asia/Tokyo, JPY, 8 h/day and 40 h/week, +25 % overtime, +35 % statutory holiday, 5-year
  retention; no social-insurance rates, per the owner decision)**. A test compiles every bundled catalogue.
  Two prototype conventions (underscored pay codes and certification slugs) are accepted faithfully.
- Configuration Studio: catalogue-aware create/update (entitlement to the catalogue's module required),
  compatibility and activation impact; runtime manifests skip the field-permission filter for catalogues;
  `GET /configuration/catalogues`, `POST /configuration/catalogues/install` (`configuration:draft`) and
  `GET /configuration/catalogues/current` (`configuration-runtime:read`, server runtime scope). Submit, approval
  by a different person, publish, activation and rollback are the existing lifecycle, unchanged.
- The `modules/gigaops/config` JSON packs are marked superseded (`SUPERSEDED.md`).
- Live certification: `verify:governed-catalogues` (install → submit → author approval refused → independent
  approval → publish → activate → runtime read, for the metric catalogue and Japan; breaking removal, invalid
  ratio, unknown pack and unentitled tenant).

## 064d build (2026-09-26) — metric drill-down

- Contracts: `MetricSpecV1` (aggregate: fact type + `SUM`|`COUNT`; ratio: two aggregate parts),
  `MetricDrilldownRequestV1`, `MetricDrilldownV1`; `resolveMetricSpec(catalogue, key)` turns an activated catalogue
  metric into its typed spec (the metric unit enum moved to the analytics contracts to avoid an import cycle).
- Analytics `POST /v1/places/metric-drilldown` (`analytics:read`): one SQL pass over the rollups for both ratio
  parts; the only runtime-chosen SQL text is `quantity` or `fact_count` from a closed mapping; per-child ratios
  divide sums, the total is the ratio of totals, a zero denominator yields null. The BFF allows it as a read-only
  POST. Governance of which metrics exist, their labels and units is the activated Configuration Studio catalogue;
  Analytics enforces only typed, allowlisted execution.
- Tests: 6 service tests, 1 proxy test, catalogue resolution; the 1,000,000-fact performance check now includes
  labour cost facts and asserts the ratio drill-down p95 as well.

## 064e design (G1–G3) — Demo Lab

- **Demo tenant:** a platform action creates an isolated tenant labelled `Demo Lab — <industry> (<country>)` with
  tenant feature `demo-lab`, entitlements for Analytics Studio and GigaOps, and the chosen industry pack, the
  country pack and the operations metric catalogue installed and activated. Demo tenants hold no customer data
  (roadmap rule 8), so the Demo Lab system actor runs the catalogue lifecycle with an explicit audit reason; live
  tenants keep independent approval.
- **Synthetic facts:** Analytics generates facts from the pack's demo profile (regions × sites × zones, per-day
  labour hours and cost, spend, downtime, carbon) with deterministic seeded variation, origin `SYNTHETIC`, source
  `demo-lab`, then rebuilds rollups — one bounded, idempotent statement per tenant (≤ 1,000,000 facts) instead of
  a multi-step job: a failure leaves nothing partial and a rerun is safe.
- **Reset and deletion:** a `SECURITY DEFINER` function deletes only `SYNTHETIC` facts and rollups for the tenant
  bound in `app.tenant_id` (facts stay append-only for everything else); reset = purge + regenerate; deletion =
  purge, then the control-plane tenant is removed (cascade). Audit records are retained as evidence.
- **Excluded from value reporting:** structural — value reports are per tenant and synthetic facts never enter the
  value ledger; `origin` marks every synthetic fact.
- **Scope decision:** the P3 outcome is analytics drill-down across industries, so demo tenants are not given
  Geospatial places yet (fact paths carry the place codes); a demo place hierarchy arrives with the P10 Demo Lab
  switcher (WI-OI-073).

## 064e/064f build (2026-09-27) — Demo Lab and drill-down experience

- **Ratio performance fix (064d):** the first ratio certification measured p95 27.6 ms. Diagnosis: right after a
  bulk rollup write the planner's statistics are stale and `fact_type = ANY(...)` leaves the index condition
  (14.5 ms per query, reproduced); equality does not. The metric query now runs one single-fact-type index scan
  per part combined with `UNION ALL` (0.6 ms under the same stale statistics), and bulk rollup writes refresh
  statistics through `refresh_place_rollup_statistics()` (definer; the runtime role does not own the table).
- **Analytics migration 000015:** `reset_synthetic_facts(tenant)` (definer; refuses any tenant other than the
  one bound in `app.tenant_id`; deletes only `SYNTHETIC` facts and the tenant's rollups) and
  `refresh_place_rollup_statistics()`; audit enums `DEMO_DATA_GENERATED`, `DEMO_DATA_RESET`, `DEMO_DATASET`.
  Proven under the runtime role: direct deletes denied, cross-tenant reset refused, live facts and other tenants
  untouched. Schema contract 15.
- **Analytics Demo Lab API:** `POST /v1/demo-lab/generate` (one transaction: reset, set-based deterministic
  generation from the pack's place levels and demo profile with every value bound, rollup rebuild, statistics,
  audit), `POST /v1/demo-lab/reset`, `GET /v1/demo-lab/dataset`; ≤ 1,000,000 facts per tenant.
- **Control plane:** `platform/demo-lab` (platform owners and admins): catalogues, list, create (platform tenant
  provisioning with the administrator as owner, `demo-lab` label, 90-day trial entitlements for Analytics and
  GigaOps, operations metrics + industry + country packs activated via `provisionDemoCatalogue`, which is refused
  for any tenant without the label) and `tenants/:id/delete` (label required; audit kept with the tenant
  reference cleared).
- **Web:** `/api/demo-lab/[generate|reset|dataset|delete]` only in `demo-lab` workspaces; generation reads the
  activated industry pack, caps days to the fact limit and calls Analytics through `callSignedModule`; delete
  (platform roles) purges synthetic data before deleting the tenant. `/analytics/places` Place drill-down
  (Medusa UI, ECharts per ADR-0004 via Medusa theme tokens): catalogue metrics, windows, breadcrumb, click-to-drill
  bars and table, Demo Lab panel. `/platform-admin/demo-lab` console. ECharts 6.1.0 (Apache-2.0) added.
- **Tests:** Demo Lab service (8), route (4), metric query shape; live `verify:demo-lab` through the web BFF.

### 064e deletion finding (2026-09-27)

The first Demo Lab certification (identity `494c46a2a3bf`) passed creation, generation, drill-down, isolation,
reset and regeneration, but tenant deletion returned 500: `audit_logs` is append-only by trigger and its tenant
foreign key is `ON DELETE SET NULL`, so deleting any audited tenant is blocked — correctly. Demo Lab "delete" is
therefore a **decommission**: synthetic Analytics data purged first, then the tenant closed (`CANCELLED`),
memberships removed, sessions revoked, entitlements disabled and the decommission audited; the tenant row and its
audit trail remain as evidence. Hard erasure of audited tenants (with audit-retention rules) is a platform data-
retention capability, registered to the tenant data-portability work (WI-OI-048), not bypassed here. The failed
run's certification tenant (`demo-qsr-us-1999b2`, synthetic data already purged) was decommissioned the same way.

## P3 certification (2026-09-27) — identity `5abfa667bb10-991866bbd6a3`

- **Repository:** build 106/106 tasks; tests 201/201 files; six audits (production-data, all-runtime-data,
  package-dependencies, api-boundary, navigation, sdlc) pass; source identity refreshed; control-plane, web,
  Workforce, Geospatial and module images built at the exact tag and deployed with all four overlays.
- **Live regression on an idle host (15 checks, all pass):** Analytics HTTP matrix; 1,000,000-fact drill-down
  (aggregate p50 3.917 ms / p95 5.742 ms / max 13.78 ms; ratio p50 4.033 ms / p95 5.584 ms / max 8.055 ms; 200
  samples; limit 20 ms; 331,693 rollup rows rebuilt in 7.7 s; estate/region/site totals reconcile to the raw
  facts); module clean replay and two-tenant RLS (Connector Hub v4, Analytics v15); 4 rounds of concurrent module
  migrations; Geospatial HTTP, runtime, journey and performance (p95 4.100 ms at 50,505 places); Workforce HTTP,
  runtime and journey; real-login spatial-scope session probe; Analytics web path; governed catalogues (Japan
  pack, independent approval, exact audit trail); Demo Lab end to end through the web BFF (run
  `1790475501315-c7e62e`). Routes `/api/health/ready`, `/maps`, `/gigaops`, `/settings`, `/analytics`,
  `/analytics/places`, `/platform-admin/demo-lab` answer 200/307.
- **Image policy:** 7 images, 0 Critical, 0 High (unfixed included), Trivy 0.74.0, CycloneDX SBOMs —
  `infra/compose/evidence/wi-oi-064-20260927T021928Z`.
- **Housekeeping:** superseded identities (`494c46a2a3bf`, `8197f27022df`, `6cecab041271`) removed; current and
  previous (`b520db0a4d89`) kept.

### M1 exit status

| Criterion | Status |
| --- | --- |
| p95 < 20 ms on 1,000,000 synthetic facts | Met (5.742 ms aggregate, 5.584 ms ratio) |
| Zero migrations between profiles | Met — industries and countries switch by activating catalogues |
| Demo reset and deletion proven | Met — reset, regeneration without duplicates, decommission with audit kept |
| Blind third industry configured by a non-engineer in 30 minutes | Open — Product Owner acceptance run |

### Registered limitations

- Hard erasure of audited tenants → WI-OI-048 (tenant data portability and retention).
- Spatially scoped members are refused place analytics until the place directory projection → WI-OI-072.
- Live (non-synthetic) facts from module outboxes → P9.
- Demo place hierarchy in Geospatial for demo tenants → WI-OI-073 (P10 Demo Lab switcher).

Status: technically complete → **Review** (bounded Local Development G4). Independent review and the Product
Owner M1 acceptance run remain open. Under continuous mode the Build slot passes to P4 (WI-OI-038).
