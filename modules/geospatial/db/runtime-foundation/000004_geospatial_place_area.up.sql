BEGIN;

-- WI-OI-105a (ADR-0016 F15): a place's area is computed in code when its boundary is saved (no PostGIS) and stored
-- here. Places saved before keep NULL until their boundary is next saved; the API computes it on read meanwhile.
ALTER TABLE gigalibs_geospatial.spatial_nodes
  ADD COLUMN area_m2 NUMERIC(16, 2) CHECK (area_m2 IS NULL OR area_m2 >= 0);

INSERT INTO gigalibs_geospatial.schema_migrations (version, name)
VALUES (4, '000004_geospatial_place_area');

COMMIT;
