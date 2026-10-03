-- WI-EAM-005: MRO Storeroom Logistics & Multi-Warehouse Bin Tracking (Maximo Parity)

-- 1. Storerooms / Warehouses
CREATE TABLE gigalibs_cmms.cmms_storerooms (
  tenant_id       gigalibs_cmms.tenant_ref NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  code            text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description     text CHECK (char_length(description) <= 1000),
  site_ref        uuid,
  is_active       boolean NOT NULL DEFAULT true,
  version         integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by      gigalibs_cmms.principal_ref NOT NULL,
  updated_by      gigalibs_cmms.principal_ref NOT NULL,
  correlation_id  text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT cmms_storerooms_code_unique UNIQUE (tenant_id, code)
);

ALTER TABLE gigalibs_cmms.cmms_storerooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_storerooms FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_storerooms_tenant_isolation ON gigalibs_cmms.cmms_storerooms
  AS RESTRICTIVE
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX cmms_storerooms_site ON gigalibs_cmms.cmms_storerooms (tenant_id, site_ref);

-- 2. Multi-Warehouse Bin Balances (Parts per Storeroom / Bin)
CREATE TABLE gigalibs_cmms.cmms_part_balances (
  tenant_id        gigalibs_cmms.tenant_ref NOT NULL,
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  part_id          uuid NOT NULL,
  storeroom_id     uuid NOT NULL,
  bin_location     text NOT NULL DEFAULT 'DEFAULT' CHECK (char_length(bin_location) BETWEEN 1 AND 120),
  quantity_on_hand numeric(14, 3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  min_quantity     numeric(14, 3) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  reorder_point    numeric(14, 3) CHECK (reorder_point >= 0),
  version          integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT cmms_part_balances_unique UNIQUE (tenant_id, part_id, storeroom_id, bin_location),
  CONSTRAINT cmms_part_balances_part_fk FOREIGN KEY (tenant_id, part_id)
    REFERENCES gigalibs_cmms.parts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cmms_part_balances_storeroom_fk FOREIGN KEY (tenant_id, storeroom_id)
    REFERENCES gigalibs_cmms.cmms_storerooms (tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE gigalibs_cmms.cmms_part_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.cmms_part_balances FORCE ROW LEVEL SECURITY;

CREATE POLICY cmms_part_balances_tenant_isolation ON gigalibs_cmms.cmms_part_balances
  AS RESTRICTIVE
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE INDEX cmms_part_balances_part ON gigalibs_cmms.cmms_part_balances (tenant_id, part_id);
CREATE INDEX cmms_part_balances_storeroom ON gigalibs_cmms.cmms_part_balances (tenant_id, storeroom_id);

-- 3. Extend stock_movements with Storeroom & Bin tracking
ALTER TABLE gigalibs_cmms.stock_movements
  ADD COLUMN IF NOT EXISTS storeroom_id uuid,
  ADD COLUMN IF NOT EXISTS bin_location text,
  ADD CONSTRAINT stock_movements_storeroom_fk FOREIGN KEY (tenant_id, storeroom_id)
    REFERENCES gigalibs_cmms.cmms_storerooms (tenant_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_movements_storeroom ON gigalibs_cmms.stock_movements (tenant_id, storeroom_id);
