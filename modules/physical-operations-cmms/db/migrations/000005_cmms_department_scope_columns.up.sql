-- Migration 000005: Add department_id scope columns to core CMMS tables
-- Purpose: Enable certified per-department query filtering in SCOPED_DEPARTMENTS mode.
-- Strategy: Additive only. Nullable foreign key; existing rows remain unscoped (NULL = enterprise-wide).
-- Replaces the global 403 fail-closed block in authorization.ts for SCOPED_DEPARTMENTS mode.
BEGIN;

-- ─── ASSETS ──────────────────────────────────────────────────────────────────
ALTER TABLE gigalibs_cmms.assets
  ADD COLUMN IF NOT EXISTS department_id uuid NULL;

COMMENT ON COLUMN gigalibs_cmms.assets.department_id IS
  'Control-plane Department UUID. NULL means the asset belongs to the whole tenant (FLAT_TENANT). '
  'When org_scope.mode = SCOPED_DEPARTMENTS the BFF resolves the caller''s department sub-tree '
  'and injects the resolved set into the query predicate.';

CREATE INDEX IF NOT EXISTS idx_cmms_assets_department_id
  ON gigalibs_cmms.assets (tenant_id, department_id)
  WHERE department_id IS NOT NULL;

-- ─── WORK ORDERS ─────────────────────────────────────────────────────────────
ALTER TABLE gigalibs_cmms.work_orders
  ADD COLUMN IF NOT EXISTS department_id uuid NULL;

COMMENT ON COLUMN gigalibs_cmms.work_orders.department_id IS
  'Control-plane Department UUID. NULL = enterprise-wide. '
  'See gigalibs_cmms.assets.department_id for scoping semantics.';

CREATE INDEX IF NOT EXISTS idx_cmms_work_orders_department_id
  ON gigalibs_cmms.work_orders (tenant_id, department_id)
  WHERE department_id IS NOT NULL;

-- ─── LOCATIONS ───────────────────────────────────────────────────────────────
ALTER TABLE gigalibs_cmms.locations
  ADD COLUMN IF NOT EXISTS department_id uuid NULL;

COMMENT ON COLUMN gigalibs_cmms.locations.department_id IS
  'Control-plane Department UUID for scoped site/building/zone hierarchy.';

CREATE INDEX IF NOT EXISTS idx_cmms_locations_department_id
  ON gigalibs_cmms.locations (tenant_id, department_id)
  WHERE department_id IS NOT NULL;

-- ─── PARTS ───────────────────────────────────────────────────────────────────
ALTER TABLE gigalibs_cmms.parts
  ADD COLUMN IF NOT EXISTS department_id uuid NULL;

COMMENT ON COLUMN gigalibs_cmms.parts.department_id IS
  'Control-plane Department UUID for scoped inventory management.';

CREATE INDEX IF NOT EXISTS idx_cmms_parts_department_id
  ON gigalibs_cmms.parts (tenant_id, department_id)
  WHERE department_id IS NOT NULL;

-- ─── PM SCHEDULES ─────────────────────────────────────────────────────────────
ALTER TABLE gigalibs_cmms.pm_schedules
  ADD COLUMN IF NOT EXISTS department_id uuid NULL;

COMMENT ON COLUMN gigalibs_cmms.pm_schedules.department_id IS
  'Control-plane Department UUID for scoped preventive-maintenance program filtering.';

CREATE INDEX IF NOT EXISTS idx_cmms_pm_schedules_department_id
  ON gigalibs_cmms.pm_schedules (tenant_id, department_id)
  WHERE department_id IS NOT NULL;

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (5, '000005_cmms_department_scope_columns')
ON CONFLICT (version) DO NOTHING;

COMMIT;
