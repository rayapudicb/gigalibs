-- WI-OI-128 S1: RMA domain tables, Orders linkage, anti-double-process guard.
BEGIN;

CREATE TABLE gigalibs_universal_returns.rma_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  code varchar(32) NOT NULL,
  name varchar(128) NOT NULL,
  description varchar(500),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE gigalibs_universal_returns.rma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  rma_number varchar(64) NOT NULL,
  rma_type_id uuid NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'AUTHORIZED', 'RECEIVING', 'INSPECTING', 'DISPOSED', 'CLOSED', 'CANCELLED')),
  sales_order_id uuid,
  customer_invoice_id uuid,
  customer_party_id uuid NOT NULL,
  orders_return_id uuid,
  reason text NOT NULL,
  authorized_by varchar(128),
  authorized_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, rma_number),
  UNIQUE (tenant_id, orders_return_id),
  FOREIGN KEY (tenant_id, rma_type_id) REFERENCES gigalibs_universal_returns.rma_types (tenant_id, id)
);

CREATE INDEX rma_tenant_status ON gigalibs_universal_returns.rma (tenant_id, status, updated_at DESC);

CREATE TABLE gigalibs_universal_returns.rma_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  rma_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  sales_order_line_id uuid,
  customer_invoice_line_id uuid,
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  requested_quantity numeric(18, 6) NOT NULL CHECK (requested_quantity > 0),
  authorized_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (authorized_quantity >= 0),
  received_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  invoiced_quantity_cap numeric(18, 6) NOT NULL CHECK (invoiced_quantity_cap >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, rma_id, line_number),
  FOREIGN KEY (tenant_id, rma_id) REFERENCES gigalibs_universal_returns.rma (tenant_id, id) ON DELETE CASCADE,
  CHECK (requested_quantity <= invoiced_quantity_cap),
  CHECK (authorized_quantity <= requested_quantity),
  CHECK (received_quantity <= authorized_quantity)
);

CREATE TABLE gigalibs_universal_returns.dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  rma_line_id uuid NOT NULL,
  disposition_code varchar(32) NOT NULL CHECK (disposition_code IN ('RESTOCK', 'QUARANTINE', 'SCRAP')),
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  inspected_by varchar(128) NOT NULL,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  inventory_receipt_id uuid,
  gl_journal_id uuid,
  credit_memo_requested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, rma_line_id) REFERENCES gigalibs_universal_returns.rma_lines (tenant_id, id) ON DELETE CASCADE
);

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['rma_types', 'rma', 'rma_lines', 'dispositions'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_universal_returns.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_universal_returns.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_universal_returns.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation',
      relation
    );
  END LOOP;
END
$$;

INSERT INTO gigalibs_universal_returns.schema_migrations (version, name)
VALUES (2, '000002_rma_domain')
ON CONFLICT (version) DO NOTHING;

COMMIT;
