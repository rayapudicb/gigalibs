-- WI-OI-042 / CMMS Wave-7: purchase_orders + po_line_items
-- Satisfies FK reference in part_transactions.po_id (migration 000001)
BEGIN;

-- ─── purchase_orders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.purchase_orders (
  tenant_id     uuid                     NOT NULL,
  id            uuid                     NOT NULL,
  vendor_id     uuid                     NOT NULL,
  department_id uuid,                               -- optional dept scope
  status        text                     NOT NULL DEFAULT 'DRAFT',
  reference     text,
  notes         text,
  currency_code character(3)             NOT NULL DEFAULT 'USD',
  total_cost    numeric(14,4),
  ordered_at    timestamptz,
  received_at   timestamptz,
  version       integer                  NOT NULL DEFAULT 1,
  created_by    uuid                     NOT NULL,
  created_at    timestamptz              NOT NULL DEFAULT transaction_timestamp(),
  updated_at    timestamptz              NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT po_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT po_vendor_fk FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES gigalibs_cmms.vendors (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT po_status_check CHECK (status IN ('DRAFT','SENT','PARTIAL','RECEIVED','CANCELLED')),
  CONSTRAINT po_version_check CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_cmms_po_vendor   ON gigalibs_cmms.purchase_orders (tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_cmms_po_status   ON gigalibs_cmms.purchase_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cmms_po_dept     ON gigalibs_cmms.purchase_orders (tenant_id, department_id)
  WHERE department_id IS NOT NULL;

ALTER TABLE gigalibs_cmms.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.purchase_orders FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_po_tenant ON gigalibs_cmms.purchase_orders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── po_line_items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gigalibs_cmms.po_line_items (
  tenant_id          uuid           NOT NULL,
  id                 uuid           NOT NULL,
  po_id              uuid           NOT NULL,
  part_id            uuid           NOT NULL,
  quantity_ordered   numeric(12,4)  NOT NULL CHECK (quantity_ordered > 0),
  quantity_received  numeric(12,4)  NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost          numeric(12,4),
  notes              text,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT poli_po_fk   FOREIGN KEY (tenant_id, po_id)   REFERENCES gigalibs_cmms.purchase_orders (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT poli_part_fk FOREIGN KEY (tenant_id, part_id) REFERENCES gigalibs_cmms.parts (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_cmms_poli_po   ON gigalibs_cmms.po_line_items (tenant_id, po_id);
CREATE INDEX IF NOT EXISTS idx_cmms_poli_part ON gigalibs_cmms.po_line_items (tenant_id, part_id);

ALTER TABLE gigalibs_cmms.po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.po_line_items FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_poli_tenant ON gigalibs_cmms.po_line_items
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ─── schema_migrations ledger ─────────────────────────────────────────────────
INSERT INTO gigalibs_cmms.schema_migrations (version, name, applied_at)
VALUES (6, 'purchase_orders', transaction_timestamp())
ON CONFLICT (version) DO NOTHING;

COMMIT;
