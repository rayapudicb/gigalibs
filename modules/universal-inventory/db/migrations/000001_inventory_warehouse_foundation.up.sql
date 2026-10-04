-- WI-OI-091 / ADR-0022: Universal Inventory and Warehouse module-owned persistence. Forward-only.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS gigalibs_inventory;

CREATE TABLE gigalibs_inventory.schema_migrations (
  version bigint PRIMARY KEY CHECK (version > 0),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 200),
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

-- Warehouses
CREATE TABLE gigalibs_inventory.warehouses (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  code varchar(50) NOT NULL,
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  description varchar(2000),
  warehouse_type varchar(24) NOT NULL CHECK (warehouse_type IN ('PHYSICAL','VIRTUAL','TRANSIT','CONSIGNMENT','QUARANTINE','VAN_STOCK')),
  org_unit_id varchar(64),
  place_id varchar(64),
  address varchar(500),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by varchar(128) NOT NULL,
  updated_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);
CREATE INDEX warehouses_tenant_active ON gigalibs_inventory.warehouses (tenant_id, active);
CREATE INDEX warehouses_tenant_org ON gigalibs_inventory.warehouses (tenant_id, org_unit_id);

-- Locations (Zones, Aisles, Racks, Shelves, Bins, Staging bays)
CREATE TABLE gigalibs_inventory.locations (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  warehouse_id uuid NOT NULL,
  code varchar(50) NOT NULL,
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  location_type varchar(24) NOT NULL CHECK (location_type IN ('RECEIVING','STORAGE','PICKING','STAGING','PACKING','SHIPPING','QUARANTINE','INSPECTION','SCRAP','TRANSIT')),
  parent_location_id uuid,
  aisle varchar(20),
  rack varchar(20),
  shelf varchar(20),
  bin varchar(20),
  barcode varchar(128),
  max_weight_kg numeric(18, 6) CHECK (max_weight_kg IS NULL OR max_weight_kg >= 0),
  max_volume_m3 numeric(18, 6) CHECK (max_volume_m3 IS NULL OR max_volume_m3 >= 0),
  allow_negative boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, warehouse_id, code),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, parent_location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id),
  CHECK (parent_location_id IS NULL OR parent_location_id <> id)
);
CREATE INDEX locations_warehouse_type ON gigalibs_inventory.locations (tenant_id, warehouse_id, location_type, active);
CREATE INDEX locations_barcode ON gigalibs_inventory.locations (tenant_id, barcode) WHERE barcode IS NOT NULL;

-- Inventory Items (behavior referencing Phase 4 product)
CREATE TABLE gigalibs_inventory.inventory_items (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  product_id uuid NOT NULL,
  default_warehouse_id uuid,
  default_location_id uuid,
  is_lot_tracked boolean NOT NULL DEFAULT false,
  is_serial_tracked boolean NOT NULL DEFAULT false,
  shelf_life_days integer CHECK (shelf_life_days IS NULL OR shelf_life_days >= 0),
  reorder_point numeric(18, 6) CHECK (reorder_point IS NULL OR reorder_point >= 0),
  safety_stock numeric(18, 6) CHECK (safety_stock IS NULL OR safety_stock >= 0),
  valuation_method varchar(20) NOT NULL DEFAULT 'STANDARD' CHECK (valuation_method IN ('STANDARD','MOVING_AVERAGE','FIFO')),
  standard_cost_minor numeric(18, 0) NOT NULL DEFAULT 0 CHECK (standard_cost_minor >= 0),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id),
  FOREIGN KEY (tenant_id, default_warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, default_location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id)
);
CREATE INDEX inventory_items_product ON gigalibs_inventory.inventory_items (tenant_id, product_id);

-- Lots
CREATE TABLE gigalibs_inventory.inventory_lots (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  product_id uuid NOT NULL,
  lot_number varchar(100) NOT NULL CHECK (char_length(btrim(lot_number)) > 0),
  batch_code varchar(100),
  supplier_lot_number varchar(100),
  manufactured_date timestamptz,
  expiry_date timestamptz,
  status varchar(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','RESERVED','QUARANTINED','INSPECTION','DAMAGED','BLOCKED','EXPIRED')),
  custom_extensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(custom_extensions) = 'object'),
  manifest_checksum varchar(64),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, lot_number),
  CHECK (expiry_date IS NULL OR manufactured_date IS NULL OR expiry_date >= manufactured_date)
);
CREATE INDEX inventory_lots_product_status ON gigalibs_inventory.inventory_lots (tenant_id, product_id, status);

