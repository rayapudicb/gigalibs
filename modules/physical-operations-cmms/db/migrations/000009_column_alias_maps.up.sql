-- WI-OI-043 / Phase 1: column_alias_maps for per-tenant header remapping
-- Allows tenants to upload files with custom column names that map to standard CMMS fields.
BEGIN;

CREATE TABLE IF NOT EXISTS gigalibs_cmms.column_alias_maps (
  tenant_id       uuid NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type     text NOT NULL,
  external_column text NOT NULL,
  internal_column text NOT NULL,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT col_alias_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE CASCADE,
  CONSTRAINT col_alias_entity_type_check CHECK (entity_type IN (
    'assets','locations','parts','vendors','customers',
    'workforce_resources','departments'
  )),
  CONSTRAINT col_alias_unique UNIQUE (tenant_id, entity_type, external_column)
);

CREATE INDEX IF NOT EXISTS idx_cmms_col_alias_lookup
  ON gigalibs_cmms.column_alias_maps (tenant_id, entity_type);

ALTER TABLE gigalibs_cmms.column_alias_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.column_alias_maps FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_col_alias_tenant ON gigalibs_cmms.column_alias_maps
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── schema_migrations ledger ─────────────────────────────────────────────────
INSERT INTO gigalibs_cmms.schema_migrations (version, name, applied_at)
VALUES (9, 'column_alias_maps', transaction_timestamp())
ON CONFLICT (version) DO NOTHING;

COMMIT;
