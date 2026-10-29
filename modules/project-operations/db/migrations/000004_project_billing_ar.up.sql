-- WI-OI-129 S4: T&M and milestone billing requests with AR outbox relay.
BEGIN;

CREATE TABLE gigalibs_project_operations.project_billing_requests (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  project_id uuid NOT NULL,
  request_key uuid NOT NULL,
  billing_kind varchar(32) NOT NULL CHECK (billing_kind IN ('TIME_MATERIALS', 'MILESTONE')),
  milestone_line_id uuid,
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor > 0),
  currency_code char(3) NOT NULL DEFAULT 'USD',
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, milestone_line_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES gigalibs_project_operations.projects (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, milestone_line_id) REFERENCES gigalibs_project_operations.project_lines (tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (billing_kind = 'TIME_MATERIALS' AND milestone_line_id IS NULL)
    OR (billing_kind = 'MILESTONE' AND milestone_line_id IS NOT NULL)
  )
);

CREATE TABLE gigalibs_project_operations.project_billing_timesheets (
  tenant_id varchar(64) NOT NULL,
  billing_request_id uuid NOT NULL,
  timesheet_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, timesheet_id),
  FOREIGN KEY (tenant_id, billing_request_id) REFERENCES gigalibs_project_operations.project_billing_requests (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, timesheet_id) REFERENCES gigalibs_project_operations.timesheets (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX project_billing_requests_project ON gigalibs_project_operations.project_billing_requests (tenant_id, project_id, created_at DESC);

ALTER TABLE gigalibs_project_operations.project_billing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_project_operations.project_billing_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY project_billing_requests_tenant_isolation ON gigalibs_project_operations.project_billing_requests
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE gigalibs_project_operations.project_billing_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_project_operations.project_billing_timesheets FORCE ROW LEVEL SECURITY;
CREATE POLICY project_billing_timesheets_tenant_isolation ON gigalibs_project_operations.project_billing_timesheets
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE OR REPLACE FUNCTION gigalibs_project_operations.relay_lease_project_ar_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_project_operations.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_project_operations, pg_temp
AS $$
  UPDATE gigalibs_project_operations.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_project_operations.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
        AND e.event_type = 'projects.invoice_draft_requested.v1'
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

REVOKE ALL ON FUNCTION gigalibs_project_operations.relay_lease_project_ar_events(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_project_operations.relay_lease_project_ar_events(integer, integer) TO gigalibs_project_operations_runtime;

INSERT INTO gigalibs_project_operations.schema_migrations (version, name)
VALUES (4, '000004_project_billing_ar')
ON CONFLICT (version) DO NOTHING;

COMMIT;
