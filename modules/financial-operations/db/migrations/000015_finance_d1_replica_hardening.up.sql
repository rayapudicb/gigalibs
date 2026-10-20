-- WI-OI-120bp review B2/B4/B5: forced RLS on replica publish, proactive snapshot tenant list, relay lease includes snapshot-completed.
BEGIN;

ALTER TABLE gigalibs_finance.inventory_fiscal_replica_publish ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.inventory_fiscal_replica_publish FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.inventory_fiscal_replica_publish;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.inventory_fiscal_replica_publish
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.inventory_posting_cutoff_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.inventory_posting_cutoff_confirmations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.inventory_posting_cutoff_confirmations;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.inventory_posting_cutoff_confirmations
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_finance.subledger_posting_retries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_finance.subledger_posting_retries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gigalibs_finance.subledger_posting_retries;
CREATE POLICY tenant_isolation_policy ON gigalibs_finance.subledger_posting_retries
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

CREATE OR REPLACE FUNCTION gigalibs_finance.list_tenants_pending_inventory_fiscal_replica_snapshot()
RETURNS TABLE(tenant_id character varying)
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_finance, pg_temp
AS $$
  SELECT DISTINCT p.tenant_id
    FROM gigalibs_finance.fiscal_periods p
    LEFT JOIN gigalibs_finance.inventory_fiscal_replica_publish pub
      ON pub.tenant_id = p.tenant_id
   WHERE pub.tenant_id IS NULL
$$;

REVOKE ALL ON FUNCTION gigalibs_finance.list_tenants_pending_inventory_fiscal_replica_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_finance.list_tenants_pending_inventory_fiscal_replica_snapshot()
  TO gigalibs_finance_runtime;

CREATE OR REPLACE FUNCTION gigalibs_finance.relay_lease_finance_inventory_events(p_limit integer, p_lease_seconds integer)
RETURNS SETOF gigalibs_finance.outbox_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_finance, pg_temp
AS $$
  UPDATE gigalibs_finance.outbox_events o
     SET status = 'LEASED',
         available_at = now() + make_interval(secs => GREATEST(LEAST(p_lease_seconds, 300), 5)),
         attempt_count = o.attempt_count + 1
   WHERE o.id IN (
     SELECT e.id FROM gigalibs_finance.outbox_events e
      WHERE (e.status = 'PENDING' OR (e.status = 'LEASED' AND e.available_at <= now()))
        AND e.available_at <= now()
        AND e.event_type IN (
          'finance.inventory-receipt.posting-outcome.v1',
          'finance.fiscal-period.state-changed.v1',
          'finance.fiscal-period.snapshot-completed.v1'
        )
      ORDER BY e.created_at, e.id
      LIMIT GREATEST(LEAST(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;

REVOKE ALL ON FUNCTION gigalibs_finance.relay_lease_finance_inventory_events(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gigalibs_finance.relay_lease_finance_inventory_events(integer, integer)
  TO gigalibs_finance_runtime;

INSERT INTO gigalibs_finance.schema_migrations (version) VALUES (15)
ON CONFLICT (version) DO NOTHING;

COMMIT;
