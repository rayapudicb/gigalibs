-- Recovery only before a manufacturing journal uses these accounts. After posting, roll forward
-- by restoring the profile configuration and replaying the inbox event; do not drop history.
BEGIN;

ALTER TABLE gigalibs_finance.cost_profiles
  DROP COLUMN manufacturing_variance_gl_account_id,
  DROP COLUMN manufacturing_wip_gl_account_id;

DROP INDEX gigalibs_finance.chart_of_accounts_tenant_id_id_manufacturing;

DELETE FROM gigalibs_finance.schema_migrations WHERE version = 16;

COMMIT;
