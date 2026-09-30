#!/usr/bin/env bash
# WI-OI-104e end-to-end proof, kernel stage: run the proof tenant's rebuild schedule through the live kernel worker.
set -uo pipefail
q() { docker exec -i gigalibs-postgres psql -U gigalibs -d gigalibs -tA -v tenant="$TENANT" "$@"; }
TENANT="${1:-$(docker exec -i gigalibs-postgres psql -U gigalibs -d gigalibs -tA -c 'SELECT "tenantId" FROM kernel_job_schedules WHERE "createdAt" > now() - interval '"'"'30 minutes'"'"' AND name LIKE '"'"'Harvest feed%'"'"' ORDER BY "createdAt" DESC LIMIT 1')}"
[ -n "$TENANT" ] || { echo "FAIL no proof schedule found"; exit 1; }
echo "  tenant $TENANT"
q <<'SQL'
UPDATE kernel_job_schedules SET "nextRunAt" = now() - interval '1 second' WHERE "tenantId" = :'tenant';
SQL
for _ in $(seq 1 40); do
  n="$(q <<'SQL'
SELECT count(*) FROM kernel_job_runs WHERE "tenantId" = :'tenant' AND status IN ('SUCCEEDED', 'DEAD_LETTER');
SQL
)"
  [ "${n:-0}" -ge 2 ] && break; sleep 3
done
q <<'SQL' | sed 's/^/  /'
SELECT payload->>'operation', status::text, coalesce("lastErrorCode", '-'), "resultSummary"::text FROM kernel_job_runs WHERE "tenantId" = :'tenant' ORDER BY "createdAt";
SELECT 'dataset v' || dv.version_number || ' ' || dv.build_status || ' ' || dv.record_count || ' records; models on it: '
       || (SELECT count(*) FROM gigalibs_analytics.semantic_models sm WHERE sm.dataset_version_id = dv.id)
       || '; ready summaries: ' || (SELECT count(*) FROM gigalibs_analytics.analytics_summaries s WHERE s.dataset_version_id = dv.id AND s.status = 'READY')
  FROM gigalibs_analytics.analytical_dataset_versions dv WHERE dv.tenant_id = :'tenant' ORDER BY dv.version_number;
SELECT 'audit: ' || count(*) || ' SEMANTIC_MODEL_REFRESHED' FROM gigalibs_analytics.analytics_audit_log WHERE tenant_id = :'tenant' AND event_type = 'SEMANTIC_MODEL_REFRESHED';
SQL
result="$(q <<'SQL'
SELECT (SELECT count(*) FROM kernel_job_runs WHERE "tenantId" = :'tenant' AND status = 'SUCCEEDED' AND payload->>'operation' IN ('analytics.dataset-build', 'analytics.summaries-build'))
    || ' ' || (SELECT count(*) FROM gigalibs_analytics.semantic_models sm JOIN gigalibs_analytics.analytical_dataset_versions dv ON dv.id = sm.dataset_version_id WHERE sm.tenant_id = :'tenant' AND dv.version_number = 2)
    || ' ' || (SELECT count(*) FROM gigalibs_analytics.analytics_summaries s JOIN gigalibs_analytics.analytical_dataset_versions dv ON dv.id = s.dataset_version_id WHERE s.tenant_id = :'tenant' AND dv.version_number = 2 AND s.status = 'READY');
SQL
)"
q <<'SQL' | sed 's/^/  schedules removed: /'
DELETE FROM kernel_job_schedules WHERE "tenantId" = :'tenant';
SQL
read -r ok moved summaries <<<"$result"
echo "  kernel jobs succeeded: $ok of 2; model on v2: $moved; ready summaries on v2: $summaries"
[ "$ok" = 2 ] && [ "$moved" = 1 ] && [ "${summaries:-0}" -ge 1 ] && echo "KERNEL STAGE PASS" || { echo "KERNEL STAGE FAIL"; exit 1; }
