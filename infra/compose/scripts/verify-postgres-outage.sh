#!/usr/bin/env bash
# verify-postgres-outage.sh
# Phase A4: Verifies API liveness/readiness contract during PostgreSQL container outage.
# Reads connection info from infra/compose/.env; never prints credentials.
# Usage: EVIDENCE_PATH=<path> bash infra/compose/scripts/verify-postgres-outage.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_ENV="${COMPOSE_DIR}/.env"

if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "ERROR: NODE_ENV=production is not permitted" >&2; exit 1
fi
if [[ -z "${EVIDENCE_PATH:-}" ]]; then
  echo "ERROR: EVIDENCE_PATH must be set" >&2; exit 1
fi

read_local_value() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${LOCAL_ENV}" | sed "s/^['\"]//;s/['\"]$//")"
  if [[ -z "${value}" ]]; then echo "ERROR: ${key} missing from .env" >&2; exit 1; fi
  printf '%s' "${value}"
}

CONTAINER="$(read_local_value CONTROL_POSTGRES_CONTAINER)"
API_PORT="$(read_local_value API_PUBLIC_PORT)"
API_URL="http://localhost:${API_PORT}"

# Validate container name (no shell injection)
if ! echo "${CONTAINER}" | grep -qE '^[a-zA-Z0-9_.-]+$'; then
  echo "ERROR: invalid container name: ${CONTAINER}" >&2; exit 1
fi

OUTCOMES=()
FAILURES=()
START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

write_evidence() {
  local status="$1"
  local failures_json
  if [[ ${#FAILURES[@]} -eq 0 ]]; then failures_json="[]"; else
    failures_json="["
    for f in "${FAILURES[@]}"; do failures_json+="\"${f}\","; done
    failures_json="${failures_json%,}]"
  fi
  local outcomes_json
  outcomes_json="["
  for o in "${OUTCOMES[@]}"; do outcomes_json+="\"${o}\","; done
  outcomes_json="${outcomes_json%,}]"
  cat > "${EVIDENCE_PATH}" << EOF
{
  "verifier": "verify-postgres-outage",
  "timestamp": "${START_TS}",
  "status": "${status}",
  "container": "${CONTAINER}",
  "apiUrl": "${API_URL}",
  "outcomes": ${outcomes_json},
  "failures": ${failures_json}
}
EOF
}

# Cleanup: always restart the PG container on exit
cleanup() {
  echo "[cleanup] Ensuring ${CONTAINER} is running..."
  docker start "${CONTAINER}" >/dev/null 2>&1 || true
  sleep 5
  local final_live
  final_live="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/v1/health" 2>/dev/null || echo '000')"
  echo "[cleanup] Post-restore liveness: ${final_live}"
}
trap cleanup EXIT

# Pre-outage: verify healthy baseline
echo "[1/6] Verifying baseline liveness..."
PRE_LIVE="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/v1/health" 2>/dev/null || echo '000')"
if [[ "${PRE_LIVE}" != "200" ]]; then
  FAILURES+=("pre-outage liveness=${PRE_LIVE} expected 200")
  write_evidence "FAIL"; exit 1
fi
OUTCOMES+=("pre-outage-liveness=200")

echo "[2/6] Verifying baseline readiness..."
PRE_READY="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/v1/ready" 2>/dev/null || echo '000')"
if [[ "${PRE_READY}" != "200" ]]; then
  FAILURES+=("pre-outage readiness=${PRE_READY} expected 200")
  write_evidence "FAIL"; exit 1
fi
OUTCOMES+=("pre-outage-readiness=200")

# Stop PG
echo "[3/6] Stopping PostgreSQL container (${CONTAINER})..."
docker stop "${CONTAINER}" >/dev/null
sleep 15

# During outage: liveness must remain 200 (process up), readiness must degrade
echo "[4/6] Checking liveness during outage (expect 200)..."
OUTAGE_LIVE="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/api/v1/health" 2>/dev/null || echo '000')"
if [[ "${OUTAGE_LIVE}" != "200" ]]; then
  FAILURES+=("outage liveness=${OUTAGE_LIVE} expected 200 — process must stay live even when DB is down")
fi
OUTCOMES+=("outage-liveness=${OUTAGE_LIVE}")

echo "[5/6] Checking readiness during outage (expect non-200)..."
OUTAGE_READY="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/api/v1/ready" 2>/dev/null || echo '000')"
if [[ "${OUTAGE_READY}" == "200" ]]; then
  FAILURES+=("outage readiness=${OUTAGE_READY} — readiness must degrade when DB is unreachable")
fi
OUTCOMES+=("outage-readiness=${OUTAGE_READY}")

# Restart PG and verify recovery
echo "[6/6] Restarting PostgreSQL and polling for recovery (up to 30s)..."
docker start "${CONTAINER}" >/dev/null
for i in $(seq 1 6); do
  sleep 5
  RECOVER_READY="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/v1/ready" 2>/dev/null || echo '000')"
  if [[ "${RECOVER_READY}" == "200" ]]; then
    OUTCOMES+=("post-outage-readiness=200")
    echo "  Recovery confirmed (${i}x5s)"
    break
  fi
  if [[ $i -eq 6 ]]; then
    FAILURES+=("readiness did not recover in 30s after PG restart (last=${RECOVER_READY})")
  fi
done

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo "FAIL: ${FAILURES[*]}"
  write_evidence "FAIL"; exit 1
fi

write_evidence "PASS"
echo "PASS: PostgreSQL outage contract verified"
exit 0
