#!/usr/bin/env bash
set -euo pipefail

# WI-OI-120hf: refresh identity, build control-plane migrations + ar-api images, start ar-api, run health proof.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"
DOCKERFILE="${COMPOSE_DIR}/docker/Dockerfile"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"

"${SCRIPT_DIR}/docker-disk-guard.sh" check

node "${SCRIPT_DIR}/verify-compose-database-url.mjs"

"${SCRIPT_DIR}/refresh-source-identity.sh"

read_value() {
  local file="$1" key="$2" value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${file}")"
  [[ -n "${value}" ]] || { echo "Error: ${key} missing from ${file}." >&2; exit 1; }
  printf '%s' "${value}"
}

SOURCE_REVISION="$(read_value "${BASE_ENV}" SOURCE_REVISION)"
SOURCE_STATE_SHA256="$(read_value "${BASE_ENV}" SOURCE_STATE_SHA256)"
MIGRATIONS_IMAGE="$(read_value "${BASE_ENV}" MIGRATIONS_IMAGE)"
AR_IMAGE="$(read_value "${MODULE_ENV}" AR_IMAGE)"

build_target() {
  docker build \
    --pull=false \
    --file "${DOCKERFILE}" \
    --target "$1" \
    --build-arg "SOURCE_REVISION=${SOURCE_REVISION}" \
    --build-arg "SOURCE_STATE_SHA256=${SOURCE_STATE_SHA256}" \
    --tag "$2" \
    "${REPO_ROOT}"
}

build_target migrations "${MIGRATIONS_IMAGE}"
build_target ar-api "${AR_IMAGE}"

"${SCRIPT_DIR}/up-ar-api.sh"
pnpm --dir "${REPO_ROOT}" proof:ar-compose-health
