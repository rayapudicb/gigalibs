#!/usr/bin/env bash
# WI-OI-120bo: refresh source identity and image tags in the .env.test* files (project gigalibs-test).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GIGALIBS_COMPOSE_ENV_SUFFIX=.test
bash "${SCRIPT_DIR}/refresh-source-identity.sh"
