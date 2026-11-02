#!/usr/bin/env bash
# Owner / release worktree: deploy convergence-core module batch to UAT (5180) for manual UI testing.
# Excludes CONTAINED sidebar modules (AR, spend, TextFly); ar-api may still run for backend relays.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-worktree.sh
source "${SCRIPT_DIR}/release-worktree.sh"
gigalibs_require_release_worktree "${BASH_SOURCE[0]}"
# shellcheck source=compose-modules-local.sh
source "${SCRIPT_DIR}/compose-modules-local.sh"
# Host exports must not override infra/compose/.env* (stale tags break image pulls).
for _image_var in CONNECTOR_HUB_IMAGE ANALYTICS_IMAGE CMMS_IMAGE IOT_IMAGE AR_IMAGE MIGRATIONS_IMAGE API_IMAGE WEB_IMAGE MODULE_HOST_IMAGE WORKFORCE_IMAGE GEOSPATIAL_IMAGE; do
  unset "${_image_var}" || true
done
unset _image_var
# Host DATABASE_URL* exports override --env-file and break UAT (WI-OI-120am uat-postgres URLs).
while IFS= read -r _db_var; do
  unset "${_db_var}" || true
done < <(env | sed -n 's/^\([A-Za-z0-9_]*DATABASE_URL\)=.*/\1/p')
unset _db_var

DATABASE_ENV="${COMPOSE_DIR}/.env${GIGALIBS_COMPOSE_ENV_SUFFIX:-}.database"
if [[ ! -f "${DATABASE_ENV}" ]]; then
  echo "Error: missing ${DATABASE_ENV} (UAT uat-postgres password). Copy from a release worktree that ran WI-OI-120am prepare, or run prepare.mjs." >&2
  exit 1
fi
COMPOSE+=(--env-file "${DATABASE_ENV}")
COMPOSE+=(
  -f "${COMPOSE_DIR}/compose.database.yaml"
  -f "${COMPOSE_DIR}/compose.workforce.local.yaml"
  -f "${COMPOSE_DIR}/compose.geospatial.local.yaml"
  -f "${COMPOSE_DIR}/generated/compose.module-host.yaml"
)
for _env in "${TABLE1_MODULE_ENVS[@]}"; do
  [[ -f "${_env}" ]] || continue
  COMPOSE+=(--env-file "${_env}")
done

one_shot() {
  "${COMPOSE[@]}" up --no-deps --abort-on-container-exit --exit-code-from "$1" "$1"
}

ensure_runtime_roles() {
  local pg_container
  pg_container="$(docker ps -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" --filter name=uat-postgres | head -1)"
  [[ -n "${pg_container}" ]] || return 0
  node -e '
    const index = require(process.argv[1]);
    for (const row of Object.values(index)) {
      if (row.hosting !== "host") continue;
      const role = `${row.schema}_runtime`;
      process.stdout.write(`${role}\n`);
    }
  ' "${COMPOSE_DIR}/generated/modules.json" | while read -r role; do
    docker exec -i "${pg_container}" psql -v ON_ERROR_STOP=1 -U gigalibs -d gigalibs -q -c \
      "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END \$\$;" || true
  done
}

if ! grep -q '^GIGALIBS_UAT_PREVIEW=enabled' "${BASE_ENV}" 2>/dev/null; then
  printf '\n# Convergence UAT manual test: show PLANNED modules in the sidebar.\nGIGALIBS_UAT_PREVIEW=enabled\n' >>"${BASE_ENV}"
  echo "Appended GIGALIBS_UAT_PREVIEW=enabled to ${BASE_ENV}"
fi

if [[ "${SKIP_PLATFORM_MIGRATIONS:-}" == "1" ]]; then
  echo "SKIP_PLATFORM_MIGRATIONS=1 — skipping control-plane migrations."
else
  echo "Platform migrations (optional; set SKIP_PLATFORM_MIGRATIONS=1 to skip)…"
  "${COMPOSE[@]}" up --no-deps --abort-on-container-exit --exit-code-from migrations migrations || {
    echo "Warning: control-plane migrations failed; continuing with module migrations (check DATABASE_URL if modules fail)."
  }
fi

ensure_runtime_roles

MODULE_MIGRATIONS=(
  connector-hub-migrations
  analytics-migrations
  cmms-migrations
  iot-migrations
  business-partners-migrations
  financial-operations-migrations
  process-safety-screening-migrations
  product-catalogue-migrations
  project-operations-migrations
  universal-inventory-migrations
  universal-manufacturing-migrations
  universal-orders-migrations
  universal-procurement-migrations
  universal-returns-migrations
  operator-rounds-migrations
  safety-operations-migrations
  workforce-migrations
)

if [[ "${SKIP_MODULE_MIGRATIONS:-}" == "1" ]]; then
  echo "SKIP_MODULE_MIGRATIONS=1 — skipping module migration jobs."
else
  for mig in "${MODULE_MIGRATIONS[@]}"; do
    echo "Migration ${mig}…"
    one_shot "${mig}" || {
      echo "Warning: ${mig} failed (often MODULE_MIGRATIONS_DATABASE_URL / UAT Postgres password); continuing."
    }
  done
fi

APP_SERVICES=(connector-hub-api analytics-api cmms-api iot-api module-host api kernel-worker workforce-api web)

# A container started by hand (docker run) under a service's Compose name has no project label, so Compose cannot
# recreate it ("name already in use"). Remove only such unlabelled containers; Compose-managed ones are recreated.
for service in "${APP_SERVICES[@]}"; do
  name="${COMPOSE_PROJECT_NAME}-${service}-1"
  project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "${name}" 2>/dev/null || true)"
  if docker inspect "${name}" >/dev/null 2>&1 && [[ -z "${project}" ]]; then
    echo "Removing hand-started container ${name} so Compose can recreate it."
    docker rm -f "${name}" >/dev/null
  fi
done

echo "Recreating application services…"
"${COMPOSE[@]}" up -d --no-deps --force-recreate "${APP_SERVICES[@]}"

echo "Waiting for web readiness…"
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null http://127.0.0.1:"${WEB_PUBLIC_PORT:-5180}"/api/health/ready; then
    echo "Web ready on port ${WEB_PUBLIC_PORT:-5180}."
    break
  fi
  sleep 2
done

echo "Next: pnpm exec tsx infra/compose/scripts/seed-uat-module-entitlements.mjs"
echo "Then sign in at http://127.0.0.1:${WEB_PUBLIC_PORT:-5180}/ and open sidebar modules."
