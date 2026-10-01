#!/usr/bin/env bash
set -euo pipefail

# WI-OI-063 / ADR-0006 exit gate: sub-tree query p95 under 8 ms at 50,000 places. Runs in a throwaway
# database: replays the canonical migrations, loads two tenants of 50,505 places each
# (5 regions x 100 districts x 100 sites) and times 200 scoped sub-tree queries as the RLS-bound runtime role.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
GEOSPATIAL_ENV="${COMPOSE_DIR}/.env.geospatial"
VERIFY_DATABASE="gigalibs_wi_oi_063_perf"
P95_LIMIT_MS="${P95_LIMIT_MS:-8}"

read_value() {
  awk -v key="$2" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$1"
}
database_url_for() {
  SOURCE_DATABASE_URL="$1" TARGET_DATABASE="${VERIFY_DATABASE}" node -e '
    const url = new URL(process.env.SOURCE_DATABASE_URL);
    url.pathname = `/${process.env.TARGET_DATABASE}`;
    process.stdout.write(url.toString());'
}
url_part() {
  SOURCE_DATABASE_URL="$1" URL_PART="$2" node -e '
    const url = new URL(process.env.SOURCE_DATABASE_URL);
    process.stdout.write(decodeURIComponent(process.env.URL_PART === "username" ? url.username : url.password));'
}

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
ADMIN_DATABASE_URL="$(database_url_for "$(read_value "${GEOSPATIAL_ENV}" GEOSPATIAL_MIGRATIONS_DATABASE_URL)")"
RUNTIME_DATABASE_URL="$(database_url_for "$(read_value "${GEOSPATIAL_ENV}" GEOSPATIAL_DATABASE_URL)")"
GEOSPATIAL_IMAGE="$(read_value "${GEOSPATIAL_ENV}" GEOSPATIAL_IMAGE)"
RUNTIME_USER="$(url_part "${RUNTIME_DATABASE_URL}" username)"
RUNTIME_PASSWORD="$(url_part "${RUNTIME_DATABASE_URL}" password)"

