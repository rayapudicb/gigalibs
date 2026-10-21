#!/usr/bin/env bash
# WI-OI-120cc (SPEED S9a): stop the speed-lab preview. Its volumes are kept; nothing else is touched.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=speed-lab-compose.sh
source "${SCRIPT_DIR}/speed-lab-compose.sh"
"${COMPOSE[@]}" stop
