#!/usr/bin/env bash
set -euo pipefail

# WI-OI-120hd: M-AR0 local compose readiness — ar-api migration pin 16 and /health/ready inside the stack.
# Requires ar-api running from compose.modules.local.yaml (not host-published; probe runs in-container).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-modules-local.sh
source "${SCRIPT_DIR}/compose-modules-local.sh"

fail() {
  echo "Error: $*" >&2
  exit 1
}

"${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx 'ar-api' \
  || fail 'ar-api is not running; start with: infra/compose/scripts/up-ar-api.sh'

"${COMPOSE[@]}" exec -T ar-api node -e "
  fetch('http://127.0.0.1:3400/health/ready')
    .then(async (r) => {
      if (!r.ok) process.exit(1);
      const body = await r.json();
      if (body?.status !== 'ready') process.exit(2);
    })
    .catch(() => process.exit(3));
" || fail 'ar-api /health/ready failed inside the container (migrations or database).'

migration_pin="$("${COMPOSE[@]}" exec -T ar-api node -e "process.stdout.write(process.env.AR_EXPECTED_MIGRATION_VERSION || '')")"
[[ "${migration_pin}" == '18' ]] || fail "AR_EXPECTED_MIGRATION_VERSION must be 18 in ar-api; got '${migration_pin}'."

echo "AR compose health OK (migration pin ${migration_pin}, /health/ready)."
