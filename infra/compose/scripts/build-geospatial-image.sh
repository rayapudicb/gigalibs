#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"

"${SCRIPT_DIR}/docker-disk-guard.sh" check

BASE_ENV="${COMPOSE_DIR}/.env"
GEOSPATIAL_ENV="${COMPOSE_DIR}/.env.geospatial"
DOCKERFILE="${COMPOSE_DIR}/docker/Dockerfile"

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

for required_file in "${BASE_ENV}" "${GEOSPATIAL_ENV}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Error: ${required_file} is required." >&2
    exit 1
  fi
done

SOURCE_REVISION="$(read_value "${BASE_ENV}" SOURCE_REVISION)"
SOURCE_STATE_SHA256="$(read_value "${BASE_ENV}" SOURCE_STATE_SHA256)"
CURRENT_REVISION="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
CURRENT_STATE_SHA256="$(node "${REPO_ROOT}/scripts/compute-source-state-sha256.mjs")"
if [[ "${SOURCE_REVISION}" != "${CURRENT_REVISION}" || "${SOURCE_STATE_SHA256}" != "${CURRENT_STATE_SHA256}" ]]; then
  echo "Error: source identity is stale; run refresh-source-identity.sh first." >&2
  exit 1
fi

TAG="${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
EXPECTED_IMAGE="gigalibs/geospatial-api:${TAG}"
GEOSPATIAL_IMAGE="$(read_value "${GEOSPATIAL_ENV}" GEOSPATIAL_IMAGE)"
if [[ "${GEOSPATIAL_IMAGE}" != "${EXPECTED_IMAGE}" ]]; then
  echo "Error: GEOSPATIAL_IMAGE must equal ${EXPECTED_IMAGE}." >&2
  exit 1
fi

docker build \
  --pull=false \
  --file "${DOCKERFILE}" \
  --target geospatial-api \
  --build-arg "SOURCE_REVISION=${SOURCE_REVISION}" \
  --build-arg "SOURCE_STATE_SHA256=${SOURCE_STATE_SHA256}" \
  --tag "${GEOSPATIAL_IMAGE}" \
  "${REPO_ROOT}"

runtime_user="$(docker image inspect "${GEOSPATIAL_IMAGE}" --format '{{.Config.User}}')"
built_revision="$(docker image inspect "${GEOSPATIAL_IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
built_state="$(docker image inspect "${GEOSPATIAL_IMAGE}" --format '{{index .Config.Labels "com.gigalibs.source-state-sha256"}}')"
built_work_item="$(docker image inspect "${GEOSPATIAL_IMAGE}" --format '{{index .Config.Labels "com.gigalibs.work-item"}}')"
if [[ "${runtime_user}" != "65532:65532" ]]; then
  echo "Error: ${GEOSPATIAL_IMAGE} must run as 65532:65532; found ${runtime_user}." >&2
  exit 1
fi
if [[ "${built_revision}" != "${SOURCE_REVISION}" || "${built_state}" != "${SOURCE_STATE_SHA256}" || "${built_work_item}" != "WI-OI-063" ]]; then
  echo "Error: Geospatial image labels do not match the active build authority." >&2
  exit 1
fi

echo "Built the exact WI-OI-063 Geospatial image without printing credentials."
