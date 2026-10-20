#!/usr/bin/env bash
# WI-OI-120bo: start the isolated gigalibs-test stack for Table 1 / P2P-O2C (never UAT).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-modules-local.sh
source "${SCRIPT_DIR}/compose-modules-local.sh"

if [[ "${COMPOSE_PROJECT_NAME}" != "${TEST_COMPOSE_PROJECT}" ]]; then
  echo "Error: up-test-stack.sh requires project ${TEST_COMPOSE_PROJECT}." >&2
  exit 1
fi

echo "Starting ${TEST_COMPOSE_PROJECT} core (postgres, migrations, api, web, redis, kernel-worker)…"
"${COMPOSE[@]}" up -d test-postgres
echo "Waiting for test-postgres…"
for _ in $(seq 1 60); do
  if node "${SCRIPT_DIR}/verify-compose-test-database-url.mjs" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
node "${SCRIPT_DIR}/verify-compose-test-database-url.mjs"
"${COMPOSE[@]}" up -d migrations api web redis kernel-worker

echo "Table 1 module migrations and module-host…"
bash "${SCRIPT_DIR}/up-table1-module-host.sh"

echo "Seeding E2E principals from e2e/test.env (idempotent)…"
node "${SCRIPT_DIR}/seed-test-e2e-principals.mjs"

echo "Test stack ready. Run: cd e2e && pnpm test:minimal-p2p-o2c"
