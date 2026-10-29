-- WI-OI-129 S3: project WIP and labor expense GL accounts on Finance cost profiles.
BEGIN;

ALTER TABLE gigalibs_finance.cost_profiles
  ADD COLUMN project_wip_gl_account_id uuid,
  ADD COLUMN project_labor_expense_gl_account_id uuid,
  ADD CONSTRAINT cost_profiles_project_wip_owner
    FOREIGN KEY (tenant_id, project_wip_gl_account_id)
    REFERENCES gigalibs_finance.chart_of_accounts (tenant_id, id),
  ADD CONSTRAINT cost_profiles_project_labor_expense_owner
    FOREIGN KEY (tenant_id, project_labor_expense_gl_account_id)
    REFERENCES gigalibs_finance.chart_of_accounts (tenant_id, id);

INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (18);

COMMIT;
