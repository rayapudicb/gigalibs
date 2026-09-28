#!/usr/bin/env bash
# build-solution-web-image.sh (WI-OI-083d)
# Builds the web image for one solution: the core plus only the modules `solutions/<name>.yaml` selects.
#   build-solution-web-image.sh <solution>
# It copies the working tree as build-images.sh sees it, regenerates the catalogue, gateways, upstreams, navigation
# and pages in that copy with `module-manifests.mjs --solution`, and builds the `web` target from the copy. The
# repository is not changed. The image is tagged `<source identity>-<solution>`, labelled com.gigalibs.solution, and
# passes the same checks as build-images.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"

"${SCRIPT_DIR}/docker-disk-guard.sh" check

LOCAL_ENV="${COMPOSE_DIR}/.env"
SOLUTION="${1:-}"
if [[ ! "${SOLUTION}" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ || ! -f "${REPO_ROOT}/solutions/${SOLUTION}.yaml" ]]; then
  echo "Usage: $(basename "$0") <solution>, where solutions/<solution>.yaml exists." >&2
  exit 2
fi
if [[ ! -f "${LOCAL_ENV}" ]]; then
  echo "Error: ${LOCAL_ENV} is required; run generate-credentials.sh first." >&2
  exit 1
fi

read_local_value() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "${LOCAL_ENV}")"
  if [[ -z "${value}" ]]; then
    echo "Error: ${key} is missing from ${LOCAL_ENV}." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

SOURCE_REVISION="$(read_local_value SOURCE_REVISION)"
SOURCE_STATE_SHA256="$(read_local_value SOURCE_STATE_SHA256)"
CURRENT_REVISION="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
CURRENT_STATE_SHA256="$(node "${REPO_ROOT}/scripts/compute-source-state-sha256.mjs")"
if [[ "${SOURCE_REVISION}" != "${CURRENT_REVISION}" || "${SOURCE_STATE_SHA256}" != "${CURRENT_STATE_SHA256}" ]]; then
  echo "Error: source state changed after ${LOCAL_ENV} was generated." >&2
  echo "Run refresh-source-identity.sh before building; it preserves the existing local secrets." >&2
  exit 1
fi

# The identity of a solution image is the source identity plus the solution: its content follows from both.
IMAGE="gigalibs/workflow-platform:${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}-${SOLUTION}"

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gigalibs-solution-XXXXXX")"
trap 'rm -rf "${BUILD_DIR}"' EXIT

# The files build-images.sh would send: tracked and untracked, minus ignored and deleted ones.
(
  cd "${REPO_ROOT}"
  git ls-files -co --exclude-standard -z | perl -0ne 'chomp; print "$_\0" if -e $_ || -l $_' |
    tar -c --null -T - -f -
) | tar -x -f - -C "${BUILD_DIR}"

node "${REPO_ROOT}/scripts/module-manifests.mjs" --write --solution "${SOLUTION}" --root "${BUILD_DIR}" |
  node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const r=JSON.parse(s);console.log(`Solution ${r.solution}: ${r.manifests} module manifests, ${r.catalogEntries} catalogue entries, ${r.pages} pages; gateways: ${r.gateways.join("; ")}.`)})'

docker build \
  --pull=false \
  --file "${BUILD_DIR}/infra/compose/docker/Dockerfile" \
  --target web \
  --build-arg "SOURCE_REVISION=${SOURCE_REVISION}" \
  --build-arg "SOURCE_STATE_SHA256=${SOURCE_STATE_SHA256}" \
  --label "com.gigalibs.solution=${SOLUTION}" \
  --tag "${IMAGE}" \
  "${BUILD_DIR}"

built_revision="$(docker image inspect "${IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
built_state="$(docker image inspect "${IMAGE}" --format '{{index .Config.Labels "com.gigalibs.source-state-sha256"}}')"
built_solution="$(docker image inspect "${IMAGE}" --format '{{index .Config.Labels "com.gigalibs.solution"}}')"
if [[ "${built_revision}" != "${SOURCE_REVISION}" || "${built_state}" != "${SOURCE_STATE_SHA256}" || "${built_solution}" != "${SOLUTION}" ]]; then
  echo "Error: ${IMAGE} labels do not match the source authority and solution." >&2
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
if ! grep -qx 'app/next.config.mjs' <<<"${image_paths}" || grep -qx 'app/next.config.ts' <<<"${image_paths}"; then
  echo "Error: ${IMAGE} must contain next.config.mjs and exclude next.config.ts." >&2
  exit 1
fi
runtime_user="$(docker image inspect "${IMAGE}" --format '{{.Config.User}}')"
if [[ "${runtime_user}" != "65532:65532" ]]; then
  echo "Error: ${IMAGE} must run as 65532:65532; found ${runtime_user}." >&2
  exit 1
fi

echo "Solution web image built from ${SOURCE_REVISION} / ${SOURCE_STATE_SHA256} for ${SOLUTION}:"
echo "- ${IMAGE} $(docker image inspect "${IMAGE}" --format '{{.Id}}')"
