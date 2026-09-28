# WI-OI-063 - Place: spatial hierarchy and jurisdiction scope

Status: In Progress  
Gate: Bounded Local G4 Build — 063a runtime foundation, then 063b hierarchy and scope (handoff 2026-09-26 after WI-OI-061 entered Review)  
Owner: SDLC Orchestrator / Geospatial Domain  
Programme: `WI-OI-062`, phase P2 of `docs/plans/gigaops-convergence-roadmap.md`  
Requirements: FR-05, FR-14, FR-15; NFR-SEC-001–005, NFR-DATA-001–004, NFR-PERF-001–003, NFR-UX-001–004,
NFR-OBS-001–004  
Decision record: `docs/architecture/ADR-0006-spatial-hierarchy-and-scope.md` (Proposed)

## Business outcome

An operations lead models every real site once, from a single shop to a multi-country estate, and limits a
regional manager to their region. Every later phase (CMMS assets, bookings, punches, facts) references these
sites by logical `site_ref` from day one, so no location backfill is ever needed.

## G0 inventory — 2026-09-26

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Geospatial is not deployed locally | Schema `gigalibs_spatial` absent from the local database; no service in `infra/compose/*.yaml` | The `/maps` page calls `/api/maps/v1/spatial/*` with no runtime behind it |
| Catalogue claims availability | `geospatial-studio` readiness `AVAILABLE` in `packages/contracts/src/modules/index.ts` | Truthful-state violation; must be contained until certified |
| Prototype-grade migration | `db/migrations/000001_geospatial_assets_and_fences.up.sql`: RLS enabled but not forced; no audit, outbox or migration ledger; no version column; `IF NOT EXISTS` DDL | Does not meet the WI-OI-060 runtime-foundation standard |
| Tenant session key differs | Geospatial policies read `app.current_tenant_id`; Workforce uses `app.tenant_id` | One platform tenant key is required (Delta 5 D4) |
| Lexicon violations | Categories `FLEET`, `WAREHOUSE`, `CUSTOMER_SITE`; event `DISPATCH_TRIGGERED` | ADR-0003 Decision 8 |
| Cross-module endpoint | Web calls `/v1/spatial/dispatch-cmms` | Must become an event or be removed (no cross-module writes) |
| Duplicate geofence model | Control-plane `GeofenceZone` (`packages/db/schema.prisma`) and `gigalibs_spatial.geofences` | One owner required |
| Extensions | `ltree` and `btree_gist` available in `postgres:16-alpine`; PostGIS absent | Hierarchy uses `ltree`; boundaries stay GeoJSON until ADR-0006 revisits |
| No Japan country pack | `modules/gigaops/config/country-packs/` has US, GB, AU, IN, EU | Needed for jurisdiction coverage |

## Proposed Build slices (one at a time)

1. **WI-OI-063a Geospatial runtime foundation** — mirror WI-OI-060 for Geospatial: a new canonical
   `db/runtime-foundation` chain (the existing `db/migrations/000001` becomes excluded prototype inventory),
   forced RLS on the platform tenant key, migration ledger, audit and outbox, non-superuser runtime role,
   signed `PlatformContextV1` verification, liveness/readiness, exact image and compose profile, neutral
   lexicon; catalogue marked contained until certified.
2. **WI-OI-063b Spatial hierarchy and scope** — `spatial_nodes` with `ltree` path, configured node types,
   jurisdiction and time zone; `SpatialNodeChangedV1`; optional `spatial_scope` claim; fail-closed scope
   helper; Sites & Zones explorer with flat mode; import through Universal Data Studio; `GeofenceZone`
   convergence; Japan pack.

## Additional G0 finding — tenant authority

`modules/geospatial/apps/api/src/auth/authorization.ts` falls back to a caller-supplied `x-tenant-id` (and
`x-user-id`) header when no bearer token is present. That is a tenant-isolation defect; the prototype runtime
must never be deployed as is.

## G2–G3 design summary

**Ownership simplification.** Geospatial owns *places* (hierarchy, boundaries, jurisdiction, time zone).
Tracked physical assets belong to CMMS; the prototype `spatial_assets` table (`FLEET`, `WAREHOUSE`,
`CUSTOMER_SITE`) is not carried forward, avoiding a second asset master. Distance, bearing and containment
remain stateless `@gigalibs/maps-core` calculations.

