-- WI-OI-129 S3: persisted WIP accrual postings and Finance outbox relay.
BEGIN;

ALTER TABLE gigalibs_project_operations.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
ALTER TABLE gigalibs_project_operations.outbox_events ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING', 'LEASED', 'PUBLISHED', 'FAILED'));

CREATE TABLE gigalibs_project_operations.project_cost_postings (
  id uuid PRIMARY KEY,
  tenant_id varchar(64) NOT NULL,
  project_id uuid NOT NULL,
  request_key uuid NOT NULL,
  material_minor bigint NOT NULL CHECK (material_minor >= 0),
  labor_minor bigint NOT NULL CHECK (labor_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  currency_code char(3) NOT NULL DEFAULT 'USD',
  created_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_key),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES gigalibs_project_operations.projects (tenant_id, id) ON DELETE CASCADE,
  CHECK (total_minor = material_minor + labor_minor)
);

CREATE INDEX project_cost_postings_project ON gigalibs_project_operations.project_cost_postings (tenant_id, project_id, created_at DESC);

ALTER TABLE gigalibs_project_operations.project_cost_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_project_operations.project_cost_postings FORCE ROW LEVEL SECURITY;
CREATE POLICY project_cost_postings_tenant_isolation ON gigalibs_project_operations.project_cost_postings
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE OR REPLACE FUNCTION gigalibs_project_operations.relay_lease_project_finance_events(p_limit integer, p_lease_seconds integer)
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
        AND e.event_type = 'projects.wip_accrual_requested.v1'
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

CREATE OR REPLACE FUNCTION gigalibs_project_operations.relay_settle_project_event(
  p_id varchar, p_published boolean, p_error_code text, p_retry_seconds integer, p_max_attempts integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_project_operations, pg_temp
AS $$
  UPDATE gigalibs_project_operations.outbox_events
     SET status = CASE
                    WHEN p_published THEN 'PUBLISHED'
                    WHEN p_retry_seconds IS NULL OR attempt_count >= p_max_attempts THEN 'FAILED'
                    ELSE 'PENDING'
                  END,
         published_at = CASE WHEN p_published THEN now() ELSE published_at END,
         available_at = CASE WHEN p_published OR p_retry_seconds IS NULL THEN available_at
                             ELSE now() + make_interval(secs => LEAST(GREATEST(p_retry_seconds, 1), 900)) END,
         last_error_code = CASE WHEN p_published THEN NULL ELSE left(p_error_code, 128) END
   WHERE id = p_id
$$;

REVOKE ALL ON FUNCTION gigalibs_project_operations.relay_lease_project_finance_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION gigalibs_project_operations.relay_settle_project_event(varchar, boolean, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_project_operations.relay_lease_project_finance_events(integer, integer) TO gigalibs_project_operations_runtime;
GRANT EXECUTE ON FUNCTION gigalibs_project_operations.relay_settle_project_event(varchar, boolean, text, integer, integer) TO gigalibs_project_operations_runtime;

INSERT INTO gigalibs_project_operations.schema_migrations (version, name)
VALUES (3, '000003_project_wip_posting')
ON CONFLICT (version) DO NOTHING;

COMMIT;
