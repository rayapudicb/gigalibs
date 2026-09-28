#!/usr/bin/env bash
# build-generated-module-image.sh (WI-OI-085b)
# Builds the API image of one generated module (`spec.runtime.generated`) with the generic `generated-module`
# target. Everything comes from infra/compose/generated/modules.json, which `pnpm modules:catalog` writes from the
# manifest.
#   build-generated-module-image.sh <module>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"

"${SCRIPT_DIR}/docker-disk-guard.sh" check

MODULE="${1:-}"
BASE_ENV="${COMPOSE_DIR}/.env"
MODULE_ENV="${COMPOSE_DIR}/.env.module.${MODULE}"
INDEX="${COMPOSE_DIR}/generated/modules.json"
DOCKERFILE="${COMPOSE_DIR}/docker/Dockerfile"

if [[ ! "${MODULE}" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Usage: $(basename "$0") <module>" >&2
  exit 2
fi
module_value() {
  node -e '
    const index = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const entry = index[process.argv[2]];
    if (!entry) { console.error(`Error: ${process.argv[2]} is not a generated module; run pnpm modules:catalog.`); process.exit(1); }
    process.stdout.write(String(entry[process.argv[3]]));
  ' "${INDEX}" "${MODULE}" "$1"
}
for required_file in "${BASE_ENV}" "${MODULE_ENV}" "${INDEX}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Error: ${required_file} is required (credentials: generate-generated-module-credentials.sh ${MODULE})." >&2
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

PREFIX="$(module_value prefix)"
EXPECTED_IMAGE="$(module_value image):${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
CONFIGURED_IMAGE="$(read_value "${MODULE_ENV}" "${PREFIX}_IMAGE")"
if [[ "${CONFIGURED_IMAGE}" != "${EXPECTED_IMAGE}" ]]; then
  echo "Error: ${PREFIX}_IMAGE in ${MODULE_ENV} must equal ${EXPECTED_IMAGE}." >&2
  exit 1
fi

docker build \
  --pull=false \
  --file "${DOCKERFILE}" \
  --target generated-module \
  --build-arg "SOURCE_REVISION=${SOURCE_REVISION}" \
  --build-arg "SOURCE_STATE_SHA256=${SOURCE_STATE_SHA256}" \
  --build-arg "MODULE_PACKAGE=$(module_value package)" \
  --build-arg "MODULE_DIR=$(module_value directory)" \
  --build-arg "MODULE_TITLE=$(module_value title)" \
  --build-arg "MODULE_COMPONENT=$(module_value component)" \
  --build-arg "MODULE_WORK_ITEM=$(module_value workItem)" \
  --build-arg "MODULE_PORT=$(module_value port)" \
  --tag "${CONFIGURED_IMAGE}" \
  "${REPO_ROOT}"

runtime_user="$(docker image inspect "${CONFIGURED_IMAGE}" --format '{{.Config.User}}')"
if [[ "${runtime_user}" != "65532:65532" ]]; then
  echo "Error: ${CONFIGURED_IMAGE} must run as 65532:65532; found ${runtime_user}." >&2
  exit 1
fi
built_revision="$(docker image inspect "${CONFIGURED_IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
built_state="$(docker image inspect "${CONFIGURED_IMAGE}" --format '{{index .Config.Labels "com.gigalibs.source-state-sha256"}}')"
if [[ "${built_revision}" != "${SOURCE_REVISION}" || "${built_state}" != "${SOURCE_STATE_SHA256}" ]]; then
  echo "Error: ${CONFIGURED_IMAGE} source labels do not match the build authority." >&2
  exit 1
fi
container_id="$(docker create "${CONFIGURED_IMAGE}")"
if ! image_paths="$(docker export "${container_id}" | tar -tf -)"; then
  docker rm -f "${container_id}" >/dev/null 2>&1 || true
  echo "Error: could not list ${CONFIGURED_IMAGE}." >&2
  exit 1
fi
docker rm "${container_id}" >/dev/null
if grep -Eq '(^|/)\.env(\.[^/]*)?$|(^|/)\.git(/|$)|^usr/local/lib/node_modules/npm(/|$)|^(usr/)?bin/sh$' <<<"${image_paths}"; then
  echo "Error: ${CONFIGURED_IMAGE} contains a prohibited environment, Git, npm or shell path." >&2
  exit 1
fi
if ! grep -qx 'app/dist/main.js' <<<"${image_paths}" || ! grep -qx 'app/run-module-migrations.mjs' <<<"${image_paths}"; then
  echo "Error: ${CONFIGURED_IMAGE} must contain dist/main.js and run-module-migrations.mjs." >&2
  exit 1
fi

echo "Built generated module ${MODULE}: ${CONFIGURED_IMAGE} $(docker image inspect "${CONFIGURED_IMAGE}" --format '{{.Id}}')"