-- Serials
CREATE TABLE gigalibs_inventory.inventory_serials (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  product_id uuid NOT NULL,
  serial_number varchar(100) NOT NULL CHECK (char_length(btrim(serial_number)) > 0),
  lot_id uuid,
  warehouse_id uuid,
  location_id uuid,
  status varchar(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','RESERVED','QUARANTINED','INSPECTION','DAMAGED','BLOCKED','EXPIRED')),
  current_custody_actor_id varchar(128),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, serial_number),
  FOREIGN KEY (tenant_id, lot_id) REFERENCES gigalibs_inventory.inventory_lots (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id)
);
CREATE INDEX inventory_serials_lookup ON gigalibs_inventory.inventory_serials (tenant_id, product_id, serial_number);

-- Stock Ledger Transactions (Immutable Headers)
CREATE TABLE gigalibs_inventory.stock_ledger_transactions (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  transaction_number varchar(64) NOT NULL,
  document_type varchar(50) NOT NULL,
  document_reference_id varchar(128),
  reason varchar(32) NOT NULL CHECK (reason IN ('RECEIPT','PUTAWAY','TRANSFER','RESERVE','RELEASE','PICK','STAGE','ISSUE','RETURN','COUNT_GAIN','COUNT_LOSS','ADJUSTMENT','SCRAP','STATUS_CHANGE')),
  correlation_id varchar(128) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  posted_by varchar(128) NOT NULL,
  posted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, transaction_number),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX stock_ledger_tx_posted ON gigalibs_inventory.stock_ledger_transactions (tenant_id, posted_at);

-- Stock Ledger Entries (Immutable Balanced Lines)
CREATE TABLE gigalibs_inventory.stock_ledger_entries (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  transaction_id uuid NOT NULL,
  direction varchar(10) NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  base_quantity numeric(18, 6) NOT NULL CHECK (base_quantity > 0),
  lot_id uuid,
  serial_id uuid,
  stock_status varchar(20) NOT NULL CHECK (stock_status IN ('AVAILABLE','RESERVED','QUARANTINED','INSPECTION','DAMAGED','BLOCKED','EXPIRED')),
  unit_cost_minor numeric(18, 0),
  total_cost_minor numeric(18, 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, transaction_id) REFERENCES gigalibs_inventory.stock_ledger_transactions (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id),
  FOREIGN KEY (tenant_id, lot_id) REFERENCES gigalibs_inventory.inventory_lots (tenant_id, id),
  FOREIGN KEY (tenant_id, serial_id) REFERENCES gigalibs_inventory.inventory_serials (tenant_id, id)
);
CREATE INDEX stock_ledger_entries_product ON gigalibs_inventory.stock_ledger_entries (tenant_id, product_id, location_id);
CREATE INDEX stock_ledger_entries_tx ON gigalibs_inventory.stock_ledger_entries (tenant_id, transaction_id);

