# WI-OI-042 Gate 13 — Live PostgreSQL Migration Replay Evidence

**Date:** 2026-09-22  
**Environment:** PostgreSQL 16.13, cloud container  
**Database:** `analytics_replay` (isolated replay, no application data)  
**Operator:** Claude Sonnet 4.6 (automated gate evidence collection)

## Pre-flight Fix Applied

Migration files 000004–000010 used `description` as the column name in `schema_migrations` ledger INSERTs, but migration 000003 defines the ledger with a `name` column. The column name was corrected to `name` across all 7 affected migrations before replay. The correction is committed alongside this evidence file.

## Replay Results — All 10 Migrations

| Migration | File | Result | Exit Code |
|-----------|------|--------|-----------|
| 000001 | `000001_analytics_lineage_and_audit.up.sql` | ✅ PASS | 0 |
| 000002 | `000002_analytics_telemetry_series.up.sql` | ✅ PASS | 0 |
| 000003 | `000003_analytics_rls_and_ledger.up.sql` | ✅ PASS | 0 |
| 000004 | `000004_connector_hub_source_connections.up.sql` | ✅ PASS | 0 |
| 000005 | `000005_connector_sync_runs_and_raw_records.up.sql` | ✅ PASS | 0 |
| 000006 | `000006_schema_discovery_and_studio_mappings.up.sql` | ✅ PASS | 0 |
| 000007 | `000007_analytical_datasets_and_semantic_models.up.sql` | ✅ PASS | 0 |
| 000008 | `000008_charts_and_dashboards.up.sql` | ✅ PASS | 0 |
| 000009 | `000009_reports_and_scheduled_delivery.up.sql` | ✅ PASS | 0 |
| 000010 | `000010_lineage_and_audit.up.sql` | ✅ PASS | 0 |

**Total: 10/10 PASS**

## Schema Migrations Ledger (post-replay)

```
 version |                  name                   |          applied_at
---------+-----------------------------------------+-------------------------------
       1 | 000001_analytics_lineage_and_audit      | 2026-09-22 02:37:40.206192+00
       2 | 000002_analytics_telemetry_series       | 2026-09-22 02:37:40.206192+00
       3 | 000003_analytics_rls_and_ledger         | 2026-09-22 02:37:40.206192+00
       4 | connector_hub_source_connections        | 2026-09-22 02:37:40.268803+00
       5 | connector_sync_runs_and_raw_records     | 2026-09-22 02:37:40.325981+00
       6 | schema_discovery_and_studio_mappings    | 2026-09-22 02:37:40.391439+00
       7 | analytical_datasets_and_semantic_models | 2026-09-22 02:37:40.458943+00
       8 | 000008_charts_and_dashboards            | 2026-09-22 02:37:40.518876+00
       9 | 000009_reports_and_scheduled_delivery   | 2026-09-22 02:37:40.583265+00
      10 | 000010_lineage_and_audit                | 2026-09-22 02:37:40.646032+00
(10 rows)
```

## Tables Created (31 total in gigalibs_analytics schema)

```
analytical_dataset_versions, analytics_audit_log, analytics_lineage_edges,
chart_definitions, connector_credential_refs, dashboard_charts, dashboard_filters,
dashboards, data_studio_mappings, dataset_record_versions, discovered_source_schemas,
executive_actions, metric_snapshots, module_tenants, query_result_cache,
raw_record_versions, report_artifacts, report_definitions, report_deliveries,
report_runs, report_schedules, schema_migrations, semantic_measures,
semantic_model_versions, semantic_models, source_connections, source_field_profiles,
source_sync_runs, studio_mapping_versions, telemetry_series, tenant_analytics_configs
```

## Append-Only Table REVOKE Verification

All 8 append-only tables confirmed UPDATE REVOKED and DELETE REVOKED for `gigalibs_analytics_runtime`:

| Table | UPDATE | DELETE |
|-------|--------|--------|
| analytics_audit_log | REVOKED | REVOKED |
| analytics_lineage_edges | REVOKED | REVOKED |
| dataset_record_versions | REVOKED | REVOKED |
| raw_record_versions | REVOKED | REVOKED |
| report_artifacts | REVOKED | REVOKED |
| report_deliveries | REVOKED | REVOKED |
| semantic_model_versions | REVOKED | REVOKED |
| studio_mapping_versions | REVOKED | REVOKED |

## Row Level Security Verification

30 of 30 tenant tables: `relrowsecurity = true`, `relforcerowsecurity = true`  
(`schema_migrations` is the single non-RLS table, by design)

## Enum Verification

- `freshness_state`: FRESH, STALE, PARTIAL, REBUILDING, UNAVAILABLE — **`UNAUTHORIZED` absent** ✓
- `lineage_node_type`: 10 values (SOURCE_CONNECTION through REPORT_ARTIFACT) ✓
- `audit_event_type`: 24 values (CONNECTION_CREATED through QUERY_EXECUTED) ✓
- `chart_type`: 9 values (BAR, LINE, PIE, SCATTER, AREA, HEATMAP, TREEMAP, FUNNEL, GAUGE) ✓
- All other enums: connection_status, sync_run_status, report_status, delivery_status, delivery_channel, external_source_type ✓

## Gate 13 Verdict

**VERIFIED** — All 10 analytics-studio migrations replay cleanly on a fresh PostgreSQL 16 instance with no errors. All architecture invariants confirmed in the live schema.

---
*Evidence collected by automated gate runner. Human sign-off required per GigaLibs SDLC Gate 16.*
