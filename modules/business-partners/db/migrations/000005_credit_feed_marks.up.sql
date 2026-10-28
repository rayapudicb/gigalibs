-- WI-OI-123 S4/S5: per-component feed readiness before credit approval.
BEGIN;

CREATE TABLE gigalibs_business_partners.credit_feed_marks (
  tenant_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  org_unit_id varchar(64) NOT NULL,
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  component varchar(24) NOT NULL CHECK (component IN ('OPEN_AR', 'UNINVOICED_ORDER', 'PREPAYMENT')),
  ready_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, party_id, org_unit_id, currency_code, component),
  FOREIGN KEY (tenant_id, party_id)
    REFERENCES gigalibs_business_partners.party_references (tenant_id, party_id)
);

ALTER TABLE gigalibs_business_partners.credit_feed_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_business_partners.credit_feed_marks FORCE ROW LEVEL SECURITY;
CREATE POLICY credit_feed_marks_tenant_isolation
  ON gigalibs_business_partners.credit_feed_marks
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_business_partners.schema_migrations (version, name)
VALUES (5, '000005_credit_feed_marks');
COMMIT;