**063a — runtime foundation (no business API; BFF stays contained)**

- Canonical schema `gigalibs_geospatial` (the prototype `gigalibs_spatial` is excluded so a stray prototype
  install can never collide). `modules/geospatial/db/runtime-foundation/000001` schema and ledger; `000002` revocation, append-only
  audit, outbox, inbox, forced RLS on `app.tenant_id` (mirrors Workforce 000001–000002).
- API rebuilt on the Workforce runtime pattern: strict runtime configuration with a pinned
  `GEOSPATIAL_SCHEMA_CONTRACT_VERSION` guarded by a test against the last migration file; signed
  `PlatformContextV1` guard (audience `gigalibs-geospatial-api`, module key `geospatial-studio`); no header
  fallback; tenant-bound transactions; `/v1/health/live`, `/v1/health/ready`,
  `/v1/runtime/tenant-scope`. Prototype controllers are not registered.
- Delivery: Dockerfile target `geospatial-api`, `build-geospatial-image.sh`, `compose.geospatial.local.yaml`,
  `generate-geospatial-runtime-credentials.sh`, identity refresh for `GEOSPATIAL_IMAGE`,
  `verify-geospatial-runtime.sh` (clean replay, least privilege, RLS, append-only) and
  `verify-geospatial-http.sh` (signed context, audience, entitlement, permission, tenant binding),
  deployment profile `geospatial-runtime-local-development-v1`.

**063b — hierarchy and scope (business API; BFF opens)**

- `000003` (in `gigalibs_geospatial`) `spatial_node_types` (tenant-defined codes and labels, seeded from an industry pack by an explicit
  admin action) and `spatial_nodes` (`ltree` path unique per tenant, parent, type, ISO country and
  subdivision, IANA time zone, optional point and GeoJSON boundary, optimistic version, status).
- APIs: node types list/create; nodes list (flat or subtree), get, create, update with expected version,
  move (re-paths descendants in one transaction with audit and one `SpatialNodeChangedV1` per node).
- Scope: per-tenant opt-in setting and member scope assignments in the control plane; optional
  `spatial_scope` claim minted by the web BFF; shared validated `ltree[]` helper; out-of-scope reads 404.
- Web: signed allow-listed `/api/maps` proxy; Sites & Zones explorer with flat mode for single-location
  tenants; catalogue returns to `REVIEW`.
- Japan country pack; `GeofenceZone` convergence; 50,000-node performance evidence.
- Bulk import through Universal Data Studio follows as increment 063c after the API is certified.

## Acceptance cases (G1 draft)

- A tenant admin creates a region → site → zone hierarchy; paths are unique per tenant and moves re-path
  descendants atomically with audit and one outbox event per affected node.
- A single-location tenant sees a flat site list with no hierarchy controls.
- A user scoped to `APAC` reads APAC nodes and descendants only; sibling regions return 404, not 403.
- A token without `spatial_scope` behaves as `UNBOUNDED` only where the tenant has not enabled scoping;
  once enabled, a missing claim fails closed.
- Malformed scope paths (injection attempts, empty labels, over-depth) are rejected before SQL.
- Tenant B cannot list, read, move or infer tenant A nodes; an unscoped runtime query returns no rows.
- Sub-tree query p95 under 8 ms at 50,000 nodes on the local profile (representative volume in an isolated
  certification tenant).

## Value measure

Time for a tenant admin to import and verify its real site list; number of later modules consuming
`site_ref` without their own location tables.

## Owner decisions — 2026-09-26

