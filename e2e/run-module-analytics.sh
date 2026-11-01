#!/usr/bin/env bash
# WI-OI-131: seed pilot module analytics fixtures, then run Playwright proof on 5180.
set -euo pipefail
_e2e_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$_e2e_dir"
# shellcheck source=load-uat-env.sh
source "$_e2e_dir/load-uat-env.sh"
# shellcheck source=ensure-playwright-ready.sh
source "$_e2e_dir/ensure-playwright-ready.sh"

if [ "${SKIP_UAT_MODULE_ACCESS_SEED:-0}" != 1 ]; then
  echo "Ensuring UAT admin has module + analytics source permissions…"
  (cd "$_e2e_dir/.." && node infra/compose/scripts/run-seed-uat-module-entitlements-local.mjs) || true
fi
if [ "${SKIP_MODULE_ANALYTICS_SEED:-0}" != 1 ]; then
  echo "Seeding module analytics fixtures (set SKIP_MODULE_ANALYTICS_SEED=1 to skip)…"
  (cd "$_e2e_dir/.." && pnpm seed:module-analytics-e2e)
fi

GIGALIBS_E2E_NONINTERACTIVE=1 pnpm exec playwright test specs/module-analytics-pilot.spec.ts --workers=1 --reporter=list
