#!/usr/bin/env bash
# WI-OI-104d: Connector Hub integration tests on a throwaway PostgreSQL 16 (127.0.0.1, removed afterwards). The real
# module migration runner applies migrations 1-6 and provisions the non-superuser runtime role.
set -euo pipefail
REPO="$HOME/dev/gigalibs" PG=gl-104d-hub-it PORT=55462
API="$REPO/modules/universal-connector-hub/apps/api"
trap 'docker rm -f "$PG" >/dev/null 2>&1 || true; rm -f "$API/.run-migrations.tmp.mjs"' EXIT
docker run -d --name "$PG" -p 127.0.0.1:$PORT:5432 -e POSTGRES_USER=gigalibs -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=gigalibs postgres:16-alpine >/dev/null
until docker exec "$PG" pg_isready -U gigalibs -d gigalibs >/dev/null 2>&1; do sleep 1; done; sleep 2
cp "$REPO/infra/compose/docker/run-module-migrations.mjs" "$API/.run-migrations.tmp.mjs"
RUNTIME="postgresql://gigalibs_connectors_runtime:runtime-smoke@127.0.0.1:$PORT/gigalibs"
(cd "$API" && DATABASE_URL="postgresql://gigalibs:smoke@127.0.0.1:$PORT/gigalibs" MODULE_RUNTIME_DATABASE_URL="$RUNTIME" \
  MODULE_MIGRATIONS_DIRECTORY="$REPO/modules/universal-connector-hub/db/migrations" MODULE_SCHEMA=gigalibs_connectors \
  MODULE_EXPECTED_MIGRATION_VERSION=8 MODULE_APPEND_ONLY_TABLES=audit_events \
  MODULE_READ_ONLY_TABLES=connector_definitions,auth_revocation_events node .run-migrations.tmp.mjs | tail -3)
cd "$REPO" && CONNECTOR_HUB_TEST_DATABASE_URL="$RUNTIME" npx vitest run modules/universal-connector-hub/apps/api/src 2>&1 | sed "s/\x1b\[[0-9;]*m//g" > "/private/tmp/claude-501/-Users-rayapudi/7e540710-a7a2-4b98-bf5a-871b8ca5b513/scratchpad/hub-it.log" || true
grep -E "Tests |×|FAIL|Error:|expected|received" "/private/tmp/claude-501/-Users-rayapudi/7e540710-a7a2-4b98-bf5a-871b8ca5b513/scratchpad/hub-it.log" | head -30
