#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/../backups"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_FILE="${BACKUP_DIR}/ar_backup_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "Starting consistent database backup for Accounts Receivable..."

docker compose -f "${SCRIPT_DIR}/../compose.yaml" exec -T postgres \
  pg_dump -U ar_admin -d ar -Fc --no-owner --no-privileges \
  > "${BACKUP_FILE}"

SIZE=$(wc -c < "${BACKUP_FILE}" | tr -d ' ')
echo "✅ Accounts Receivable backup completed: ${BACKUP_FILE} (${SIZE} bytes)"
