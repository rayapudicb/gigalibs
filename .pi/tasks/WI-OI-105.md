# WI-OI-105: places with boundaries (ADR-0016 F15)

- **Status:** Approved (owner, 2026-09-30: "go" with D1–D4 as recommended). In progress.
- **Work item:** WI-OI-105. Evidence goes in `.pi/work/WI-OI-105.md`.
- **Size:** L. Five pieces, each verified and committed on its own.

## Goal

Agriculture plan phase 3 exit: "a map of fields coloured by a measure, filtered to one farm, shows only what the user
may see." Area and containment are computed in code; PostGIS only with its own ADR and a restore drill.

## What exists (checked 2026-09-30)

- **Geospatial:**
  - `spatial_nodes` stores places (ltree path, point, boundary as JSON, no area);
  - every change writes a `SpatialNodeChangedV1` fact to `outbox_events`, but no relay delivers them;
  - it has `inbox_receipts`, and a `places/import` route.
- **Analytics:**
  - place scope arrives in the signed context but is unused;
  - place analytics refuses scoped members "until the place-directory projection exists" (`place-analytics.service.ts`);
  - datasets have no place field.
- **CMMS and Workforce** already enforce place scope on their own records; to re-check in 105e.

## Pieces (recommended design)

1. **105a Area on save (Geospatial).** Boundaries are validated GeoJSON (Polygon or MultiPolygon, closed rings, WGS84).
   Area is computed in code (spherical, authalic radius; within about 0.3% of the ellipsoidal area for field-sized
   parcels) and stored (`area_m2`, migration 000004). The change fact carries the boundary and the area.
2. **105b Place directory in Analytics (ADR-0007 relay):**
   - Geospatial's `OutboxRelay` delivers place facts to the Analytics inbox with its own relay key pair.
   - Analytics keeps `place_directory` (id, parent, path, type, name, boundary, bounding box, area, status, version),
     applying only newer versions.
   - Facts already waiting in Geospatial's outbox deliver on the first run, and an admin "republish places" command
     resyncs.
3. **105c Records tagged with their place (Analytics mappings):**
   - A mapping may name a place source: latitude and longitude fields, or a place-code field.
   - At build, each record gets `place_id` and `place_path` from the smallest active place containing its point
     (point-in-polygon against the directory, bounding boxes first).
   - Unmatched records keep null and appear as a visible "Unplaced" bucket: a count on the dataset, and a value in
     Explore.
4. **105d Place scope in every Analytics query:**
   - A scoped member sees only records under their assigned places (path containment). Unplaced records, and datasets
     without places, are not shown to scoped members (fail closed).
   - Scoped questions are answered from the raw rows (summaries hold no place yet).
   - Place analytics uses the directory instead of refusing.
5. **105e Places from source locations, and the map:**
   - A Connector Hub connection can send its pulled records to Geospatial as places (GeoJSON or WKT geometry, parent
     by source id). Each source id stays linked to its place id.
   - A map chart colours places by a measure, filtered to one farm.
   - The exit proof: a scoped member sees only their farm.

## Decisions for the owner

- **D1:** Analytics learns places from Geospatial's facts over the relay (recommended; ADR-0007, and the code already
  expects a place directory), rather than calling Geospatial at query time.
- **D2:** Scoped members never see unplaced records or datasets without places (recommended: fail closed).
- **D3:** Scoped questions skip summaries for now (recommended: correct first; place-aware summaries only if speed
  needs them).
- **D4:** Geospatial is rebuilt and deployed for 105a and 105b (a standing rule says not without the owner).

## Stop and ask if

- a migration would change or drop existing place data;
- a module's existing scope rule would change for its users.
