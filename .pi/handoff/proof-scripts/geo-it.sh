#!/usr/bin/env bash
# WI-OI-105a/b/e: Geospatial integration tests on a throwaway PostgreSQL 16 (127.0.0.1, removed afterwards). The real
# module migration runner applies 1-4, old-style places and facts are seeded (as before the relay existed), then the
# runner applies 5 (relay functions and the fact backfill) and provisions the non-superuser runtime role.
set -euo pipefail
REPO="$HOME/dev/gigalibs" PG=gl-105-geo-it PORT=55472
API="$REPO/modules/geospatial/apps/api" MIG="$REPO/modules/geospatial/db/runtime-foundation"
STAGE="$(mktemp -d)"
trap 'docker rm -f "$PG" >/dev/null 2>&1 || true; rm -f "$API/.run-migrations.tmp.mjs"; rm -rf "$STAGE"' EXIT
docker run -d --name "$PG" -p 127.0.0.1:$PORT:5432 -e POSTGRES_USER=gigalibs -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=gigalibs postgres:16-alpine >/dev/null
until docker exec "$PG" pg_isready -U gigalibs -d gigalibs >/dev/null 2>&1; do sleep 1; done; sleep 2
cp "$REPO/infra/compose/docker/run-module-migrations.mjs" "$API/.run-migrations.tmp.mjs"
ADMIN="postgresql://gigalibs:smoke@127.0.0.1:$PORT/gigalibs"
RUNTIME="postgresql://gigalibs_geospatial_runtime:runtime-smoke@127.0.0.1:$PORT/gigalibs"
migrate() { (cd "$API" && DATABASE_URL="$ADMIN" MODULE_RUNTIME_DATABASE_URL="$RUNTIME" MODULE_MIGRATIONS_DIRECTORY="$1" \
  MODULE_SCHEMA=gigalibs_geospatial MODULE_EXPECTED_MIGRATION_VERSION="$2" MODULE_APPEND_ONLY_TABLES=audit_events \
  MODULE_READ_ONLY_TABLES=auth_revocation_events node .run-migrations.tmp.mjs | tail -1); }
cp "$MIG"/00000[1-4]_*.up.sql "$STAGE/"
migrate "$STAGE" 4
docker exec -i "$PG" psql -U gigalibs -d gigalibs -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO gigalibs_geospatial.spatial_node_types (id, tenant_id, code, label, created_by, updated_by, correlation_id)
VALUES ('00000000-0000-4000-8000-0000000000f1', 'geo-a', 'FARM', 'Farm', 'seed', 'seed', 'seed'),
       ('00000000-0000-4000-8000-0000000000f2', 'geo-a', 'FIELD', 'Field', 'seed', 'seed', 'seed');
INSERT INTO gigalibs_geospatial.spatial_nodes (id, tenant_id, node_type_id, code, path, display_name, boundary, version, created_by, updated_by, correlation_id)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'geo-a', '00000000-0000-4000-8000-0000000000f1', 'NORTH', 'NORTH', 'North farm',
        '{"type":"Polygon","coordinates":[[[77.5,12.9],[77.51,12.9],[77.51,12.91],[77.5,12.91],[77.5,12.9]]]}', 2, 'seed', 'seed', 'seed');
INSERT INTO gigalibs_geospatial.outbox_events (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload) VALUES
 ('old-1', 'geo-a', 'geospatial.facts.v1', 'SpatialNodeChangedV1', 'SPATIAL_NODE', '00000000-0000-4000-8000-0000000000a1', 1, 'seed', 1,
  '{"nodeId":"00000000-0000-4000-8000-0000000000a1","change":"CREATED","path":"NORTH","previousPath":null,"parentId":null,"nodeTypeCode":"FARM","countryCode":null,"subdivisionCode":null,"timeZone":null,"status":"ACTIVE","aggregateVersion":1}'),
 ('old-2', 'geo-a', 'geospatial.facts.v1', 'SpatialNodeChangedV1', 'SPATIAL_NODE', '00000000-0000-4000-8000-0000000000a1', 2, 'seed', 1,
  '{"nodeId":"00000000-0000-4000-8000-0000000000a1","change":"UPDATED","path":"NORTH","previousPath":null,"parentId":null,"nodeTypeCode":"FARM","countryCode":null,"subdivisionCode":null,"timeZone":null,"status":"ACTIVE","aggregateVersion":2}'),
 ('type-1', 'geo-a', 'geospatial.facts.v1', 'SpatialNodeTypeCreatedV1', 'SPATIAL_NODE_TYPE', '00000000-0000-4000-8000-0000000000f1', 1, 'seed', 1, '{}');
SQL
migrate "$MIG" 8
# The relay tests count facts from the seeded state, so they run before the inbox adds places.
cd "$REPO" && { GEOSPATIAL_TEST_DATABASE_URL="$RUNTIME" npx vitest run modules/geospatial/apps/api/src --exclude "**/inbox/**" --exclude "**/pack/*.integration.test.ts" 2>&1; \
  GEOSPATIAL_TEST_DATABASE_URL="$RUNTIME" npx vitest run modules/geospatial/apps/api/src/inbox modules/geospatial/apps/api/src/pack 2>&1; } | sed "s/\x1b\[[0-9;]*m//g" | grep -E "Tests |✓ .*(relay|inbox|pack)|×|FAIL|Error:|expected|received" | head -30
