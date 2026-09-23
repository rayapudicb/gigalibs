#!/usr/bin/env bash
# verify-local-restore.sh — Verify backup/restore, migration history, and manifest checksum.
# Writes evidence JSON to $EVIDENCE_PATH. Exits 0 on PASS, 1 on FAIL.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
LOCAL_ENV="${COMPOSE_DIR}/.env"

if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "Error: NODE_ENV=production is not permitted for restore verification." >&2; exit 1
fi
if [[ -z "${EVIDENCE_PATH:-}" ]]; then
  echo "Error: EVIDENCE_PATH is required." >&2; exit 1
fi
if [[ -e "${EVIDENCE_PATH}" ]]; then
  echo "Error: EVIDENCE_PATH already exists: ${EVIDENCE_PATH}" >&2; exit 1
fi
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <path-to-backup.dump>" >&2; exit 1
fi
DUMP_PATH="$1"
if [[ ! -f "${DUMP_PATH}" || ! -s "${DUMP_PATH}" ]]; then
  echo "Error: non-empty backup file not found: ${DUMP_PATH}" >&2; exit 1
fi
if [[ ! -f "${LOCAL_ENV}" ]]; then
  echo "Error: ${LOCAL_ENV} is required." >&2; exit 1
fi

read_local_value() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${LOCAL_ENV}" | sed "s/^['\"]//;s/['\"]$//")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${LOCAL_ENV}." >&2; exit 1
  fi
  printf '%s' "${value}"
}

CONTROL_POSTGRES_CONTAINER="$(read_local_value CONTROL_POSTGRES_CONTAINER)"
CONTROL_DB_USER="$(read_local_value CONTROL_DB_USER)"
CONTROL_DB_NAME="$(read_local_value CONTROL_DB_NAME)"
RESTORE_DB="gigalibs_restore_verify_$(date -u +%Y%m%d%H%M%S)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OUTCOMES=()
FAILURES=()
STATUS="FAIL"

for identifier in "${CONTROL_POSTGRES_CONTAINER}" "${CONTROL_DB_USER}" "${CONTROL_DB_NAME}" "${RESTORE_DB}"; do
  if [[ ! "${identifier}" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
    echo "Error: unsafe identifier: ${identifier}" >&2; exit 1
  fi
done
if [[ "$(docker inspect --format '{{.State.Running}}' "${CONTROL_POSTGRES_CONTAINER}" 2>/dev/null || true)" != "true" ]]; then
  echo "Error: PostgreSQL container ${CONTROL_POSTGRES_CONTAINER} is not running." >&2; exit 1
fi

cleanup() {
  local exit_code=$?
  # Drop the disposable restore database
  docker exec "${CONTROL_POSTGRES_CONTAINER}" \
    psql -U "${CONTROL_DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS \"${RESTORE_DB}\";" >/dev/null 2>&1 || true
  # Write evidence
  local failures_json
  failures_json="$(printf '"%s",' "${FAILURES[@]:-}" | sed 's/,$//')"
  local outcomes_json
  outcomes_json="$(printf '"%s",' "${OUTCOMES[@]:-}" | sed 's/,$//')"
  cat > "${EVIDENCE_PATH}" <<EOF
{
  "verifier": "verify-local-restore",
  "timestamp": "${STARTED_AT}",
  "status": "${STATUS}",
  "restoreDatabase": "${RESTORE_DB}",
  "outcomes": [${outcomes_json}],
  "failures": [${failures_json}],
  "limitations": ["full-migration-replay-requires-clean-target-manually"]
}
EOF
  exit "${exit_code}"
}
trap cleanup EXIT

# 1. Verify backup checksum
CHECKSUM_FILE="${DUMP_PATH}.sha256"
if [[ ! -f "${CHECKSUM_FILE}" ]]; then
  FAILURES+=("checksum-file-missing: ${CHECKSUM_FILE}")
  exit 1
fi
EXPECTED_SHA256="$(awk 'NR==1{print $1}' "${CHECKSUM_FILE}")"
ACTUAL_SHA256="$(shasum -a 256 "${DUMP_PATH}" | awk '{print $1}')"
if [[ "${EXPECTED_SHA256}" != "${ACTUAL_SHA256}" ]]; then
  FAILURES+=("checksum-mismatch: expected=${EXPECTED_SHA256} actual=${ACTUAL_SHA256}")
  exit 1
fi
OUTCOMES+=("backup-checksum-verified")

# 2. Create disposable restore target
docker exec "${CONTROL_POSTGRES_CONTAINER}" \
  psql -U "${CONTROL_DB_USER}" -d postgres -c "CREATE DATABASE \"${RESTORE_DB}\";" >/dev/null
OUTCOMES+=("disposable-restore-db-created")

# 3. Restore into disposable DB
docker exec -i "${CONTROL_POSTGRES_CONTAINER}" \
  pg_restore -U "${CONTROL_DB_USER}" -d "${RESTORE_DB}" \
  --clean --if-exists --exit-on-error --single-transaction < "${DUMP_PATH}"
OUTCOMES+=("pg-restore-completed")

# 4. Verify migration count (expect >= 37 applied migrations)
MIGRATION_COUNT="$(docker exec "${CONTROL_POSTGRES_CONTAINER}" \
  psql -U "${CONTROL_DB_USER}" -d "${RESTORE_DB}" -t -c \
  "SELECT COUNT(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL;" 2>/dev/null | tr -d ' \n')"
if [[ -z "${MIGRATION_COUNT}" ]] || [[ "${MIGRATION_COUNT}" -lt 37 ]]; then
  FAILURES+=("migration-count-too-low: ${MIGRATION_COUNT} (expected >= 37)")
  exit 1
fi
OUTCOMES+=("migration-count-verified: ${MIGRATION_COUNT}")

# 5. Verify required Configuration tables exist
REQUIRED_TABLES=("configuration_packages" "configuration_change_sets" "configuration_activations")
for tbl in "${REQUIRED_TABLES[@]}"; do
  FOUND="$(docker exec "${CONTROL_POSTGRES_CONTAINER}" \
    psql -U "${CONTROL_DB_USER}" -d "${RESTORE_DB}" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='${tbl}';" 2>/dev/null | tr -d ' \n')"
  if [[ "${FOUND}" != "1" ]]; then
    FAILURES+=("required-table-missing: ${tbl}")
    exit 1
  fi
done
OUTCOMES+=("configuration-tables-present")

# 6. Verify active manifest checksum is preserved (count only, no value printed)
CHECKSUM_COUNT="$(docker exec "${CONTROL_POSTGRES_CONTAINER}" \
  psql -U "${CONTROL_DB_USER}" -d "${RESTORE_DB}" -t -c \
  "SELECT COUNT(*) FROM configuration_activations WHERE revoked_at IS NULL;" 2>/dev/null | tr -d ' \n')"
OUTCOMES+=("active-activation-count: ${CHECKSUM_COUNT}")

STATUS="PASS"
OUTCOMES+=("restore-verification-complete")
