BEGIN;

ALTER TABLE gigalibs_cmms.resource_allocations
  ADD CONSTRAINT allocations_work_order_fk
  FOREIGN KEY (tenant_id, work_order_id)
  REFERENCES gigalibs_cmms.work_orders (tenant_id, id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE gigalibs_cmms.resource_allocations
  VALIDATE CONSTRAINT allocations_work_order_fk;

CREATE TABLE gigalibs_cmms.workforce_usage_events (
  tenant_id   uuid NOT NULL,
  id          uuid NOT NULL,
  event_key   text NOT NULL,
  metric      text NOT NULL,
  quantity    bigint NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  actor_id    text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT workforce_usage_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES gigalibs_cmms.module_tenants (id) ON DELETE RESTRICT,
  CONSTRAINT workforce_usage_event_key_unique UNIQUE (tenant_id, event_key),
  CONSTRAINT workforce_usage_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_cmms_workforce_usage_period
  ON gigalibs_cmms.workforce_usage_events (tenant_id, occurred_at, metric);

ALTER TABLE gigalibs_cmms.workforce_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.workforce_usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY cmms_workforce_usage_events_tenant_isolation
  ON gigalibs_cmms.workforce_usage_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION gigalibs_cmms.reject_allocation_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'allocation_status_history is append-only';
END;
$$;

CREATE TRIGGER allocation_status_history_append_only
  BEFORE UPDATE OR DELETE ON gigalibs_cmms.allocation_status_history
  FOR EACH ROW EXECUTE FUNCTION gigalibs_cmms.reject_allocation_history_mutation();

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (4, '000004_workforce_integrity_audit_and_metering')
ON CONFLICT (version) DO NOTHING;

COMMIT;
