#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
LOCAL_ENV="${COMPOSE_DIR}/.env"
STATUS="PASS"

pass() { echo "[PASS] $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1" >&2; STATUS="FAIL"; }

echo "GigaLibs configuration-local-development-v1 pre-flight"

if command -v docker >/dev/null 2>&1; then
  pass "$(docker --version)"
else
  fail "Docker is not installed or not in PATH."
fi
if docker compose version >/dev/null 2>&1; then
  pass "$(docker compose version)"
else
  fail "Docker Compose v2 is unavailable."
fi
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if [[ "${NODE_MAJOR}" -ge 22 ]]; then
    pass "Node.js $(node --version)"
  else
    fail "Node.js 22 or newer is required; found $(node --version)."
  fi
else
  fail "Node.js is not installed or not in PATH."
fi
if command -v pnpm >/dev/null 2>&1; then
  pass "pnpm $(pnpm --version)"
else
  fail "pnpm is not installed or not in PATH."
fi
if command -v trivy >/dev/null 2>&1; then
  TRIVY_VERSION="$(trivy --version | awk 'NR == 1 { print $2 }')"
  if [[ "${TRIVY_VERSION}" == "0.74.0" ]]; then
    pass "Trivy ${TRIVY_VERSION}"
  else
    fail "Trivy 0.74.0 is required for comparable image evidence; found ${TRIVY_VERSION:-unknown}."
  fi
else
  fail "Trivy 0.74.0 is not installed or not in PATH."
fi

if ! docker info >/dev/null 2>&1; then
  fail "Docker engine is not reachable."
else
  pass "Docker engine is reachable."
fi

CONTROL_POSTGRES_CONTAINER="gigalibs-postgres"
MINIO_CONTAINER="docker-minio-1"
if [[ -f "${LOCAL_ENV}" ]]; then
  MODE="$(stat -f '%Lp' "${LOCAL_ENV}" 2>/dev/null || stat -c '%a' "${LOCAL_ENV}")"
  if [[ "${MODE}" == "600" ]]; then
    pass "${LOCAL_ENV} has mode 0600."
  else
    fail "${LOCAL_ENV} must have mode 0600; found ${MODE}."
  fi
  # The generated file is controlled local input. Load only operational container identifiers.
  POSTGRES_FROM_ENV="$(awk -F= '$1 == "CONTROL_POSTGRES_CONTAINER" { print substr($0, index($0, "=") + 1); exit }' "${LOCAL_ENV}")"
  MINIO_FROM_ENV="$(awk -F= '$1 == "MINIO_CONTAINER" { print substr($0, index($0, "=") + 1); exit }' "${LOCAL_ENV}")"
  CONTROL_POSTGRES_CONTAINER="${POSTGRES_FROM_ENV:-${CONTROL_POSTGRES_CONTAINER}}"
  MINIO_CONTAINER="${MINIO_FROM_ENV:-${MINIO_CONTAINER}}"
else
  warn "${LOCAL_ENV} is absent; run generate-credentials.sh after dependency checks pass."
fi

check_running_container() {
  local container_name="$1"
  local component="$2"
  local running
  running="$(docker inspect --format '{{.State.Running}}' "${container_name}" 2>/dev/null || true)"
  if [[ "${running}" == "true" ]]; then
    pass "${component} container ${container_name} is running."
  else
    fail "${component} container ${container_name} is not running."
  fi
}

if docker info >/dev/null 2>&1; then
  check_running_container "${CONTROL_POSTGRES_CONTAINER}" "PostgreSQL"
  check_running_container "${MINIO_CONTAINER}" "MinIO"
fi

if [[ "$(uname)" == "Darwin" ]]; then
  CPU_CORES="$(sysctl -n hw.ncpu)"
  MEM_BYTES="$(sysctl -n hw.memsize)"
  MEM_GB=$((MEM_BYTES / 1024 / 1024 / 1024))
else
  CPU_CORES="$(nproc)"
  MEM_KB="$(awk '/MemTotal/ { print $2; exit }' /proc/meminfo)"
  MEM_GB=$((MEM_KB / 1024 / 1024))
fi
DISK_FREE_KB="$(df -k "${REPO_ROOT}" | awk 'NR == 2 { print $4 }')"
DISK_FREE_GB=$((DISK_FREE_KB / 1024 / 1024))

[[ "${CPU_CORES}" -ge 4 ]] && pass "CPU cores: ${CPU_CORES}" || warn "CPU cores: ${CPU_CORES}; 4 recommended."
[[ "${MEM_GB}" -ge 8 ]] && pass "Memory: ${MEM_GB} GB" || warn "Memory: ${MEM_GB} GB; 8 GB recommended."
[[ "${DISK_FREE_GB}" -ge 20 ]] && pass "Free disk: ${DISK_FREE_GB} GB" || warn "Free disk: ${DISK_FREE_GB} GB; 20 GB recommended."

for port in 3333 5180; do
  if lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t >/dev/null 2>&1; then
    warn "Application port ${port} is already in use; stop the host process before Compose startup."
  else
    pass "Application port ${port} is available."
  fi
done

node "${REPO_ROOT}/scripts/verify-configuration-local-profile.mjs" >/dev/null \
  && pass "Machine-readable local profile contract passes." \
  || fail "Machine-readable local profile contract failed."

if [[ "${STATUS}" != "PASS" ]]; then
  echo "Pre-flight failed. Resolve the failures; no application container was started." >&2
  exit 1
fi
echo "Pre-flight passed for local development. This is not production certification."
