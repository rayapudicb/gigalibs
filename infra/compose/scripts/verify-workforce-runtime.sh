#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASE_ENV="${COMPOSE_DIR}/.env"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"
VERIFY_DATABASE="gigalibs_wi_oi_060_verify"

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
  SOURCE_DATABASE_URL="${source_url}" TARGET_DATABASE="${VERIFY_DATABASE}" node -e '
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

for file in "${BASE_ENV}" "${WORKFORCE_ENV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Error: ${file} is required." >&2
    exit 1
  fi
done

POSTGRES_CONTAINER="$(read_value "${BASE_ENV}" CONTROL_POSTGRES_CONTAINER)"
ADMIN_USER="$(read_value "${BASE_ENV}" CONTROL_DB_USER)"
ADMIN_DATABASE_URL="$(database_url_for "$(read_value "${WORKFORCE_ENV}" WORKFORCE_MIGRATIONS_DATABASE_URL)")"
WORKFORCE_DATABASE_URL="$(database_url_for "$(read_value "${WORKFORCE_ENV}" WORKFORCE_DATABASE_URL)")"
WORKFORCE_IMAGE="$(read_value "${WORKFORCE_ENV}" WORKFORCE_IMAGE)"

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
  --env "MODULE_RUNTIME_DATABASE_URL=${WORKFORCE_DATABASE_URL}" \
  --env MODULE_MIGRATIONS_DIRECTORY=/app/migrations \
  --env MODULE_SCHEMA=gigalibs_workforce \
  --env MODULE_EXPECTED_MIGRATION_VERSION=16 \
  --env MODULE_APPEND_ONLY_TABLES=audit_events,booking_events,punches,punch_voids,time_corrections,earning_lines \
  --env MODULE_READ_ONLY_TABLES=auth_revocation_events \
  "${WORKFORCE_IMAGE}" run-module-migrations.mjs

WORKFORCE_USER="$(url_part "${WORKFORCE_DATABASE_URL}" username)"
WORKFORCE_PASSWORD="$(url_part "${WORKFORCE_DATABASE_URL}" password)"

for tenant in tenant-a tenant-b; do
  docker exec -e "PGPASSWORD=${WORKFORCE_PASSWORD}" "${POSTGRES_CONTAINER}" \
    psql -h 127.0.0.1 -U "${WORKFORCE_USER}" -d "${VERIFY_DATABASE}" -v ON_ERROR_STOP=1 \
    -c "BEGIN; SET LOCAL app.tenant_id = '${tenant}'; INSERT INTO gigalibs_workforce.inbox_receipts (id, tenant_id, consumer_name, message_id, event_type, source_module, source_version, correlation_id, payload_sha256) VALUES ('receipt-${tenant}', '${tenant}', 'verify', 'message-${tenant}', 'VerificationV1', 'certification', 1, 'corr-${tenant}', repeat('a', 64)); COMMIT;" >/dev/null
done

VISIBLE_ROWS="$(docker exec -e "PGPASSWORD=${WORKFORCE_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${WORKFORCE_USER}" -d "${VERIFY_DATABASE}" -At -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; SELECT count(*) FROM gigalibs_workforce.inbox_receipts; COMMIT;" | sed -n '3p')"
if [[ "${VISIBLE_ROWS}" != "1" ]]; then
  echo "Error: Workforce tenant isolation expected 1 visible row, found ${VISIBLE_ROWS}." >&2
  exit 1
fi

UNSCOPED_ROWS="$(docker exec -e "PGPASSWORD=${WORKFORCE_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${WORKFORCE_USER}" -d "${VERIFY_DATABASE}" -At -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM gigalibs_workforce.inbox_receipts;")"
if [[ "${UNSCOPED_ROWS}" != "0" ]]; then
  echo "Error: Workforce unscoped runtime query exposed ${UNSCOPED_ROWS} rows." >&2
  exit 1
fi

docker exec -e "PGPASSWORD=${WORKFORCE_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${WORKFORCE_USER}" -d "${VERIFY_DATABASE}" -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; INSERT INTO gigalibs_workforce.audit_events (id, tenant_id, actor_subject, action, entity_type, correlation_id) VALUES ('audit-a', 'tenant-a', 'certifier', 'VERIFY', 'RUNTIME', 'corr-a'); COMMIT;" >/dev/null
if docker exec -e "PGPASSWORD=${WORKFORCE_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${WORKFORCE_USER}" -d "${VERIFY_DATABASE}" -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL app.tenant_id = 'tenant-a'; UPDATE gigalibs_workforce.audit_events SET action = 'MUTATED' WHERE id = 'audit-a'; COMMIT;" >/dev/null 2>&1; then
  echo "Error: append-only Workforce audit evidence accepted an update." >&2
  exit 1
fi

if docker exec -e "PGPASSWORD=${WORKFORCE_PASSWORD}" "${POSTGRES_CONTAINER}" \
  psql -h 127.0.0.1 -U "${WORKFORCE_USER}" -d "${VERIFY_DATABASE}" -v ON_ERROR_STOP=1 \
  -c "INSERT INTO gigalibs_workforce.schema_migrations (version, name) VALUES (99, 'forbidden');" >/dev/null 2>&1; then
  echo "Error: Workforce runtime role could modify the migration ledger." >&2
  exit 1
fi

echo "WI-OI-061 clean replay, least privilege, RLS and append-only verification passed."