admin_sql() { docker exec -i "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d "${VERIFY_DATABASE}" -v ON_ERROR_STOP=1 -q "$@"; }
cleanup() {
  docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -q \
    -c "DROP DATABASE IF EXISTS ${VERIFY_DATABASE} WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -q -c "CREATE DATABASE ${VERIFY_DATABASE};"
docker run --rm --add-host host.docker.internal:host-gateway \
  --env "DATABASE_URL=${ADMIN_DATABASE_URL}" \
  --env "MODULE_RUNTIME_DATABASE_URL=${RUNTIME_DATABASE_URL}" \
  --env MODULE_MIGRATIONS_DIRECTORY=/app/migrations \
  --env MODULE_SCHEMA=gigalibs_geospatial \
  --env MODULE_EXPECTED_MIGRATION_VERSION=6 \
  --env MODULE_APPEND_ONLY_TABLES=audit_events \
  --env MODULE_READ_ONLY_TABLES=auth_revocation_events \
  "${GEOSPATIAL_IMAGE}" run-module-migrations.mjs >/dev/null

for tenant in perf-a perf-b; do
  admin_sql <<SQL
INSERT INTO gigalibs_geospatial.spatial_node_types (tenant_id, code, label, created_by, updated_by, correlation_id)
VALUES ('${tenant}', 'REGION', 'Region', 'perf', 'perf', 'perf'),
       ('${tenant}', 'DISTRICT', 'District', 'perf', 'perf', 'perf'),
       ('${tenant}', 'SITE', 'Site', 'perf', 'perf', 'perf');
INSERT INTO gigalibs_geospatial.spatial_nodes (tenant_id, node_type_id, code, path, display_name, created_by, updated_by, correlation_id)
SELECT '${tenant}', t.id, 'R' || r, ('R' || r)::ltree, 'Region ' || r, 'perf', 'perf', 'perf'
  FROM generate_series(1, 5) r, gigalibs_geospatial.spatial_node_types t
 WHERE t.tenant_id = '${tenant}' AND t.code = 'REGION';
INSERT INTO gigalibs_geospatial.spatial_nodes (tenant_id, parent_id, node_type_id, code, path, display_name, created_by, updated_by, correlation_id)
SELECT '${tenant}', p.id, t.id, 'D' || d, (p.path::text || '.D' || d)::ltree, 'District ' || d, 'perf', 'perf', 'perf'
  FROM gigalibs_geospatial.spatial_nodes p, generate_series(1, 100) d, gigalibs_geospatial.spatial_node_types t
 WHERE p.tenant_id = '${tenant}' AND nlevel(p.path) = 1 AND t.tenant_id = '${tenant}' AND t.code = 'DISTRICT';
INSERT INTO gigalibs_geospatial.spatial_nodes (tenant_id, parent_id, node_type_id, code, path, display_name, created_by, updated_by, correlation_id)
SELECT '${tenant}', p.id, t.id, 'S' || s, (p.path::text || '.S' || s)::ltree, 'Site ' || s, 'perf', 'perf', 'perf'
  FROM gigalibs_geospatial.spatial_nodes p, generate_series(1, 100) s, gigalibs_geospatial.spatial_node_types t
 WHERE p.tenant_id = '${tenant}' AND nlevel(p.path) = 2 AND t.tenant_id = '${tenant}' AND t.code = 'SITE';
SQL
done
admin_sql -c "ANALYZE gigalibs_geospatial.spatial_nodes;"

NODE_COUNT="$(admin_sql -At -c "SELECT count(*) FROM gigalibs_geospatial.spatial_nodes WHERE tenant_id = 'perf-a';")"

# 200 anchors: all 5 regions plus 195 random districts; each query runs as the runtime role under RLS.
TIMINGS="$(docker exec -i -e "PGPASSWORD=${RUNTIME_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${RUNTIME_USER}" -d "${VERIFY_DATABASE}" -At -v ON_ERROR_STOP=1 -q <<'SQL'
BEGIN;
SET LOCAL app.tenant_id = 'perf-a';
CREATE TEMP TABLE anchors AS
  (SELECT path FROM gigalibs_geospatial.spatial_nodes WHERE nlevel(path) = 1)
  UNION ALL
  (SELECT path FROM gigalibs_geospatial.spatial_nodes WHERE nlevel(path) = 2 ORDER BY random() LIMIT 195);
DO $$
DECLARE anchor ltree; plan json; elapsed numeric;
BEGIN
  CREATE TEMP TABLE timings (ms numeric);
  FOR anchor IN SELECT path FROM anchors LOOP
    EXECUTE format(
      'EXPLAIN (ANALYZE, FORMAT JSON) SELECT id, path, display_name FROM gigalibs_geospatial.spatial_nodes WHERE tenant_id = %L AND path <@ %L::ltree',
      'perf-a', anchor::text) INTO plan;
    elapsed := (plan->0->>'Execution Time')::numeric;
    INSERT INTO timings VALUES (elapsed);
  END LOOP;
END $$;
SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms)::numeric, 3) || ' '
    || round(percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::numeric, 3) || ' '
    || round(max(ms), 3) || ' ' || count(*)
  FROM timings;
COMMIT;
SQL
)"
read -r P50 P95 MAX SAMPLES <<<"${TIMINGS}"

echo "{\"nodesPerTenant\":${NODE_COUNT},\"tenants\":2,\"samples\":${SAMPLES},\"p50Ms\":${P50},\"p95Ms\":${P95},\"maxMs\":${MAX},\"limitP95Ms\":${P95_LIMIT_MS}}"
if ! awk -v p95="${P95}" -v limit="${P95_LIMIT_MS}" 'BEGIN { exit !(p95 < limit) }'; then
  echo "Error: sub-tree p95 ${P95} ms exceeds ${P95_LIMIT_MS} ms." >&2
  exit 1
fi
echo "WI-OI-063 sub-tree performance passed: p95 ${P95} ms at ${NODE_COUNT} places per tenant."
