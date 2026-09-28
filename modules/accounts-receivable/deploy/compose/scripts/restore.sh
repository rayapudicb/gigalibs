#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-backup-file.dump>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Error: Backup file ${BACKUP_FILE} does not exist." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "WARNING: Restoring will overwrite existing data in the ar database."
read -p "Are you sure you want to proceed? (yes/no): " -r CONFIRM
if [[ "${CONFIRM}" != "yes" ]]; then
  echo "Restore cancelled."
  exit 0
fi

echo "Stopping API and Worker before restoring database..."
docker compose -f "${SCRIPT_DIR}/../compose.yaml" stop api worker

echo "Restoring database from ${BACKUP_FILE}..."
docker compose -f "${SCRIPT_DIR}/../compose.yaml" exec -T postgres \
  pg_restore -U ar_admin -d ar --clean --if-exists --no-owner --no-privileges \
  < "${BACKUP_FILE}"

echo "Restarting API and Worker..."
docker compose -f "${SCRIPT_DIR}/../compose.yaml" start api worker

echo "✅ Restore completed successfully."
