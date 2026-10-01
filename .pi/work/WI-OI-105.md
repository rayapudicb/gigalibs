# WI-OI-105: places with boundaries (ADR-0016 F15)

- **Status:** Review. Built, verified and deployed in one batch (owner, 2026-09-30: "batch"); live proofs pass.
- **Owner:** Geospatial Domain / Solution Architecture.
- **Decision records:** ADR-0016 F15, ADR-0007 (outbox relay), and the owner's decisions D1–D4 in the task card.
- **Task card:** `.pi/tasks/WI-OI-105.md`. Proof scripts: `.pi/handoff/proof-scripts/geo-it.sh`, `hub-it.sh`, `e2e-105.sh`, `deploy-105.sh`.
- **Independent reviewers:** Security & Privacy, Backend/Data, QA/SDET.

## G0: why

Agriculture plan phase 3 exit: "a map of fields coloured by a measure, filtered to one farm, shows only what the
user may see." Before this item, Geospatial kept boundaries without area, its place facts had no consumer, Analytics
ignored the member's place scope (and refused scoped members in place analytics), and datasets had no place.

## G1: scope

- **In scope:** 105a–105e in the task card.
- **Out of scope:** PostGIS (only with its own ADR and restore drill); place-aware summaries (D3); changing CMMS or
  Workforce scope rules (see "Divergence" below).

## G2: acceptance

1. Area is computed in code and stored when a boundary is saved.
2. Analytics keeps a place directory from Geospatial's place facts (ADR-0007 relay), newest version wins.
3. Records are tagged with the smallest place holding them, with a visible "Unplaced" bucket.
4. Every Analytics answer honours the member's place scope; unplaced records and datasets without places are not
   shown to scoped members (fail closed).
5. A Connector Hub connection can create places in Geospatial; a map chart colours places by a measure on one farm;
   a scoped member sees only their farm.

## G3: slices

| Slice | What | Status |
|---|---|---|
| 105a | Area on save (Geospatial) | Done, live |
| 105b | Place directory in Analytics (relay) | Done, live |
| 105c | Records tagged with their place | Done, live |
| 105d | Place scope in every Analytics query | Done, live |
| 105e | Places from Connector Hub, the place map | Done, live |

## What changed

### 105a: area on save (Geospatial)

- `boundaryAreaM2` in `@gigalibs/contracts` (spherical excess, authalic radius 6,371,007.2 m; outer rings minus
  holes; cm²). A 1 ha field is within 0.5% of its ellipsoidal area.
- Migration 000004 adds `spatial_nodes.area_m2`; create and update store it; reads fall back to computing it.
- The place fact (`SpatialNodeChangedV1`) now carries name, point, boundary and area.

### 105b: place directory in Analytics (D1)

- Geospatial migration 000005: relay lease/settle definer functions (lowest pending version per place first), the
  outbox sweep, and a backfill: each place's latest fact brought up to its current state, older queued versions
  closed as `SUPERSEDED_BY_BACKFILL` (12,114 waiting place facts across 29 tenants; no place data changes).
- Geospatial's `AnalyticsPlaceRelay` (module SDK `OutboxRelay`) signs with its own key pair (`ANALYTICS_GEOSPATIAL`).
- Analytics migration 000025 `place_directory` (RLS; path and bounds indexes). The inbox accepts each producer's own
  event only, applies newer versions only, keeps held values for old-style facts, and moves descendants with a moved
  place (prefix match with `starts_with`, so `_` in codes is literal).
- Admin command `POST v1/nodes/republish` (members without a place scope; audited), now also reachable through the
  web proxy.

### 105c: records tagged with their place

- A mapping may name one place field: from a point (`place.longitudeField`) or a code or id (`place.byCode`).
  `place_id` and `place_path` are reserved. The place field reads its source without claiming it, so the same source
  field (say `lat`) can also be a plain field (found by the live proof).
- At build, `PlaceTagger` picks the smallest active place containing the point (bounding box first, then
  point-in-polygon) or the place with that id or unique last path segment. Unmatched: "Unplaced", with null ids.
- The unplaced count is stored on the dataset version (`unplaced_count`, migration 000025) and shown on the Sources
  screen.

### 105d: place scope in every Analytics query (D2, D3)

- `resolvePlaceScope`: the assigned places and everything inside them, by the directory's current paths; records
  are matched by the place id stamped at build, so a moved place moves its records.
- Applied to: questions (`runSpec`, also used by chart views, dashboards and reports), legacy chart runs, dashboard
  filter values, and place drill-downs (only at or under an assigned place). Scoped questions are answered from rows,
  never summaries. A dataset without places is refused to scoped members (`SPATIAL_SCOPE_DENIED`). The answer cache
  keys on the visible places.
- Report downloads: a scoped member downloads only files of runs they started (another member's file may hold
  records outside their places).
- Rebuilding place rollups stays with members without a place scope (tenant-wide).

### 105e: places from Connector Hub, and the place map

- Connector Hub migration 000008: `tenant_connections.place_delivery` and relay functions for
  `CONNECTOR_PLACE_PULLED_V1`. A connection names the record fields for the place's type (fixed, or a type field),
  name, shape (GeoJSON or WKT), code and parent. `GeospatialPlaceRelay` signs with its own key pair
  (`GEOSPATIAL_HUB`).
