# ADR-0006: Spatial hierarchy, jurisdiction and spatial scope

- Status: Proposed (G2 draft for WI-OI-063; independent reviews pending)
- Date: 2026-09-26
- Programme: WI-OI-062, phase P2
- Related: ADR-0003 (identity, lexicon, workforce primitives), ADR-0005 and the Delta 5 North Star
  (module ownership, events, tenant binding, audit)

## Context

Every operational module needs to say where work happens. Today location is duplicated and weak: CMMS and
the GigaOps prototypes carry free-text location columns, the control plane has a circle-only
`GeofenceZone`, and `modules/geospatial` has point assets and geofences without a hierarchy, forced RLS,
audit, outbox or a deployed runtime. Users also cannot be limited to part of an estate.

## Decision

1. **Owner.** `modules/geospatial` (canonical schema `gigalibs_geospatial`) is the single system of record for
   places, their hierarchy, boundaries and jurisdiction. No other module stores its own place master. The
   prototype schema `gigalibs_spatial` is excluded, mirroring `gigalibs_workforce` versus `gigalibs_gigaops`.
2. **Foundation first.** Geospatial receives a canonical `db/runtime-foundation` migration chain meeting the
   WI-OI-060 standard before any hierarchy work. The existing `db/migrations/000001` is excluded prototype
   inventory and is never applied or edited.
3. **Hierarchy.** `spatial_nodes` uses a PostgreSQL `ltree` path per tenant. Node types are tenant reference
   data in `spatial_node_types` (code and label, like Workforce capability definitions), not SQL enums, so
   industries name their own levels (region, site, building, zone, pier) without migrations. An industry pack
   seeds them only through an explicit admin action; display terminology overlays may later come from
   Configuration Studio (Delta 5 D1), which remains the only metadata engine. Each node carries ISO 3166 country and subdivision, IANA time
   zone and an optional GeoJSON boundary.
4. **Geometry.** Boundaries are GeoJSON validated at the API boundary. PostGIS is not adopted now because the
   pinned `postgres:16-alpine` image lacks it; adopting it later requires a new image decision, scan and
   restore evidence, recorded as an amendment to this ADR on measured need.
5. **References, not links.** Other modules store `site_ref` (node ID) plus a path snapshot and consume
   `SpatialNodeChangedV1` through their inbox. No foreign keys or reads across module schemas.
6. **Scope claim.** `PlatformContextV1` gains optional `spatial_scope`:
   `{ mode: 'UNBOUNDED' } | { mode: 'SCOPED_PATHS', paths: string[] }`. The control plane stores member
   scope assignments and issues the claim. Tokens without the claim remain valid. When a tenant enables
   spatial scoping, a missing claim fails closed.
7. **Enforcement.** A shared helper validates each path against
   `^[A-Za-z0-9_]{1,63}(\.[A-Za-z0-9_]{1,63}){0,31}$` and binds `path <@ ANY($1::ltree[])` as a parameter.
   Modules apply it inside their own repositories under RLS; string-built SQL is forbidden.
8. **Tenant key.** Geospatial adopts the platform tenant session key `app.tenant_id`, matching Workforce.
9. **Convergence.** The control-plane `GeofenceZone` is migrated into Geospatial and retired through a
   registered follow-up item.

## Consequences

- One place master; later phases need no location backfill.
- P2 grows into two Build slices (foundation, then hierarchy).
- Scoped reads cost one indexed `ltree` predicate; the exit target is p95 under 8 ms at 50,000 nodes.
- Geospatial Studio is contained in the catalogue until its runtime foundation is certified.

## Rejected alternatives

- A shared `platform_spatial_nodes` table in `packages/db`: makes the control plane own domain data and
  invites cross-schema foreign keys.
- Foreign keys from `work_units` or CMMS work orders to spatial tables: violates module ownership.
- PostGIS now: not available in the certified database image.
- String-concatenated path filters: injection risk; rejected by Delta 5 secure-extensibility rules.

## Verification required before acceptance

Threat model for scope escalation and path injection; clean migration replay and upgrade; two-tenant and
cross-scope negative tests; performance evidence at 50,000 nodes; restore test; independent Security,
Backend/Data and Solution Architecture review.
