-- WI-OI-133: bounded lookup for 90-day Rounds numeric trends on validated, scoped inbox facts.
-- Raw records remain append-only and tenant RLS remains forced. Forward-only; drop this index to recover.
BEGIN;
CREATE INDEX IF NOT EXISTS raw_rounds_trend_lookup
  ON gigalibs_analytics.raw_record_versions
  (tenant_id,(raw_payload->>'assetId'),(raw_payload->>'checkpointId'),(raw_payload->>'unitCode'))
  WHERE source_table_name='inspection_readings' AND raw_payload->>'scopeKnown'='true';
INSERT INTO gigalibs_analytics.schema_migrations(version,name)
VALUES(35,'000035_round_inspection_trend') ON CONFLICT(version) DO NOTHING;
COMMIT;
