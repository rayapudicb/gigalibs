#!/usr/bin/env bash
# Jobs integration tests on a throwaway PostgreSQL 16 (127.0.0.1, removed afterwards): a minimal tenants table plus the
# kernel job migrations.
set -euo pipefail
REPO="$HOME/dev/gigalibs" PG=gl-104c-jobs-it PORT=55452
trap 'docker rm -f "$PG" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$PG" -p 127.0.0.1:$PORT:5432 -e POSTGRES_USER=gigalibs -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=gigalibs postgres:16-alpine >/dev/null
until docker exec "$PG" pg_isready -U gigalibs -d gigalibs >/dev/null 2>&1; do sleep 1; done; sleep 2
psql() { docker exec -i "$PG" psql -U gigalibs -d gigalibs -v ON_ERROR_STOP=1 -qAt "$@"; }
echo 'CREATE TABLE "tenants" ("id" TEXT PRIMARY KEY);' | psql
for m in 20260930000000_kernel_jobs_foundation 20260930010000_kernel_job_schedules; do psql <"$REPO/packages/db/migrations/$m/migration.sql" >/dev/null; done
cd "$REPO" && JOBS_TEST_DATABASE_URL="postgresql://gigalibs:smoke@127.0.0.1:$PORT/gigalibs" npx vitest run packages/jobs 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |✓|×|FAIL|AssertionError|error:" | head -40