- Geospatial migration 000006 `place_source_links` and the inbox (`internal/v1/inbox`): receipt, link and place
  change commit together; place commands run through the same service people use (area, audit and facts follow);
  a newer version updates or moves the linked place; older ones are ignored; a record that cannot become a place is
  kept with its reason; a parent not yet arrived is answered 503 so the relay retries.
- Analytics: `placeUnder` on questions (a farm and what is inside it, within the scope); `GET v1/places/directory`
  (the places a member may see, optionally under one place and with boundaries).
- Web: Hub "Send pulled records to Geospatial as places"; Sources "Place of each record" (point or code) and the
  unplaced count; Explore "Place" filter; chart type "Map (places)" (ECharts map from directory boundaries, coloured
  from the green tag tokens, rows not drawable counted).

## Divergence for the owner (not changed)

CMMS and Workforce match a member's assigned place ids exactly; the platform contract (and now Analytics) grants each
assigned place and everything inside it. CMMS and Workforce are therefore stricter (a member assigned a farm does not
see work on its fields there). Changing that is a module scope rule change, so it waits for the owner.

## Verification

- Contracts 64; Analytics 309 and the real-database proof `proof:connector-hub-inbox` (steps 1–7, including 105b–e);
  Geospatial 51 on a throwaway PostgreSQL (migrations 1–4, seeded old facts, then 5–6; relay and inbox integration);
  Connector Hub 52 on a throwaway PostgreSQL (place facts and relay); web 14 new or touched.
- `pnpm verify`: PASS (known WORKFORCE_API_URL drift only), after moving the active-item list from WI-OI-104
  (Review) to WI-OI-105.

## Deploy and live proof

- **Deploy** (owner's "batch", 2026-09-30):
  - Backups: `gigalibs_backup_20260930_170556Z.dump` (before the migrations) and one before the redeploy.
  - The credentials script added two relay key pairs to `.env.modules` (Geospatial → Analytics from 105b, Connector
    Hub → Geospatial); no secret printed.
  - Migrations: Geospatial 6 (with the 105b backfill), Connector Hub 8, Analytics 25; the others unchanged.
  - First deploy at `042d22787b32-685adc6f3cd9`. The places browser proof found a real bug (a mapping could not use
    `lat` both as a plain field and as the place source); fixed, and redeployed at **`042d22787b32-d3e901751025`**:
    every service healthy, the web on 5180.
  - The disk guard stopped two builds at 59 GB: build cache trimmed, and the owner removed an unused proof image
    (`workflow-platform:…-proof-without-cmms`).
- **Live web proof:** a real login, signed module contexts, 14 Playwright tests; Connector Hub refuses an unsigned
  request (401).
- **Places end-to-end proof** (`.pi/handoff/proof-scripts/e2e-105.sh`, spec `e2e/specs/places-map.spec.ts`; throwaway
  source, Hub and web on 127.0.0.1:5190, a throwaway tenant with `spatial-scoping`):
  - Tenant Admin, in the browser: a land register (two farms, four fields, WKT boundaries, one source with a type
    field and a parent field) set to "send as places", pulled; Geospatial makes the six places and they reach the
    Analytics directory. Field scouting (six points) pulled into Analytics, mapped with "Place of each record: from
    latitude and longitude", built: "6 records. 1 are in no known place". Pests per field are exact (A1 10, A2 4,
    B1 20, B2 7, Farm B 3, Unplaced 5), and on Farm B only B1, B2 and Farm B. The saved "Map (places)" on Farm B draws
    exactly Farm B's places (checked against the chart's accessible data description; screenshot
    `e2e/artifacts/places-map-admin-farm-b.png`).
  - A member scoped to Farm B (`analytics:read` only): the place directory holds Farm B, B1 and B2; the unfiltered
    saved map answers only those three places (no Unplaced); asking about Farm A returns nothing; the map draws only
    Farm B's places.
- **Backfill delivery:** 12,114 queued place facts. Most were delivered to the place directory. 980 facts, all in old
  `wi-oi-063-cert-*` certification tenants, were refused (401) during the service swap: the new Geospatial started 14 s
  before the new Analytics, which did not yet know its key, and a 401 is a permanent refusal. They sit as dead letters
  in Geospatial's outbox; replaying them (reset to PENDING; the inbox ignores repeats) is the owner's call.
  - Lesson, applied to `deploy-104c.sh`: start consumers before producers (Analytics, then Geospatial, then the Hub).
- **Relay retries seen in the proof:** the live Hub and the proof's throwaway Hub both run the Geospatial relay, so a
  field sometimes arrived just before its farm; the inbox answered 503 and the relay delivered it on retry, as designed.

## Open for the owner

- Replay the 980 dead-lettered place facts (test tenants only), or leave them.
- The CMMS and Workforce scope divergence above.
- `place_map` charts on dashboards load every visible place's boundary (dashboard tiles do not carry the question's
  place filter yet); correct, and limited to 2,000 places.
