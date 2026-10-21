#!/usr/bin/env bash
# WI-OI-120cc (SPEED S9a): build the images tagged in infra/compose/.env.speed-lab* (project gigalibs-speed-lab).
# Do not edit any non-ignored file while this runs: the build hashes and copies the working tree.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GIGALIBS_COMPOSE_ENV_SUFFIX=.speed-lab
bash "${SCRIPT_DIR}/build-images.sh"
bash "${SCRIPT_DIR}/build-module-host-image.sh"
