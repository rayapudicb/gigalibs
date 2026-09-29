#!/usr/bin/env bash
# Local certification chain (stops at the first failure). Usage: chain.sh <log-file>
set -uo pipefail
LOG="${1:?log file}"
cd "$HOME/dev/gigalibs" || exit 1
: > "$LOG"
run() {
  local name="$1"; shift
  echo "=== STEP $name START $(date +%H:%M:%S)" >> "$LOG"
  if "$@" >> "$LOG" 2>&1; then
    echo "=== STEP $name PASS $(date +%H:%M:%S)" >> "$LOG"
  else
    echo "=== STEP $name FAIL $(date +%H:%M:%S)" >> "$LOG"
    echo "CHAIN FAILED at $name" >> "$LOG"
    exit 1
  fi
}
run build pnpm build
run test pnpm test
for audit in production-data all-runtime-data package-dependencies api-boundary navigation sdlc layers \
  module-manifests configuration-deployment-profile; do
  run "audit:$audit" pnpm -s "audit:$audit"
done
echo "CHAIN PASSED $(date +%H:%M:%S)" >> "$LOG"