1. **Contain now:** the owner directed "Mark Geospatial Studio unavailable". Delivered inside WI-OI-061
   (which placed Geospatial in the Workforce & Operations group and owns that group's accurate states):
   catalogue readiness `CONTAINED`; `/maps` renders the contained capability status; `/api/maps/*` returns
   `503 GEOSPATIAL_CONTAINED` after session verification and never contacts an upstream. The former page,
   proxy and test are preserved in `scratch/wi-oi-063-originals/`. The former proxy forwarded browser
   `Authorization` plus caller `x-tenant-id`/`x-user-id` headers and defaulted to `127.0.0.1:3018`; it must
   not be restored as is.
2. **Certify:** the owner directed "make it certified", approving the 063a runtime foundation followed by
   063b hierarchy (P2 becomes M + M). Build starts when WI-OI-061 enters Review and the owner hands over the
   single Build slot.
3. **Scope enablement:** not yet answered; the design proceeds on the recommended per-tenant opt-in and
   will be confirmed at G2.

## 063a evidence — Geospatial runtime foundation (2026-09-26)

Identity `5abfa667bb10-b2777cad873b` for all images.

| Check | Result |
| --- | --- |
| Source | canonical `modules/geospatial/db/runtime-foundation/000001–000002`; API rebuilt on the Workforce runtime pattern (strict config, pinned `GEOSPATIAL_SCHEMA_CONTRACT_VERSION = 2`, signed `PlatformContextV1` guard with no header fallback, tenant-bound transactions, revocation, health, tenant scope); prototype sources removed from the module and preserved in `scratch/wi-oi-063-originals/` |
| Delivery | Dockerfile target `geospatial-api` (distroless, 65532), Docker workspace entry, `compose.geospatial.local.yaml`, `.env.geospatial` (0600, git-ignored), identity refresh, deployment profile `geospatial-runtime-local-development-v1`, runtime-data audit root |
| Unit tests | 20 new (configuration contract and pin, header-authority rejection, audience, entitlement, permission, revocation fail-closed, immutable principal) |
| `pnpm build` / `pnpm test` | 106/106 tasks; 192/192 files |
| Six audits | all passed |
| Deployment | `geospatial-migrations` applied 000001–000002; `geospatial-api` healthy; base services and Workforce redeployed on the same identity |
| `verify-geospatial-http.sh` | passed: missing token, wrong audience, wrong module, missing scope denied; tenant binding; unknown business route 404 |
| `verify-geospatial-runtime.sh` | passed: empty-database replay, least privilege, forced RLS, append-only audit, ledger protected |
| Workforce regression | HTTP, runtime and journey certifications pass on the new identity |
| Image policy (Trivy 0.74.0, unfixed included) | migrations, api, web, workforce-api, geospatial-api: 0 Critical, 0 High (`infra/compose/evidence/wi-oi-063a-20260926T072922Z/`) |
| Also fixed | root cause of the intermittent `configuration-surface-bff` test (token built twice across a second boundary) |

The web BFF remains contained; business APIs arrive in 063b.

## Owner decisions — 063b (2026-09-26)

- **Grant `maps:*` to `TENANT_ADMIN`** (approved): Tenant Admins read and manage place types and places in
  their own workspace; Manager, Member and Viewer receive no Geospatial authority.
- **Enable Geospatial Studio for `gigalibs-global`** (approved): add the `geospatial-studio` tenant feature
  and an audited `ENABLED` platform-override entitlement; no other workspace changes.
- Spatial scope (per-tenant opt-in `spatial_scope`) is delivered as the next increment of this work item after
  the hierarchy is certified.

## 063b increment 2 — spatial scope design (G3)

Reuses the existing organization-settings and member-update flows instead of adding endpoints:

- **Tenant opt-in:** `UpdateTenantOrganizationSettingsSchema` gains optional `spatialScopingEnabled`
  (`hierarchyEnabled` becomes optional; at least one is required). The service toggles tenant feature
  `spatial-scoping` with a `SETTINGS_CHANGE` audit record; the organization settings screen gets the toggle.
- **Assignment:** `UpdateTenantMemberSchema` gains optional `spatialScopePaths` (≤ 50 validated `ltree`
  paths). Stored in a new `tenant_members."spatialScopePaths" TEXT[]` column (forward Prisma migration,
  default empty); the existing `PERMISSION_CHANGE` audit records before and after.
- **Session:** `getSessionContext` returns `spatialScope`: `UNBOUNDED` when the tenant has not opted in, for
  `SUPER_ADMIN`/`TENANT_ADMIN` and for platform roles; otherwise `SCOPED_PATHS` with the member's paths (an
  empty list fails closed).
- **Token:** `PlatformContextV1.spatial_scope` is optional; tokens without it mean `UNBOUNDED`, so existing
  modules and tokens keep working.
- **Enforcement (Geospatial):** scoped principals list only `path <@ ANY($n::ltree[])`; reads, updates and
  moves outside scope return 404; creating a top-level place, moving a place to the top level or outside
  scope, and managing node types return `403 SPATIAL_SCOPE_DENIED`. Paths are validated before SQL.

