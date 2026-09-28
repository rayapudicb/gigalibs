-- WI-OI-064b: operational fact store keyed by place, and hierarchical place rollups for sub-second drill-down.
-- Facts keep the place path at event time, so moving a place later does not re-attribute history. Rollups are
-- derived data: rebuild_place_rollups() recomputes any tenant and day window from facts, set-based and idempotent.
-- Forward-only; previously applied migrations remain immutable.

BEGIN;

-- Database-wide extension; module migrations are serialized by the runner's global advisory lock.
CREATE EXTENSION IF NOT EXISTS ltree;

-- Operator-triggered rollup rebuilds are audited (new values are not used inside this migration).
ALTER TYPE gigalibs_analytics.audit_event_type ADD VALUE IF NOT EXISTS 'PLACE_ROLLUPS_REBUILT';
ALTER TYPE gigalibs_analytics.lineage_node_type ADD VALUE IF NOT EXISTS 'PLACE_ROLLUP';

CREATE TABLE gigalibs_analytics.operational_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  fact_type VARCHAR(32) NOT NULL
    CHECK (fact_type IN ('LABOUR_HOURS', 'LABOUR_COST', 'SPEND', 'DOWNTIME_MINUTES', 'CARBON_KG')),
  place_id UUID NOT NULL,
  place_path ltree NOT NULL CHECK (nlevel(place_path) BETWEEN 1 AND 32),
  occurred_at TIMESTAMPTZ NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL CHECK (quantity >= 0),
  currency_code CHAR(3) CHECK (currency_code ~ '^[A-Z]{3}$'),
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
  origin VARCHAR(16) NOT NULL CHECK (origin IN ('LIVE', 'SYNTHETIC')),
  source VARCHAR(64) NOT NULL CHECK (source ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  source_event_id VARCHAR(128) NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source, source_event_id),
  CHECK ((fact_type IN ('LABOUR_COST', 'SPEND')) = (currency_code IS NOT NULL))
);

CREATE INDEX operational_facts_tenant_window
  ON gigalibs_analytics.operational_facts (tenant_id, occurred_at);

CREATE TABLE gigalibs_analytics.place_rollups (
  tenant_id TEXT NOT NULL,
  fact_type VARCHAR(32) NOT NULL,
  -- '' is the whole estate; child_path is one level below, or equal to ancestor_path for facts recorded on it.
  ancestor_path ltree NOT NULL,
  child_path ltree NOT NULL,
  day DATE NOT NULL,
  quantity NUMERIC(24, 4) NOT NULL,
  fact_count BIGINT NOT NULL CHECK (fact_count > 0),
  PRIMARY KEY (tenant_id, fact_type, ancestor_path, day, child_path),
  CHECK (child_path = ancestor_path OR (child_path <@ ancestor_path AND nlevel(child_path) = nlevel(ancestor_path) + 1))
);

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY['operational_facts', 'place_rollups'] LOOP
    EXECUTE format('ALTER TABLE gigalibs_analytics.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE gigalibs_analytics.%I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON gigalibs_analytics.%I FOR ALL USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      tenant_table || '_tenant_isolation_v13',
      tenant_table
    );
  END LOOP;
END
$$;

-- Recomputes rollups for one tenant and a UTC day window from facts. Runs as the caller, so forced RLS limits it
-- to the tenant bound in app.tenant_id; a mismatched tenant argument touches no rows.
CREATE FUNCTION gigalibs_analytics.rebuild_place_rollups(p_tenant_id text, p_from date, p_to date)
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
         subpath(f.place_path, 0, levels.i),
         subpath(f.place_path, 0, LEAST(levels.i + 1, nlevel(f.place_path))),
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
VALUES (13, '000013_operational_facts_and_place_rollups', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
