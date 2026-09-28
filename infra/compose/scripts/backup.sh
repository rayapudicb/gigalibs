#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_ENV="${COMPOSE_DIR}/.env"
BACKUP_DIR="${COMPOSE_DIR}/backups"

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
PROFILE_KEY="$(read_local_value PROFILE_KEY)"
RELEASE_ID="$(read_local_value RELEASE_ID)"
SOURCE_REVISION="$(read_local_value SOURCE_REVISION)"
SOURCE_STATE_SHA256="$(read_local_value SOURCE_STATE_SHA256)"

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

umask 077
mkdir -p "${BACKUP_DIR}"
TIMESTAMP="$(date -u +'%Y%m%d_%H%M%SZ')"
BACKUP_FILE="${BACKUP_DIR}/gigalibs_backup_${TIMESTAMP}.dump"
METADATA_FILE="${BACKUP_DIR}/gigalibs_backup_${TIMESTAMP}.json"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
TEMP_FILE="$(mktemp "${BACKUP_DIR}/.backup-partial.XXXXXX")"
trap 'rm -f "${TEMP_FILE}"' EXIT

docker exec "${CONTROL_POSTGRES_CONTAINER}" \
  pg_dump -U "${CONTROL_DB_USER}" -d "${CONTROL_DB_NAME}" -Fc -Z 6 >"${TEMP_FILE}"
if [[ ! -s "${TEMP_FILE}" ]]; then
  echo "Error: pg_dump produced an empty file." >&2
  exit 1
fi
mv "${TEMP_FILE}" "${BACKUP_FILE}"
trap - EXIT

FILE_SIZE="$(wc -c <"${BACKUP_FILE}" | tr -d ' ')"
FILE_SHA256="$(shasum -a 256 "${BACKUP_FILE}" | awk '{print $1}')"
printf '%s  %s\n' "${FILE_SHA256}" "$(basename "${BACKUP_FILE}")" >"${CHECKSUM_FILE}"
cat >"${METADATA_FILE}" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "profileKey": "${PROFILE_KEY}",
  "releaseId": "${RELEASE_ID}",
  "sourceRevision": "${SOURCE_REVISION}",
  "sourceStateSha256": "${SOURCE_STATE_SHA256}",
  "database": "${CONTROL_DB_NAME}",
  "backupFile": "$(basename "${BACKUP_FILE}")",
  "sizeBytes": ${FILE_SIZE},
  "sha256": "${FILE_SHA256}",
  "engine": "PostgreSQL 16",
  "format": "custom-fc"
}
EOF

echo "Database backup created: ${BACKUP_FILE}"
echo "Checksum: ${CHECKSUM_FILE}"
echo "Metadata: ${METADATA_FILE}"