Regression for the 2026-09-26 deploy incident: concurrent Workforce and Geospatial migration jobs collided on
shared catalog rows (`GRANT CONNECT ON DATABASE`, `CREATE EXTENSION`), leaving web down for about five
minutes until the jobs were run in sequence. `run-module-migrations.mjs` now takes a global advisory lock
before the per-schema lock; `verify-module-migrations-concurrent.sh` reproduced the failure on the unfixed
images and must pass on the fixed ones.

## 063b — Medusa UI alignment (2026-09-26)

User review found the Sites & Zones and Workforce screens rendering blue primary buttons: both were styled
with hard-coded Tailwind palette classes instead of the app's Medusa design system. Both
`components/geospatial/SitesAndZonesExplorer.tsx` and `components/gigaops/GigaOpsWorkforceWorkbench.tsx` now
use `@medusajs/ui` (`Container`, `Heading`, `Text`, `Button`, `Input`, `Textarea`, `Checkbox`, `Label`,
`Badge`, `StatusBadge`, `Alert`, `Table`) and `@medusajs/icons`, with `ui-*` tokens only. Native `<select>`
elements are kept for FormData and empty-value options and styled to match the Medusa field. Data calls,
element ids and behaviour are unchanged; no hard-coded palette class or `lucide-react` import remains in
either file.

Local disk incident (same day): repeated certification cycles left ~160 GB of Docker build cache and
superseded images, filling the disk. Each local cycle now ends by removing unused
`label=com.gigalibs.component` images and capping the build cache at 20 GB after deploy.

### Local certification — identity `5abfa667bb10-0996e3eb2387` (2026-09-26)

Source: move fix, global migration lock, Medusa UI alignment. `pnpm build`, `pnpm test` and all six audits
passed on this exact source state; all images built (pinned base images re-pulled by digest after the disk
clean-up removed them). Deployed with the Workforce and Geospatial overlays: the three migration jobs ran in
parallel and exited 0; web, api, workforce-api and geospatial-api healthy.

- `verify-module-migrations-concurrent.sh` (4 rounds): passed (failed in round 1 on the previous images).
- Geospatial HTTP, runtime (clean replay 1–3, least privilege, RLS, append-only): passed.
- Geospatial sub-tree performance: p95 3.858 ms at 50,505 places per tenant (limit 8 ms).
- Workforce HTTP, runtime and journey: passed (run 20260926T100526Z).
- Geospatial places journey: first failed with a JSON parse error from a test-script defect —
  `-e "IDS=${IDS:-{}}"` appends a stray `}` to a set value, so the verify phase had never run. Fixed in
  `verify-geospatial-journey.sh`; the full journey then passed against this deployment (run 20260926T100631Z:
  restart persistence, versioned rename and conflict, two-tenant denial, 7 audit and 7 outbox records). The
  script fix moves the source past this identity, so the formal re-run is part of the next (spatial scope)
  certification cycle.

## 063b increment 2 — spatial scope implementation (supersedes the path-based design above)

Design change: scope is stored and signed as **place ids**, not `ltree` paths. Paths change whenever a place
is moved, so a path-based scope would silently drop a moved site from its members and, worse, grant a
later place that re-uses the old path. Geospatial resolves the ids to current paths inside each request's
tenant transaction (one indexed lookup), so assignments follow the place.

- Contracts: `SpatialScopePlaceIdsSchema` (≤ 50 distinct UUIDs); `UpdateTenantMemberSchema.spatialScopePlaceIds`;
  `UpdateTenantOrganizationSettingsSchema` takes `hierarchyEnabled` and/or `spatialScopingEnabled`;
  `PlatformContextV1.spatial_scope` optional `UNBOUNDED | SCOPED_PLACES{place_ids}` (absent = `UNBOUNDED`).
- Control plane: `tenant_members."spatialScopePlaceIds" TEXT[]` (migration
  `20260926010000_member_spatial_scope_places`); tenant feature `spatial-scoping` with before/after
  `SETTINGS_CHANGE` audit; member updates carry the ids through the versioned update and `PERMISSION_CHANGE`
  audit. `getSessionContext` returns `spatialScope` (`resolveSpatialScope`): unbounded until opt-in and for
  Super/Tenant Admins and platform roles; otherwise the member's places, empty failing closed.
- Web: `VerifiedSession.spatialScope` is required and validated; `mintPlatformContextToken` signs it.
  Settings → Hierarchy shows the Medusa `TenantSpatialScopeManager` (opt-in switch gated by `tenant:update`,
  place assignment with audit reason gated by `users:update`) when Geospatial Studio is entitled.
