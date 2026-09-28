-- WI-OI-043 / Phase 1: custom_attributes JSONB column on all importable entities
-- Decision D-01: JSONB with GIN index (not EAV) for custom column storage.
-- NOTE: GIN indexes use CREATE INDEX CONCURRENTLY and cannot run inside a transaction.
-- Run this migration outside a transaction block in production (use --single-transaction=off).

ALTER TABLE gigalibs_cmms.assets
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}';

ALTER TABLE gigalibs_cmms.locations
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}';

ALTER TABLE gigalibs_cmms.parts
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}';

ALTER TABLE gigalibs_cmms.vendors
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}';

ALTER TABLE gigalibs_cmms.customers
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}';

ALTER TABLE gigalibs_cmms.workforce_resources
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}';

ALTER TABLE gigalibs_cmms.departments
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}';

-- GIN indexes for @> operator queries on custom_attributes.
-- CONCURRENTLY: no exclusive lock; safe on live tables; cannot be inside BEGIN/COMMIT.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cmms_assets_custom_attrs
  ON gigalibs_cmms.assets USING GIN (custom_attributes jsonb_path_ops)
  WHERE NOT is_deleted;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cmms_locations_custom_attrs
  ON gigalibs_cmms.locations USING GIN (custom_attributes jsonb_path_ops)
  WHERE NOT is_deleted;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cmms_parts_custom_attrs
  ON gigalibs_cmms.parts USING GIN (custom_attributes jsonb_path_ops)
  WHERE NOT is_deleted;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cmms_vendors_custom_attrs
  ON gigalibs_cmms.vendors USING GIN (custom_attributes jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cmms_customers_custom_attrs
  ON gigalibs_cmms.customers USING GIN (custom_attributes jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cmms_workforce_custom_attrs
  ON gigalibs_cmms.workforce_resources USING GIN (custom_attributes jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cmms_departments_custom_attrs
  ON gigalibs_cmms.departments USING GIN (custom_attributes jsonb_path_ops);

INSERT INTO gigalibs_cmms.schema_migrations (version, name, applied_at)
VALUES (8, 'custom_attributes', transaction_timestamp())
ON CONFLICT (version) DO NOTHING;
