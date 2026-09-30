-- WI-OI-103c: summaries answer dashboard questions fast. A summary holds, for one dataset version, the rows grouped by
-- a set of dimension fields and (optionally) one date field by day, with sum, count, min and max of every number field
-- and the row count. Dataset versions never change, so a summary never goes stale for its version. Forward-only.

BEGIN;

ALTER TABLE gigalibs_analytics.analytical_dataset_versions
  ADD CONSTRAINT analytical_dataset_versions_id_tenant_v21_unique UNIQUE (id, tenant_id);

CREATE TABLE gigalibs_analytics.analytics_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  dataset_version_id UUID NOT NULL,
  -- Sorted, distinct analytical field names; the time field is never also a dimension.
  dimensions TEXT[] NOT NULL CHECK (cardinality(dimensions) <= 8),
  time_field TEXT,
  numeric_fields TEXT[] NOT NULL CHECK (cardinality(numeric_fields) <= 40),
  status TEXT NOT NULL CHECK (status IN ('BUILDING', 'READY', 'FAILED')),
  row_count INTEGER CHECK (row_count IS NULL OR row_count >= 0),
  error TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  built_at TIMESTAMPTZ,
  UNIQUE (id, tenant_id),
  UNIQUE NULLS NOT DISTINCT (tenant_id, dataset_version_id, dimensions, time_field),
  FOREIGN KEY (dataset_version_id, tenant_id)
    REFERENCES gigalibs_analytics.analytical_dataset_versions (id, tenant_id) ON DELETE CASCADE
);

-- Typed arrays, aligned with the summary's `dimensions` and `numeric_fields`: reading an array element is far cheaper
-- than parsing JSON on every row.
CREATE TABLE gigalibs_analytics.analytics_summary_rows (
  summary_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  dims TEXT[] NOT NULL,
  day DATE,
  row_count BIGINT NOT NULL CHECK (row_count > 0),
  sums NUMERIC[] NOT NULL,
  counts BIGINT[] NOT NULL,
  mins NUMERIC[] NOT NULL,
  maxs NUMERIC[] NOT NULL,
  FOREIGN KEY (summary_id, tenant_id)
    REFERENCES gigalibs_analytics.analytics_summaries (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX analytics_summary_rows_summary_day ON gigalibs_analytics.analytics_summary_rows (summary_id, day);

ALTER TABLE gigalibs_analytics.analytics_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.analytics_summaries FORCE ROW LEVEL SECURITY;
CREATE POLICY analytics_summaries_tenant_isolation_v21 ON gigalibs_analytics.analytics_summaries
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gigalibs_analytics.analytics_summary_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_analytics.analytics_summary_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY analytics_summary_rows_tenant_isolation_v21 ON gigalibs_analytics.analytics_summary_rows
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

INSERT INTO gigalibs_analytics.schema_migrations (version, name, applied_at)
VALUES (21, '000021_query_summaries', now());

COMMIT;