- Geospatial: lists, counts and type node counts are limited to the scope roots; any by-id read, update,
  move or parent outside scope is 404 (indistinguishable from missing); ancestors outside scope are omitted;
  top-level create, move to the top level and place-type creation return `403 SPATIAL_SCOPE_DENIED`.
- Tests: contract rules, session resolution (6 cases), web validator and token round trip, Geospatial
  guard and service enforcement; `verify-geospatial-journey.sh` gains a scoped phase against real Postgres,
  including an administrator moving the assigned site while the member keeps it.

### Local certification — spatial scope, identity `5abfa667bb10-39ab26edbd0c` (2026-09-26)

`pnpm build` 106/106, `pnpm test` 195/195 files (one existing settings-audit test updated for the richer
before/after audit record), six audits, exact images. Deployed with both overlays; control-plane migration
`20260926010000_member_spatial_scope_places` applied; all three migration jobs ran in parallel and exited 0.

- Concurrent module migrations (4 rounds), Geospatial HTTP and runtime, Workforce HTTP, runtime and journey:
  passed. Sub-tree p95 4.276 ms at 50,505 places per tenant.
- Places journey (run 20260926T102949Z), now including the scoped phase: assigned-site reach, ancestors
  outside scope hidden, 404 for the parent region, sibling site, out-of-scope update and parent,
  `SPATIAL_SCOPE_DENIED` for top-level create, move to top level and place-type create, empty scope reaches
  nothing, and the member keeps the site after an administrator moves it to the top level; 9 audit and 10
  outbox records, tenant B 0.
- Control-plane session probe with real logins (run 1790418877110-e04346): Tenant Admin unbounded, member
  scoped, unassigned member `SCOPED_PLACES []`, tenant without opt-in unbounded; audited assignment reaches
  the session; non-UUID ids 400; member self-assignment and opt-out 403; audited opt-out reaches the session.
  (Added to the repository as `verify-spatial-scope-session.mjs` in the next increment.)

Acceptance note: the contract keeps `spatial_scope` optional so older tokens still verify, and Geospatial
reads an absent claim as `UNBOUNDED`. The web BFF now always signs the claim, and the web rejects a session
without `spatialScope`, so an opted-in tenant can never be served a claim-less token by this release; a
pre-release token (≤ 300 s lifetime) could only exist before the opt-in switch existed.

## 063b — GeofenceZone convergence (2026-09-26)

Owner-approved (see WI-OI-062): control-plane `GeofenceZone` is retired so Geospatial places with boundaries
are the single geofence owner. Forward migration `20260926020000_retire_geofence_zones` drops
`geofence_zones` (index and tenant foreign key with it); the Prisma model, the `Tenant.geofenceZones`
relation and the tenant-export privacy inventory entry are removed. No live code read the table. The two
local demo rows were exported first to `infra/compose/backups/geofence_zones_retired_20260926.csv` (git-ignored,
SHA-256 alongside). The archived `apps/playground-web` (outside the workspace) still references the removed
`/geofence` route and is left as archive inventory. The Japan pack and country-pack jurisdiction codes moved
to P3 by owner decision.

## 063c — bulk place import (2026-09-26)

