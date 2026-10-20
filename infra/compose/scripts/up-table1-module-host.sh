#!/usr/bin/env bash
# WI-OI-120gu: module-host + kernel-worker for Table-1 E2E (product-catalogue, procurement, orders org-sync).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-modules-local.sh
source "${SCRIPT_DIR}/compose-modules-local.sh"
COMPOSE+=(-f "${COMPOSE_DIR}/generated/compose.module-host.yaml")
# MODULE_HOST_ENV comes from compose-modules-local.sh and follows the project (.env.test.module.host on gigalibs-test).
if [[ ! -f "${MODULE_HOST_ENV}" ]]; then
  echo "Error: missing ${MODULE_HOST_ENV}; run generate-generated-module-credentials.sh for a hosted module first." >&2
  exit 1
fi
MODULE_HOST_IMAGE="$(awk -F= '/^MODULE_HOST_IMAGE=/{print $2}' "${MODULE_HOST_ENV}")"
if [[ -z "${MODULE_HOST_IMAGE}" ]] || ! docker image inspect "${MODULE_HOST_IMAGE}" >/dev/null 2>&1; then
  echo "Error: Docker image ${MODULE_HOST_IMAGE:-<unset>} is not present." >&2
  if [[ "${COMPOSE_PROJECT_NAME}" == "${TEST_COMPOSE_PROJECT}" ]]; then
    echo "Build it: bash infra/compose/scripts/build-test-stack-images.sh" >&2
  else
    echo "Build it: bash infra/compose/scripts/refresh-source-identity.sh, then build-module-host-image.sh" >&2
  fi
  exit 1
fi

CANONICAL_REDIS="${COMPOSE_PROJECT_NAME}-redis-1"
fix_redis_name_conflict() {
  local ids=()
  while IFS= read -r line; do ids+=("$line"); done < <(docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" --filter "name=redis")
  ((${#ids[@]} == 0)) && return 0
  local canonical_id=""
  if docker inspect "${CANONICAL_REDIS}" >/dev/null 2>&1; then
    canonical_id="$(docker inspect -f '{{.Id}}' "${CANONICAL_REDIS}")"
  fi
  for id in "${ids[@]}"; do
    name="$(docker inspect -f '{{.Name}}' "${id}" | sed 's|^/||')"
    state="$(docker inspect -f '{{.State.Status}}' "${id}")"
    if [[ "${name}" == "${CANONICAL_REDIS}" ]]; then
      continue
    fi
    # Leftover from a failed compose recreate (hash-prefixed name, often stuck in "created").
    if [[ "${name}" == *_"${CANONICAL_REDIS}" ]] || [[ -z "${canonical_id}" && "${state}" != "running" ]]; then
      echo "Removing stale Redis container ${name} (${state})…"
      docker rm -f "${id}" >/dev/null 2>&1 || true
    fi
  done
  if ((${#ids[@]} > 1)); then
    echo "Removing duplicate Redis containers (name conflict)…"
    while IFS= read -r line; do ids+=("$line"); done < <(docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" --filter "name=redis")
    for id in "${ids[@]}"; do
      name="$(docker inspect -f '{{.Name}}' "${id}" | sed 's|^/||')"
      [[ "${name}" == "${CANONICAL_REDIS}" ]] && continue
      docker rm -f "${id}" >/dev/null 2>&1 || true
    done
  fi
}

MIGRATIONS=(
  financial-operations-migrations
  product-catalogue-migrations
  universal-inventory-migrations
  universal-orders-migrations
  universal-procurement-migrations
)

fix_redis_name_conflict
echo "Ensuring Redis is up (no recreate if already healthy)…"
"${COMPOSE[@]}" up -d --no-recreate redis

if [[ "${SKIP_TABLE1_MIGRATIONS:-}" == "1" ]]; then
  echo "SKIP_TABLE1_MIGRATIONS=1 — skipping one-shot migration jobs."
else
  echo "Probing MODULE_MIGRATIONS_DATABASE_URL (see pnpm audit:compose-database-url)…"
  if [[ "${COMPOSE_PROJECT_NAME}" == "${TEST_COMPOSE_PROJECT}" ]]; then
    node "${COMPOSE_DIR}/scripts/verify-compose-test-database-url.mjs"
  else
    node "${COMPOSE_DIR}/scripts/verify-compose-database-url.mjs"
  fi || {
    echo "Fix infra/compose/.env DATABASE_URL (and MODULE_MIGRATIONS_DATABASE_URL in .env.modules if it drifted), then retry." >&2
    exit 1
  }
  echo "Running Table-1 module migrations (one-shot)…"
  for mig in "${MIGRATIONS[@]}"; do
    "${COMPOSE[@]}" up --no-deps --abort-on-container-exit --exit-code-from "${mig}" "${mig}"
  done
fi

echo "Starting module-host…"
"${COMPOSE[@]}" up -d --no-deps --force-recreate module-host

echo "Starting kernel-worker…"
"${COMPOSE[@]}" up -d --force-recreate kernel-worker

echo "Done. Check:"
echo "  docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'module-host|kernel-worker|redis'"
