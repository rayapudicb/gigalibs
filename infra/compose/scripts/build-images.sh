#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${COMPOSE_DIR}/../.." && pwd)"

"${SCRIPT_DIR}/docker-disk-guard.sh" check

LOCAL_ENV="${COMPOSE_DIR}/.env"
DOCKERFILE="${COMPOSE_DIR}/docker/Dockerfile"
PROFILE="${REPO_ROOT}/config/deployment-profiles/configuration-local-development-v1.json"

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

TAG="${SOURCE_REVISION:0:12}-${SOURCE_STATE_SHA256:0:12}"
read_profile_artifact_value() {
  local key="$1"
  node -e \
    'const fs=require("node:fs"); const profile=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const value=profile.artifactPolicy?.[process.argv[2]]; if (typeof value !== "string" || value.length === 0) process.exit(1); process.stdout.write(value);' \
    "${PROFILE}" "${key}"
}

BUILD_BASE_IMAGE="$(read_profile_artifact_value baseImage)"
FINAL_RUNTIME_IMAGE="$(read_profile_artifact_value finalRuntimeImage)"
for required_image in "${BUILD_BASE_IMAGE}" "${FINAL_RUNTIME_IMAGE}"; do
  if ! docker image inspect "${required_image}" >/dev/null 2>&1; then
    echo "Error: pinned image ${required_image} is not present locally." >&2
    exit 1
  fi
done

list_image_paths() {
  local image="$1"
  local container_id
  local paths
  container_id="$(docker create "${image}")"
  if ! paths="$(docker export "${container_id}" | tar -tf -)"; then
    docker rm -f "${container_id}" >/dev/null 2>&1 || true
    return 1
  fi
  docker rm "${container_id}" >/dev/null
  printf '%s\n' "${paths}"
}

declare -a BUILD_ROWS=(
  "migrations|MIGRATIONS_IMAGE|gigalibs/control-plane-migrations:${TAG}"
  "api|API_IMAGE|gigalibs/playground-api:${TAG}"
  "web|WEB_IMAGE|gigalibs/workflow-platform:${TAG}"
)

for row in "${BUILD_ROWS[@]}"; do
  IFS='|' read -r target image_key expected_image <<<"${row}"
  configured_image="$(read_local_value "${image_key}")"
  if [[ "${configured_image}" != "${expected_image}" ]]; then
    echo "Error: ${image_key} must equal ${expected_image}; found ${configured_image}." >&2
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

  built_revision="$(docker image inspect "${configured_image}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  built_state="$(docker image inspect "${configured_image}" --format '{{index .Config.Labels "com.gigalibs.source-state-sha256"}}')"
  if [[ "${built_revision}" != "${SOURCE_REVISION}" || "${built_state}" != "${SOURCE_STATE_SHA256}" ]]; then
    echo "Error: ${configured_image} labels do not match the source authority." >&2
    exit 1
  fi

  image_paths="$(list_image_paths "${configured_image}")"
  if grep -Eq '(^|/)\.env(\.[^/]*)?$|(^|/)\.git(/|$)|^usr/local/lib/node_modules/npm(/|$)|^(usr/)?bin/sh$' <<<"${image_paths}"; then
    echo "Error: ${configured_image} contains a prohibited environment, Git, npm or shell path." >&2
    exit 1
  fi

  if [[ "${target}" == "api" ]]; then
    if ! grep -Eq '^app/node_modules/\.pnpm/.*/node_modules/@gigalibs/db/dist/generated/prisma/.*query_engine.*\.node$' <<<"${image_paths}"; then
      echo "Error: ${configured_image} does not contain the generated Prisma query engine." >&2
      exit 1
    fi
  fi
  if [[ "${target}" == "web" ]]; then
    if ! grep -qx 'app/next.config.mjs' <<<"${image_paths}" || grep -qx 'app/next.config.ts' <<<"${image_paths}"; then
      echo "Error: ${configured_image} must contain next.config.mjs and exclude next.config.ts." >&2
      exit 1
    fi
  fi
  if [[ "${target}" == "migrations" ]]; then
    if grep -Eq '^app/node_modules/\.pnpm/(vite|vitest|esbuild|tsx)@' <<<"${image_paths}"; then
      echo "Error: ${configured_image} contains build/test tooling in the migrations runtime." >&2
      exit 1
    fi
    if ! grep -qx 'app/database/schema.prisma' <<<"${image_paths}" || \
       ! grep -Eq '^app/database/migrations/[^/]+/migration\.sql$' <<<"${image_paths}"; then
      echo "Error: ${configured_image} does not contain the canonical schema and migration SQL." >&2
      exit 1
    fi
  fi

  runtime_user="$(docker image inspect "${configured_image}" --format '{{.Config.User}}')"
  if [[ "${runtime_user}" != "65532:65532" ]]; then
    echo "Error: ${configured_image} must run as 65532:65532; found ${runtime_user}." >&2
    exit 1
  fi
done

echo "Local images built from ${SOURCE_REVISION} / ${SOURCE_STATE_SHA256}:"
for row in "${BUILD_ROWS[@]}"; do
  IFS='|' read -r _ image_key _ <<<"${row}"
  configured_image="$(read_local_value "${image_key}")"
  image_id="$(docker image inspect "${configured_image}" --format '{{.Id}}')"
  echo "- ${configured_image} ${image_id}"
done
