BEGIN;

-- WI-OI-105e (ADR-0007, ADR-0016 F15): Connector Hub can send pulled records here as places. Each source record stays
-- linked to the place it created, so a later version of the record updates or moves that place instead of adding
-- another. A record that cannot become a place is kept with the reason, so it can be seen and fixed at the source.
CREATE TABLE gigalibs_geospatial.place_source_links (
  tenant_id VARCHAR(64) NOT NULL,
  hub_connection_id VARCHAR(64) NOT NULL,
  source_id VARCHAR(256) NOT NULL,
  place_id UUID,
  -- The version of the Hub fact last applied; an older or repeated fact changes nothing.
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  status VARCHAR(16) NOT NULL CHECK (status IN ('LINKED', 'REJECTED')),
  reason VARCHAR(400),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, hub_connection_id, source_id),
  FOREIGN KEY (tenant_id, place_id) REFERENCES gigalibs_geospatial.spatial_nodes (tenant_id, id),
  CHECK ((status = 'LINKED') = (place_id IS NOT NULL))
);

CREATE INDEX place_source_links_place ON gigalibs_geospatial.place_source_links (tenant_id, place_id);

ALTER TABLE gigalibs_geospatial.place_source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_geospatial.place_source_links FORCE ROW LEVEL SECURITY;
CREATE POLICY place_source_links_tenant_isolation ON gigalibs_geospatial.place_source_links
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_geospatial.schema_migrations (version, name)
VALUES (6, '000006_geospatial_hub_places');

COMMIT;
