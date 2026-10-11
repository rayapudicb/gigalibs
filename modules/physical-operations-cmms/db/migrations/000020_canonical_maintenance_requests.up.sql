-- WI-OI-120t (M-CM1 Slice 2): Canonical maintenance requests intake, triage, and work-order conversion.
BEGIN;

CREATE TABLE gigalibs_cmms.request_counters (
  tenant_id  gigalibs_cmms.tenant_ref PRIMARY KEY,
  last_value bigint NOT NULL CHECK (last_value > 0)
);

CREATE TABLE gigalibs_cmms.maintenance_requests (
  tenant_id          gigalibs_cmms.tenant_ref NOT NULL,
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  request_number     text NOT NULL CHECK (request_number ~ '^REQ-[0-9]{6,}$'),
  title              text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  description        text CHECK (char_length(description) <= 10000),
  priority           text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY')),
  status             text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  asset_id           uuid,
  location_id        uuid,
  requester_subject  gigalibs_cmms.principal_ref NOT NULL,
  requester_name     text CHECK (char_length(requester_name) <= 240),
  requester_email    text CHECK (char_length(requester_email) <= 240),
  requester_phone    text CHECK (char_length(requester_phone) <= 64),
  rejection_reason   text CHECK (char_length(rejection_reason) <= 4000),
  converted_wo_id    uuid,
  triaged_by         gigalibs_cmms.principal_ref,
  triaged_at         timestamptz,
  cancelled_at       timestamptz,
  version            integer NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id     text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT requests_number_unique UNIQUE (tenant_id, request_number),
  CONSTRAINT requests_asset_fk FOREIGN KEY (tenant_id, asset_id)
    REFERENCES gigalibs_cmms.assets (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT requests_converted_wo_fk FOREIGN KEY (tenant_id, converted_wo_id)
    REFERENCES gigalibs_cmms.work_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT requests_accepted_state CHECK ((status = 'ACCEPTED') = (converted_wo_id IS NOT NULL AND triaged_at IS NOT NULL)),
  CONSTRAINT requests_rejected_state CHECK ((status = 'REJECTED') = (rejection_reason IS NOT NULL AND triaged_at IS NOT NULL)),
  CONSTRAINT requests_cancelled_state CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
);

CREATE INDEX requests_queue ON gigalibs_cmms.maintenance_requests (tenant_id, status, priority, created_at DESC);
CREATE INDEX requests_requester ON gigalibs_cmms.maintenance_requests (tenant_id, requester_subject);

ALTER TABLE gigalibs_cmms.request_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.request_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY request_counters_tenant_isolation ON gigalibs_cmms.request_counters
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

ALTER TABLE gigalibs_cmms.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_cmms.maintenance_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_requests_tenant_isolation ON gigalibs_cmms.maintenance_requests
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::gigalibs_cmms.tenant_ref);

INSERT INTO gigalibs_cmms.schema_migrations (version, name)
VALUES (20, '000020_canonical_maintenance_requests');

COMMIT;
