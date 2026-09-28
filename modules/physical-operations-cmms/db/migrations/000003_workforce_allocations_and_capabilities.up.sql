BEGIN;

-- ─── 1. WORKFORCE RESOURCES ───────────────────────────────────────────────────
-- Physical entities capable of performing operational work.
-- Industry-agnostic model (no technician, crewing, doctor, rigger jargon).
CREATE TABLE IF NOT EXISTS gigalibs_cmms.workforce_resources (
  tenant_id       uuid NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id         varchar(64),                                    -- Logical reference to Control Plane User
  name            text NOT NULL,
  employment_type text NOT NULL DEFAULT 'FULL_TIME_SALARIED',
  home_lat        numeric(10,7),
  home_lng        numeric(10,7),
  cost_rate_usd   numeric(10,2) NOT NULL DEFAULT 0.00,
  is_active       boolean NOT NULL DEFAULT true,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at      timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT workforce_resources_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT workforce_resources_employment_type_check CHECK (
    employment_type IN (
      'FULL_TIME_SALARIED', 'CONTRACTOR_1099', 'GIG_UNION', 'DAILY_CASUAL',
      'FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'SEASONAL', 'INTERN'
    )
  ),
  CONSTRAINT workforce_resources_cost_rate_check CHECK (cost_rate_usd >= 0),
  CONSTRAINT workforce_resources_version_check CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_cmms_workforce_resources_tenant
  ON gigalibs_cmms.workforce_resources (tenant_id, is_active);

-- ─── 2. RESOURCE CAPABILITIES ────────────────────────────────────────────────
-- Certified skills, licenses, and safety passports with explicit validity dates.
CREATE TABLE IF NOT EXISTS gigalibs_cmms.resource_capabilities (
  tenant_id          uuid NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  resource_id        uuid NOT NULL,
  capability_code    text NOT NULL,
  cert_level         text NOT NULL DEFAULT 'STANDARD',
  valid_from         timestamptz NOT NULL DEFAULT transaction_timestamp(),
  valid_until        timestamptz,
  accreditation_body text,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT capabilities_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT capabilities_resource_fk FOREIGN KEY (tenant_id, resource_id)
    REFERENCES gigalibs_cmms.workforce_resources (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT capabilities_cert_level_check CHECK (
    cert_level IN ('STANDARD', 'ADVANCED', 'MASTER', 'EXPERT')
  ),
  CONSTRAINT capabilities_valid_range_check CHECK (
    valid_until IS NULL OR valid_until >= valid_from
  )
);

CREATE INDEX IF NOT EXISTS idx_cmms_resource_capabilities_lookup
  ON gigalibs_cmms.resource_capabilities (tenant_id, resource_id, capability_code, is_active);

-- ─── 3. RESOURCE ALLOCATIONS ─────────────────────────────────────────────────
-- Locked time-space commitments connecting a resource to an operational task/work order.
CREATE TABLE IF NOT EXISTS gigalibs_cmms.resource_allocations (
  tenant_id               uuid NOT NULL,
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  work_order_id           uuid,                                      -- Optional link to CMMS work order
  resource_id             uuid NOT NULL,
  required_capability_code text,                                     -- Required capability for validation guard
  scheduled_start         timestamptz NOT NULL,
  scheduled_finish        timestamptz NOT NULL,
  actual_start            timestamptz,
  actual_finish           timestamptz,
  status                  text NOT NULL DEFAULT 'DRAFT',
  checkin_lat             numeric(10,7),
  checkin_lng             numeric(10,7),
  version                 integer NOT NULL DEFAULT 1,
  created_at              timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at              timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT allocations_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT allocations_resource_fk FOREIGN KEY (tenant_id, resource_id)
    REFERENCES gigalibs_cmms.workforce_resources (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT allocations_status_check CHECK (
    status IN ('DRAFT', 'CONFIRMED', 'DISPATCHED', 'ON_SITE', 'COMPLETED', 'CANCELLED')
  ),
  CONSTRAINT allocations_schedule_check CHECK (scheduled_finish > scheduled_start),
  CONSTRAINT allocations_version_check CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_cmms_resource_allocations_schedule
  ON gigalibs_cmms.resource_allocations (tenant_id, resource_id, scheduled_start, scheduled_finish);
CREATE INDEX IF NOT EXISTS idx_cmms_resource_allocations_wo
  ON gigalibs_cmms.resource_allocations (tenant_id, work_order_id);

-- ─── 4. ALLOCATION STATUS HISTORY ────────────────────────────────────────────
-- Immutable audit ledger of allocation state transitions.
CREATE TABLE IF NOT EXISTS gigalibs_cmms.allocation_status_history (
  tenant_id       uuid NOT NULL,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  allocation_id   uuid NOT NULL,
  previous_status text,
  new_status      text NOT NULL,
  changed_by      text NOT NULL,
  reason          text,
  recorded_at     timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT history_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT history_allocation_fk FOREIGN KEY (tenant_id, allocation_id)
    REFERENCES gigalibs_cmms.resource_allocations (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cmms_allocation_history_alloc
  ON gigalibs_cmms.allocation_status_history (tenant_id, allocation_id, recorded_at);

-- ─── 5. ROW LEVEL SECURITY ───────────────────────────────────────────────────
DO $$
DECLARE
  rel text;
  pol text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'workforce_resources', 'resource_capabilities', 'resource_allocations', 'allocation_status_history'
  ] LOOP
    pol := 'cmms_' || rel || '_tenant_isolation';
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I ENABLE ROW LEVEL SECURITY', rel);
    EXECUTE format('ALTER TABLE gigalibs_cmms.%I FORCE ROW LEVEL SECURITY', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON gigalibs_cmms.%I', pol, rel);
    EXECUTE format(
      $policy$CREATE POLICY %I ON gigalibs_cmms.%I USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$policy$,
      pol,
      rel
    );
  END LOOP;
END
$$;

-- ─── 6. SCHEMA MIGRATIONS REGISTRATION ────────────────────────────────────────
INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (3, '000003_workforce_allocations_and_capabilities')
ON CONFLICT (version) DO NOTHING;

COMMIT;
