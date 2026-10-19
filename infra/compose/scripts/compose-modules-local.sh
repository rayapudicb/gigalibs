#!/usr/bin/env bash
# WI-OI-120he: shared docker compose invocation for compose.modules.local.yaml.
# Kernel-worker in that overlay requires Workforce and Geospatial platform-context keys; those live in
# .env.workforce and .env.geospatial (not in .env.modules). Source this file, then "${COMPOSE[@]}" …
set -euo pipefail

if [[ -n "${BASH_VERSION:-}" && -n "${BASH_SOURCE[0]:-}" ]]; then
  _compose_local_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  _compose_local_script_dir="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  _compose_local_script_dir="$(cd "$(dirname "$0")" && pwd)"
fi
SCRIPT_DIR="${_compose_local_script_dir}"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
WORKFORCE_ENV="${COMPOSE_DIR}/.env.workforce"
GEOSPATIAL_ENV="${COMPOSE_DIR}/.env.geospatial"

compose_modules_local_requirements() {
  local missing=()
  [[ -f "${BASE_ENV}" ]] || missing+=("${BASE_ENV}")
  [[ -f "${MODULE_ENV}" ]] || missing+=("${MODULE_ENV}")
  [[ -f "${WORKFORCE_ENV}" ]] || missing+=("${WORKFORCE_ENV} (run generate-workforce-runtime-credentials.sh)")
  [[ -f "${GEOSPATIAL_ENV}" ]] || missing+=("${GEOSPATIAL_ENV} (run generate-geospatial-runtime-credentials.sh)")
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Error: module-local compose requires:" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    exit 1
  fi
}

compose_modules_local_requirements

COMPOSE=(
  docker compose
  -f "${COMPOSE_DIR}/compose.yaml"
  -f "${COMPOSE_DIR}/compose.modules.local.yaml"
  --env-file "${BASE_ENV}"
  --env-file "${MODULE_ENV}"
  --env-file "${WORKFORCE_ENV}"
  --env-file "${GEOSPATIAL_ENV}"
)
