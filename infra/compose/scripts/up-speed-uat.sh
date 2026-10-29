#!/usr/bin/env bash
# WI-OI-120cd / convergence: bring SPEED (process-safety-screening) up on the configuration-local stack (web :5180, /speed).
# Requires infra/compose/.env.module.process-safety-screening (generate-generated-module-credentials.sh) and the module-host overlay.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-modules-local.sh
source "${SCRIPT_DIR}/compose-modules-local.sh"
SPEED_ENV="${COMPOSE_DIR}/.env${GIGALIBS_COMPOSE_ENV_SUFFIX:-}.module.process-safety-screening"
if [[ ! -f "${SPEED_ENV}" ]]; then
  echo "Error: missing ${SPEED_ENV}; run: bash infra/compose/scripts/generate-generated-module-credentials.sh process-safety-screening" >&2
  exit 1
fi
COMPOSE+=(-f "${COMPOSE_DIR}/generated/compose.module-host.yaml")
COMPOSE+=(--env-file "${SPEED_ENV}")

if [[ ! -f "${MODULE_HOST_ENV}" ]]; then
  echo "Error: missing ${MODULE_HOST_ENV}; run generate-generated-module-credentials.sh for any hosted module first." >&2
  exit 1
fi
MODULE_HOST_IMAGE="$(awk -F= '/^MODULE_HOST_IMAGE=/{print $2}' "${MODULE_HOST_ENV}")"
if [[ -z "${MODULE_HOST_IMAGE}" ]] || ! docker image inspect "${MODULE_HOST_IMAGE}" >/dev/null 2>&1; then
  echo "Error: build module-host first: bash infra/compose/scripts/build-module-host-image.sh" >&2
  exit 1
fi

schema="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"))["process-safety-screening"].schema)' "${COMPOSE_DIR}/generated/modules.json")"
pg_container="$(docker ps -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" --filter name=uat-postgres | head -1)"
if [[ -n "${pg_container}" ]]; then
  echo "Ensuring ${schema}_runtime exists before migrations…"
  docker exec -i "${pg_container}" psql -v ON_ERROR_STOP=1 -U gigalibs -d gigalibs -q -c \
    "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${schema}_runtime') THEN CREATE ROLE ${schema}_runtime NOLOGIN; END IF; END \$\$;" || true
fi

echo "Running process-safety-screening migrations…"
"${COMPOSE[@]}" up --no-deps --abort-on-container-exit --exit-code-from process-safety-screening-migrations process-safety-screening-migrations

echo "Recreating module-host, kernel-worker and web (SPEED gateway keys)…"
"${COMPOSE[@]}" up -d --no-deps --force-recreate module-host
"${COMPOSE[@]}" up -d --force-recreate kernel-worker web

echo "SPEED ready when web is healthy: http://127.0.0.1:\${WEB_PUBLIC_PORT:-5180}/speed"
echo "Enable tenant entitlement process-safety-screening, assign SPEED roles, org-sync, then import criteria/library packs (WI-OI-120ce)."
