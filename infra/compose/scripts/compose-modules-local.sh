#!/usr/bin/env bash
# WI-OI-120he / WI-OI-120bo: shared docker compose invocation for compose.modules.local.yaml.
# Kernel-worker in that overlay requires Workforce and Geospatial platform-context keys; those live in
# .env.workforce and .env.geospatial (not in .env.modules). Source this file, then "${COMPOSE[@]}" …
# Outside the release worktree it targets only the isolated project gigalibs-test (.env.test* files).
set -euo pipefail

if [[ -n "${BASH_VERSION:-}" && -n "${BASH_SOURCE[0]:-}" ]]; then
  _compose_local_entry_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  _compose_local_entry_dir="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  _compose_local_entry_dir="$(cd "$(dirname "$0")" && pwd)"
fi
# shellcheck source=compose-modules-local-guard-only.sh
source "${_compose_local_entry_dir}/compose-modules-local-guard-only.sh"
unset _compose_local_entry_dir

compose_modules_local_env_paths() {
  local suffix="${GIGALIBS_COMPOSE_ENV_SUFFIX}"
  BASE_ENV="${COMPOSE_DIR}/.env${suffix}"
  MODULE_ENV="${COMPOSE_DIR}/.env${suffix}.modules"
  WORKFORCE_ENV="${COMPOSE_DIR}/.env${suffix}.workforce"
  GEOSPATIAL_ENV="${COMPOSE_DIR}/.env${suffix}.geospatial"
  MODULE_HOST_ENV="${COMPOSE_DIR}/.env${suffix}.module.host"
  TEST_DATABASE_ENV="${COMPOSE_DIR}/.env.test.database"
  TABLE1_MODULE_ENVS=(
    "${COMPOSE_DIR}/.env${suffix}.module.business-partners"
    "${COMPOSE_DIR}/.env${suffix}.module.financial-operations"
    "${COMPOSE_DIR}/.env${suffix}.module.product-catalogue"
    "${COMPOSE_DIR}/.env${suffix}.module.universal-procurement"
    "${COMPOSE_DIR}/.env${suffix}.module.universal-orders"
    "${COMPOSE_DIR}/.env${suffix}.module.universal-inventory"
    "${COMPOSE_DIR}/.env${suffix}.module.universal-manufacturing"
  )
}

compose_modules_local_requirements() {
  compose_modules_local_env_paths
  local missing=()
  local hint='run generate-workforce-runtime-credentials.sh / generate-geospatial-runtime-credentials.sh'
  if [[ "${COMPOSE_PROJECT_NAME}" == "${TEST_COMPOSE_PROJECT}" ]]; then
    hint='run generate-test-stack-credentials.sh'
    [[ -f "${TEST_DATABASE_ENV}" ]] || missing+=("${TEST_DATABASE_ENV} (${hint})")
  fi
  [[ -f "${BASE_ENV}" ]] || missing+=("${BASE_ENV}")
  [[ -f "${MODULE_ENV}" ]] || missing+=("${MODULE_ENV}")
  [[ -f "${WORKFORCE_ENV}" ]] || missing+=("${WORKFORCE_ENV} (${hint})")
  [[ -f "${GEOSPATIAL_ENV}" ]] || missing+=("${GEOSPATIAL_ENV} (${hint})")
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Error: module-local compose requires:" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    exit 1
  fi
}

compose_modules_local_requirements

COMPOSE=(
  docker compose
  -p "${COMPOSE_PROJECT_NAME}"
  -f "${COMPOSE_DIR}/compose.yaml"
  -f "${COMPOSE_DIR}/compose.modules.local.yaml"
  --env-file "${BASE_ENV}"
  --env-file "${MODULE_ENV}"
  --env-file "${WORKFORCE_ENV}"
  --env-file "${GEOSPATIAL_ENV}"
)
if [[ "${COMPOSE_PROJECT_NAME}" == "${TEST_COMPOSE_PROJECT}" ]]; then
  COMPOSE+=(--env-file "${TEST_DATABASE_ENV}")
  COMPOSE+=(-f "${COMPOSE_DIR}/compose.test-isolated.yaml")
fi
if [[ -f "${MODULE_HOST_ENV}" ]]; then
  COMPOSE+=(--env-file "${MODULE_HOST_ENV}")
fi
for _table1_env in "${TABLE1_MODULE_ENVS[@]}"; do
  if [[ -f "${_table1_env}" ]]; then
    COMPOSE+=(--env-file "${_table1_env}")
  fi
done
unset _table1_env
