#!/usr/bin/env bash
# scripts/dev-modules.sh
# Starts all GigaLibs module API backends for local development.
# Each module runs in the background with its own .env file.
# Usage: bash scripts/dev-modules.sh [stop]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS_FILE="${REPO_ROOT}/.dev-modules.pids"

stop_modules() {
  if [[ -f "${PIDS_FILE}" ]]; then
    echo "→ Stopping module API processes..."
    while IFS= read -r line; do
      name="${line%%:*}"
      pid="${line##*:}"
      if kill -0 "${pid}" 2>/dev/null; then
        kill "${pid}" && echo "  ✓ Stopped ${name} (PID ${pid})"
      else
        echo "  - ${name} (PID ${pid}) already stopped"
      fi
    done < "${PIDS_FILE}"
    rm -f "${PIDS_FILE}"
    echo "→ All module APIs stopped."
  else
    echo "No running module processes found (${PIDS_FILE} not present)."
  fi
  exit 0
}

if [[ "${1:-}" == "stop" ]]; then
  stop_modules
fi

if [[ -f "${PIDS_FILE}" ]]; then
  echo "⚠ Module APIs may already be running. Run 'bash scripts/dev-modules.sh stop' first, or delete ${PIDS_FILE}."
  exit 1
fi

LOG_DIR="${REPO_ROOT}/.dev-module-logs"
mkdir -p "${LOG_DIR}"

start_module() {
  local name="$1"
  local filter="$2"
  local port="$3"

  echo "→ Starting ${name} on port ${port}..."
  pnpm --filter "${filter}" dev \
    > "${LOG_DIR}/${name}.log" 2>&1 &
  local pid=$!
  echo "${name}:${pid}" >> "${PIDS_FILE}"
  echo "  PID ${pid} — logs: ${LOG_DIR}/${name}.log"
}

# Check postgres is up on port 5440 before starting modules
if ! nc -z 127.0.0.1 5440 2>/dev/null; then
  echo "⚠ PostgreSQL is not reachable on port 5440."
  echo "  Run: docker start gigalibs-postgres"
  echo "  Then retry this script."
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GigaLibs Module API Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

start_module "ar-api"            "@gigalibs/ar-api"            3400
start_module "spend-api"         "@gigalibs/spend-api"         3500
start_module "tax-api"           "@gigalibs/tax-api"           3600
start_module "currency-api"      "@gigalibs/currency-api"      3700
start_module "connectors-api"    "@gigalibs/connectors-api"    4100

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All module APIs starting. Waiting 8s for readiness..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sleep 8

echo ""
echo "  Health checks:"
for entry in "AR:3400" "Spend:3500" "Tax:3600" "Currency:3700" "ConnectorHub:4100"; do
  label="${entry%%:*}"
  port="${entry##*:}"
  if nc -z 127.0.0.1 "${port}" 2>/dev/null; then
    echo "  ✓ ${label} API — port ${port} OPEN"
  else
    echo "  ✗ ${label} API — port ${port} NOT YET OPEN (check .dev-module-logs/${label,,}-api.log)"
  fi
done

echo ""
echo "  To stop all modules:  bash scripts/dev-modules.sh stop"
echo "  To tail a log:        tail -f .dev-module-logs/ar-api.log"
echo ""
