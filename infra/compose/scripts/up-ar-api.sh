#!/usr/bin/env bash
set -euo pipefail

# WI-OI-120he: start ar-migrations + ar-api on the configuration-local module profile.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-modules-local.sh
source "${SCRIPT_DIR}/compose-modules-local.sh"

"${COMPOSE[@]}" up -d ar-api
echo "Started ar-api (includes ar-migrations). Run: pnpm proof:ar-compose-health"
