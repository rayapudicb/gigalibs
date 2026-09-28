-- WI-OI-064b: store rollup paths as text. Under forced RLS the planner may only use leakproof operators as index
-- conditions ahead of the tenant policy; ltree equality is not leakproof, so an ltree ancestor_path was applied as a
-- filter after scanning every rollup of the tenant and window (measured 43 ms instead of 0.2 ms). Text equality is
-- leakproof, so the full primary key is used. ltree still computes the paths. Forward-only.

BEGIN;

ALTER TABLE gigalibs_analytics.place_rollups DROP CONSTRAINT place_rollups_check;

ALTER TABLE gigalibs_analytics.place_rollups
  ALTER COLUMN ancestor_path TYPE text USING ancestor_path::text,
  ALTER COLUMN child_path TYPE text USING child_path::text;

ALTER TABLE gigalibs_analytics.place_rollups
  ADD CONSTRAINT place_rollups_child_of_ancestor CHECK (
    child_path = ancestor_path
    OR (child_path::ltree <@ ancestor_path::ltree AND nlevel(child_path::ltree) = nlevel(ancestor_path::ltree) + 1)
  );

CREATE OR REPLACE FUNCTION gigalibs_analytics.rebuild_place_rollups(p_tenant_id text, p_from date, p_to date)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = gigalibs_analytics, public
AS $$
DECLARE
  written bigint;
BEGIN
  IF p_to < p_from OR p_to - p_from > 3660 THEN
    RAISE EXCEPTION 'rollup window must be between 0 and 3660 days';
  END IF;
  DELETE FROM gigalibs_analytics.place_rollups
   WHERE tenant_id = p_tenant_id AND day BETWEEN p_from AND p_to;
  INSERT INTO gigalibs_analytics.place_rollups
    (tenant_id, fact_type, ancestor_path, child_path, day, quantity, fact_count)
  SELECT f.tenant_id,
         f.fact_type,
         subpath(f.place_path, 0, levels.i)::text,
         subpath(f.place_path, 0, LEAST(levels.i + 1, nlevel(f.place_path)))::text,
         (f.occurred_at AT TIME ZONE 'UTC')::date,
         SUM(f.quantity),
         COUNT(*)
    FROM gigalibs_analytics.operational_facts f
   CROSS JOIN LATERAL generate_series(0, nlevel(f.place_path)) AS levels(i)
   WHERE f.tenant_id = p_tenant_id
     AND f.occurred_at >= p_from::timestamp AT TIME ZONE 'UTC'
     AND f.occurred_at < (p_to + 1)::timestamp AT TIME ZONE 'UTC'
   GROUP BY 1, 2, 3, 4, 5;
  GET DIAGNOSTICS written = ROW_COUNT;
  RETURN written;
END
$$;

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (14, '000014_place_rollups_text_paths', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
