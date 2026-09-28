#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <path-to-custom-format-dump>" >&2
  exit 1
fi

DUMP_PATH="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_ENV="${COMPOSE_DIR}/.env"
COMPOSE_FILE="${COMPOSE_DIR}/compose.yaml"

if [[ ! -f "${DUMP_PATH}" || ! -s "${DUMP_PATH}" ]]; then
  echo "Error: non-empty backup file not found: ${DUMP_PATH}" >&2
  exit 1
fi
if [[ ! -f "${LOCAL_ENV}" ]]; then
  echo "Error: ${LOCAL_ENV} is required." >&2
  exit 1
fi

read_local_value() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${LOCAL_ENV}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${LOCAL_ENV}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

CONTROL_POSTGRES_CONTAINER="$(read_local_value CONTROL_POSTGRES_CONTAINER)"
CONTROL_DB_USER="$(read_local_value CONTROL_DB_USER)"
CONTROL_DB_NAME="$(read_local_value CONTROL_DB_NAME)"
for identifier in "${CONTROL_POSTGRES_CONTAINER}" "${CONTROL_DB_USER}" "${CONTROL_DB_NAME}"; do
  if [[ ! "${identifier}" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
    echo "Error: unsafe PostgreSQL container/user/database identifier." >&2
    exit 1
  fi
done
if [[ "$(docker inspect --format '{{.State.Running}}' "${CONTROL_POSTGRES_CONTAINER}" 2>/dev/null || true)" != "true" ]]; then
  echo "Error: PostgreSQL container ${CONTROL_POSTGRES_CONTAINER} is not running." >&2
  exit 1
fi

CHECKSUM_FILE="${DUMP_PATH}.sha256"
if [[ -f "${CHECKSUM_FILE}" ]]; then
  EXPECTED_SHA256="$(awk 'NR == 1 { print $1 }' "${CHECKSUM_FILE}")"
  ACTUAL_SHA256="$(shasum -a 256 "${DUMP_PATH}" | awk '{print $1}')"
  if [[ ! "${EXPECTED_SHA256}" =~ ^[0-9a-f]{64}$ || "${ACTUAL_SHA256}" != "${EXPECTED_SHA256}" ]]; then
    echo "Error: backup checksum verification failed." >&2
    exit 1
  fi
  echo "Backup checksum verified."
else
  echo "Error: checksum file is required: ${CHECKSUM_FILE}" >&2
  exit 1
fi

echo "DESTRUCTIVE LOCAL RESTORE: all restorable objects in ${CONTROL_DB_NAME} will be replaced."
read -r -p "Type the database name '${CONTROL_DB_NAME}' to continue: " CONFIRMATION
if [[ "${CONFIRMATION}" != "${CONTROL_DB_NAME}" ]]; then
  echo "Restore aborted; confirmation did not match."
  exit 0
fi

APP_WAS_RUNNING="false"
if [[ -n "$(docker compose --env-file "${LOCAL_ENV}" -f "${COMPOSE_FILE}" ps -q api 2>/dev/null)" ]]; then
  docker compose --env-file "${LOCAL_ENV}" -f "${COMPOSE_FILE}" stop api web
  APP_WAS_RUNNING="true"
fi
restart_apps() {
  local original_status="$?"
  trap - EXIT
  if [[ "${APP_WAS_RUNNING}" == "true" ]]; then
    if ! docker compose --env-file "${LOCAL_ENV}" -f "${COMPOSE_FILE}" start api web >/dev/null; then
      echo "Error: restore finished, but the previously running application services did not restart." >&2
      exit 1
    fi
  fi
  exit "${original_status}"
}
trap restart_apps EXIT

docker exec -i "${CONTROL_POSTGRES_CONTAINER}" \
  pg_restore -U "${CONTROL_DB_USER}" -d "${CONTROL_DB_NAME}" \
  --clean --if-exists --exit-on-error --single-transaction <"${DUMP_PATH}"
docker exec "${CONTROL_POSTGRES_CONTAINER}" \
  psql -U "${CONTROL_DB_USER}" -d "${CONTROL_DB_NAME}" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null

echo "Restore and database connectivity verification completed successfully."
