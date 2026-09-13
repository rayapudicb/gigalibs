-- Phase 10: Universal runtime form definitions and custom field definitions.
--
-- Provides two tables:
--   form_definitions      — per-(form_key, tenant_id) JSON schema; NULL tenant_id = platform base
--   custom_field_definitions — per-(tenant_id, entity_type) field registry
--
-- Adds custom_fields JSONB to every entity table that participates in data-entry forms
-- (invoice_drafts, customers, credit_notes, payment_records).

BEGIN;

-- ─── form_definitions ─────────────────────────────────────────────────────────

CREATE TABLE gigalibs_ar.form_definitions (
  id              uuid         NOT NULL DEFAULT gen_random_uuid(),
  form_key        varchar(100) NOT NULL,
  -- NULL → platform default; non-NULL → tenant extension
  tenant_id       uuid,
  definition      jsonb        NOT NULL,
  version         integer      NOT NULL DEFAULT 1,
  -- DRAFT allows editing; PUBLISHED is the live version users see
  status          varchar(20)  NOT NULL DEFAULT 'DRAFT',
  published_at    timestamptz,
  published_by    text,
  created_at      timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  updated_at      timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT form_definitions_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES gigalibs_ar.module_tenants (id) ON DELETE CASCADE,
  CONSTRAINT form_definitions_status_check
    CHECK (status IN ('DRAFT', 'PUBLISHED')),
  CONSTRAINT form_definitions_form_key_check
    CHECK (char_length(btrim(form_key)) BETWEEN 1 AND 100),
  CONSTRAINT form_definitions_version_check
    CHECK (version > 0),
  CONSTRAINT form_definitions_published_by_check
    CHECK (published_by IS NULL OR char_length(published_by) BETWEEN 1 AND 255)
);

-- At most one PUBLISHED version per (form_key, tenant_id) pair
CREATE UNIQUE INDEX form_definitions_published_unique_idx
  ON gigalibs_ar.form_definitions (form_key, tenant_id)
  WHERE status = 'PUBLISHED';

-- Lookup: get all definitions for a form_key regardless of tenant
CREATE INDEX form_definitions_form_key_idx
  ON gigalibs_ar.form_definitions (form_key, status);

-- RLS: tenants can only read their own layer (or platform layer)
ALTER TABLE gigalibs_ar.form_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.form_definitions FORCE ROW LEVEL SECURITY;

CREATE POLICY form_definitions_tenant_policy ON gigalibs_ar.form_definitions
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON TABLE gigalibs_ar.form_definitions
  TO gigalibs_ar_api_runtime;

-- ─── custom_field_definitions ─────────────────────────────────────────────────

CREATE TABLE gigalibs_ar.custom_field_definitions (
  id              uuid         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid         NOT NULL,
  -- entity type: 'ar.invoice', 'ar.customer', 'ar.credit-note', 'ar.payment'
  entity_type     varchar(100) NOT NULL,
  name            varchar(100) NOT NULL,
  label           varchar(200) NOT NULL,
  -- text | number | boolean | date | select | multi_select | json
  field_type      varchar(50)  NOT NULL,
  required        boolean      NOT NULL DEFAULT false,
  default_value   jsonb,
  options         jsonb,       -- [{label,value}] for select/multi_select
  validation_rule jsonb,       -- {min?,max?,regex?}
  position        integer      NOT NULL DEFAULT 0,
  created_at      timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  updated_at      timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (id),
  CONSTRAINT custom_field_defs_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES gigalibs_ar.module_tenants (id) ON DELETE CASCADE,
  CONSTRAINT custom_field_defs_name_unique
    UNIQUE (tenant_id, entity_type, name),
  CONSTRAINT custom_field_defs_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT custom_field_defs_label_check
    CHECK (char_length(btrim(label)) BETWEEN 1 AND 200),
  CONSTRAINT custom_field_defs_type_check
    CHECK (field_type IN ('text','number','boolean','date','select','multi_select','json')),
  CONSTRAINT custom_field_defs_position_check
    CHECK (position >= 0)
);

CREATE INDEX custom_field_defs_tenant_entity_idx
  ON gigalibs_ar.custom_field_definitions (tenant_id, entity_type);

ALTER TABLE gigalibs_ar.custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.custom_field_definitions FORCE ROW LEVEL SECURITY;

CREATE POLICY custom_field_defs_tenant_policy ON gigalibs_ar.custom_field_definitions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gigalibs_ar.custom_field_definitions
  TO gigalibs_ar_api_runtime;

-- ─── custom_fields JSONB columns ─────────────────────────────────────────────
-- Stores tenant-defined custom field values on entity rows.
-- Default '{}' means no custom data; this is additive and never breaks existing queries.

ALTER TABLE gigalibs_ar.invoice_drafts
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE gigalibs_ar.customers
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE gigalibs_ar.credit_notes
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE gigalibs_ar.payment_records
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

-- GIN indexes for jsonb lookups on high-volume tables
CREATE INDEX invoice_drafts_custom_fields_idx
  ON gigalibs_ar.invoice_drafts USING GIN (custom_fields jsonb_path_ops);

CREATE INDEX customers_custom_fields_idx
  ON gigalibs_ar.customers USING GIN (custom_fields jsonb_path_ops);

-- ─── Schema version ──────────────────────────────────────────────────────────
INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (10, '000010_form_definitions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
