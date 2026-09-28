-- WI-OI-064e: Demo Lab reset. Operational facts stay append-only for the runtime role; this definer function is
-- the one controlled exception: it deletes only SYNTHETIC facts, and only for the tenant bound in app.tenant_id,
-- then clears that tenant's derived rollups (the caller rebuilds them for any remaining facts). Forward-only.

BEGIN;

ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'DEMO_DATA_GENERATED';
ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'DEMO_DATA_RESET';
ALTER TYPE gigalibs_analytics.lineage_node_type ADD VALUE IF NOT EXISTS 'DEMO_DATASET';

CREATE FUNCTION gigalibs_analytics.reset_synthetic_facts(p_tenant_id text)
RETURNS TABLE (deleted_facts bigint, deleted_rollups bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gigalibs_analytics, pg_temp
AS $$
DECLARE
  bound_tenant text := current_setting('app.tenant_id', true);
BEGIN
  IF bound_tenant IS NULL OR bound_tenant = '' OR p_tenant_id IS DISTINCT FROM bound_tenant THEN
    RAISE EXCEPTION 'synthetic reset is only allowed for the tenant bound to this transaction'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM gigalibs_analytics.operational_facts
   WHERE tenant_id = bound_tenant AND origin = 'SYNTHETIC';
  GET DIAGNOSTICS deleted_facts = ROW_COUNT;
  DELETE FROM gigalibs_analytics.place_rollups WHERE tenant_id = bound_tenant;
  GET DIAGNOSTICS deleted_rollups = ROW_COUNT;
  RETURN NEXT;
END
$$;

-- Bulk rollup rebuilds change the table far faster than autovacuum re-analyzes it, and stale statistics push
-- the planner off the rollup primary key. The runtime role does not own the table, so it refreshes statistics
-- through this definer function. ANALYZE reads no tenant data back to the caller.
CREATE FUNCTION gigalibs_analytics.refresh_place_rollup_statistics()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = gigalibs_analytics, pg_temp
AS $$ ANALYZE gigalibs_analytics.place_rollups $$;

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (15, '000015_demo_lab_synthetic_reset', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
