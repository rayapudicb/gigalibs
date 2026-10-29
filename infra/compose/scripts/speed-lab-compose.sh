# shellcheck shell=bash
# WI-OI-120cc (SPEED S9a): the docker compose invocation for the speed-lab preview, project gigalibs-speed-lab only.
# Sourced by up-speed-lab.sh and stop-speed-lab.sh; sets COMPOSE. It refuses every other project, so it cannot reach
# UAT (gigalibs-configuration-local) or gigalibs-test, and it reads only the .env.speed-lab* files.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
SPEED_LAB_PROJECT='gigalibs-speed-lab'
if [[ -n "${COMPOSE_PROJECT_NAME:-}" && "${COMPOSE_PROJECT_NAME}" != "${SPEED_LAB_PROJECT}" ]]; then
  echo "Error: the speed-lab scripts run only Docker Compose project ${SPEED_LAB_PROJECT}." >&2
  exit 1
fi
export COMPOSE_PROJECT_NAME="${SPEED_LAB_PROJECT}"
export GIGALIBS_COMPOSE_ENV_SUFFIX=.speed-lab
SPEED_LAB_HOSTED_MODULES=(
  financial-operations
  process-safety-screening
  product-catalogue
  universal-inventory
  universal-orders
  universal-procurement
)
SPEED_LAB_ENV_FILES=(
  "${COMPOSE_DIR}/.env.speed-lab"
  "${COMPOSE_DIR}/.env.speed-lab.database"
  "${COMPOSE_DIR}/.env.speed-lab.modules"
  "${COMPOSE_DIR}/.env.speed-lab.workforce"
  "${COMPOSE_DIR}/.env.speed-lab.geospatial"
  "${COMPOSE_DIR}/.env.speed-lab.module.host"
)
for module in "${SPEED_LAB_HOSTED_MODULES[@]}"; do
  SPEED_LAB_ENV_FILES+=("${COMPOSE_DIR}/.env.speed-lab.module.${module}")
done
missing=()
for file in "${SPEED_LAB_ENV_FILES[@]}"; do
  [[ -f "${file}" ]] || missing+=("${file}")
done
if ((${#missing[@]} > 0)); then
  echo "Error: run generate-speed-lab-credentials.sh first; missing:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi
COMPOSE=(
  docker compose
  -p "${SPEED_LAB_PROJECT}"
  -f "${COMPOSE_DIR}/compose.yaml"
  -f "${COMPOSE_DIR}/compose.modules.local.yaml"
  -f "${COMPOSE_DIR}/generated/compose.module-host.yaml"
  -f "${COMPOSE_DIR}/compose.speed-lab.yaml"
)
for file in "${SPEED_LAB_ENV_FILES[@]}"; do
  COMPOSE+=(--env-file "${file}")
done
