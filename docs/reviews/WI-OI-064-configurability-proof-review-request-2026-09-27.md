# WI-OI-064 Configurability proof review request (roadmap P3, milestone M1 build)

Date: 2026-09-27  
Profiles: `configuration-local-development-v1` with the Workforce, Geospatial and modules overlays  
Decision requested: bounded Local Development G4 review; Product Owner M1 acceptance run (below)

## Implemented outcome

The same product can be configured for different industries and countries without code or schema changes, and
an estate can be explored from the whole organisation down to a single site in milliseconds:

- **Analytics runtime convergence (064a):** Analytics trusts only the BFF-signed `PlatformContextV1` like
  Workforce and Geospatial. The self-issued development token endpoint (any tenant, `analytics:*`, no credential)
  is removed; user scopes, session revocation and forced RLS apply; measure keys are bound parameters.
- **Operational fact store and place rollups (064b):** facts keyed by place id with the path at event time;
  hierarchical rollups make each drill-down read one level's children. Two planner findings fixed: rollup paths are
  text because `ltree` equality is not leakproof under RLS, and ratio metrics use per-part index scans because
  `= ANY` left the index under stale statistics.
- **Governed catalogues in Configuration Studio (064c, owner decision):** metric catalogue, nine industry packs and
  six country packs — including the new **Japan** pack with 47 prefectures — as typed definitions under the change
  set → independent approval → publish → activation lifecycle, installable from platform-shipped sources.
- **Metric drill-down (064d):** catalogue metrics resolved to typed aggregate/ratio specs and executed over rollups
  (ratio of totals, null on zero denominators); nothing free-form reaches SQL.
- **Demo Lab (064e, FR-13):** platform administrators create isolated, labelled demo workspaces per industry and
  country; synthetic data is generated from the industry pack in one transaction, reset through a tenant-bound
  definer function, and workspaces are decommissioned (audit trail kept — audited tenants cannot be hard deleted).
- **Drill-down experience (064f):** `/analytics/places` (Medusa UI, ECharts per ADR-0004) and
  `/platform-admin/demo-lab`.

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| Source revision | `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` |
| Source-state identity | `991866bbd6a3` (full SHA-256 in `infra/compose/.env`) |
| Images | control-plane-migrations, playground-api, workflow-platform, workforce-api, geospatial-api, analytics-api, connector-hub-api at tag `5abfa667bb10-991866bbd6a3` |
| Image policy evidence | `infra/compose/evidence/wi-oi-064-20260927T021928Z` — 7 images, 0 Critical, 0 High (unfixed included) |

## Measured result

- Build 106/106; tests 201/201 files; six repository audits pass.
- 1,000,000 synthetic facts: aggregate drill-down p50 3.917 ms, **p95 5.742 ms**, max 13.78 ms; ratio metric
  (cost per labour hour) p50 4.033 ms, **p95 5.584 ms**, max 8.055 ms (200 samples each, limit 20 ms). Estate,
  region and site totals reconcile to the raw facts.
- Full live regression on an idle host: 15 checks pass (Analytics, Geospatial, Workforce, session scope,
  catalogues, Demo Lab through the web BFF), plus the seven affected page routes.
- Demo Lab: labelled workspace with three activated catalogues, 24,000 facts for QSR over 30 days, estate and
  store drill-down (cost per labour hour equals the pack rate 16), non-demo workspace refused, reset to 0,
  regeneration without duplicates, decommission (closed, members removed, sessions revoked, entitlements disabled,
  facts purged, audit kept).

## M1 exit criteria

| Criterion | Status |
| --- | --- |
| p95 < 20 ms on 1,000,000 synthetic facts | Met — 5.742 ms aggregate, 5.584 ms ratio |
| Zero migrations between profiles | Met — QSR, Japan industrial and any bundled pack are activated as configuration; no schema change |
| Demo reset and deletion proven | Met — reset and decommission certified through the web BFF |
| Blind third industry configured by a non-engineer in 30 minutes | **Human acceptance run required** (below) |

## Product Owner acceptance run (M1)

1. Platform administration → Demo Lab: create QSR (United States) and Japanese metro industrial (Japan).
2. In each, Analytics → Place drill-down → Generate synthetic data; drill estate → region → site; switch metrics.
3. Have a non-engineer pick a third industry blind and configure it in under 30 minutes; record the time.
4. Reset and retire one workspace; confirm it disappears from the Demo Lab list.

## Review decisions required

1. Solution Architecture / Product: catalogues in Configuration Studio, Demo Lab decommission semantics, P3 scope.
2. Security & Privacy: Analytics signed-context convergence, definer functions (`reset_synthetic_facts`,
   `refresh_place_rollup_statistics`), Demo Lab approval bypass limited to `demo-lab` tenants, ECharts dependency.
3. IAM/Tenancy: `platform/demo-lab` roles, `demo-lab` label gates, canonical tenant ids in Analytics.
4. Backend/Data: fact store, rollups and their planner behaviour, migrations 000012–000015.
5. API Contracts: analytics and catalogue contracts (`MetricSpecV1`, `GovernedCatalogueDefinition`, Demo Lab).
6. Web/Accessibility: Place drill-down and Demo Lab screens.
7. QA/SDET: requirement trace in `.pi/work/WI-OI-064.md`.

## Decision boundaries

No production, cloud, customer distribution or external-provider use. Live (non-synthetic) facts arrive in P9;
spatially scoped members are refused place analytics until the place directory projection (WI-OI-072). Hard
erasure of audited tenants is registered to WI-OI-048; a demo place hierarchy for Demo Lab tenants to WI-OI-073.