-- Stock Balances (Rebuildable Materialized Projections)
CREATE TABLE gigalibs_inventory.stock_balances (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  lot_id uuid,
  serial_id uuid,
  stock_status varchar(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (stock_status IN ('AVAILABLE','RESERVED','QUARANTINED','INSPECTION','DAMAGED','BLOCKED','EXPIRED')),
  on_hand_quantity numeric(18, 6) NOT NULL DEFAULT 0,
  reserved_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  available_quantity numeric(18, 6) NOT NULL DEFAULT 0,
  last_movement_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id),
  FOREIGN KEY (tenant_id, lot_id) REFERENCES gigalibs_inventory.inventory_lots (tenant_id, id),
  FOREIGN KEY (tenant_id, serial_id) REFERENCES gigalibs_inventory.inventory_serials (tenant_id, id),
  CHECK (available_quantity = on_hand_quantity - reserved_quantity)
);
CREATE UNIQUE INDEX stock_balances_unique_dim ON gigalibs_inventory.stock_balances (
  tenant_id, warehouse_id, location_id, product_id, uom_id,
  (COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  (COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  stock_status
);
CREATE INDEX stock_balances_product_avail ON gigalibs_inventory.stock_balances (tenant_id, product_id, available_quantity);

-- Reservations
CREATE TABLE gigalibs_inventory.inventory_reservations (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  reservation_type varchar(16) NOT NULL CHECK (reservation_type IN ('HARD','SOFT')),
  demand_type varchar(24) NOT NULL CHECK (demand_type IN ('WORK_ORDER','SALES_ORDER','TRANSFER','PROJECT')),
  demand_reference_id varchar(128) NOT NULL,
  demand_line_id varchar(128),
  warehouse_id uuid NOT NULL,
  location_id uuid,
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  fulfilled_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING','ACTIVE','FULFILLED','RELEASED','CANCELLED')),
  expiry_date timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id),
  CHECK (fulfilled_quantity <= quantity)
);
CREATE INDEX reservations_demand_idx ON gigalibs_inventory.inventory_reservations (tenant_id, demand_type, demand_reference_id, status);

-- Inbound Receipts
CREATE TABLE gigalibs_inventory.receipts (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  receipt_number varchar(64) NOT NULL,
  warehouse_id uuid NOT NULL,
  supplier_party_id uuid,
  carrier_party_id uuid,
  external_document_reference varchar(128),
  status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','EXPECTED','RECEIVING','COMPLETED','CANCELLED')),
  notes varchar(2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, receipt_number),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id)
);
CREATE INDEX receipts_status_idx ON gigalibs_inventory.receipts (tenant_id, status);

CREATE TABLE gigalibs_inventory.receipt_lines (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  receipt_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  expected_quantity numeric(18, 6) NOT NULL CHECK (expected_quantity >= 0),
  received_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  target_location_id uuid,
  lot_number varchar(100),
  expiry_date timestamptz,
  inspection_status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (inspection_status IN ('PENDING','PASSED','FAILED','QUARANTINED')),
  custom_extensions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(custom_extensions) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, receipt_id, line_number),
  FOREIGN KEY (tenant_id, receipt_id) REFERENCES gigalibs_inventory.receipts (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, target_location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id)
);

-- Transfers
CREATE TABLE gigalibs_inventory.transfers (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  transfer_number varchar(64) NOT NULL,
  source_warehouse_id uuid NOT NULL,
  target_warehouse_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REQUESTED','ALLOCATED','PICKED','IN_TRANSIT','RECEIVED','CANCELLED')),
  notes varchar(2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, transfer_number),
  FOREIGN KEY (tenant_id, source_warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, target_warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id)
);

CREATE TABLE gigalibs_inventory.transfer_lines (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  transfer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  source_location_id uuid NOT NULL,
  target_location_id uuid NOT NULL,
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  lot_id uuid,
  serial_id uuid,
  picked_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  received_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, transfer_id) REFERENCES gigalibs_inventory.transfers (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, source_location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id),
  FOREIGN KEY (tenant_id, target_location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id),
  FOREIGN KEY (tenant_id, lot_id) REFERENCES gigalibs_inventory.inventory_lots (tenant_id, id),
  FOREIGN KEY (tenant_id, serial_id) REFERENCES gigalibs_inventory.inventory_serials (tenant_id, id)
);

-- Kits & Staging (CMMS Maintenance Handshake)
CREATE TABLE gigalibs_inventory.kits (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  kit_number varchar(64) NOT NULL,
  work_order_id varchar(128) NOT NULL,
  work_order_task_id varchar(128),
  warehouse_id uuid NOT NULL,
  staging_location_id uuid,
  assigned_technician_id varchar(128),
  status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ALLOCATED','PICKING','STAGED','ISSUED','RETURNED','CLOSED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, kit_number),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, staging_location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id)
);
CREATE INDEX kits_work_order_idx ON gigalibs_inventory.kits (tenant_id, work_order_id, status);

