#!/usr/bin/env bash
# verify-minio-outage.sh
# Phase A4: Verifies API liveness/readiness contract during MinIO container outage.
# F2 (Configuration Studio) has NO object-storage dependency — API must remain live/ready.
# Usage: EVIDENCE_PATH=<path> bash infra/compose/scripts/verify-minio-outage.sh
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

CONTAINER="$(read_local_value MINIO_CONTAINER)"
API_PORT="$(read_local_value API_PUBLIC_PORT)"
API_URL="http://localhost:${API_PORT}"

if ! echo "${CONTAINER}" | grep -qE '^[a-zA-Z0-9_.-]+$'; then
  echo "ERROR: invalid container name: ${CONTAINER}" >&2; exit 1
fi

OUTCOMES=()
FAILURES=()
START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEFERRED_TP2="true"  # Object-storage dependency arrives in TP-2; F2 has none

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
  "verifier": "verify-minio-outage",
  "timestamp": "${START_TS}",
  "status": "${status}",
  "container": "${CONTAINER}",
  "apiUrl": "${API_URL}",
  "outcomes": ${outcomes_json},
  "failures": ${failures_json},
  "deferredTP2": ${DEFERRED_TP2},
  "notes": "F2 Configuration Studio has no object-storage dependency. Full MinIO outage test deferred to TP-2 durable export job."
}
EOF
}

cleanup() {
  echo "[cleanup] Ensuring ${CONTAINER} is running..."
  docker start "${CONTAINER}" >/dev/null 2>&1 || true
  sleep 5
}
trap cleanup EXIT

# Pre-outage baseline
echo "[1/5] Verifying baseline liveness..."
PRE_LIVE="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/v1/health" 2>/dev/null || echo '000')"
if [[ "${PRE_LIVE}" != "200" ]]; then
  FAILURES+=("pre-outage liveness=${PRE_LIVE} expected 200")
  write_evidence "FAIL"; exit 1
fi
OUTCOMES+=("pre-outage-liveness=200")

echo "[2/5] Verifying baseline readiness..."
PRE_READY="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/v1/ready" 2>/dev/null || echo '000')"
if [[ "${PRE_READY}" != "200" ]]; then
  FAILURES+=("pre-outage readiness=${PRE_READY} expected 200")
  write_evidence "FAIL"; exit 1
fi
OUTCOMES+=("pre-outage-readiness=200")

# Stop MinIO
echo "[3/5] Stopping MinIO container (${CONTAINER})..."
docker stop "${CONTAINER}" >/dev/null
sleep 10

# During outage: F2 has no object-storage dependency — API must remain live AND ready
echo "[4/5] Checking liveness during MinIO outage (expect 200 — F2 has no object-storage dep)..."
OUTAGE_LIVE="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/api/v1/health" 2>/dev/null || echo '000')"
if [[ "${OUTAGE_LIVE}" != "200" ]]; then
  FAILURES+=("outage liveness=${OUTAGE_LIVE} expected 200 — F2 must not depend on MinIO")
fi
OUTCOMES+=("outage-liveness=${OUTAGE_LIVE}")

OUTAGE_READY="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/api/v1/ready" 2>/dev/null || echo '000')"
if [[ "${OUTAGE_READY}" != "200" ]]; then
  FAILURES+=("outage readiness=${OUTAGE_READY} expected 200 — F2 must not depend on MinIO")
fi
OUTCOMES+=("outage-readiness=${OUTAGE_READY}")

# Restart MinIO and verify recovery
echo "[5/5] Restarting MinIO and polling for API readiness (up to 20s)..."
docker start "${CONTAINER}" >/dev/null
for i in $(seq 1 4); do
  sleep 5
  RECOVER_READY="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/api/v1/ready" 2>/dev/null || echo '000')"
  if [[ "${RECOVER_READY}" == "200" ]]; then
    OUTCOMES+=("post-outage-readiness=200")
    echo "  Recovery confirmed (${i}x5s)"
    break
  fi
  if [[ $i -eq 4 ]]; then
    FAILURES+=("readiness not 200 in 20s after MinIO restart (last=${RECOVER_READY})")
  fi
done

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo "FAIL: ${FAILURES[*]}"
  write_evidence "FAIL"; exit 1
fi

write_evidence "PASS"
echo "PASS: MinIO outage contract verified (F2 correctly has no object-storage dependency)"
exit 0
