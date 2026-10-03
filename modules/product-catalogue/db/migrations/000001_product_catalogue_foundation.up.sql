-- WI-OI-112 / ADR-0021: Product Catalogue module-owned persistence. Forward-only.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS gigalibs_product_catalogue;

CREATE TABLE gigalibs_product_catalogue.schema_migrations (
  version bigint PRIMARY KEY CHECK (version > 0),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 200),
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE gigalibs_product_catalogue.uom_definitions (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  code varchar(20) NOT NULL,
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  symbol varchar(10) NOT NULL,
  dimension varchar(16) NOT NULL CHECK (dimension IN ('LENGTH','WEIGHT','VOLUME','AREA','TIME','TEMPERATURE','COUNT','DATA','CURRENCY')),
  standard_precision smallint NOT NULL DEFAULT 2 CHECK (standard_precision BETWEEN 0 AND 12),
  costing_precision smallint NOT NULL DEFAULT 4 CHECK (costing_precision BETWEEN 0 AND 12),
  uom_type varchar(24) NOT NULL DEFAULT 'TENANT_CUSTOM' CHECK (uom_type IN ('PLATFORM_REFERENCE','TENANT_CUSTOM')),
  iso_code varchar(20),
  ucum_code varchar(20),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);
CREATE INDEX uom_definitions_tenant_dimension ON gigalibs_product_catalogue.uom_definitions (tenant_id, dimension, active);

CREATE TABLE gigalibs_product_catalogue.product_categories (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  code varchar(50) NOT NULL,
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  description varchar(2000),
  parent_category_id uuid,
  default_category boolean NOT NULL DEFAULT false,
  effective_from timestamptz,
  effective_to timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, parent_category_id) REFERENCES gigalibs_product_catalogue.product_categories (tenant_id, id),
  CHECK (parent_category_id IS NULL OR parent_category_id <> id),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX product_categories_one_default ON gigalibs_product_catalogue.product_categories (tenant_id) WHERE default_category;
CREATE INDEX product_categories_parent ON gigalibs_product_catalogue.product_categories (tenant_id, parent_category_id);

CREATE TABLE gigalibs_product_catalogue.products (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  owning_unit_id varchar(64),
  code varchar(50) NOT NULL,
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  display_name varchar(200),
  description varchar(2000),
  product_type varchar(16) NOT NULL CHECK (product_type IN ('GOOD','SERVICE','DIGITAL','RESOURCE','BUNDLE')),
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','DISCONTINUED','ARCHIVED')),
  base_uom_id uuid NOT NULL,
  category_id uuid,
  sold boolean NOT NULL DEFAULT false,
  purchased boolean NOT NULL DEFAULT false,
  stocked boolean NOT NULL DEFAULT false,
  data_classification varchar(16) NOT NULL DEFAULT 'INTERNAL' CHECK (data_classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  extensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extensions) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, base_uom_id) REFERENCES gigalibs_product_catalogue.uom_definitions (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES gigalibs_product_catalogue.product_categories (tenant_id, id),
  CHECK (NOT stocked OR product_type IN ('GOOD','RESOURCE'))
);
CREATE INDEX products_search ON gigalibs_product_catalogue.products (tenant_id, status, lower(name), id);
CREATE INDEX products_organization ON gigalibs_product_catalogue.products (tenant_id, owning_unit_id, status);