Universal Data Studio (WI-OI-023) is an undeployed data-contract engine with no file-import job capability,
and the WI-OI-044/045 import packages are quarantined outside the workspace. Under roadmap rule 11 ("prove
one journey before generalizing") the importer is proven inside Geospatial; it becomes a shared durable-job
importer when P5 roster import is the second adopter (registered for WI-OI-065).

- Contract: `ImportSpatialNodesV1` (`VALIDATE | COMMIT`, ≤ 2,000 rows so one import stays under the 1 MiB
  BFF limit), `SpatialNodeImportRowV1` (same attribute rules as a single create; type by code; parent by path,
  existing or earlier in the file; no boundaries), `SpatialNodeImportResultV1` (row-numbered errors).
- API `POST /v1/nodes/import` (`maps.nodes.manage`; scoped principals `403 SPATIAL_SCOPE_DENIED`): per-row
  validation (schema, duplicate path in file, existing path, unknown or inactive type, missing or inactive
  parent); VALIDATE writes nothing; COMMIT is all-or-nothing (`422 SPATIAL_IMPORT_INVALID` with the report),
  inserts parents first one depth level per query, and writes a per-place `SPATIAL_NODE_CREATED` audit and
  `SpatialNodeChangedV1` event plus one `SPATIAL_NODES_IMPORTED` summary audit. JSON body limit raised to 1 MiB.
- Web: `/api/maps` allows only `POST v1/nodes/import`; Sites & Zones → Import (Medusa) with template download,
  browser CSV parsing (`lib/place-import.ts`, RFC 4180), validation report by spreadsheet line, then commit.
- Tests: 4 service, 5 CSV, 1 proxy; the places journey gains an import phase (validation writes nothing,
  refused commit and re-import leave no partial writes, multi-level file, scoped and cross-tenant denial,
  2,000 places under 15 s).

## P2 close-out — final local certification, identity `5abfa667bb10-e9aef742c13a` (2026-09-26)

Source revision `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6`, source-state SHA-256
`e9aef742c13a7d46bbf113a77e5f0d9846c013608cf288da191e5018c1b9d2fe` (spatial scope, GeofenceZone retirement,
bulk import, session-scope certification script).

| Check | Result |
| --- | --- |
| `pnpm build` / `pnpm test` / six audits | 106/106 tasks; 196/196 test files; all pass |
| Deploy (both overlays) | 3 migration jobs in parallel exit 0; `retire_geofence_zones` applied; web, api, workforce-api, geospatial-api healthy |
| Concurrent module migrations | 4/4 rounds pass |
| Geospatial HTTP / runtime | signed context, audience, entitlement, permission, tenant binding, closed routes; clean replay 1–3, least privilege, RLS, append-only: pass |
| Places journey (run 20260926T114743Z) | hierarchy, moves, jurisdiction, restart, versioning, two-tenant denial, spatial scope, bulk import (2,000 places in 260 ms); 2,015 audit and 2,014 outbox records, tenant B 0 |
| Sub-tree performance | p95 3.168 ms at 50,505 places per tenant (limit 8 ms) |
| Control-plane session scope (run 1790423412288-bce602) | pass (real logins) |
| Workforce HTTP / runtime / journey | pass (no regression) |
| Image policy (Trivy 0.74.0, unfixed included) | migrations, api, web, workforce-api, geospatial-api: 0 Critical, 0 High (`infra/compose/evidence/wi-oi-063-20260926T115022Z/`) |
| Geospatial runtime hardening | user 65532:65532, read-only root, all capabilities dropped, `no-new-privileges`, no host port, 0 restarts |

### P2 exit criteria

- Sub-tree query p95 < 8 ms on 50,000 nodes: **met** (3.168 ms at 50,505).
- Zero cross-scope and cross-tenant reads: **met** (journey tenant-B and scoped phases; session probe).
- Exact image: **met** (images match source state; scan passes).

### Acceptance cases (G1 draft) trace

1. Region → site → zone, unique paths, atomic re-path with per-node audit and outbox: journey create/verify/scoped.
2. Single-location tenant sees a flat list: explorer flat mode (`tenantNodeCount ≤ 1` or all depth 1); no automated
   UI test — to be confirmed in Product Owner acceptance.
3. Scoped member reads assigned sub-tree only; siblings 404: journey scoped phase (scope by place id).
4. Missing claim semantics: see the acceptance note in the spatial-scope certification above.
5. Malformed scope rejected before SQL: non-UUID place ids fail the signed-context schema and member update (400).
6. Tenant B cannot list, read, move or infer: journey verify/import phases.
7. p95 < 8 ms at 50,000: performance script.

### Known limitations, each registered to its owning work item

- Country packs with jurisdiction codes and the Japan pack → WI-OI-064 (P3), owner decision 2026-09-26.
- Shared durable-job importer (generalize 063c when roster import adopts it) → WI-OI-065 (P5).
- Other modules applying spatial scope must resolve place ids to paths from `SpatialNodeChangedV1` (no reads
  of Geospatial tables) → WI-OI-038 (P4, CMMS) and WI-OI-067 (P6, booking).
- Boundary authoring UI (API accepts GeoJSON boundaries; the explorer and import do not) → WI-OI-069 (P7,
  geofence checks), its first consumer.
- Nine Geospatial SBOM components without license fields → distribution disposition, as for WI-OI-060.
- Archived `apps/playground-web` still references the removed `/geofence` route → archive inventory only.
