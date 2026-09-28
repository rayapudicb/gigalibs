#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
VERIFY_DATABASE="gigalibs_wi_oi_059_verify"

read_value() {
  local file="$1"
  local key="$2"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${file}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${file}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

database_url_for() {
  local source_url="$1"
  local database="$2"
  SOURCE_DATABASE_URL="${source_url}" TARGET_DATABASE="${database}" node -e '
    const url = new URL(process.env.SOURCE_DATABASE_URL);
    url.pathname = `/${process.env.TARGET_DATABASE}`;
    process.stdout.write(url.toString());
  '
}

url_part() {
  local source_url="$1"
  local part="$2"
  SOURCE_DATABASE_URL="${source_url}" URL_PART="${part}" node -e '
    const url = new URL(process.env.SOURCE_DATABASE_URL);
    const value = process.env.URL_PART === "username" ? url.username : url.password;
    process.stdout.write(decodeURIComponent(value));
  '
}

for file in "${BASE_ENV}" "${MODULE_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required." >&2
    exit 1
  fi
done

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
ADMIN_DATABASE_URL="$(database_url_for "$(read_value "${MODULE_ENV}" MODULE_MIGRATIONS_DATABASE_URL)" "${VERIFY_DATABASE}")"
CONNECTORS_DATABASE_URL="$(database_url_for "$(read_value "${MODULE_ENV}" CONNECTORS_DATABASE_URL)" "${VERIFY_DATABASE}")"
ANALYTICS_DATABASE_URL="$(database_url_for "$(read_value "${MODULE_ENV}" ANALYTICS_DATABASE_URL)" "${VERIFY_DATABASE}")"
CONNECTOR_HUB_IMAGE="$(read_value "${MODULE_ENV}" CONNECTOR_HUB_IMAGE)"
ANALYTICS_IMAGE="$(read_value "${MODULE_ENV}" ANALYTICS_IMAGE)"

cleanup() {
  docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS ${VERIFY_DATABASE} WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker exec "${POSTGRES_CONTAINER}" psql -U "${ADMIN_USER}" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE ${VERIFY_DATABASE};" >/dev/null

docker run --rm \
  --add-host host.docker.internal:host-gateway \
  --env "DATABASE_URL=${ADMIN_DATABASE_URL}" \
  --env "MODULE_RUNTIME_DATABASE_URL=${CONNECTORS_DATABASE_URL}" \
  --env MODULE_MIGRATIONS_DIRECTORY=/app/migrations \
  --env MODULE_SCHEMA=gigalibs_connectors \
  --env MODULE_EXPECTED_MIGRATION_VERSION=4 \
  --env MODULE_APPEND_ONLY_TABLES=audit_events \
  --env MODULE_READ_ONLY_TABLES=connector_definitions \
  "${CONNECTOR_HUB_IMAGE}" run-module-migrations.mjs

docker run --rm \
  --add-host host.docker.internal:host-gateway \
  --env "DATABASE_URL=${ADMIN_DATABASE_URL}" \
  --env "MODULE_RUNTIME_DATABASE_URL=${ANALYTICS_DATABASE_URL}" \
  --env MODULE_MIGRATIONS_DIRECTORY=/app/migrations \
  --env MODULE_SCHEMA=gigalibs_analytics \
  --env MODULE_EXPECTED_MIGRATION_VERSION=15 \
  --env MODULE_APPEND_ONLY_TABLES=raw_record_versions,studio_mapping_versions,report_artifacts,report_deliveries,analytics_lineage_edges,analytics_audit_log,operational_facts \
  --env MODULE_READ_ONLY_TABLES=auth_revocation_events \
  "${ANALYTICS_IMAGE}" run-module-migrations.mjs

CONNECTORS_USER="$(url_part "${CONNECTORS_DATABASE_URL}" username)"
CONNECTORS_PASSWORD="$(url_part "${CONNECTORS_DATABASE_URL}" password)"
ANALYTICS_USER="$(url_part "${ANALYTICS_DATABASE_URL}" username)"
ANALYTICS_PASSWORD="$(url_part "${ANALYTICS_DATABASE_URL}" password)"

docker exec -e "PGPASSWORD=${CONNECTORS_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${CONNECTORS_USER}" -d "${VERIFY_DATABASE}" -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; INSERT INTO gigalibs_connectors.tenant_connections (id, tenant_id, connector_code, name, slug) VALUES ('verify-conn-a', 'tenant-a', 'CUSTOM_WEBHOOK', 'Tenant A', 'verify'); COMMIT;" >/dev/null
docker exec -e "PGPASSWORD=${CONNECTORS_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${CONNECTORS_USER}" -d "${VERIFY_DATABASE}" -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-b'; INSERT INTO gigalibs_connectors.tenant_connections (id, tenant_id, connector_code, name, slug) VALUES ('verify-conn-b', 'tenant-b', 'CUSTOM_WEBHOOK', 'Tenant B', 'verify'); COMMIT;" >/dev/null
CONNECTOR_VISIBLE="$(docker exec -e "PGPASSWORD=${CONNECTORS_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${CONNECTORS_USER}" -d "${VERIFY_DATABASE}" -At -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; SELECT count(*) FROM gigalibs_connectors.tenant_connections; COMMIT;" | sed -n '3p')"
if [[ "${CONNECTOR_VISIBLE}" != "1" ]]; then
  echo "Error: Connector Hub tenant isolation expected 1 visible row, found ${CONNECTOR_VISIBLE}." >&2
  exit 1
fi

docker exec -e "PGPASSWORD=${ANALYTICS_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${ANALYTICS_USER}" -d "${VERIFY_DATABASE}" -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; INSERT INTO gigalibs_analytics.tenant_analytics_configs (tenant_id) VALUES ('tenant-a'); COMMIT;" >/dev/null
docker exec -e "PGPASSWORD=${ANALYTICS_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${ANALYTICS_USER}" -d "${VERIFY_DATABASE}" -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-b'; INSERT INTO gigalibs_analytics.tenant_analytics_configs (tenant_id) VALUES ('tenant-b'); COMMIT;" >/dev/null
ANALYTICS_VISIBLE="$(docker exec -e "PGPASSWORD=${ANALYTICS_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${ANALYTICS_USER}" -d "${VERIFY_DATABASE}" -At -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; SELECT count(*) FROM gigalibs_analytics.tenant_analytics_configs; COMMIT;" | sed -n '3p')"
if [[ "${ANALYTICS_VISIBLE}" != "1" ]]; then
  echo "Error: Analytics tenant isolation expected 1 visible row, found ${ANALYTICS_VISIBLE}." >&2
  exit 1
fi

echo "Clean migration replay and two-tenant RLS verification passed for Connector Hub v4 and Analytics v15."
