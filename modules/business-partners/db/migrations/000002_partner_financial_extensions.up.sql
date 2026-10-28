-- WI-OI-123 S1/S3: financial extensions of the kernel Party authority.
-- Party identity, contacts and addresses remain in the control plane. No party master is copied here.
-- Roll forward by preserving these keyed rows and replaying versioned party facts; never rewrite a ledger row.
BEGIN;

CREATE TABLE gigalibs_business_partners.party_references (
  tenant_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  code varchar(64) NOT NULL,
  display_name varchar(255) NOT NULL,
  party_type varchar(32) NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED', 'MERGED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, party_id)
);
CREATE UNIQUE INDEX party_references_code_live
  ON gigalibs_business_partners.party_references (tenant_id, code)
  WHERE status = 'ACTIVE';

CREATE TABLE gigalibs_business_partners.party_role_references (
  tenant_id varchar(64) NOT NULL,
  role_id uuid NOT NULL,
  party_id uuid NOT NULL,
  role_type varchar(32) NOT NULL CHECK (role_type IN ('CUSTOMER', 'SUPPLIER', 'CONTRACTOR', 'AGENCY', 'CARRIER', 'PARTNER')),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  source_version integer NOT NULL CHECK (source_version > 0),
  effective_from timestamptz,
  effective_to timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role_id),
  UNIQUE (tenant_id, party_id, role_type),
  FOREIGN KEY (tenant_id, party_id)
    REFERENCES gigalibs_business_partners.party_references (tenant_id, party_id),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);
CREATE INDEX party_role_references_active
  ON gigalibs_business_partners.party_role_references (tenant_id, party_id, role_type, status);

CREATE TABLE gigalibs_business_partners.partner_customer_acct (
  tenant_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  org_unit_id varchar(64) NOT NULL,
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  receivable_account_ref uuid NOT NULL,
  receivable_account_version integer NOT NULL CHECK (receivable_account_version > 0),
  accounting_book_id uuid NOT NULL,
  credit_limit_minor bigint NOT NULL CHECK (credit_limit_minor >= 0),
  terms_version varchar(128) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by varchar(128) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, party_id, org_unit_id, currency_code),
  FOREIGN KEY (tenant_id, party_id)
    REFERENCES gigalibs_business_partners.party_references (tenant_id, party_id)
);
CREATE INDEX partner_customer_acct_org
  ON gigalibs_business_partners.partner_customer_acct (tenant_id, org_unit_id, status);

CREATE TABLE gigalibs_business_partners.partner_vendor_acct (
  tenant_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  org_unit_id varchar(64) NOT NULL,
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  payable_account_ref uuid NOT NULL,
  payable_account_version integer NOT NULL CHECK (payable_account_version > 0),
  accounting_book_id uuid NOT NULL,
  terms_version varchar(128) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by varchar(128) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, party_id, org_unit_id, currency_code),
  FOREIGN KEY (tenant_id, party_id)
    REFERENCES gigalibs_business_partners.party_references (tenant_id, party_id)
);
CREATE INDEX partner_vendor_acct_org
  ON gigalibs_business_partners.partner_vendor_acct (tenant_id, org_unit_id, status);

CREATE TABLE gigalibs_business_partners.partner_account_action_outcomes (
  tenant_id varchar(64) NOT NULL,
  request_key uuid NOT NULL,
  operation varchar(32) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, request_key)
);

-- A bank reference is a vault token and masked display only. Raw account/routing numbers never enter this schema.
CREATE TABLE gigalibs_business_partners.partner_bank (
  tenant_id varchar(64) NOT NULL,
  id uuid NOT NULL,
  party_id uuid NOT NULL,
  org_unit_id varchar(64) NOT NULL,
  vault_reference varchar(256) NOT NULL,
  display_last_four char(4) NOT NULL CHECK (display_last_four ~ '^[0-9]{4}$'),
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, vault_reference),
  FOREIGN KEY (tenant_id, party_id)
    REFERENCES gigalibs_business_partners.party_references (tenant_id, party_id)
);
CREATE INDEX partner_bank_party
  ON gigalibs_business_partners.partner_bank (tenant_id, party_id, org_unit_id);

-- Positive deltas raise exposure for OPEN_AR and UNINVOICED_ORDER; positive PREPAYMENT lowers it.
-- Corrections append an opposite delta with a new source version and a reversal reference.
CREATE TABLE gigalibs_business_partners.credit_status (
  tenant_id varchar(64) NOT NULL,
  id uuid NOT NULL,
  party_id uuid NOT NULL,
  org_unit_id varchar(64) NOT NULL,
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  component varchar(24) NOT NULL CHECK (component IN ('OPEN_AR', 'UNINVOICED_ORDER', 'PREPAYMENT')),
  delta_minor bigint NOT NULL CHECK (delta_minor <> 0),
  source_module varchar(64) NOT NULL,
  source_document_id varchar(128) NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  source_event_id varchar(128) NOT NULL,
  reversal_of uuid,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, source_event_id),
  UNIQUE (tenant_id, source_module, source_document_id, source_version, component),
  FOREIGN KEY (tenant_id, party_id)
    REFERENCES gigalibs_business_partners.party_references (tenant_id, party_id),
  FOREIGN KEY (tenant_id, reversal_of)
    REFERENCES gigalibs_business_partners.credit_status (tenant_id, id)
);
CREATE INDEX credit_status_party_balance
  ON gigalibs_business_partners.credit_status (tenant_id, party_id, org_unit_id, currency_code, component);

