#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"

"${SCRIPT_DIR}/docker-disk-guard.sh" check

BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.modules"
DOCKERFILE="${COMPOSE_DIR}/docker/Dockerfile"

for required_file in "${BASE_ENV}" "${MODULE_ENV}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Error: ${required_file} is required." >&2
    exit 1
  fi
done

read_value() {
  local file="$1"
  local key="$2"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${file}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${file}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

SOURCE_REVISION="$(read_value "${BASE_ENV}" SOURCE_REVISION)"
SOURCE_STATE_SHA256="$(read_value "${BASE_ENV}" SOURCE_STATE_SHA256)"
CURRENT_REVISION="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
CURRENT_STATE_SHA256="$(node "${REPO_ROOT}/scripts/compute-source-state-sha256.mjs")"
if [[ "${SOURCE_REVISION}" != "${CURRENT_REVISION}" || "${SOURCE_STATE_SHA256}" != "${CURRENT_STATE_SHA256}" ]]; then
  echo "Error: source identity is stale; run refresh-source-identity.sh first." >&2
  exit 1
fi

TAG="${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
declare -a BUILD_ROWS=(
  "connector-hub-api|CONNECTOR_HUB_IMAGE|gigalibs/connector-hub-api:${TAG}"
  "analytics-api|ANALYTICS_IMAGE|gigalibs/analytics-api:${TAG}"
  "cmms-api|CMMS_IMAGE|gigalibs/cmms-api:${TAG}"
)

for row in "${BUILD_ROWS[@]}"; do
  IFS='|' read -r target image_key expected_image <<<"${row}"
  configured_image="$(read_value "${MODULE_ENV}" "${image_key}")"
  if [[ "${configured_image}" != "${expected_image}" ]]; then
    echo "Error: ${image_key} must equal ${expected_image}." >&2
    exit 1
  fi
  docker build \
    --pull=false \
    --file "${DOCKERFILE}" \
    --target "${target}" \
    --build-arg "SOURCE_REVISION=${SOURCE_REVISION}" \
    --build-arg "SOURCE_STATE_SHA256=${SOURCE_STATE_SHA256}" \
    --tag "${configured_image}" \
    "${REPO_ROOT}"

  runtime_user="$(docker image inspect "${configured_image}" --format '{{.Config.User}}')"
  if [[ "${runtime_user}" != "65532:65532" ]]; then
    echo "Error: ${configured_image} must run as 65532:65532; found ${runtime_user}." >&2
    exit 1
  fi
  built_revision="$(docker image inspect "${configured_image}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  built_state="$(docker image inspect "${configured_image}" --format '{{index .Config.Labels "com.gigalibs.source-state-sha256"}}')"
  if [[ "${built_revision}" != "${SOURCE_REVISION}" || "${built_state}" != "${SOURCE_STATE_SHA256}" ]]; then
    echo "Error: ${configured_image} source labels do not match the build authority." >&2
    exit 1
  fi
done

echo "Built the WI-OI-059 module images without printing credentials."
