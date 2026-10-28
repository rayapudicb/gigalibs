-- WI-OI-123 S4: last applied AR invoice balance. Credit deltas remain append-only.
-- A source snapshot is converted to a delta only after the previous source version is present.
BEGIN;

CREATE TABLE gigalibs_business_partners.credit_source_positions (
  tenant_id varchar(64) NOT NULL,
  source_module varchar(64) NOT NULL,
  source_document_id varchar(128) NOT NULL,
  component varchar(24) NOT NULL CHECK (component IN ('OPEN_AR', 'UNINVOICED_ORDER', 'PREPAYMENT')),
  party_id uuid NOT NULL,
  org_unit_id varchar(64) NOT NULL,
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  source_version integer NOT NULL CHECK (source_version >= 0),
  balance_minor bigint NOT NULL CHECK (balance_minor >= 0),
  source_event_id varchar(128),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source_module, source_document_id, component),
  FOREIGN KEY (tenant_id, party_id)
    REFERENCES gigalibs_business_partners.party_references (tenant_id, party_id),
  CHECK ((source_version = 0 AND source_event_id IS NULL) OR
         (source_version > 0 AND source_event_id IS NOT NULL))
);
CREATE INDEX credit_source_positions_party
  ON gigalibs_business_partners.credit_source_positions
  (tenant_id, party_id, org_unit_id, currency_code, component);

ALTER TABLE gigalibs_business_partners.credit_source_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_business_partners.credit_source_positions FORCE ROW LEVEL SECURITY;
CREATE POLICY credit_source_positions_tenant_isolation
  ON gigalibs_business_partners.credit_source_positions
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

INSERT INTO gigalibs_business_partners.schema_migrations (version, name)
VALUES (3, '000003_credit_source_positions');
COMMIT;