CREATE TABLE gigalibs_business_partners.credit_holds (
  tenant_id varchar(64) NOT NULL,
  id uuid NOT NULL,
  party_id uuid NOT NULL,
  org_unit_id varchar(64) NOT NULL,
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'RELEASED')),
  reason varchar(1024) NOT NULL CHECK (length(btrim(reason)) > 0),
  exposure_minor bigint NOT NULL,
  credit_limit_minor bigint NOT NULL,
  source_version varchar(128) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_by varchar(128),
  released_at timestamptz,
  release_reason varchar(1024),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, party_id)
    REFERENCES gigalibs_business_partners.party_references (tenant_id, party_id),
  CHECK ((status = 'ACTIVE' AND released_by IS NULL AND released_at IS NULL)
      OR (status = 'RELEASED' AND released_by IS NOT NULL AND released_at IS NOT NULL AND release_reason IS NOT NULL))
);
CREATE UNIQUE INDEX credit_holds_one_active
  ON gigalibs_business_partners.credit_holds (tenant_id, party_id, org_unit_id, currency_code)
  WHERE status = 'ACTIVE';

CREATE TABLE gigalibs_business_partners.document_action_outcomes (
  tenant_id varchar(64) NOT NULL,
  document_id uuid NOT NULL,
  action varchar(64) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id, action, idempotency_key)
);

CREATE TABLE gigalibs_business_partners.inbox_receipts (
  id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  consumer_name varchar(128) NOT NULL,
  message_id varchar(128) NOT NULL,
  source_module varchar(64) NOT NULL,
  event_type varchar(128) NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  correlation_id varchar(128) NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status varchar(16) NOT NULL CHECK (status IN ('PROCESSING', 'PROCESSED', 'FAILED')),
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  last_error_code varchar(128),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, consumer_name, message_id)
);

-- The signed context carries roots and a version, which the module expands from its own
-- immutable copy. A missing version denies access until kernel delivery catches up.
CREATE TABLE gigalibs_business_partners.org_replica_versions (
  tenant_id varchar(64) NOT NULL,
  version_id varchar(64) NOT NULL,
  tree_id varchar(64) NOT NULL,
  tree_kind varchar(16) NOT NULL CHECK (tree_kind IN ('PRIMARY', 'ALTERNATE')),
  version_number integer NOT NULL CHECK (version_number > 0),
  checksum char(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  status varchar(16) NOT NULL DEFAULT 'RECEIVING' CHECK (status IN ('RECEIVING', 'READY')),
  unit_count integer CHECK (unit_count >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  PRIMARY KEY (tenant_id, version_id),
  CHECK ((status = 'READY') = (ready_at IS NOT NULL AND unit_count IS NOT NULL))
);
CREATE TABLE gigalibs_business_partners.org_replica_units (
  tenant_id varchar(64) NOT NULL,
  version_id varchar(64) NOT NULL,
  unit_id varchar(64) NOT NULL,
  parent_unit_id varchar(64),
  code varchar(64) NOT NULL,
  name varchar(200) NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  holds_records boolean NOT NULL,
  type_code varchar(40) NOT NULL,
  PRIMARY KEY (tenant_id, version_id, unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_business_partners.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);
CREATE TABLE gigalibs_business_partners.org_replica_closure (
  tenant_id varchar(64) NOT NULL,
  version_id varchar(64) NOT NULL,
  ancestor_unit_id varchar(64) NOT NULL,
  descendant_unit_id varchar(64) NOT NULL,
  depth smallint NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_business_partners.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);
CREATE INDEX org_replica_closure_descendant ON gigalibs_business_partners.org_replica_closure (tenant_id, version_id, descendant_unit_id);

DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'party_references', 'party_role_references', 'partner_customer_acct', 'partner_vendor_acct',
    'partner_account_action_outcomes', 'partner_bank',
    'credit_status', 'credit_holds', 'document_action_outcomes', 'inbox_receipts',
    'org_replica_versions', 'org_replica_units', 'org_replica_closure'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_business_partners.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_business_partners.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_business_partners.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation', relation
    );
  END LOOP;
END $$;

INSERT INTO gigalibs_business_partners.schema_migrations (version, name)
VALUES (2, '000002_partner_financial_extensions');

COMMIT;