CREATE TABLE gigalibs_inventory.kit_lines (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  kit_id uuid NOT NULL,
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  requested_quantity numeric(18, 6) NOT NULL CHECK (requested_quantity > 0),
  picked_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  issued_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),
  returned_quantity numeric(18, 6) NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  lot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, kit_id) REFERENCES gigalibs_inventory.kits (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, lot_id) REFERENCES gigalibs_inventory.inventory_lots (tenant_id, id)
);

-- Cycle Counts & Adjustments
CREATE TABLE gigalibs_inventory.count_plans (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  plan_number varchar(64) NOT NULL,
  name varchar(200) NOT NULL CHECK (char_length(btrim(name)) > 0),
  plan_type varchar(24) NOT NULL CHECK (plan_type IN ('CYCLE','ANNUAL','SPOT','EVENT_TRIGGERED')),
  warehouse_id uuid NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','SUBMITTED','RECOUNT_REQUESTED','APPROVED','CANCELLED')),
  is_blind_count boolean NOT NULL DEFAULT true,
  allow_movements_during_count boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, plan_number),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id)
);

CREATE TABLE gigalibs_inventory.count_entries (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  count_plan_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  lot_id uuid,
  serial_id uuid,
  snapshot_quantity numeric(18, 6) NOT NULL,
  counted_quantity numeric(18, 6) NOT NULL,
  variance_quantity numeric(18, 6) NOT NULL,
  counted_by varchar(128) NOT NULL,
  counted_at timestamptz NOT NULL,
  recount_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, count_plan_id) REFERENCES gigalibs_inventory.count_plans (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id),
  FOREIGN KEY (tenant_id, lot_id) REFERENCES gigalibs_inventory.inventory_lots (tenant_id, id),
  FOREIGN KEY (tenant_id, serial_id) REFERENCES gigalibs_inventory.inventory_serials (tenant_id, id)
);

-- Adjustments (Maker-Checker Variance Approvals)
CREATE TABLE gigalibs_inventory.inventory_adjustments (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  adjustment_number varchar(64) NOT NULL,
  count_plan_id uuid,
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  product_id uuid NOT NULL,
  lot_id uuid,
  serial_id uuid,
  quantity numeric(18, 6) NOT NULL,
  reason varchar(32) NOT NULL CHECK (reason IN ('COUNT_GAIN','COUNT_LOSS','ADJUSTMENT','SCRAP')),
  status varchar(24) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL','APPROVED','REJECTED','POSTED')),
  maker_actor_id varchar(128) NOT NULL,
  approver_actor_id varchar(128),
  approved_at timestamptz,
  notes varchar(2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, adjustment_number),
  FOREIGN KEY (tenant_id, count_plan_id) REFERENCES gigalibs_inventory.count_plans (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES gigalibs_inventory.warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES gigalibs_inventory.locations (tenant_id, id),
  FOREIGN KEY (tenant_id, lot_id) REFERENCES gigalibs_inventory.inventory_lots (tenant_id, id),
  FOREIGN KEY (tenant_id, serial_id) REFERENCES gigalibs_inventory.inventory_serials (tenant_id, id),
  CHECK (approver_actor_id IS NULL OR approver_actor_id <> maker_actor_id)
);

-- Reference Mappings for External Systems (SAP / Maximo / Oracle coexistence)
CREATE TABLE gigalibs_inventory.inventory_reference_mappings (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  source_system varchar(100) NOT NULL,
  source_key varchar(255) NOT NULL,
  entity_type varchar(32) NOT NULL CHECK (entity_type IN ('WAREHOUSE','LOCATION','ITEM','LOT','SERIAL','RECEIPT')),
  gigalibs_entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_system, source_key)
);

