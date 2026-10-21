#!/usr/bin/env bash
# WI-OI-120cc (SPEED S9a): start the speed-lab preview and seed its test workspace. Project gigalibs-speed-lab only;
# its own database, object store, volumes and network. Order: database and object store, platform migrations, the
# workspace accounts (before the API starts, so its windows are activated at start), the hosted modules' migrations,
# the platform and the module host, then the screening data through the API and the web gateway.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=speed-lab-compose.sh
source "${SCRIPT_DIR}/speed-lab-compose.sh"

one_shot() {
  "${COMPOSE[@]}" up --no-deps --abort-on-container-exit --exit-code-from "$1" "$1"
}

echo "Database and object store…"
"${COMPOSE[@]}" up -d --wait lab-postgres lab-objects
one_shot lab-objects-init
echo "Platform migrations…"
one_shot migrations
echo "Workspace accounts…"
(cd "${REPO_ROOT}" && pnpm exec tsx infra/compose/scripts/seed-speed-lab.mts accounts)
echo "Hosted module migrations…"
# Finance (000012, 000013, 000015) and Inventory grant to their runtime role in a migration, but the runner creates the
# role only after the migrations, so a fresh database stops there (reported with WI-OI-120cc). Each hosted module's
# runtime role is created here first, without login; the runner then gives it its login and password as usual.
for schema in $(node -e '
  const index = require(process.argv[1]);
  console.log(process.argv.slice(2).map((name) => index[name].schema).join(" "));
' "${COMPOSE_DIR}/generated/modules.json" "${SPEED_LAB_HOSTED_MODULES[@]}"); do
  "${COMPOSE[@]}" exec -T lab-postgres psql -v ON_ERROR_STOP=1 -U gigalibs -d gigalibs -q -c \
    "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${schema}_runtime') THEN CREATE ROLE ${schema}_runtime NOLOGIN; END IF; END \$\$;"
done
for module in "${SPEED_LAB_HOSTED_MODULES[@]}"; do
  one_shot "${module}-migrations"
done
echo "Platform, web and module host…"
"${COMPOSE[@]}" up -d --no-deps --wait redis
"${COMPOSE[@]}" up -d --no-deps --wait api
"${COMPOSE[@]}" up -d --no-deps --wait module-host
"${COMPOSE[@]}" up -d --no-deps --wait web
"${COMPOSE[@]}" up -d --no-deps kernel-worker
echo "Screening data (TEST FIXTURE)…"
(cd "${REPO_ROOT}" && pnpm exec tsx infra/compose/scripts/seed-speed-lab.mts screening)
WEB_PORT="$(awk -F= '/^WEB_PUBLIC_PORT=/{print $2}' "${COMPOSE_DIR}/.env.speed-lab")"
echo "speed-lab preview ready at http://127.0.0.1:${WEB_PORT}/speed (accounts in infra/compose/.env.speed-lab.accounts)."
