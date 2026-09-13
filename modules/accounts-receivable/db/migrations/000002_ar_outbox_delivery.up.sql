BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gigalibs_ar_outbox_worker') THEN
    CREATE ROLE gigalibs_ar_outbox_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;

ALTER TABLE gigalibs_ar.outbox_events
  ADD COLUMN claim_id uuid,
  ADD COLUMN claimed_by text,
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN dead_lettered_at timestamptz,
  ADD CONSTRAINT outbox_claim_state_check CHECK (
    (claim_id IS NULL AND claimed_by IS NULL AND claimed_at IS NULL) OR
    (claim_id IS NOT NULL AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL)
  ),
  ADD CONSTRAINT outbox_claimed_by_check CHECK (
    claimed_by IS NULL OR char_length(claimed_by) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT outbox_dead_letter_state_check CHECK (
    dead_lettered_at IS NULL OR (published_at IS NULL AND dead_lettered_at >= occurred_at)
  );

DROP INDEX gigalibs_ar.outbox_pending_idx;
CREATE INDEX outbox_pending_idx
  ON gigalibs_ar.outbox_events (next_attempt_at, occurred_at, tenant_id, id)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;

CREATE POLICY outbox_events_worker_policy ON gigalibs_ar.outbox_events
  TO gigalibs_ar_outbox_worker
  USING (pg_has_role(current_user, 'gigalibs_ar_outbox_worker', 'member'))
  WITH CHECK (pg_has_role(current_user, 'gigalibs_ar_outbox_worker', 'member'));

GRANT USAGE ON SCHEMA gigalibs_ar TO gigalibs_ar_outbox_worker;
GRANT SELECT, UPDATE ON TABLE gigalibs_ar.outbox_events TO gigalibs_ar_outbox_worker;
GRANT SELECT ON TABLE gigalibs_ar.schema_migrations TO gigalibs_ar_outbox_worker;

INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (2, '000002_ar_outbox_delivery');

COMMIT;
