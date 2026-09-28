# WI-OI-063 Place (sites, zones and spatial scope) review request

Date: 2026-09-26  
Profiles: `configuration-local-development-v1`, `geospatial-runtime-local-development-v1`  
Decision requested: bounded Local Development G4 review only (roadmap phase P2)

## Implemented outcome

An operations lead can model every real site once, from a single shop to a multi-country estate, and limit
a member to the places they are responsible for:

- **Geospatial runtime (063a):** canonical `gigalibs_geospatial` schema with forced tenant RLS, append-only
  audit, outbox, signed `PlatformContextV1`, least-privilege runtime role and an exact hardened image.
- **Places hierarchy (063b):** tenant-defined place types; regions, sites and zones on an `ltree` path with
  ISO country and subdivision, IANA time zone, point and optional GeoJSON boundary; versioned updates;
  moves that re-path the whole sub-tree atomically with one `SpatialNodeChangedV1` per affected place.
- **Spatial scope (063b):** per-tenant opt-in (off by default). Members other than workspace administrators
  reach only their assigned places and everything inside them; an unassigned member reaches none. Scope is
  stored and signed as **place ids**, resolved to current paths per request, so it survives moves and a
  re-used path never grants access. Outside-scope places read as not found.
- **Bulk import (063c):** CSV import in Sites & Zones — row-numbered validation that writes nothing, then an
  all-or-nothing commit of up to 2,000 places, parents first, with the same audit and events as single creates.
- **One geofence owner:** the control-plane `GeofenceZone` table is retired (owner-approved; demo rows backed up).
- **Web:** Sites & Zones and Settings → Hierarchy → Spatial scope in Medusa UI; `/api/maps` stays an allow-listed
  signed proxy.

Not in this item: map drawing and boundary authoring UI, geofence checks (P7), country packs and the Japan pack
(moved to P3 by owner decision), other modules applying spatial scope (P4, P6).

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| Source revision | `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` |
| Source-state SHA-256 | `e9aef742c13a7d46bbf113a77e5f0d9846c013608cf288da191e5018c1b9d2fe` |
| Geospatial image | `gigalibs/geospatial-api:5abfa667bb10-e9aef742c13a` (`sha256:b08e1289eb8ebd2f9820650dec3c0fae54c0a6a2a0d369b9bb351bf2dd167f48`) |
| Web image | `gigalibs/workflow-platform:5abfa667bb10-e9aef742c13a` (`sha256:cd143e6a557eff6f5bd518db973b798b84d014edc7fc2ac4f94fb0049c35b5e5`) |
| Control-plane API image | `gigalibs/playground-api:5abfa667bb10-e9aef742c13a` (`sha256:2e6ad91d3cee1a21a8602278134d6f0e21642432b2627386ef03dfa3ab986ef2`) |
| Migrations image | `gigalibs/control-plane-migrations:5abfa667bb10-e9aef742c13a` (`sha256:eb6d06de57c268b45cbf67b3bce3392bf66996b2adeb50618a5861e757f217f2`) |
| Geospatial vulnerability report SHA-256 | `0ef5be3ed00835591dab406ddb6ae7ccf07869adf010444dac37bd6cb0bd41f2` |
| Geospatial CycloneDX SBOM SHA-256 | `cd1c8ec8094c3f44f54e6b7dedd2acdcf2926a14bb607b33ea02c87b97e296b7` |

Evidence: `infra/compose/evidence/wi-oi-063-20260926T115022Z/` (image policy, SBOMs, vulnerability reports)
and `.pi/work/WI-OI-063.md` (full certification record and acceptance trace).

## Measured result

- Repository build 106/106 tasks; tests 196/196 files; production-data, all-runtime-data, package-dependency,
  API-boundary, navigation and SDLC audits: PASS.
- Deploy: control-plane migrations `member_spatial_scope_places` and `retire_geofence_zones`, Workforce and
  Geospatial migration jobs in parallel: exit 0. Concurrent module migration regression (4 rounds): PASS.
- Geospatial signed-context matrix, closed routes, clean replay through migration 3, least privilege, forced
  RLS and append-only audit: PASS.
- Places journey against real PostgreSQL (run `20260926T114743Z`): hierarchy, jurisdiction validation,
  duplicate and cycle rejection, sub-tree move, restart persistence, versioned rename and conflict,
  active-descendant guard, two-tenant denial, spatial scope (including scope surviving an administrator's
  move), bulk import (validation writes nothing, refused commits and re-imports write nothing, 2,000 places in
  260 ms); 2,015 audit and 2,014 outbox records for tenant A, 0 for tenant B: PASS.
- Control-plane session scope with real logins (run `1790423412288-bce602`): Tenant Admin unbounded, member
  scoped, unassigned member fails closed, tenant without opt-in unbounded, audited assignment and opt-out reach
  the session, invalid ids 400, member self-change 403: PASS.
- Sub-tree query p95 3.168 ms at 50,505 places per tenant (P2 limit 8 ms): PASS.
- Workforce HTTP, runtime and journey regression: PASS.
- Trivy 0.74.0 (unfixed included) on migrations, api, web, workforce-api and geospatial-api: 0 Critical,
  0 High: PASS. Geospatial container: user 65532, read-only root, all capabilities dropped,
  `no-new-privileges`, no host port, zero restarts.
- Geospatial SBOM: 129 components, 9 without a license field (distribution disposition, as WI-OI-060).

## Review decisions required

Named reviewers record `Accept`, `Conditional` or `Reject` against the exact identities above:

1. Solution Architecture / Product: place ownership, GeofenceZone retirement, importer inside Geospatial
   under roadmap rule 11, Japan pack moved to P3.
2. Security & Privacy: fail-closed scope, not-found for out-of-scope places, image scan and SBOM disposition.
3. IAM/Tenancy: `spatial_scope` claim semantics, opt-in switch (`tenant:update`), assignment (`users:update`),
   Tenant Admin and platform roles unbounded.
4. Backend/Data: `ltree` model, atomic re-pathing, batched import, control-plane migrations.
5. API Contracts: `PlatformContextV1.spatial_scope`, `ImportSpatialNodesV1`, `SpatialNodeChangedV1`.
6. Web/Accessibility: Sites & Zones, import panel and Spatial scope settings in Medusa UI.
7. QA/SDET: acceptance trace in `.pi/work/WI-OI-063.md` (flat-mode UI confirmed manually at acceptance).

## Decision boundaries

This packet does not authorize production, cloud, public ingress, customer distribution or external-provider
use, and does not enable spatial scope in any module other than Geospatial. Each known limitation is
registered to its owning work item in `.pi/work/WI-OI-063.md`.
