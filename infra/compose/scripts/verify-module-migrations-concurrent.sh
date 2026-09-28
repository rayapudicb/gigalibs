#!/usr/bin/env bash
set -euo pipefail

# Regression for the 2026-09-26 "tuple concurrently updated" failure: Workforce and Geospatial migration
# jobs started together collided on shared catalog rows (GRANT CONNECT ON DATABASE). Runs both module
# runners in parallel against a throwaway database for several rounds; every run must succeed.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"
GEOSPATIAL_ENV="${COMPOSE_DIR}/.env.geospatial"
VERIFY_DATABASE="gigalibs_module_migration_concurrency"
ROUNDS="${ROUNDS:-3}"

read_value() {
  awk -v key="$2" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$1"
}
database_url_for() {
  SOURCE_DATABASE_URL="$1" TARGET_DATABASE="${VERIFY_DATABASE}" node -e '
    const url = new URL(process.env.SOURCE_DATABASE_URL);
    url.pathname = `/${process.env.TARGET_DATABASE}`;
    process.stdout.write(url.toString());'
}

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
LOG_DIR="$(mktemp -d)"
cleanup() {
  docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -q \
    -c "DROP DATABASE IF EXISTS ${VERIFY_DATABASE} WITH (FORCE);" >/dev/null 2>&1 || true
  rm -rf "${LOG_DIR}"
}
trap cleanup EXIT

run_module() {
  local env_file="$1" prefix="$2" schema="$3" version="$4" append_only="$5" read_only="$6"
  docker run --rm --add-host host.docker.internal:host-gateway \
    --env "DATABASE_URL=$(database_url_for "$(read_value "${env_file}" "${prefix}_MIGRATIONS_DATABASE_URL")")" \
    --env "MODULE_RUNTIME_DATABASE_URL=$(database_url_for "$(read_value "${env_file}" "${prefix}_DATABASE_URL")")" \
    --env MODULE_MIGRATIONS_DIRECTORY=/app/migrations \
    --env "MODULE_SCHEMA=${schema}" \
    --env "MODULE_EXPECTED_MIGRATION_VERSION=${version}" \
    --env "MODULE_APPEND_ONLY_TABLES=${append_only}" \
    --env "MODULE_READ_ONLY_TABLES=${read_only}" \
    "$(read_value "${env_file}" "${prefix}_IMAGE")" run-module-migrations.mjs
}

cleanup
docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -q -c "CREATE DATABASE ${VERIFY_DATABASE};"
mkdir -p "${LOG_DIR}"

for round in $(seq 1 "${ROUNDS}"); do
  run_module "${WORKFORCE_ENV}" WORKFORCE gigalibs_workforce 8 audit_events,booking_events auth_revocation_events >"${LOG_DIR}/w${round}.log" 2>&1 &
  workforce_pid=$!
  run_module "${GEOSPATIAL_ENV}" GEOSPATIAL gigalibs_geospatial 3 audit_events auth_revocation_events >"${LOG_DIR}/g${round}.log" 2>&1 &
  geospatial_pid=$!
  failed=0
  wait "${workforce_pid}" || failed=1
  wait "${geospatial_pid}" || failed=1
  if [[ "${failed}" != "0" ]]; then
    echo "Error: concurrent module migrations failed in round ${round}." >&2
    grep -h -E "error|Error" "${LOG_DIR}/w${round}.log" "${LOG_DIR}/g${round}.log" | head -5 >&2
    exit 1
  fi
done

echo "Concurrent module migrations passed: ${ROUNDS} rounds of Workforce and Geospatial runners in parallel."
