# shellcheck shell=bash
# Ensures workspace deps and Playwright CLI/browsers before UAT specs run.
set -euo pipefail
_epr_e2e="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_epr_root="$(cd "$_epr_e2e/.." && pwd)"

if [ ! -f "$_epr_e2e/node_modules/@playwright/test/cli.js" ]; then
  echo "Playwright is missing; running pnpm install at repo root…"
  (cd "$_epr_root" && pnpm install)
fi

if [ ! -f "$_epr_e2e/node_modules/@playwright/test/cli.js" ]; then
  echo "Playwright still missing after pnpm install. From repo root run: rm -rf node_modules e2e/node_modules && pnpm install"
  exit 1
fi

echo "Checking Playwright browser (downloads once if needed)…"
(cd "$_epr_e2e" && pnpm exec playwright install chromium)

unset _epr_e2e _epr_root
