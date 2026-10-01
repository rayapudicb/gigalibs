-- WI-OI-105b (ADR-0016 F15, ADR-0007): Analytics keeps its own copy of the tenant's places, fed by Geospatial's
-- SpatialNodeChangedV1 facts through the relay inbox, so records can be tagged with their place and every query can
-- honour a member's place scope without reading Geospatial's schema. A place is applied only when its version is not
-- older than the one held. Forward-only; a new table, no data changes.

BEGIN;

CREATE TABLE gigalibs_analytics.place_directory (
    tenant_id      TEXT             NOT NULL,
    place_id       UUID             NOT NULL,
    parent_id      UUID,
    path           TEXT             NOT NULL,
    depth          INTEGER          NOT NULL CHECK (depth BETWEEN 1 AND 32),
    node_type_code TEXT,
    display_name   TEXT,
    latitude       DOUBLE PRECISION,
    longitude      DOUBLE PRECISION,
    boundary       JSONB,
    min_longitude  DOUBLE PRECISION,
    min_latitude   DOUBLE PRECISION,
    max_longitude  DOUBLE PRECISION,
    max_latitude   DOUBLE PRECISION,
    area_m2        DOUBLE PRECISION CHECK (area_m2 IS NULL OR area_m2 >= 0),
    status         TEXT             NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    version        INTEGER          NOT NULL CHECK (version > 0),
    updated_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, place_id)
);

ALTER TABLE gigalibs_analytics.place_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.place_directory FORCE ROW LEVEL SECURITY;
CREATE POLICY place_directory_tenant_isolation ON gigalibs_analytics.place_directory
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX place_directory_path ON gigalibs_analytics.place_directory (tenant_id, path text_pattern_ops);
CREATE INDEX place_directory_bounds ON gigalibs_analytics.place_directory (tenant_id, min_longitude, max_longitude)
    WHERE boundary IS NOT NULL AND status = 'ACTIVE';

-- WI-OI-105c: records a build tagged with no place (the "Unplaced" bucket); null for datasets without places.
ALTER TABLE gigalibs_analytics.analytical_dataset_versions
    ADD COLUMN unplaced_count BIGINT CHECK (unplaced_count >= 0);

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (25, '000025_place_directory')
ON CONFLICT (version) DO NOTHING;

COMMIT;
