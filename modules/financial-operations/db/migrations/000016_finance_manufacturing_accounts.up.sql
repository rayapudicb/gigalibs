-- WI-OI-126 S7: explicit WIP and production-variance accounts on a Finance cost profile.
-- Additive: existing profiles remain valid for non-manufacturing receipts. Manufacturing posting
-- refuses a profile without both accounts until Finance configures them.
BEGIN;

CREATE UNIQUE INDEX chart_of_accounts_tenant_id_id_manufacturing
  ON gigalibs_finance.chart_of_accounts (tenant_id, id);

ALTER TABLE gigalibs_finance.cost_profiles
  ADD COLUMN manufacturing_wip_gl_account_id uuid,
  ADD COLUMN manufacturing_variance_gl_account_id uuid,
  ADD CONSTRAINT cost_profiles_manufacturing_wip_owner
    FOREIGN KEY (tenant_id, manufacturing_wip_gl_account_id)
    REFERENCES gigalibs_finance.chart_of_accounts (tenant_id, id),
  ADD CONSTRAINT cost_profiles_manufacturing_variance_owner
    FOREIGN KEY (tenant_id, manufacturing_variance_gl_account_id)
    REFERENCES gigalibs_finance.chart_of_accounts (tenant_id, id);

INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (16);

COMMIT;
