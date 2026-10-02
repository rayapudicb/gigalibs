-- WI-OI-109e3: one source per internal producer (initially Workforce). Verified, deduplicated relay facts enter the
-- same raw-record -> discovery -> mapping -> dataset pipeline as any other source; Analytics does not read a module's
-- database. Forward-only and additive.
BEGIN;

ALTER TABLE gigalibs_analytics.source_connections
  ADD COLUMN module_source_key TEXT;

ALTER TABLE gigalibs_analytics.source_connections
  DROP CONSTRAINT source_connections_kind_fields,
  ADD CONSTRAINT source_connections_kind_fields CHECK (
    (source_type IN ('POSTGRES', 'SYNTHETIC')
      AND host IS NOT NULL AND port IS NOT NULL AND database_name IS NOT NULL
      AND hub_connection_id IS NULL AND module_source_key IS NULL)
    OR
    (source_type = 'CONNECTOR_HUB'
      AND hub_connection_id IS NOT NULL AND module_source_key IS NULL)
    OR
    (source_type = 'MODULE_EVENTS'
      AND module_source_key IS NOT NULL AND hub_connection_id IS NULL
      AND host IS NULL AND port IS NULL AND database_name IS NULL)
  );

CREATE UNIQUE INDEX source_connections_module_source
  ON gigalibs_analytics.source_connections (tenant_id, module_source_key)
  WHERE module_source_key IS NOT NULL;

INSERT INTO gigalibs_analytics.schema_migrations (version, name)
VALUES (29, '000029_module_event_sources')
ON CONFLICT (version) DO NOTHING;

COMMIT;