-- Idempotency Records
CREATE TABLE gigalibs_inventory.idempotency_records (
  tenant_id varchar(64) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  resource_id varchar(128) NOT NULL,
  action varchar(64) NOT NULL,
  response_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

-- Auth Revocation Events
CREATE TABLE gigalibs_inventory.auth_revocation_events (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  actor_id varchar(128) NOT NULL,
  token_id varchar(128),
  reason varchar(200),
  revoked_at timestamptz NOT NULL DEFAULT now()
);

-- Audit Events
CREATE TABLE gigalibs_inventory.audit_events (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  entity_type varchar(64) NOT NULL,
  entity_id uuid NOT NULL,
  action varchar(32) NOT NULL,
  actor_id varchar(128) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Outbox Events
CREATE TABLE gigalibs_inventory.outbox_events (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  event_type varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PUBLISHED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_status_idx ON gigalibs_inventory.outbox_events (tenant_id, status);

-- Organization Replicas (WI-OI-109 Scoping)
CREATE TABLE gigalibs_inventory.org_replica_versions (
  tenant_id varchar(64) NOT NULL, version_id varchar(64) NOT NULL, tree_id varchar(64) NOT NULL,
  tree_kind varchar(16) NOT NULL CHECK (tree_kind IN ('PRIMARY','ALTERNATE')),
  version_number integer NOT NULL CHECK (version_number > 0),
  checksum char(71) NOT NULL CHECK (checksum ~ '^sha256:[0-9a-f]{64}$'),
  status varchar(16) NOT NULL DEFAULT 'RECEIVING' CHECK (status IN ('RECEIVING','READY')),
  unit_count integer CHECK (unit_count >= 0), received_at timestamptz NOT NULL DEFAULT now(), ready_at timestamptz,
  PRIMARY KEY (tenant_id, version_id),
  CHECK ((status = 'READY') = (ready_at IS NOT NULL AND unit_count IS NOT NULL))
);

CREATE TABLE gigalibs_inventory.org_replica_units (
  tenant_id varchar(64) NOT NULL, version_id varchar(64) NOT NULL, unit_id varchar(64) NOT NULL,
  parent_unit_id varchar(64), code varchar(64) NOT NULL, name varchar(200) NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0), status varchar(16) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  holds_records boolean NOT NULL, type_code varchar(40) NOT NULL,
  PRIMARY KEY (tenant_id, version_id, unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_inventory.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE,
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> unit_id)
);

CREATE TABLE gigalibs_inventory.org_replica_closure (
  tenant_id varchar(64) NOT NULL, version_id varchar(64) NOT NULL,
  ancestor_unit_id varchar(64) NOT NULL, descendant_unit_id varchar(64) NOT NULL,
  depth smallint NOT NULL CHECK (depth BETWEEN 0 AND 16),
  PRIMARY KEY (tenant_id, version_id, ancestor_unit_id, descendant_unit_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES gigalibs_inventory.org_replica_versions (tenant_id, version_id) ON DELETE CASCADE
);
CREATE INDEX inventory_org_descendant ON gigalibs_inventory.org_replica_closure (tenant_id, version_id, descendant_unit_id);

-- Immutable Ledger Trigger
CREATE FUNCTION gigalibs_inventory.prevent_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Stock ledger entries and transactions are strictly immutable' USING ERRCODE = '55000';
END $$;

CREATE TRIGGER stock_ledger_entries_immutable BEFORE UPDATE OR DELETE ON gigalibs_inventory.stock_ledger_entries
FOR EACH ROW EXECUTE FUNCTION gigalibs_inventory.prevent_ledger_mutation();

CREATE TRIGGER stock_ledger_tx_immutable BEFORE UPDATE OR DELETE ON gigalibs_inventory.stock_ledger_transactions
FOR EACH ROW EXECUTE FUNCTION gigalibs_inventory.prevent_ledger_mutation();

-- Enable and Force RLS on all tables
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'warehouses','locations','inventory_items','inventory_lots','inventory_serials',
    'stock_ledger_transactions','stock_ledger_entries','stock_balances','inventory_reservations',
    'receipts','receipt_lines','transfers','transfer_lines','kits','kit_lines',
    'count_plans','count_entries','inventory_adjustments','inventory_reference_mappings',
    'idempotency_records','auth_revocation_events','audit_events','outbox_events',
    'org_replica_versions','org_replica_units','org_replica_closure'
  ] LOOP
    EXECUTE format('ALTER TABLE gigalibs_inventory.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE gigalibs_inventory.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_inventory.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), ''''))',
      relation || '_tenant_isolation', relation
    );
  END LOOP;
END $$;

INSERT INTO gigalibs_inventory.schema_migrations (version, name)
VALUES (1, '000001_inventory_warehouse_foundation');

COMMIT;
