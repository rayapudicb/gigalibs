#!/usr/bin/env bash
# build-module-host-image.sh (WI-OI-085e)
# Builds the shared module host image, which runs every generated module with `spec.runtime.hosting: host`
# (infra/compose/generated/modules.json). Its identity lives in infra/compose/.env.module.host.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"

"${SCRIPT_DIR}/docker-disk-guard.sh" check

BASE_ENV="${COMPOSE_DIR}/.env"
HOST_ENV="${COMPOSE_DIR}/.env.module.host"
INDEX="${COMPOSE_DIR}/generated/modules.json"
DOCKERFILE="${COMPOSE_DIR}/docker/Dockerfile"
for required_file in "${BASE_ENV}" "${HOST_ENV}" "${INDEX}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Error: ${required_file} is required (generate-generated-module-credentials.sh creates .env.module.host)." >&2
    exit 1
  fi
done

read_value() {
  local value
  value="$(awk -v key="$2" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$1")"
  if [[ -z "${value}" ]]; then
    echo "Error: $2 is missing from $1." >&2
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
EXPECTED_IMAGE="gigalibs/module-host:${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
IMAGE="$(read_value "${HOST_ENV}" MODULE_HOST_IMAGE)"
if [[ "${IMAGE}" != "${EXPECTED_IMAGE}" ]]; then
  echo "Error: MODULE_HOST_IMAGE in ${HOST_ENV} must equal ${EXPECTED_IMAGE}." >&2
  exit 1
fi
HOSTED="$(node -e 'const i=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); console.log(Object.entries(i).filter(([,r])=>r.hosting==="host").map(([n])=>n).join(" "))' "${INDEX}")"
if [[ -z "${HOSTED}" ]]; then
  echo "Error: no generated module has spec.runtime.hosting: host." >&2
  exit 1
fi

docker build \
  --pull=false \
  --file "${DOCKERFILE}" \
  --target module-host \
  --build-arg "SOURCE_REVISION=${SOURCE_REVISION}" \
  --build-arg "SOURCE_STATE_SHA256=${SOURCE_STATE_SHA256}" \
  --tag "${IMAGE}" \
  "${REPO_ROOT}"

runtime_user="$(docker image inspect "${IMAGE}" --format '{{.Config.User}}')"
built_revision="$(docker image inspect "${IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
built_state="$(docker image inspect "${IMAGE}" --format '{{index .Config.Labels "com.gigalibs.source-state-sha256"}}')"
if [[ "${runtime_user}" != "65532:65532" || "${built_revision}" != "${SOURCE_REVISION}" || "${built_state}" != "${SOURCE_STATE_SHA256}" ]]; then
  echo "Error: ${IMAGE} must run as 65532:65532 and carry the source identity." >&2
  exit 1
fi
container_id="$(docker create "${IMAGE}")"
if ! image_paths="$(docker export "${container_id}" | tar -tf -)"; then
  docker rm -f "${container_id}" >/dev/null 2>&1 || true
  echo "Error: could not list ${IMAGE}." >&2
  exit 1
fi
docker rm "${container_id}" >/dev/null
if grep -Eq '(^|/)\.env(\.[^/]*)?$|(^|/)\.git(/|$)|^usr/local/lib/node_modules/npm(/|$)|^(usr/)?bin/sh$' <<<"${image_paths}"; then
  echo "Error: ${IMAGE} contains a prohibited environment, Git, npm or shell path." >&2
  exit 1
fi
for required_path in app/dist/main.js app/run-module-migrations.mjs; do
  grep -qx "${required_path}" <<<"${image_paths}" || { echo "Error: ${IMAGE} lacks ${required_path}." >&2; exit 1; }
done
# The migrations runner shipped in the host imports pg, so the host must carry it directly (a pnpm link).
if ! grep -qx 'app/node_modules/pg' <<<"${image_paths}" ||
  ! grep -Eq '^app/node_modules/\.pnpm/pg@[^/]+/node_modules/pg/package\.json$' <<<"${image_paths}"; then
  echo "Error: ${IMAGE} lacks pg, which the module migrations runner needs." >&2
  exit 1
fi
for module in ${HOSTED}; do
  grep -Eq "^app/modules/${module}/migrations/[^/]+\.up\.sql$" <<<"${image_paths}" || {
    echo "Error: ${IMAGE} lacks the migrations of ${module}." >&2
    exit 1
  }
done
# Hosted modules must share one copy of the Nest framework, or their exceptions and metadata break.
nest_copies="$(grep -Eo '^app/node_modules/\.pnpm/@nestjs\+common@[^/]+/' <<<"${image_paths}" | sort -u | wc -l | tr -d ' ')"
if [[ "${nest_copies}" != "1" ]]; then
  echo "Error: ${IMAGE} contains ${nest_copies} copies of @nestjs/common; hosted modules must share one." >&2
  exit 1
fi

echo "Built the module host for ${HOSTED}: ${IMAGE} $(docker image inspect "${IMAGE}" --format '{{.Id}}')"
