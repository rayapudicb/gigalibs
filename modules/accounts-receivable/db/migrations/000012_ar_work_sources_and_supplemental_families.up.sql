-- Migration 000012: AR Work Sources, Billable Source Records & Supplemental Invoice Families
BEGIN;

-- ─── Work Sources (Events, Projects, Cases, Contracts) ──────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_ar.work_sources (
  tenant_id        uuid         NOT NULL,
  id               uuid         NOT NULL,
  customer_id      uuid         NOT NULL,
  source_type      text         NOT NULL,
  source_reference text         NOT NULL,
  name             text         NOT NULL,
  status           text         NOT NULL DEFAULT 'ACTIVE',
  metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  updated_at       timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT work_sources_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT work_sources_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES gigalibs_ar.customers (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT work_sources_source_type_check CHECK (source_type IN ('EVENT', 'PROJECT', 'CASE', 'CONTRACT', 'ORDER')),
  CONSTRAINT work_sources_status_check CHECK (status IN ('ACTIVE', 'CLOSED', 'ARCHIVED')),
  CONSTRAINT work_sources_reference_check CHECK (char_length(btrim(source_reference)) BETWEEN 1 AND 100),
  CONSTRAINT work_sources_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT work_sources_reference_unique UNIQUE (tenant_id, source_type, source_reference)
);

CREATE INDEX IF NOT EXISTS work_sources_customer_idx
  ON gigalibs_ar.work_sources (tenant_id, customer_id, status);

ALTER TABLE gigalibs_ar.work_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.work_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY work_sources_tenant_policy ON gigalibs_ar.work_sources
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Billable Source Records ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_ar.billable_source_records (
  tenant_id           uuid           NOT NULL,
  id                  uuid           NOT NULL,
  work_source_id      uuid           NOT NULL,
  external_record_id  text           NOT NULL,
  resource_name       text           NOT NULL,
  resource_role       text           NOT NULL,
  category            text           NOT NULL,
  quantity            numeric(20, 6) NOT NULL,
  raw_cost_minor      bigint         NOT NULL,
  markup_percent_bp   integer        NOT NULL DEFAULT 0,
  markup_flat_minor   bigint         NOT NULL DEFAULT 0,
  billed_rate_minor   bigint         NOT NULL,
  billed_total_minor  bigint         NOT NULL,
  approval_status     text           NOT NULL DEFAULT 'PENDING',
  billing_status      text           NOT NULL DEFAULT 'UNBILLED',
  reserved_invoice_id uuid,
  invoiced_invoice_id uuid,
  approved_by         text,
  approved_at         timestamptz,
  created_at          timestamptz    NOT NULL DEFAULT transaction_timestamp(),
  updated_at          timestamptz    NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT billable_records_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT billable_records_work_source_fk FOREIGN KEY (tenant_id, work_source_id)
    REFERENCES gigalibs_ar.work_sources (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT billable_records_quantity_check CHECK (quantity > 0),
  CONSTRAINT billable_records_amounts_check CHECK (
    raw_cost_minor >= 0 AND markup_percent_bp >= 0 AND markup_flat_minor >= 0 AND
    billed_rate_minor >= 0 AND billed_total_minor >= 0
  ),
  CONSTRAINT billable_records_approval_check CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT billable_records_billing_check CHECK (billing_status IN ('UNBILLED', 'RESERVED', 'INVOICED')),
  CONSTRAINT billable_records_external_id_unique UNIQUE (tenant_id, work_source_id, external_record_id)
);

CREATE INDEX IF NOT EXISTS billable_records_lookup_idx
  ON gigalibs_ar.billable_source_records (tenant_id, work_source_id, approval_status, billing_status);

ALTER TABLE gigalibs_ar.billable_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.billable_source_records FORCE ROW LEVEL SECURITY;
CREATE POLICY billable_records_tenant_policy ON gigalibs_ar.billable_source_records
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Invoice Families (Supplemental & Replacement Lineage) ──────────────────
CREATE TABLE IF NOT EXISTS gigalibs_ar.invoice_families (
  tenant_id           uuid         NOT NULL,
  id                  uuid         NOT NULL,
  work_source_id      uuid         NOT NULL,
  invoice_id          uuid         NOT NULL,
  sequence_number     integer      NOT NULL,
  family_role         text         NOT NULL,
  replaces_invoice_id uuid,
  record_count        integer      NOT NULL,
  created_at          timestamptz  NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT invoice_families_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_ar.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT invoice_families_work_source_fk FOREIGN KEY (tenant_id, work_source_id)
    REFERENCES gigalibs_ar.work_sources (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoice_families_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES gigalibs_ar.invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT invoice_families_sequence_check CHECK (sequence_number >= 0),
  CONSTRAINT invoice_families_role_check CHECK (family_role IN ('ORIGINAL', 'SUPPLEMENTAL', 'REPLACEMENT')),
  CONSTRAINT invoice_families_record_count_check CHECK (record_count > 0),
  CONSTRAINT invoice_families_source_invoice_unique UNIQUE (tenant_id, work_source_id, invoice_id),
  CONSTRAINT invoice_families_sequence_unique UNIQUE (tenant_id, work_source_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS invoice_families_lookup_idx
  ON gigalibs_ar.invoice_families (tenant_id, work_source_id, sequence_number ASC);

ALTER TABLE gigalibs_ar.invoice_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_ar.invoice_families FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_families_tenant_policy ON gigalibs_ar.invoice_families
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ─── Runtime Grants ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON TABLE
  gigalibs_ar.work_sources,
  gigalibs_ar.billable_source_records,
  gigalibs_ar.invoice_families
TO gigalibs_ar_api_runtime;

-- ─── Schema Migration Record ─────────────────────────────────────────────────
INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (12, '000012_ar_work_sources_and_supplemental_families')
ON CONFLICT (version) DO NOTHING;

COMMIT;
