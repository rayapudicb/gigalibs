#!/usr/bin/env bash
# WI-OI-120bo: build the images tagged in infra/compose/.env.test (project gigalibs-test).
# Do not edit any non-ignored file while this runs: the build hashes and copies the working tree.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GIGALIBS_COMPOSE_ENV_SUFFIX=.test
bash "${SCRIPT_DIR}/build-images.sh"
bash "${SCRIPT_DIR}/build-module-host-image.sh"
