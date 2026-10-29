BEGIN;

ALTER TABLE gigalibs_finance.cost_profiles
  DROP CONSTRAINT IF EXISTS cost_profiles_project_labor_expense_owner,
  DROP CONSTRAINT IF EXISTS cost_profiles_project_wip_owner,
  DROP COLUMN IF EXISTS project_labor_expense_gl_account_id,
  DROP COLUMN IF EXISTS project_wip_gl_account_id;

DELETE FROM gigalibs_finance.schema_migrations WHERE version = 18;

COMMIT;