CREATE TABLE gigalibs_product_catalogue.product_org_availability (
  tenant_id varchar(64) NOT NULL,
  product_id uuid NOT NULL,
  unit_id varchar(64) NOT NULL,
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product_id, unit_id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES gigalibs_product_catalogue.products (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX product_availability_unit ON gigalibs_product_catalogue.product_org_availability (tenant_id, unit_id, product_id);

CREATE TABLE gigalibs_product_catalogue.uom_conversions (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  from_uom_id uuid NOT NULL,
  to_uom_id uuid NOT NULL,
  product_id uuid,
  conversion_rate numeric(38,12) NOT NULL CHECK (conversion_rate > 0),
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz,
  effective_to timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, from_uom_id, to_uom_id, product_id, effective_from),
  FOREIGN KEY (tenant_id, from_uom_id) REFERENCES gigalibs_product_catalogue.uom_definitions (tenant_id, id),
  FOREIGN KEY (tenant_id, to_uom_id) REFERENCES gigalibs_product_catalogue.uom_definitions (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES gigalibs_product_catalogue.products (tenant_id, id),
  CHECK (from_uom_id <> to_uom_id),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);

CREATE TABLE gigalibs_product_catalogue.attribute_definitions (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  code varchar(50) NOT NULL,
  name varchar(200) NOT NULL,
  description varchar(2000),
  value_type varchar(16) NOT NULL CHECK (value_type IN ('STRING','INTEGER','DECIMAL','BOOLEAN','DATE','ENUM')),
  required boolean NOT NULL DEFAULT false,
  data_classification varchar(16) NOT NULL DEFAULT 'INTERNAL' CHECK (data_classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  unit varchar(20),
  allowed_values text[] NOT NULL DEFAULT '{}',
  minimum numeric(38,12),
  maximum numeric(38,12),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  CHECK (maximum IS NULL OR minimum IS NULL OR maximum >= minimum)
);

CREATE TABLE gigalibs_product_catalogue.product_attribute_values (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  product_id uuid NOT NULL,
  attribute_definition_id uuid NOT NULL,
  value jsonb NOT NULL,
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, attribute_definition_id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES gigalibs_product_catalogue.products (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, attribute_definition_id) REFERENCES gigalibs_product_catalogue.attribute_definitions (tenant_id, id)
);

CREATE TABLE gigalibs_product_catalogue.catalogues (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  owning_unit_id varchar(64),
  code varchar(50) NOT NULL,
  name varchar(200) NOT NULL,
  description varchar(2000),
  purpose varchar(100),
  audience varchar(100),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE gigalibs_product_catalogue.catalogue_versions (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  catalogue_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','PUBLISHED','SUPERSEDED','ARCHIVED')),
  checksum char(71),
  effective_from timestamptz,
  effective_to timestamptz,
  notes varchar(1000),
  submitted_by varchar(128), submitted_at timestamptz,
  approved_by varchar(128), approved_at timestamptz,
  published_by varchar(128), published_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, catalogue_id, version_number),
  FOREIGN KEY (tenant_id, catalogue_id) REFERENCES gigalibs_product_catalogue.catalogues (tenant_id, id),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
  CHECK (checksum IS NULL OR checksum ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE gigalibs_product_catalogue.catalogue_entries (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  catalogue_version_id uuid NOT NULL,
  product_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  highlighted boolean NOT NULL DEFAULT false,
  display_overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(display_overrides) = 'object'),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, catalogue_version_id, product_id),
  FOREIGN KEY (tenant_id, catalogue_version_id) REFERENCES gigalibs_product_catalogue.catalogue_versions (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES gigalibs_product_catalogue.products (tenant_id, id)
);

CREATE TABLE gigalibs_product_catalogue.price_lists (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  owning_unit_id varchar(64),
  code varchar(50) NOT NULL,
  name varchar(200) NOT NULL,
  description varchar(2000),
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  tax_included boolean NOT NULL DEFAULT false,
  enforce_price_limit boolean NOT NULL DEFAULT true,
  price_precision smallint NOT NULL DEFAULT 2 CHECK (price_precision BETWEEN 0 AND 6),
  audience varchar(100),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE gigalibs_product_catalogue.price_list_versions (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  price_list_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status varchar(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVATED','SUPERSEDED','ARCHIVED')),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  checksum char(71),
  notes varchar(1000),
  submitted_by varchar(128), submitted_at timestamptz,
  approved_by varchar(128), approved_at timestamptz,
  activated_by varchar(128), activated_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, price_list_id, version_number),
  FOREIGN KEY (tenant_id, price_list_id) REFERENCES gigalibs_product_catalogue.price_lists (tenant_id, id),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (checksum IS NULL OR checksum ~ '^sha256:[0-9a-f]{64}$')
);
CREATE INDEX price_versions_resolution ON gigalibs_product_catalogue.price_list_versions (tenant_id, status, effective_from DESC, effective_to);

CREATE TABLE gigalibs_product_catalogue.product_prices (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  price_list_version_id uuid NOT NULL,
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  minimum_quantity numeric(38,12) NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
  list_price_minor bigint NOT NULL,
  standard_price_minor bigint NOT NULL,
  limit_price_minor bigint NOT NULL,
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, price_list_version_id, product_id, uom_id, minimum_quantity),
  FOREIGN KEY (tenant_id, price_list_version_id) REFERENCES gigalibs_product_catalogue.price_list_versions (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES gigalibs_product_catalogue.products (tenant_id, id),
  FOREIGN KEY (tenant_id, uom_id) REFERENCES gigalibs_product_catalogue.uom_definitions (tenant_id, id),
  CHECK (list_price_minor >= standard_price_minor AND standard_price_minor >= limit_price_minor)
);
CREATE INDEX product_prices_resolution ON gigalibs_product_catalogue.product_prices (tenant_id, product_id, uom_id, minimum_quantity DESC);

CREATE TABLE gigalibs_product_catalogue.product_reference_mappings (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  product_id uuid NOT NULL,
  source_system varchar(100) NOT NULL,
  source_key varchar(255) NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_system, source_key),
  FOREIGN KEY (tenant_id, product_id) REFERENCES gigalibs_product_catalogue.products (tenant_id, id)
);

CREATE TABLE gigalibs_product_catalogue.consumer_snapshots (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  product_id uuid NOT NULL,
  product_version integer NOT NULL,
  fingerprint char(71) NOT NULL CHECK (fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  payload jsonb NOT NULL,
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, product_version, fingerprint),
  FOREIGN KEY (tenant_id, product_id) REFERENCES gigalibs_product_catalogue.products (tenant_id, id)
);

CREATE TABLE gigalibs_product_catalogue.idempotency_records (
  tenant_id varchar(64) NOT NULL,
  actor_subject varchar(128) NOT NULL,
  operation varchar(80) NOT NULL,
  idempotency_key uuid NOT NULL,
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_status smallint NOT NULL CHECK (response_status BETWEEN 200 AND 299),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, actor_subject, operation, idempotency_key)
);

CREATE TABLE gigalibs_product_catalogue.auth_revocation_events (
  id varchar(64) PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  revocation_type varchar(32) NOT NULL CHECK (revocation_type IN ('SESSION','SUBJECT_AUTH_VERSION')),
  session_id varchar(128), subject_id varchar(128), invalid_through_auth_version integer,
  reason varchar(256) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((revocation_type = 'SESSION' AND session_id IS NOT NULL AND subject_id IS NULL AND invalid_through_auth_version IS NULL)
      OR (revocation_type = 'SUBJECT_AUTH_VERSION' AND session_id IS NULL AND subject_id IS NOT NULL AND invalid_through_auth_version IS NOT NULL))
);
CREATE INDEX product_auth_session ON gigalibs_product_catalogue.auth_revocation_events (tenant_id, session_id) WHERE revocation_type = 'SESSION';
CREATE INDEX product_auth_subject ON gigalibs_product_catalogue.auth_revocation_events (tenant_id, subject_id, invalid_through_auth_version) WHERE revocation_type = 'SUBJECT_AUTH_VERSION';

CREATE TABLE gigalibs_product_catalogue.audit_events (
  id varchar(64) PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  actor_subject varchar(128) NOT NULL,
  action varchar(128) NOT NULL,
  entity_type varchar(128) NOT NULL,
  entity_id varchar(128),
  correlation_id varchar(128) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_audit_time ON gigalibs_product_catalogue.audit_events (tenant_id, occurred_at DESC);

CREATE TABLE gigalibs_product_catalogue.outbox_events (
  id varchar(64) PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  topic varchar(128) NOT NULL,
  event_type varchar(128) NOT NULL,
  aggregate_type varchar(128) NOT NULL,
  aggregate_id varchar(128) NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  correlation_id varchar(128) NOT NULL,
  causation_id varchar(128),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  payload jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PUBLISHED','FAILED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error_code varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type)
);
CREATE INDEX product_outbox_delivery ON gigalibs_product_catalogue.outbox_events (status, available_at, created_at);

-- WI-OI-109 module-local organization replica. It is populated only by signed kernel module.call jobs.
CREATE TABLE gigalibs_product_catalogue.org_replica_versions (
  tenant_id varchar(64) NOT NULL, version_id varchar(64) NOT NULL, tree_id varchar(64) NOT NULL,
  tree_kind varchar(16) NOT NULL CHECK (tree_kind IN ('PRIMARY','ALTERNATE')),
  version_number integer NOT NULL CHECK (version_number > 0),
  checksum char(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  status varchar(16) NOT NULL DEFAULT 'RECEIVING' CHECK (status IN ('RECEIVING','READY')),
  unit_count integer CHECK (unit_count >= 0), received_at timestamptz NOT NULL DEFAULT now(), ready_at timestamptz,
  PRIMARY KEY (tenant_id, version_id),
  CHECK ((status = 'READY') = (ready_at IS NOT NULL AND unit_count IS NOT NULL))
);
CREATE TABLE gigalibs_product_catalogue.org_replica_units (
  tenant_id varchar(64) NOT NULL, version_id varchar(64) NOT NULL, unit_id varchar(64) NOT NULL,
  parent_unit_id varchar(64), code varchar(64) NOT NULL, name varchar(200) NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0), status varchar(16) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  holds_records boolean NOT NULL, type_code varchar(40) NOT NULL,
  PRIMARY KEY (tenant_id, version_id, unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_product_catalogue.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);
CREATE TABLE gigalibs_product_catalogue.org_replica_closure (
  tenant_id varchar(64) NOT NULL, version_id varchar(64) NOT NULL,
  ancestor_unit_id varchar(64) NOT NULL, descendant_unit_id varchar(64) NOT NULL,
  depth smallint NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_product_catalogue.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);
CREATE INDEX product_org_descendant ON gigalibs_product_catalogue.org_replica_closure (tenant_id, version_id, descendant_unit_id);

CREATE FUNCTION gigalibs_product_catalogue.require_catalogue_draft() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE state text;
BEGIN
  SELECT status INTO state FROM gigalibs_product_catalogue.catalogue_versions
   WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
     AND id = COALESCE(NEW.catalogue_version_id, OLD.catalogue_version_id);
  IF state IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Published catalogue versions are immutable' USING ERRCODE = '55000'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER catalogue_entries_draft_only BEFORE INSERT OR UPDATE OR DELETE ON gigalibs_product_catalogue.catalogue_entries
FOR EACH ROW EXECUTE FUNCTION gigalibs_product_catalogue.require_catalogue_draft();

CREATE FUNCTION gigalibs_product_catalogue.require_price_draft() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE state text;
BEGIN
  SELECT status INTO state FROM gigalibs_product_catalogue.price_list_versions
   WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
     AND id = COALESCE(NEW.price_list_version_id, OLD.price_list_version_id);
  IF state IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Activated price-list versions are immutable' USING ERRCODE = '55000'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER product_prices_draft_only BEFORE INSERT OR UPDATE OR DELETE ON gigalibs_product_catalogue.product_prices
FOR EACH ROW EXECUTE FUNCTION gigalibs_product_catalogue.require_price_draft();

DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'uom_definitions','product_categories','products','product_org_availability','uom_conversions','attribute_definitions','product_attribute_values',
    'catalogues','catalogue_versions','catalogue_entries','price_lists','price_list_versions','product_prices',
    'product_reference_mappings','consumer_snapshots','idempotency_records','auth_revocation_events','audit_events','outbox_events',
    'org_replica_versions','org_replica_units','org_replica_closure'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_product_catalogue.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_product_catalogue.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_product_catalogue.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation', relation
    );
  END LOOP;
END $$;

INSERT INTO gigalibs_product_catalogue.schema_migrations (version, name)
VALUES (1, '000001_product_catalogue_foundation');

COMMIT;
